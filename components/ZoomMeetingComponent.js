import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';

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

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const localDisplayName = (role, locationName) =>
  role === 1 ? `Doctor – ${locationName || ''}` : `Clinic – ${locationName || ''}`;

export default function ZoomMeetingComponent({
  callId,
  locationName,
  role = 0,
  userId,
  token,
}) {
  // ---- Refs
  const selfVideoRef = useRef(null);
  const selfLabelRef = useRef(null);
  const clientRef = useRef(null);
  const mediaRef = useRef(null);
  const remoteGridRef = useRef(null);
  const remoteTilesRef = useRef(new Map()); // userId -> {wrapper, canvas, label}

  // ---- State
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState('');
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );

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
      setDebugLines((prev) => prev.concat(line).slice(-160));
    }
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  // ---- UI helpers
  const button = (onClick, label, color = '#2b8bff') => (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        border: 0,
        background: color,
        color: '#fff',
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );

  // ---- Remote tiles
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

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    Object.assign(canvas.style, {
      width: '100%',
      height: '100%',
      display: 'block',
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
    });

    wrapper.appendChild(canvas);
    wrapper.appendChild(label);
    remoteGridRef.current?.appendChild(wrapper);

    tile = { wrapper, canvas, label };
    remoteTilesRef.current.set(uid, tile);
    return tile;
  };

  const renderRemote = async (uid) => {
    try {
      const client = clientRef.current;
      const media = mediaRef.current;
      if (!client || !media) return;

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const { canvas } = ensureRemoteTile(user);

      const target = (client.getAllUser() || []).find((u) => u.userId === uid);
      const bVideoOn = !!target?.bVideoOn;

      if (bVideoOn) {
        await media.renderVideo(canvas, uid, 320, 180, 0, 0, 2);
        dbg('remote.render ok', { uid });
      } else {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        dbg('remote.noVideo placeholder', { uid });
      }
    } catch (e) {
      dbg('remote.render fail', { uid, err: e?.reason || e?.message || String(e) });
    }
  };

  const stopRemoteRenderOnly = (uid) => {
    try { mediaRef.current?.stopRender(uid); } catch { }
    const tile = remoteTilesRef.current.get(uid);
    if (tile?.canvas) {
      const ctx = tile.canvas.getContext('2d');
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, tile.canvas.width, tile.canvas.height);
    }
  };

  const removeRemoteTile = (uid) => {
    stopRemoteRenderOnly(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (tile) {
      tile.wrapper.remove();
      remoteTilesRef.current.delete(uid);
    }
  };

  // ---- Local media control
  const attachSelf = async (retry = 0) => {
    const client = clientRef.current;
    const media = mediaRef.current;
    if (!client || !media) return false;
    const me = client.getCurrentUserInfo()?.userId;
    if (!selfVideoRef.current || me == null) return false;

    try {
      await media.attachVideo(selfVideoRef.current, me);
      dbg('attach self ok');
      return true;
    } catch (e) {
      dbg('attach self fail', e?.reason || e?.message);
      if (retry < 3) {
        setTimeout(() => attachSelf(retry + 1), 400 * (retry + 1));
      }
      return false;
    }
  };

  const startMyVideo = async () => {
    const media = mediaRef.current;
    try {
      // choose a camera if available
      const cams = await media.getCameraList?.().catch(() => []);
      if (cams?.length) {
        try { await media.switchCamera(cams[0].deviceId); } catch { }
      }

      try {
        await media.startVideo(); // publish local video
      } catch (e) {
        const name = e?.name || e?.errorCode;
        if (name === 'NotAllowedError') setError('Camera blocked. Click the address-bar camera icon to allow.');
        else if (name === 'NotReadableError') setError('Camera is used by another app. Close other apps using the camera and retry.');
        else setError(e?.reason || e?.message || 'Could not start camera');
        throw e;
      }

      await attachSelf();
      setCamOn(true);
      setNeedsGesture(false);
    } catch (e) {
      dbg('startMyVideo failed', { name: e?.name, message: e?.message });
      throw e;
    }
  };

  const stopMyVideo = async () => {
    try { await mediaRef.current?.stopVideo(); } catch { }
    setCamOn(false);
  };

  const startMyAudio = async () => {
    try {
      await mediaRef.current?.startAudio();
      setMicOn(true);
      setNeedsGesture(false);
    } catch (e) {
      const name = e?.name || e?.errorCode;
      if (name === 'NotAllowedError') setError('Microphone blocked. Click the address-bar mic icon to allow.');
      else if (name === 'NotReadableError') setError('Microphone is used by another app. Close other apps using the mic and retry.');
      else setError(e?.reason || e?.message || 'Could not start mic');
      throw e;
    }
  };

  const stopMyAudio = async () => {
    try { await mediaRef.current?.stopAudio(); } catch { }
    setMicOn(false);
  };

  const toggleCam = async () => (camOn ? stopMyVideo() : startMyVideo());
  const toggleMic = async () => (micOn ? stopMyAudio() : startMyAudio());

  // ---- Join & events
  useEffect(() => {
    if (!callId && !token) return;
    let mounted = true;

    (async () => {
      try {
        setError('');
        setJoining(true);

        // 1) Resolve sessionName + token + displayName
        let sessionToken = token;
        let sessionName;
        let displayName;

        if (sessionToken) {
          const p = decodeJwtPayload(sessionToken);
          sessionName = p?.tpc;
          displayName = p?.user_identity || localDisplayName(role, locationName);
          if (!sessionName) throw new Error('Token is missing session name (tpc).');
        } else {
          const payload = {
            role: role ? 1 : 0,
            user_id: userId ?? undefined,
            call_id: callId,
            userName: localDisplayName(role, locationName),
            location_name: locationName || undefined,
          };
          dbg('POST /join', { callId, payload });

          const { data } = await axios.post(
            `${API_BASE}/qr/calls/${encodeURIComponent(String(callId))}/join`,
            payload,
            { headers: { 'Content-Type': 'application/json' } }
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
          displayName = p?.user_identity || payload.userName;
        }

        // 2) Init & join
        const client = ZoomVideo.createClient();
        clientRef.current = client;

        await client.init('en-US', 'Global', { patchJsMedia: true });
        await client.join(sessionName, sessionToken, displayName);

        if (selfLabelRef.current) {
          selfLabelRef.current.textContent = `You — ${displayName}`;
        }

        const media = client.getMediaStream();
        mediaRef.current = media;

        // 3) Try to start media (may fail due to permissions/OS locks)
        try { await startMyAudio(); } catch { /* handled above */ }
        try { await startMyVideo(); } catch { /* handled above */ }

        // 4) Existing remotes
        const me = client.getCurrentUserInfo()?.userId;
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== me) {
            ensureRemoteTile(u);
            renderRemote(u.userId);
          }
        });

        // 5) Events
        const onAdded = (list) => {
          asArray(list).forEach((u) => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) {
              ensureRemoteTile(u);
              renderRemote(u.userId);
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
          if (action === 'Start') renderRemote(userId);
          else stopRemoteRenderOnly(userId);
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
      const media = mediaRef.current;

      try {
        const h = client?._handlers;
        if (h) {
          client.off?.('user-added', h.onAdded);
          client.off?.('user-updated', h.onUpdated);
          client.off?.('user-removed', h.onRemoved);
          client.off?.('peer-video-state-change', h.onPeerVideo);
        }
      } catch { }

      // detach self
      try {
        const me = client?.getCurrentUserInfo?.()?.userId;
        if (me != null) media?.detachVideo?.(me);
      } catch { }

      try {
        remoteTilesRef.current.forEach((_, uid) => {
          try { media?.stopRender(uid); } catch { }
        });
        remoteTilesRef.current.clear();
      } catch { }

      try { media?.stopVideo(); } catch { }
      try { media?.stopAudio(); } catch { }
      try { client?.leave(); } catch { }

      clientRef.current = null;
      mediaRef.current = null;
    };
  }, [callId, locationName, role, userId, token, debug]);

  // ---- Gesture CTA
  const handleEnable = async () => {
    setError('');
    try { await startMyAudio(); } catch {}
    try { await startMyVideo(); } catch {}
  };

  // ---- UI
  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      background: '#000',
      color: '#fff'
    }}>
      {/* Top bar */}
      <div style={{
        padding: 12,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        background: 'rgba(255,255,255,.06)',
        borderBottom: '1px solid rgba(255,255,255,.07)'
      }}>
        <strong style={{ letterSpacing: '.2px' }}>
          {locationName ? `Clinic – ${locationName}` : 'Clinic'}
        </strong>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {button(toggleMic, micOn ? 'Mic On' : 'Mic Off', micOn ? '#2faa60' : '#6b7280')}
          {button(toggleCam, camOn ? 'Cam On' : 'Cam Off', camOn ? '#2b8bff' : '#6b7280')}
          {button(() => {
            try { mediaRef.current?.stopVideo(); } catch {}
            try { mediaRef.current?.stopAudio(); } catch {}
            try { clientRef.current?.leave(); } catch {}
          }, 'Leave', '#d33')}
        </div>
      </div>

      {/* Stage */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px,360px) 1fr',
        gap: 14,
        padding: 14
      }}>
        {/* Local tile */}
        <div style={{ position: 'relative' }}>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>You</div>
          <div style={{
            position: 'relative',
            width: '100%',
            height: 220,
            background: '#111',
            borderRadius: 12,
            overflow: 'hidden',
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
                position: 'absolute',
                left: 10,
                bottom: 8,
                padding: '3px 8px',
                fontSize: 12,
                background: 'rgba(0,0,0,.55)',
                borderRadius: 6,
                letterSpacing: '.2px'
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

      {/* Overlays */}
      {joining && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,.35)', fontSize: 16
        }}>
          Connecting to session…
        </div>
      )}

      {(needsGesture) && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,.45)'
        }}>
          <div style={{ display: 'grid', gap: 10, placeItems: 'center' }}>
            {!!error && (
              <div style={{
                background: 'rgba(220,0,0,.85)',
                padding: '8px 12px',
                borderRadius: 6,
                maxWidth: 520,
                lineHeight: 1.35
              }}>
                {String(error)}
              </div>
            )}
            {button(handleEnable, 'Enable mic & cam')}
          </div>
        </div>
      )}

      {!!error && !needsGesture && (
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(220,0,0,.85)', padding: '8px 12px',
          borderRadius: 6, maxWidth: 520
        }}>
          {String(error)}
        </div>
      )}

      {debug && (
        <div style={{
          position: 'absolute', right: 8, bottom: 8, width: 400, maxHeight: 260, overflow: 'auto',
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
