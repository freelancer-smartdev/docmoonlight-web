import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';

/** Decode JWT payload (base64url → JSON). */
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

export default function ZoomMeetingComponent({
  callId,
  locationName,
  role = 0,          // 0 = participant (web)
  userId,
  token,            // optional: passed from mobile deep link
}) {
  // Refs
  const selfVideoRef = useRef(null);
  const selfLabelRef = useRef(null);
  const remoteGridRef = useRef(null);

  const clientRef = useRef(null);
  const mediaRef = useRef(null);

  // uid -> { wrapper, canvas, label }
  const remoteTilesRef = useRef(new Map());

  // State
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState('');
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
      setDebugLines((p) => p.concat(line).slice(-150));
    }
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  // ----- Remote tile helpers -----
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
      width: '280px',
      height: '180px',
      background: '#111',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,.35)',
    });

    const canvas = document.createElement('canvas');
    canvas.width = 280;
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
      const user = client.getAllUser()?.find((x) => x.userId === uid) || { userId: uid };
      const { canvas } = ensureRemoteTile(user);
      await media.renderVideo(canvas, uid, 280, 180, 0, 0, 2);
      dbg('remote.render ok', { uid });
    } catch (e) {
      dbg('remote.render fail (keeping placeholder)', { uid, err: e?.reason || e?.message || String(e) });
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

  // ----- Join flow -----
  useEffect(() => {
    if (!callId && !token) return;
    let mounted = true;

    (async () => {
      try {
        setError('');
        setJoining(true);

        // 1) Resolve token + sessionName + displayName
        let sessionName, sessionToken = token, displayName;

        if (sessionToken) {
          const p = decodeJwtPayload(sessionToken);
          sessionName = p?.tpc;
          displayName = p?.user_identity || (locationName ? `Clinic – ${locationName}` : 'Clinic');
          if (!sessionName) throw new Error('Token is missing session name (tpc).');
        } else {
          const payload = {
            role: Number(role ?? 0),
            user_id: userId ?? undefined,
            call_id: callId,
            userName: role === 1 ? `Doctor – ${locationName || ''}` : `Clinic – ${locationName || ''}`,
            location_name: locationName || undefined,
          };
          dbg('POST /join', { callId, payload });

          const { data } = await axios.post(
            `${API_BASE}/qr/calls/${encodeURIComponent(String(callId))}/join`,
            payload,
            { headers: { 'Content-Type': 'application/json' } }
          );

          if (data?.meetingNumber) {
            // (Rare fallback) old Meeting SDK — redirect
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

        // 2) Init & join
        const client = ZoomVideo.createClient();
        clientRef.current = client;

        await client.init('en-US', 'Global', { patchJsMedia: true });
        await client.join(sessionName, sessionToken, displayName);

        // Local name tag
        if (selfLabelRef.current) selfLabelRef.current.textContent = `You — ${displayName}`;

        // 3) Media start + attach self
        const media = client.getMediaStream();
        mediaRef.current = media;

        try {
          await media.startAudio();
        } catch (e) {
          dbg('startAudio blocked', e?.reason || e?.message);
        }
        try {
          await media.startVideo();
          const me = client.getCurrentUserInfo()?.userId;
          if (selfVideoRef.current && me != null) {
            await media.attachVideo(selfVideoRef.current, me);
          }
          setNeedsGesture(false);
        } catch (e) {
          dbg('startVideo blocked', e?.reason || e?.message);
          setNeedsGesture(true);
          setError('Enable camera & mic to continue');
        }

        // 4) Initial remotes
        const me = client.getCurrentUserInfo()?.userId;
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== me) { ensureRemoteTile(u); renderRemote(u.userId); }
        });

        // 5) Events
        client.on('user-added', (list) => {
          const arr = Array.isArray(list) ? list : [list];
          arr.forEach((u) => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) {
              ensureRemoteTile(u);
              renderRemote(u.userId);
            }
          });
        });

        client.on('user-updated', (list) => {
          const arr = Array.isArray(list) ? list : [list];
          arr.forEach((u) => {
            const tile = remoteTilesRef.current.get(u.userId);
            if (tile?.label && u.displayName) tile.label.textContent = u.displayName;
          });
        });

        client.on('user-removed', (list) => {
          const arr = Array.isArray(list) ? list : [list];
          arr.forEach((u) => removeRemoteTile(u.userId));
        });

        client.on('peer-video-state-change', ({ action, userId }) => {
          if (action === 'Start') renderRemote(userId);
          else stopRemoteRenderOnly(userId); // keep name placeholder
        });

        if (!mounted) return;
        setJoining(false);
      } catch (e) {
        dbg('JOIN FAIL', e?.response?.data || e?.message || e);
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
      try {
        remoteTilesRef.current.forEach((_, uid) => {
          try { mediaRef.current?.stopRender(uid); } catch { }
        });
        remoteTilesRef.current.clear();

        const me = clientRef.current?.getCurrentUserInfo()?.userId;
        if (me != null) { try { mediaRef.current?.detachVideo(me); } catch { } }
      } catch { }

      try { mediaRef.current?.stopVideo(); } catch { }
      try { mediaRef.current?.stopAudio(); } catch { }
      try { clientRef.current?.leave(); } catch { }

      clientRef.current = null;
      mediaRef.current = null;
    };
  }, [callId, locationName, role, userId, token, debug]);

  const handleEnableMedia = async () => {
    try {
      setError('');
      const client = clientRef.current;
      const media = mediaRef.current || client?.getMediaStream();
      if (!client || !media) return;
      try { await media.startAudio(); } catch { }
      await media.startVideo();
      const me = client.getCurrentUserInfo()?.userId;
      if (selfVideoRef.current && me != null) {
        await media.attachVideo(selfVideoRef.current, me);
      }
      setNeedsGesture(false);
    } catch (e) {
      setError(e?.reason || e?.message || 'Could not start camera/mic');
    }
  };

  // UI
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid', gridTemplateRows: 'auto 1fr',
      background: '#000', color: '#fff', position: 'relative'
    }}>
      {/* Top bar */}
      <div style={{
        padding: 12, display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.08)'
      }}>
        <strong>{locationName ? `Clinic – ${locationName}` : 'Clinic'}</strong>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => {
              try { mediaRef.current?.stopVideo(); } catch { }
              try { mediaRef.current?.stopAudio(); } catch { }
              try { clientRef.current?.leave(); } catch { }
            }}
            style={{ padding: '6px 12px', borderRadius: 8, background: '#d33', color: '#fff', border: 0 }}>
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
        <div>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>You</div>
          <div style={{
            position: 'relative', width: '100%', height: 220,
            background: '#111', borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,.35)'
          }}>
            <video
              ref={selfVideoRef}
              autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#111' }}
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

        {/* Remote grid */}
        <div>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>Participants</div>
          <div
            ref={remoteGridRef}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
              minHeight: 220
            }}
          />
        </div>
      </div>

      {/* Overlays */}
      {joining && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)' }}>
          Connecting to session…
        </div>
      )}
      {(needsGesture || !!error) && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' }}>
          <div style={{ display: 'grid', gap: 10, placeItems: 'center' }}>
            {!!error && (
              <div style={{ background: 'rgba(220,0,0,.8)', padding: '8px 12px', borderRadius: 6, maxWidth: 520 }}>
                {String(error)}
              </div>
            )}
            <button onClick={handleEnableMedia}
              style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: '#1f8fff', color: '#fff', fontWeight: 600 }}>
              Enable camera & mic
            </button>
          </div>
        </div>
      )}

      {debug && (
        <div style={{
          position: 'absolute', right: 8, bottom: 8, width: 360, maxHeight: 240, overflow: 'auto',
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
