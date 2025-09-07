// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const BUILD = 'ZMC-2025-09-07c';
console.info('[ZMC] build:', BUILD);

const API_BASE = '/api';

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const displayNameFor = (role, location) =>
  Number(role) === 1 ? `Doctor – ${location || ''}` : `Clinic – ${location || ''}`;

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

// Await only if SDK method actually returns a Promise (some builds don’t).
async function maybeAwait(v) {
  if (v && typeof v.then === 'function') return await v;
  return v;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mapCameraError(e) {
  const s = (e?.name || e?.message || e?.reason || '').toLowerCase();
  if (/video is started/i.test(s)) return ''; // harmless
  if (/notallowed|permission|denied/i.test(s)) return 'Camera permission blocked';
  if (/notreadable|in use|busy|trackstart/i.test(s)) return 'Camera is in use by another app';
  if (/notfound|overconstrained|no suitable device|device not found/i.test(s)) return 'No camera found';
  return 'Could not start camera';
}

const tag = (el) => (el && el.tagName ? el.tagName.toLowerCase() : String(el));

/** Attach video – prefer NEW API (container DIV); fall back to OLD API (<video>, userId). */
async function attachVideoCompat(stream, userId, slot, dbg) {
  const Q = (ZoomVideo?.VideoQuality?.Video_360P) ?? 2;

  // NEW API: attachVideo(userId, quality, element?) — element can be a container
  try {
    dbg?.('attach.new', { userId, target: tag(slot) });
    const maybeEl = await maybeAwait(stream.attachVideo(userId, Q, slot));
    const el = (maybeEl && maybeEl.nodeType === 1) ? maybeEl : slot;
    if (el && el !== slot && slot?.parentNode) slot.parentNode.replaceChild(el, slot);
    return el || slot;
  } catch (e) {
    dbg?.('attach.new.fail', { err: String(e) });
  }

  // OLD API needs a <video>
  let videoEl = slot;
  if (!videoEl || tag(videoEl) !== 'video') {
    const container = slot?.nodeType === 1 ? slot : document.createElement('div');
    videoEl = document.createElement('video');
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;
    Object.assign(videoEl.style, {
      width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#111',
    });
    container.appendChild(videoEl);
    if (container !== slot && slot?.parentNode) slot.parentNode.replaceChild(container, slot);
  }

  // OLD signatures
  try {
    dbg?.('attach.old.v1', { userId, target: tag(videoEl) }); // attachVideo(videoEl, userId)
    await maybeAwait(stream.attachVideo(videoEl, userId));
    return videoEl;
  } catch (e1) {
    dbg?.('attach.old.v1.fail', { err: String(e1) });
  }
  try {
    dbg?.('attach.old.v2', { userId, target: tag(videoEl) }); // attachVideo(userId, videoEl)
    const el = await maybeAwait(stream.attachVideo(userId, videoEl));
    return (el && el.nodeType === 1) ? el : videoEl;
  } catch (e2) {
    dbg?.('attach.old.v2.fail', { err: String(e2) });
  }

  throw new Error('attachVideo: all signatures failed');
}

/** Detach video – supports both new and old API forms. */
async function detachVideoCompat(stream, userId, el, dbg) {
  try {
    dbg?.('detach.new', { userId });
    await maybeAwait(stream.detachVideo?.(userId));
  } catch {
    try {
      dbg?.('detach.old', { userId, target: tag(el) });
      await maybeAwait(stream.detachVideo?.(el, userId));
    } catch {
      try { await maybeAwait(stream.stopRender?.(userId)); } catch {}
    }
  }
}

/** Start local camera — NEVER pass an element here (avoids “Invalid element type”). */
async function startVideoCompat(stream, deviceId, dbg) {
  if (deviceId) {
    try {
      dbg?.('startVideo.opts', { deviceId });
      await maybeAwait(stream.startVideo({ deviceId }));
      return;
    } catch (e1) {
      dbg?.('startVideo.opts.fail', { err: String(e1) });
      if (/video is started/i.test(String(e1))) return; // benign
    }
  }
  try {
    dbg?.('startVideo.plain');
    await maybeAwait(stream.startVideo());
  } catch (e2) {
    dbg?.('startVideo.plain.fail', { err: String(e2) });
    if (/video is started/i.test(String(e2))) return;
    throw e2;
  }
}

export default function ZoomMeetingComponent({
  callId,
  locationName,
  role = 0,
  userId,
  token,
}) {
  // ---------- Refs ----------
  const clientRef = useRef(null);
  const mediaRef  = useRef(null);

  // self uses a CONTAINER DIV (SDK will inject its own element if needed)
  const selfSlotRef  = useRef(null);
  const selfLabelRef = useRef(null);

  // userId -> { wrapper, slot, label, video?: HTMLElement }
  const remoteTilesRef = useRef(new Map());
  const remoteGridRef  = useRef(null);

  // ---------- State ----------
  const [joining, setJoining] = useState(true);
  const [error, setError]     = useState('');

  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);

  const isMobileUA =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [needsGesture, setNeedsGesture] = useState(isMobileUA);

  // Devices (optional camera picker)
  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState('');

  // Debug overlay (?debug=1)
  const [debug, setDebug] = useState(false);
  const [debugLines, setDebugLines] = useState([]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDebug(new URLSearchParams(window.location.search).has('debug'));
    }
  }, []);
  const dbg = (msg, data) => {
    const line = `[VideoSDK] ${msg} ${data ? JSON.stringify(data) : ''}`;
    setDebugLines((p) => (debug ? p.concat(line).slice(-400) : p));
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  // ---------- Remote tile helpers (slot DIV) ----------
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

    const slot = document.createElement('div'); // act as container for new API
    Object.assign(slot.style, {
      width: '100%',
      height: '100%',
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

    wrapper.appendChild(slot);
    wrapper.appendChild(label);
    remoteGridRef.current?.appendChild(wrapper);

    tile = { wrapper, slot, label, video: null };
    remoteTilesRef.current.set(uid, tile);
    return tile;
  };

  const attachRemote = async (uid, attempt = 0) => {
    try {
      const client = clientRef.current;
      const media  = mediaRef.current;
      if (!client || !media) return;

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const tile = ensureRemoteTile(user);

      if (!user.bVideoOn) {
        if (attempt < 3) { await sleep(120); return attachRemote(uid, attempt + 1); }
        return;
      }

      const el = await attachVideoCompat(media, uid, tile.slot, dbg);
      if (el && el !== tile.slot) tile.video = el; // keep actual element for detach (old API)
      dbg('remote.attach ok', { uid, attempt, used: tag(el) });
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
    const tile = remoteTilesRef.current.get(uid);
    try { await detachVideoCompat(mediaRef.current, uid, tile?.video || tile?.slot, dbg); } catch {}
  };

  const removeRemoteTile = async (uid) => {
    await detachRemote(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (tile?.wrapper) tile.wrapper.remove();
    remoteTilesRef.current.delete(uid);
  };

  // ---------- Start camera (no element passed to startVideo) ----------
  const startCamInternal = async (preferredId) => {
    setError('');
    const client = clientRef.current;
    const media  = mediaRef.current;
    if (!client || !media) return false;

    // Camera list & selection
    let selected = preferredId || camId;
    try {
      const list = await maybeAwait(media.getCameraList?.());
      if (Array.isArray(list) && list.length) {
        setCams(list);
        if (!selected) {
          selected = list[0].deviceId;
          setCamId(selected);
        }
      }
    } catch {}

    // Pre-warm permission using the SAME device id (optional but helpful for error clarity)
    try {
      const constraints = selected ? { video: { deviceId: { exact: selected } } } : { video: true };
      const tmp = await navigator.mediaDevices.getUserMedia(constraints);
      tmp.getTracks().forEach((t) => t.stop());
    } catch (e) {
      setError(mapCameraError(e));
      return false;
    }

    // Start video (no DOM element here)
    try {
      await startVideoCompat(media, selected, dbg);
    } catch (e) {
      const msg = mapCameraError(e);
      if (msg) { setError(msg); return false; }
    }

    // Self preview attach
    try {
      const me = client.getCurrentUserInfo()?.userId;
      if (selfSlotRef.current && me != null) {
        await attachVideoCompat(media, me, selfSlotRef.current, dbg);
      }
      setCamOn(true);
      setNeedsGesture(false);
      return true;
    } catch (e) {
      dbg('self.attach fail', { err: String(e) });
      setError('Could not start camera');
      return false;
    }
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
          sessionName   = p?.tpc;
          myDisplayName = p?.user_identity || displayNameFor(role, locationName);
          if (!sessionName) throw new Error('Token is missing session name (tpc).');
        } else {
          const payload = {
            role: Number(role) ? 1 : 0,
            user_id: userId ?? undefined,
            call_id: callId,
            userName: displayNameFor(role, locationName),
            location_name: locationName || undefined,
          };
          dbg('POST /join', { callId, payload });

          const { data } = await axios.post(
            `${API_BASE}/qr/calls/${encodeURIComponent(String(callId))}/join`,
            payload,
            { headers: { 'Content-Type': 'application/json' } }
          );

          // If backend chose Meeting SDK redirect, bounce to Zoom web client
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
          sessionName  = String(data.sessionName);
          const p = decodeJwtPayload(sessionToken);
          myDisplayName = p?.user_identity || payload.userName;
        }

        // 2) Init & join
        const client = ZoomVideo.createClient();
        clientRef.current = client;

        await client.init('en-US', 'Global', { patchJsMedia: true });
        await client.join(sessionName, sessionToken, myDisplayName);

        if (selfLabelRef.current) selfLabelRef.current.textContent = `You — ${myDisplayName}`;

        // 3) Media + devices
        const media = client.getMediaStream();
        mediaRef.current = media;

        try {
          const list = await maybeAwait(media.getCameraList?.());
          if (Array.isArray(list) && list.length) {
            setCams(list);
            setCamId((prev) => prev || list[0]?.deviceId || '');
          }
        } catch {}

        // DO NOT auto-start camera/audio (avoids “Video is started” races)
        setMicOn(false);
        setCamOn(false);
        setNeedsGesture(true);

        // 4) Current remotes
        const me = client.getCurrentUserInfo()?.userId;
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
          else detachRemote(userId); // keep tile
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

    // Cleanup
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
        remoteTilesRef.current.forEach(async (_, uid) => {
          try { await detachVideoCompat(media, uid, null, dbg); } catch {}
        });
        remoteTilesRef.current.clear();
      } catch {}

      try {
        const me = client?.getCurrentUserInfo()?.userId;
        if (me != null) detachVideoCompat(media, me, selfSlotRef.current, dbg);
      } catch {}

      try { maybeAwait(media?.stopVideo()); } catch {}
      try { maybeAwait(media?.stopAudio()); } catch {}
      try { client?.leave(); } catch {}

      clientRef.current = null;
      mediaRef.current  = null;
    };
  }, [callId, locationName, role, userId, token]); // do NOT depend on camId/debug here

  // Switch camera without re-joining
  useEffect(() => {
    (async () => {
      const media = mediaRef.current;
      if (!media || !camOn || !camId) return;
      try {
        if (media.switchCamera) {
          dbg('switchCamera(camId)', { camId });
          await maybeAwait(media.switchCamera(camId));
        } else {
          dbg('switchCamera fallback: restart startVideo', { camId });
          await maybeAwait(media.stopVideo());
          await startCamInternal(camId);
        }
      } catch (e) {
        dbg('switchCamera fail', String(e));
      }
    })();
  }, [camId, camOn]);

  // ---------- Controls ----------
  const toggleMic = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      if (micOn) { await maybeAwait(media.stopAudio()); setMicOn(false); }
      else      { await maybeAwait(media.startAudio()); setMicOn(true); }
    } catch (e) {
      setError('Microphone error: ' + (e?.reason || e?.message || 'unknown'));
    }
  };

  const startCam = async () => { await startCamInternal(); };
  const stopCam  = async () => {
    try { await maybeAwait(mediaRef.current?.stopVideo()); } catch {}
    setCamOn(false);
  };
  const toggleCam = async () => (camOn ? stopCam() : startCam());

  const handleEnable = async () => {
    setError('');
    const ok = await startCamInternal();
    if (ok) await toggleMic(); // mic after cam is more reliable for autoplay
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

        {cams.length > 1 && (
          <select
            value={camId}
            onChange={(e) => setCamId(e.target.value)}
            style={{ marginLeft: 12, background: '#111', color: '#fff', borderRadius: 6, border: '1px solid #333', padding: '4px 8px' }}
            title="Camera"
          >
            {cams.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>
            ))}
          </select>
        )}

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
        {/* Local tile (container DIV, not <video>) */}
        <div style={{ position: 'relative' }}>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>You</div>
          <div style={{
            position: 'relative', width: '100%', height: 220,
            background: '#111', borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,.35)'
          }}>
            <div
              ref={selfSlotRef}
              style={{ width: '100%', height: '100%' }}
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
