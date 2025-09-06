import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';

/** Decode a JWT payload (base64url → JSON). */
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const toArr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const nameForRole = (role, locationName) =>
  role === 1 ? `Doctor – ${locationName || ''}` : `Clinic – ${locationName || ''}`;

/** Map common getUserMedia errors to a friendly message. */
function explainMediaError(err) {
  const n = err?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    return 'Camera permission is blocked. Click the camera icon in the address bar to allow.';
  }
  if (n === 'NotReadableError' || /in use/i.test(err?.message || '')) {
    return 'Camera is in use by another app. Close other apps that use the camera and try again.';
  }
  if (n === 'NotFoundError' || n === 'OverconstrainedError') {
    return 'No suitable camera was found. Check device/cable or pick another camera.';
  }
  return err?.message || 'Could not start camera.';
}

export default function ZoomMeetingComponent({
  callId,
  locationName,
  role = 0,
  userId,
  token, // optional pre-signed Video SDK token
}) {
  // ---------- SDK refs ----------
  const clientRef = useRef(null);
  const mediaRef  = useRef(null);

  // local
  const selfVideoRef = useRef(null);
  const selfLabelRef = useRef(null);

  // remotes: userId -> { wrapper, video, label }
  const remoteTilesRef = useRef(new Map());
  const remoteGridRef  = useRef(null);

  // ---------- ui/state ----------
  const [joining, setJoining] = useState(true);
  const [error, setError]     = useState('');
  const [micOn, setMicOn]     = useState(false);
  const [camOn, setCamOn]     = useState(false);

  // autoplay/gesture gate (especially on mobile)
  const isMobileUA =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [needsGesture, setNeedsGesture] = useState(isMobileUA);

  // debug overlay (?debug=1)
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
      setDebugLines((prev) => prev.concat(line).slice(-150));
    }
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  // ---------- remote tile helpers (VIDEO ELEMENTS, not canvas) ----------
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
      minHeight: '200px',
      boxShadow: '0 2px 10px rgba(0,0,0,.35)',
      display: 'grid',
    });

    const video = document.createElement('video');
    // autoplay & inline playback
    video.autoplay = true;
    video.playsInline = true;
    // remote streams don’t carry audio via this element in the Video SDK; keeping muted avoids autoplay blocks
    video.muted = true;
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
      userSelect: 'none',
      pointerEvents: 'none',
    });

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    remoteGridRef.current?.appendChild(wrapper);

    tile = { wrapper, video, label };
    remoteTilesRef.current.set(uid, tile);
    return tile;
  };

  const attachRemote = async (uid) => {
    try {
      const client = clientRef.current;
      const media  = mediaRef.current;
      if (!client || !media) return;

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const { video } = ensureRemoteTile(user);

      // CRITICAL: Use attachVideo(videoEl, userId) — canvas renderVideo will fail without SharedArrayBuffer
      await media.attachVideo(video, uid);
      dbg('remote.attach ok', { uid });
    } catch (e) {
      // This will throw when the peer's camera is off — that's fine; we keep a placeholder tile.
      dbg('remote.attach fail', { uid, err: e?.reason || e?.message || String(e) });
    }
  };

  const detachRemote = (uid) => {
    try { mediaRef.current?.detachVideo(uid); } catch {}
    dbg('remote.detach', { uid });
  };

  const removeRemoteTile = (uid) => {
    detachRemote(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (tile) {
      tile.wrapper.remove();
      remoteTilesRef.current.delete(uid);
    }
  };

  // ---------- join & events ----------
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
        let displayName;

        if (sessionToken) {
          const p = decodeJwtPayload(sessionToken);
          sessionName = p?.tpc;
          displayName = p?.user_identity || nameForRole(role, locationName);
          if (!sessionName) throw new Error('Token is missing session name (tpc).');
        } else {
          const payload = {
            role: role ? 1 : 0,
            user_id: userId ?? undefined,
            call_id: callId,
            userName: nameForRole(role, locationName),
            location_name: locationName || undefined,
          };
          dbg('POST /join', { callId, payload });

          const { data } = await axios.post(
            `${API_BASE}/qr/calls/${encodeURIComponent(String(callId))}/join`,
            payload,
            { headers: { 'Content-Type': 'application/json' } }
          );

          // Meeting SDK fallback (should be rare)
          if (data?.meetingNumber) {
            const url = new URL(`https://app.zoom.us/wc/join/${data.meetingNumber}`);
            if (data.password) url.searchParams.set('pwd', data.password);
            url.searchParams.set('prefer', '1');
            url.searchParams.set('un', btoa(unescape(encodeURIComponent(payload.userName))));
            window.location.replace(url.toString());
            return;
          }

          if (!data?.token || !data?.sessionName) throw new Error('Unexpected join payload from server.');
          sessionToken = String(data.token);
          sessionName = String(data.sessionName);
          const p = decodeJwtPayload(sessionToken);
          displayName = p?.user_identity || payload.userName;
        }

        // 2) Init & join (order matters)
        const client = ZoomVideo.createClient();
        clientRef.current = client;

        await client.init('en-US', 'Global', { patchJsMedia: true });
        await client.join(sessionName, sessionToken, displayName);
        dbg('joined', client.getSessionInfo?.());

        // Update local nameplate
        if (selfLabelRef.current) selfLabelRef.current.textContent = `You — ${displayName}`;

        // 3) Start local media
        const media = client.getMediaStream();
        mediaRef.current = media;

        // Audio
        try {
          await media.startAudio();
          setMicOn(true);
        } catch (e) {
          dbg('startAudio fail', e?.reason || e?.message);
          setMicOn(false);
        }

        // Video (attach to <video>)
        try {
          await media.startVideo({ videoElement: selfVideoRef.current });
          setCamOn(true);
          setNeedsGesture(false);
        } catch (e) {
          dbg('startVideo fail', e?.reason || e?.message || e);
          setCamOn(false);
          setNeedsGesture(true);
          setError(explainMediaError(e));
        }

        // 4) Initial remote tiles
        const me = client.getCurrentUserInfo()?.userId;
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== me) {
            ensureRemoteTile(u);
            if (u.bVideoOn) attachRemote(u.userId);
          }
        });

        // 5) Events
        const onAdded = (list) => {
          toArr(list).forEach((u) => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) {
              ensureRemoteTile(u);
              if (u.bVideoOn) attachRemote(u.userId);
            }
          });
        };
        const onUpdated = (list) => {
          toArr(list).forEach((u) => {
            const tile = remoteTilesRef.current.get(u.userId);
            if (tile?.label && u.displayName) tile.label.textContent = u.displayName;
          });
        };
        const onRemoved = (list) => {
          toArr(list).forEach((u) => removeRemoteTile(u.userId));
        };
        const onPeerVideo = ({ action, userId }) => {
          if (action === 'Start') attachRemote(userId);
          else detachRemote(userId); // keep tile/label, just detach stream
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
          'Failed to join session'
        );
        setJoining(false);
      }
    })();

    // cleanup
    return () => {
      const client = clientRef.current;
      const media  = mediaRef.current;

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
        remoteTilesRef.current.forEach((_, uid) => {
          try { media?.detachVideo(uid); } catch {}
        });
        remoteTilesRef.current.clear();
      } catch {}

      try { media?.stopVideo(); } catch {}
      try { media?.stopAudio(); } catch {}
      try { client?.leave(); } catch {}

      clientRef.current = null;
      mediaRef.current  = null;
    };
  }, [callId, locationName, role, userId, token, debug]);

  // ---------- mic/cam controls ----------
  const toggleMic = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      if (micOn) { await media.stopAudio(); setMicOn(false); }
      else { await media.startAudio(); setMicOn(true); }
    } catch (e) {
      dbg('toggleMic fail', e?.reason || e?.message);
    }
  };

  const toggleCam = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      if (camOn) {
        await media.stopVideo();
        setCamOn(false);
      } else {
        await media.startVideo({ videoElement: selfVideoRef.current });
        setCamOn(true);
        setNeedsGesture(false);
      }
    } catch (e) {
      setCamOn(false);
      setNeedsGesture(true);
      setError(explainMediaError(e));
      dbg('toggleCam fail', e?.reason || e?.message);
    }
  };

  const handleEnable = async () => {
    setError('');
    try {
      if (!micOn) await mediaRef.current?.startAudio();
      if (!camOn) await mediaRef.current?.startVideo({ videoElement: selfVideoRef.current });
      setMicOn(true);
      setCamOn(true);
      setNeedsGesture(false);
    } catch (e) {
      setError(explainMediaError(e));
      setNeedsGesture(true);
      dbg('enable button fail', e?.reason || e?.message);
    }
  };

  // ---------- UI ----------
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        background: '#000',
        color: '#fff',
        position: 'relative',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(255,255,255,.06)',
          borderBottom: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <strong style={{ letterSpacing: '.2px' }}>
          {locationName ? `Clinic – ${locationName}` : 'Clinic'}
        </strong>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={toggleMic}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: 0,
              background: micOn ? '#2ea043' : '#6e7681',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            {micOn ? 'Mic On' : 'Mic Off'}
          </button>

          <button
            onClick={toggleCam}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: 0,
              background: camOn ? '#2ea043' : '#6e7681',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            {camOn ? 'Cam On' : 'Cam Off'}
          </button>

          <button
            onClick={() => {
              try { mediaRef.current?.stopVideo(); } catch {}
              try { mediaRef.current?.stopAudio(); } catch {}
              try { clientRef.current?.leave(); } catch {}
            }}
            style={{ padding: '6px 12px', borderRadius: 8, background: '#d33', color: '#fff', border: 0 }}
          >
            Leave
          </button>
        </div>
      </div>

      {/* Stage */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px,360px) 1fr',
          gap: 14,
          padding: 14,
        }}
      >
        {/* Local */}
        <div style={{ position: 'relative' }}>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>You</div>
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 220,
              background: '#111',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 2px 10px rgba(0,0,0,.35)',
            }}
          >
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
                position: 'absolute',
                left: 10,
                bottom: 8,
                padding: '3px 8px',
                fontSize: 12,
                background: 'rgba(0,0,0,.55)',
                borderRadius: 6,
                letterSpacing: '.2px',
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
            style={{
              width: '100%',
              minHeight: 220,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
            }}
          />
        </div>
      </div>

      {/* Overlays */}
      {joining && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(0,0,0,.35)',
            fontSize: 16,
          }}
        >
          Connecting to session…
        </div>
      )}

      {(needsGesture || !!error) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(0,0,0,.45)',
          }}
        >
          <div style={{ display: 'grid', gap: 10, placeItems: 'center' }}>
            {!!error && (
              <div
                style={{
                  background: 'rgba(220,0,0,.85)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  maxWidth: 560,
                  lineHeight: 1.35,
                  textAlign: 'center',
                }}
              >
                {String(error)}
              </div>
            )}
            <button
              onClick={handleEnable}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: 0,
                background: '#1f8fff',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              Enable mic & cam
            </button>
          </div>
        </div>
      )}

      {debug && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            width: 380,
            maxHeight: 260,
            overflow: 'auto',
            fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: 11,
            background: 'rgba(0,0,0,.55)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 6,
            padding: 8,
            whiteSpace: 'pre-wrap',
          }}
        >
          {debugLines.join('\n')}
        </div>
      )}
    </div>
  );
}
