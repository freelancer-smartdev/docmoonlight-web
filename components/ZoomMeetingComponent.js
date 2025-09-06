// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const displayNameFor = (role, location) =>
  role === 1 ? `Doctor – ${location || ''}` : `Clinic – ${location || ''}`;

/** Decode a JWT payload (base64url → JSON). */
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Helper: await only if it's a thenable (SDK varies by version)
async function maybeAwait(v) {
  if (v && typeof v.then === 'function') {
    return await v;
  }
  return v;
}

// Tiny delay helper for race-y state changes
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function ZoomMeetingComponent({ callId, locationName, role = 0, userId, token }) {
  // ---------- Refs ----------
  const clientRef = useRef(null);
  const mediaRef = useRef(null);

  const selfVideoRef = useRef(null);
  const selfLabelRef = useRef(null);

  // userId -> { wrapper, video, label }
  const remoteTilesRef = useRef(new Map());
  const remoteGridRef = useRef(null);

  // ---------- State ----------
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState('');

  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);

  const isMobileUA =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [needsGesture, setNeedsGesture] = useState(isMobileUA);

  // Debug overlay (?debug=1)
  const [debug, setDebug] = useState(false);
  const [debugLines, setDebugLines] = useState([]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDebug(new URLSearchParams(window.location.search).has('debug'));
    }
  }, []);
  const dbg = (msg, data) => {
    if (debug) {
      const line = `[VideoSDK] ${msg} ${data ? JSON.stringify(data) : ''}`;
      setDebugLines((p) => p.concat(line).slice(-200));
    }
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  // ---------- Remote tile helpers ----------
  const ensureRemoteTile = (user) => {
    const uid = user.userId;
    let tile = remoteTilesRef.current.get(uid);
    if (tile) {
      if (user.displayName && tile.label) tile.label.textContent = user.displayName;
      return tile;
    }

    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'relative',
      background: '#111',
      borderRadius: '12px',
      overflow: 'hidden',
      minHeight: '180px',
      boxShadow: '0 2px 10px rgba(0,0,0,.35)',
      display: 'grid',
    });

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // audio is handled by the SDK separately
    Object.assign(video.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      background: '#111',
    });

    const label = document.createElement('div');
    label.textContent = user.displayName || `User ${uid}`;
    Object.assign(label.style, {
      position: 'absolute',
      left: '10px',
      bottom: '8px',
      padding: '3px 8px',
      fontSize: '12px',
      color: '#fff',
      background: 'rgba(0,0,0,.55)',
      borderRadius: '6px',
      letterSpacing: '.2px',
      pointerEvents: 'none',
    });

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    remoteGridRef.current?.appendChild(wrapper);

    tile = { wrapper, video, label };
    remoteTilesRef.current.set(uid, tile);
    return tile;
  };

  // Attach a remote user to a <video>, with a short retry if the track isn’t ready yet.
  const attachRemote = async (uid, attempt = 0) => {
    try {
      const client = clientRef.current;
      const media = mediaRef.current;
      if (!client || !media) return;

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const { video } = ensureRemoteTile(user);

      // If the peer’s video isn’t on yet, delay and retry once or twice.
      if (!user.bVideoOn) {
        if (attempt < 3) {
          await sleep(120);
          return attachRemote(uid, attempt + 1);
        }
        return; // keep placeholder tile
      }

      const res = media.attachVideo(video, uid);
      await maybeAwait(res);
      dbg('remote.attach ok', { uid, attempt });
    } catch (e) {
      const msg = e?.reason || e?.message || String(e);
      dbg('remote.attach fail', { uid, attempt, err: msg });
      if (/not send video/i.test(msg) && attempt < 3) {
        await sleep(160);
        return attachRemote(uid, attempt + 1);
      }
    }
  };

  const detachRemote = async (uid) => {
    try {
      const res = mediaRef.current?.detachVideo(uid);
      await maybeAwait(res);
    } catch {}
  };

  const removeRemoteTile = async (uid) => {
    await detachRemote(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (tile?.wrapper) tile.wrapper.remove();
    remoteTilesRef.current.delete(uid);
  };

  // ---------- Join & events ----------
  useEffect(() => {
    if (!callId && !token) return;
    let mounted = true;

    (async () => {
      try {
        setError('');
        setJoining(true);

        // 1) Resolve token + session name + display name
        let sessionToken = token;
        let sessionName;
        let myDisplayName;

        if (sessionToken) {
          const p = decodeJwtPayload(sessionToken);
          sessionName = p?.tpc;
          myDisplayName = p?.user_identity || displayNameFor(role, locationName);
          if (!sessionName) throw new Error('Token is missing session name (tpc).');
        } else {
          const payload = {
            role: role ? 1 : 0,
            user_id: userId ?? undefined,
            call_id: callId,
            userName: displayNameFor(role, locationName),
            location_name: locationName || undefined,
          };
          dbg('POST /join', { callId, payload });

          const { data } = await axios.post(
            `${API_BASE}/qr/calls/${encodeURIComponent(String(callId))}/join`,
            payload,
            { headers: { 'Content-Type': 'application/json' } },
          );

          if (data?.meetingNumber) {
            const url = new URL(`https://app.zoom.us/wc/join/${data.meetingNumber}`);
            if (data.password) url.searchParams.set('pwd', data.password);
            url.searchParams.set('prefer', '1');
            url.searchParams.set('un', btoa(unescape(encodeURIComponent(payload.userName))));
            window.location.replace(url.toString());
            return;
          }

          if (!data?.token || !data?.sessionName) {
            throw new Error('Unexpected join payload from server.');
          }

          sessionToken = String(data.token);
          sessionName = String(data.sessionName);
          const p = decodeJwtPayload(sessionToken);
          myDisplayName = p?.user_identity || payload.userName;
        }

        // 2) Init & join
        const client = ZoomVideo.createClient();
        clientRef.current = client;

        await client.init('en-US', 'Global', { patchJsMedia: true });
        await client.join(sessionName, sessionToken, myDisplayName);

        if (selfLabelRef.current) selfLabelRef.current.textContent = `You — ${myDisplayName}`;

        // 3) Start media + local preview
        const media = client.getMediaStream();
        mediaRef.current = media;

        try {
          const r = media.startAudio();
          await maybeAwait(r);
          setMicOn(true);
        } catch (e) {
          dbg('startAudio fail', e?.reason || e?.message);
          setMicOn(false);
        }

        const me = client.getCurrentUserInfo()?.userId;
        try {
          // Start sending camera
          await maybeAwait(media.startVideo());
          // Let the track warm up a frame or two before attaching
          await sleep(80);
          if (selfVideoRef.current && me != null) {
            await maybeAwait(media.attachVideo(selfVideoRef.current, me));
          }
          setCamOn(true);
          setNeedsGesture(false);
        } catch (e) {
          dbg('startVideo fail', e?.reason || e?.message);
          setCamOn(false);
          setNeedsGesture(true);
          setError(
            /NotAllowed|Permission/i.test(e?.name || e?.message || '')
              ? 'Camera permission blocked or in use by another app'
              : 'Could not start camera',
          );
        }

        // 4) Create remote tiles and attach those already sending video
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== me) {
            ensureRemoteTile(u);
            if (u.bVideoOn) attachRemote(u.userId);
          }
        });

        // 5) Events
        const onAdded = (list) => {
          asArray(list).forEach((u) => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) {
              ensureRemoteTile(u);
              if (u.bVideoOn) attachRemote(u.userId);
            }
          });
        };

        const onUpdated = (list) => {
          asArray(list).forEach((u) => {
            const tile = remoteTilesRef.current.get(u.userId);
            if (tile?.label && u.displayName) tile.label.textContent = u.displayName;
          });
        };

        const onRemoved = (list) => {
          asArray(list).forEach((u) => removeRemoteTile(u.userId));
        };

        const onPeerVideo = ({ action, userId }) => {
          dbg('peer-video-state-change', { action, userId });
          if (action === 'Start') attachRemote(userId, 0);
          else detachRemote(userId); // keep tile, just blank it
        };

        client.on('user-added', onAdded);
        client.on('user-updated', onUpdated);
        client.on('user-removed', onRemoved);
        client.on('peer-video-state-change', onPeerVideo);
        clientRef.current._handlers = { onAdded, onUpdated, onRemoved, onPeerVideo };

        if (!mounted) return;
        setJoining(false);
      } catch (e) {
        console.group('[VideoSDK][join] failed');
        console.error('raw error:', e);
        if (e?.response) {
          console.error('HTTP status:', e.response.status);
          console.error('HTTP data:', e.response.data);
        }
        console.groupEnd?.();

        if (!mounted) return;
        setError(
          e?.response?.data?.error ||
            e?.response?.data?.message ||
            e?.reason ||
            e?.message ||
            'Failed to join session',
        );
        setJoining(false);
      }
    })();

    // Cleanup
    return () => {
      const client = clientRef.current;
      const media = mediaRef.current;

      try {
        const h = client?._handlers;
        if (h) {
          client.off?.('user-added', h.onAdded);
          client.off?.('user-updated', h.onUpdated);
          client.off?.('user-removed', h.onRemoved);
          client.off?.('peer-video-state-change', h.onPeerVideo);
        }
      } catch {}

      try {
        remoteTilesRef.current.forEach(async (_, uid) => {
          try { await maybeAwait(media?.detachVideo(uid)); } catch {}
        });
        remoteTilesRef.current.clear();
      } catch {}

      try {
        const me = client?.getCurrentUserInfo()?.userId;
        if (me != null) maybeAwait(media?.detachVideo(me));
      } catch {}

      try { maybeAwait(media?.stopVideo()); } catch {}
      try { maybeAwait(media?.stopAudio()); } catch {}
      try { client?.leave(); } catch {}

      clientRef.current = null;
      mediaRef.current = null;
    };
  }, [callId, locationName, role, userId, token, debug]);

  // ---------- Controls ----------
  const toggleMic = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      if (micOn) { await maybeAwait(media.stopAudio()); setMicOn(false); }
      else { await maybeAwait(media.startAudio()); setMicOn(true); }
    } catch (e) {
      setError('Microphone error: ' + (e?.reason || e?.message || 'unknown'));
    }
  };

  const toggleCam = async () => {
    const client = clientRef.current;
    const media = mediaRef.current;
    if (!client || !media) return;
    try {
      if (camOn) {
        await maybeAwait(media.stopVideo());
        setCamOn(false);
      } else {
        await maybeAwait(media.startVideo());
        await sleep(80);
        const me = client.getCurrentUserInfo()?.userId;
        if (selfVideoRef.current && me != null) {
          await maybeAwait(media.attachVideo(selfVideoRef.current, me));
        }
        setCamOn(true);
        setNeedsGesture(false);
      }
    } catch (e) {
      setError(
        /NotAllowed|Permission/i.test(e?.name || e?.message || '')
          ? 'Camera permission blocked or in use by another app'
          : 'Could not start camera',
      );
    }
  };

  const handleEnable = async () => {
    setError('');
    await toggleMic();
    await toggleCam();
  };

  // ---------- UI ----------
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateRows: 'auto 1fr',
      background: '#000', color: '#fff'
    }}>
      {/* Top bar */}
      <div style={{
        padding: 12, display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.07)'
      }}>
        <strong style={{ letterSpacing: '.2px' }}>
          {locationName ? `Clinic – ${locationName}` : 'Clinic'}
        </strong>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={toggleMic}
            style={{
              padding: '6px 12px', borderRadius: 8, border: 0,
              background: micOn ? '#2e8b57' : '#666', color: '#fff'
            }}
          >
            {micOn ? 'Mic On' : 'Mic Off'}
          </button>
          <button
            onClick={toggleCam}
            style={{
              padding: '6px 12px', borderRadius: 8, border: 0,
              background: camOn ? '#2e8b57' : '#666', color: '#fff'
            }}
          >
            {camOn ? 'Cam On' : 'Cam Off'}
          </button>
          <button
            onClick={() => {
              try { maybeAwait(mediaRef.current?.stopVideo()); } catch {}
              try { maybeAwait(mediaRef.current?.stopAudio()); } catch {}
              try { clientRef.current?.leave(); } catch {}
            }}
            style={{ padding: '6px 12px', borderRadius: 8, background: '#d33', color: '#fff', border: 0 }}
          >
            Leave
          </button>
        </div>
      </div>

      {/* Stage */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px,360px) 1fr',
        gap: 14, padding: 14
      }}>
        {/* Local tile */}
        <div style={{ position: 'relative' }}>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>You</div>
          <div style={{
            position: 'relative', width: '100%', height: 220,
            background: '#111', borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,.35)'
          }}>
            <video
              ref={selfVideoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div
              ref={selfLabelRef}
              style={{
                position: 'absolute', left: 10, bottom: 8,
                padding: '3px 8px', fontSize: 12,
                background: 'rgba(0,0,0,.55)', borderRadius: 6, letterSpacing: '.2px'
              }}
            >
              You
            </div>
          </div>
        </div>

        {/* Remotes */}
        <div>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>Participants</div>
          <div
            ref={remoteGridRef}
            id="remote-grid"
            style={{
              width: '100%',
              minHeight: 220,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12
            }}
          />
        </div>
      </div>

      {/* Connecting overlay */}
      {joining && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,.35)', fontSize: 16
        }}>
          Connecting to session…
        </div>
      )}

      {/* Autoplay/permission CTA */}
      {(needsGesture || !!error) && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,.45)'
        }}>
          <div style={{ display: 'grid', gap: 10, placeItems: 'center' }}>
            {!!error && (
              <div style={{
                background: 'rgba(220,0,0,.85)', padding: '8px 12px',
                borderRadius: 6, maxWidth: 520, lineHeight: 1.35
              }}>
                {String(error)}
              </div>
            )}
            <button
              onClick={handleEnable}
              style={{
                padding: '10px 14px', borderRadius: 8, border: 0,
                background: '#1f8fff', color: '#fff', fontWeight: 600
              }}
            >
              Enable mic & cam
            </button>
          </div>
        </div>
      )}

      {/* Debug overlay (?debug=1) */}
      {debug && (
        <div style={{
          position: 'absolute', right: 8, bottom: 8, width: 360, maxHeight: 260, overflow: 'auto',
          fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11,
          background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 6, padding: 8, whiteSpace: 'pre-wrap'
        }}>
          {debugLines.join('\n')}
        </div>
      )}
    </div>
  );
}
