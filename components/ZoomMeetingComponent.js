import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';

// ── helpers
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch { return null; }
}
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const localDisplayName = (role, locationName) =>
  role === 1 ? `Doctor – ${locationName || ''}` : `Clinic – ${locationName || ''}`;

// ────────────────────────────────────────────────────────────────────────────────
export default function ZoomMeetingComponent({
  callId,
  locationName,
  role = 0,
  userId,
  token,
}) {
  // refs
  const selfVideoRef = useRef(null);
  const selfLabelRef = useRef(null);
  const clientRef = useRef(null);
  const mediaRef  = useRef(null);
  const remoteGridRef = useRef(null);
  // uid -> {wrapper, canvas, label}
  const remoteTilesRef = useRef(new Map());

  // state
  const [joining, setJoining]   = useState(true);
  const [error, setError]       = useState('');
  const [needsGesture, setNeedsGesture] =
    useState(typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);

  // optional on-screen logs (?debug=1)
  const [debug, setDebug] = useState(false);
  const [debugLines, setDebugLines] = useState([]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDebug(new URLSearchParams(window.location.search).has('debug'));
    }
  }, []);
  const dbg = (msg, data) => {
    if (debug) {
      setDebugLines(prev => prev.concat(`[VideoSDK] ${msg} ${data ? JSON.stringify(data) : ''}`).slice(-150));
    }
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  // ── remote tiles
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
    canvas.width  = 320;
    canvas.height = 180;
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });

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
      const media  = mediaRef.current;
      if (!client || !media) return;

      const user = (client.getAllUser() || []).find(u => u.userId === uid) || { userId: uid };
      const { canvas } = ensureRemoteTile(user);

      // If peer currently has video on, render, otherwise keep placeholder.
      if (user.bVideoOn) {
        await media.renderVideo(canvas, uid, 320, 180, 0, 0, 2);
        dbg('remote.render ok', { uid });
      } else {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        dbg('remote.noVideo placeholder', { uid });
      }
    } catch (e) {
      dbg('remote.render fail', { uid, err: e?.reason || e?.message || String(e) });
    }
  };

  const stopRemoteRenderOnly = (uid) => {
    try { mediaRef.current?.stopRender(uid); } catch {}
    const tile = remoteTilesRef.current.get(uid);
    if (tile?.canvas) {
      const ctx = tile.canvas.getContext('2d');
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, tile.canvas.width, tile.canvas.height);
    }
  };
  const removeRemoteTile = (uid) => {
    stopRemoteRenderOnly(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (tile) { tile.wrapper.remove(); remoteTilesRef.current.delete(uid); }
  };

  // ── join + media start
  useEffect(() => {
    if (!callId && !token) return;
    let mounted = true;

    (async () => {
      try {
        setError(''); setJoining(true);

        // 1) Resolve sessionName + token
        let sessionToken = token;
        let sessionName; let displayName;

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
            // (rare) Meeting SDK fallback
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
        dbg('joined', { sessionName, displayName, sdk: ZoomVideo.getSDKVersion?.() });

        if (selfLabelRef.current) selfLabelRef.current.textContent = `You — ${displayName}`;

        const media = client.getMediaStream();
        mediaRef.current = media;

        // 3) Try to start media automatically (some browsers will block → needsGesture)
        try {
          await media.startAudio(); setMicOn(true);
        } catch (e) {
          setNeedsGesture(true); dbg('startAudio blocked', e?.name || e?.message);
        }
        try {
          await media.startVideo(); // <- compatible path for your deployed SDK
          const me = client.getCurrentUserInfo()?.userId;
          if (selfVideoRef.current && me != null) {
            await media.attachVideo(selfVideoRef.current, me);
          }
          setCamOn(true);
        } catch (e) {
          setNeedsGesture(true);
          dbg('startVideo fail', e?.name || e?.message || e);
        }

        // 4) Initial peers
        const me = client.getCurrentUserInfo()?.userId;
        (client.getAllUser() || []).forEach(u => { if (u.userId !== me) { ensureRemoteTile(u); renderRemote(u.userId); } });

        // 5) Events
        const onAdded = (list) => {
          asArray(list).forEach(u => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) { ensureRemoteTile(u); renderRemote(u.userId); }
          });
        };
        const onUpdated = (list) => {
          asArray(list).forEach(u => {
            const tile = remoteTilesRef.current.get(u.userId);
            if (tile?.label && u.displayName) tile.label.textContent = u.displayName;
          });
        };
        const onRemoved = (list) => { asArray(list).forEach(u => removeRemoteTile(u.userId)); };
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
        remoteTilesRef.current.forEach((_, uid) => { try { media?.stopRender(uid); } catch {} });
        remoteTilesRef.current.clear();
      } catch {}

      try { 
        const me = client?.getCurrentUserInfo?.()?.userId;
        if (me != null) { try { media?.detachVideo?.(me); } catch {} }
      } catch {}

      try { media?.stopVideo(); } catch {}
      try { media?.stopAudio(); } catch {}
      try { client?.leave(); } catch {}

      clientRef.current = null;
      mediaRef.current  = null;
    };
  }, [callId, locationName, role, userId, token, debug]);

  // ── controls
  const handleEnableMedia = async () => {
    setError('');
    const client = clientRef.current; const media = mediaRef.current || client?.getMediaStream();
    if (!client || !media) return;
    try { await media.startAudio(); setMicOn(true); } catch (e) { dbg('enable audio fail', e?.name || e?.message); setError('Mic permission blocked'); }
    try {
      await media.startVideo();
      const me = client.getCurrentUserInfo()?.userId;
      if (selfVideoRef.current && me != null) await media.attachVideo(selfVideoRef.current, me);
      setCamOn(true);
      setNeedsGesture(false);
    } catch (e) {
      dbg('enable video fail', e?.name || e?.message);
      setError('Camera permission blocked or in use by another app');
    }
  };

  const toggleMic = async () => {
    const media = mediaRef.current; if (!media) return;
    try {
      if (micOn) { await media.stopAudio(); setMicOn(false); }
      else { await media.startAudio(); setMicOn(true); }
    } catch (e) { dbg('toggleMic error', e?.name || e?.message); }
  };

  const toggleCam = async () => {
    const client = clientRef.current; const media = mediaRef.current; if (!client || !media) return;
    try {
      if (camOn) {
        const me = client.getCurrentUserInfo()?.userId;
        if (me != null) { try { await media.detachVideo(selfVideoRef.current, me); } catch {} }
        await media.stopVideo(); setCamOn(false);
      } else {
        await media.startVideo();
        const me = client.getCurrentUserInfo()?.userId;
        if (selfVideoRef.current && me != null) await media.attachVideo(selfVideoRef.current, me);
        setCamOn(true);
      }
    } catch (e) { dbg('toggleCam error', e?.name || e?.message); }
  };

  // ── UI
  return (
    <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateRows:'auto 1fr', background:'#000', color:'#fff' }}>
      {/* Top bar */}
      <div style={{ padding: 12, display:'flex', gap:8, alignItems:'center',
                    background:'rgba(255,255,255,.06)', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
        <strong style={{ letterSpacing: '.2px' }}>
          {locationName ? `Clinic – ${locationName}` : 'Clinic'}
        </strong>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={toggleMic}
                  style={{ padding:'6px 10px', borderRadius:8, border:0, background: micOn ? '#2e7d32' : '#666', color:'#fff' }}>
            {micOn ? 'Mic On' : 'Mic Off'}
          </button>
          <button onClick={toggleCam}
                  style={{ padding:'6px 10px', borderRadius:8, border:0, background: camOn ? '#1976d2' : '#666', color:'#fff' }}>
            {camOn ? 'Cam On' : 'Cam Off'}
          </button>
          <button
            onClick={() => {
              try { mediaRef.current?.stopVideo(); } catch {}
              try { mediaRef.current?.stopAudio(); } catch {}
              try { clientRef.current?.leave(); } catch {}
            }}
            style={{ padding:'6px 12px', borderRadius:8, background:'#d33', color:'#fff', border:0 }}>
            Leave
          </button>
        </div>
      </div>

      {/* Stage */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(280px,360px) 1fr', gap:14, padding:14 }}>
        {/* Local */}
        <div style={{ position:'relative' }}>
          <div style={{ color:'#bbb', marginBottom:6, fontSize:14 }}>You</div>
          <div style={{ position:'relative', width:'100%', height:220, background:'#111',
                        borderRadius:12, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,.35)' }}>
            <video ref={selfVideoRef} autoPlay muted playsInline
                   style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            <div ref={selfLabelRef}
                 style={{ position:'absolute', left:10, bottom:8, padding:'3px 8px', fontSize:12,
                          background:'rgba(0,0,0,.55)', borderRadius:6, letterSpacing:'.2px' }}>
              You
            </div>
          </div>
        </div>
        {/* Remotes */}
        <div>
          <div style={{ color:'#bbb', marginBottom:6, fontSize:14 }}>Participants</div>
          <div ref={remoteGridRef}
               style={{ width:'100%', minHeight:220, display:'grid',
                        gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }} />
        </div>
      </div>

      {/* overlays */}
      {joining && (
        <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center',
                      background:'rgba(0,0,0,.35)', fontSize:16 }}>
          Connecting to session…
        </div>
      )}
      {(needsGesture || !!error) && (
        <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center',
                      background:'rgba(0,0,0,.45)' }}>
          <div style={{ display:'grid', gap:10, placeItems:'center' }}>
            {!!error && (
              <div style={{ background:'rgba(220,0,0,.85)', padding:'8px 12px', borderRadius:6, maxWidth:520 }}>
                {error}
              </div>
            )}
            <button onClick={handleEnableMedia}
                    style={{ padding:'10px 14px', borderRadius:8, border:0, background:'#1f8fff', color:'#fff', fontWeight:600 }}>
              Enable mic & cam
            </button>
          </div>
        </div>
      )}

      {/* debug overlay */}
      {debug && (
        <div style={{ position:'absolute', right:8, bottom:8, width:420, maxHeight:260, overflow:'auto',
                      fontFamily:'ui-monospace, Menlo, monospace', fontSize:11, whiteSpace:'pre-wrap',
                      background:'rgba(0,0,0,.55)', border:'1px solid rgba(255,255,255,.12)', borderRadius:6, padding:8 }}>
          {debugLines.join('\n')}
        </div>
      )}
    </div>
  );
}
