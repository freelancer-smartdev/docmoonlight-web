import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json);
  } catch { return null; }
}

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const localDisplayName = (role, locationName) =>
  role === 1 ? `Doctor – ${locationName || ''}` : `Clinic – ${locationName || ''}`;

export default function ZoomMeetingComponent({ callId, locationName, role = 0, userId, token }) {
  const selfVideoRef = useRef(null);
  const selfCanvasRef = useRef(null);
  const selfLabelRef = useRef(null);
  const remoteGridRef = useRef(null);

  const clientRef = useRef(null);
  const mediaRef = useRef(null);

  const remoteTilesRef = useRef(new Map());

  const [joining, setJoining] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [useSelfCanvas, setUseSelfCanvas] = useState(false);
  const [banner, setBanner] = useState('');

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
      setDebugLines(p => p.concat(line).slice(-140));
    }
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  // ---------- helpers ----------
  const ensureRemoteTile = (user) => {
    const uid = user.userId;
    let tile = remoteTilesRef.current.get(uid);
    if (tile) {
      if (user.displayName && tile.label) tile.label.textContent = user.displayName;
      return tile;
    }
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'relative', background: '#111', borderRadius: '12px',
      overflow: 'hidden', minHeight: '180px', boxShadow: '0 2px 10px rgba(0,0,0,.35)', display: 'grid'
    });
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 180;
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    const label = document.createElement('div');
    label.textContent = user.displayName || `User ${uid}`;
    Object.assign(label.style, {
      position: 'absolute', left: '10px', bottom: '8px', padding: '3px 8px',
      fontSize: '12px', color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: '6px'
    });
    wrapper.appendChild(canvas); wrapper.appendChild(label);
    remoteGridRef.current?.appendChild(wrapper);
    tile = { wrapper, canvas, label };
    remoteTilesRef.current.set(uid, tile);
    return tile;
  };

  const renderRemote = async (uid) => {
    try {
      const client = clientRef.current, media = mediaRef.current;
      if (!client || !media) return;
      const user = (client.getAllUser() || []).find(u => u.userId === uid) || { userId: uid };
      const { canvas } = ensureRemoteTile(user);
      const target = (client.getAllUser() || []).find(u => u.userId === uid);
      if (target?.bVideoOn) {
        await media.renderVideo(canvas, uid, 320, 180, 0, 0, 2);
        dbg('remote.render ok', { uid });
      } else {
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        dbg('remote.noVideo placeholder', { uid });
      }
    } catch (e) { dbg('remote.render fail', { uid, err: e?.reason || e?.message }); }
  };

  const stopRemoteRenderOnly = (uid) => {
    try { mediaRef.current?.stopRender(uid); } catch {}
    const tile = remoteTilesRef.current.get(uid);
    if (tile?.canvas) {
      const ctx = tile.canvas.getContext('2d');
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, tile.canvas.width, tile.canvas.height);
    }
  };

  // quick probe to know if camera is REALLY free
  const probeCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach(t => t.stop());
      return { ok: true };
    } catch (e) {
      return { ok: false, name: e?.name, message: e?.message };
    }
  };

  // ---------- join ----------
  useEffect(() => {
    if (!callId && !token) return;
    let mounted = true;
    (async () => {
      try {
        setBanner(''); setJoining(true);

        let sessionToken = token, sessionName, displayName;
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
          const { data } = await axios.post(
            `${API_BASE}/qr/calls/${encodeURIComponent(String(callId))}/join`,
            payload, { headers: { 'Content-Type': 'application/json' } }
          );
          if (data?.meetingNumber) {
            const url = new URL(`https://app.zoom.us/wc/join/${data.meetingNumber}`);
            if (data.password) url.searchParams.set('pwd', data.password);
            url.searchParams.set('prefer', '1');
            url.searchParams.set('un', btoa(unescape(encodeURIComponent(payload.userName))));
            window.location.replace(url.toString()); return;
          }
          if (!data?.token || !data?.sessionName) throw new Error('Unexpected join payload from server.');
          sessionToken = String(data.token); sessionName = String(data.sessionName);
          const p = decodeJwtPayload(sessionToken); displayName = p?.user_identity || payload.userName;
        }

        const client = ZoomVideo.createClient(); clientRef.current = client;
        await client.init('en-US', 'Global', { patchJsMedia: true });
        await client.join(sessionName, sessionToken, displayName);
        if (selfLabelRef.current) selfLabelRef.current.textContent = `You — ${displayName}`;

        const media = client.getMediaStream(); mediaRef.current = media;

        try { await media.startAudio(); setMicOn(true); } catch (e) { dbg('startAudio fail', e?.name || e?.message); }

        // self video start with robust fallbacks
        const startSelfVideo = async () => {
          setUseSelfCanvas(false);
          try {
            await media.startVideo({ videoElement: selfVideoRef.current }); // primary path
            setCamOn(true); setBanner(''); dbg('startVideo [videoElement] ok');
            return;
          } catch (e1) {
            dbg('startVideo [videoElement] failed', e1?.name || e1?.message);
            try {
              await media.startVideo();                                    // secondary
              const me = client.getCurrentUserInfo()?.userId;
              if (selfVideoRef.current && me != null && media.attachVideo) {
                await media.attachVideo(selfVideoRef.current, me);
                setCamOn(true); setBanner(''); dbg('startVideo + attach ok');
                return;
              }
            } catch (e2) {
              dbg('startVideo + attach failed', e2?.name || e2?.message);
              // probe device to explain the real reason
              const probe = await probeCamera();
              if (!probe.ok) {
                setCamOn(false);
                if (/NotReadableError/i.test(probe.name) || /in use/i.test(probe.message))
                  setBanner('Camera is in use by another app/tab. Close any app using the camera (Zoom/Teams/OBS/Camera app/other browser tabs) and click “Enable mic & cam”.');
                else if (/NotAllowedError|SecurityError/i.test(probe.name))
                  setBanner('Camera permission is blocked. Click the camera icon in the address bar and allow access, then click “Enable mic & cam”.');
                else setBanner(`${probe.name || 'Camera error'}: ${probe.message || 'Unknown error'}`);
                return;
              }
              // device is free → try canvas preview fallback
              try {
                const me = client.getCurrentUserInfo()?.userId;
                const cvs = selfCanvasRef.current;
                if (me != null && cvs) {
                  cvs.width = 320; cvs.height = 180;
                  await media.startVideo(); // ensure capture started
                  await media.renderVideo(cvs, me, 320, 180, 0, 0, 2);
                  setUseSelfCanvas(true); setCamOn(true); setBanner('');
                  dbg('self canvas render ok');
                  return;
                }
              } catch (e3) {
                setCamOn(false);
                setBanner(e3?.reason || e3?.message || e3?.name || 'Could not start camera');
                dbg('self canvas render fail', e3?.name || e3?.message);
              }
            }
          }
        };

        await startSelfVideo();

        const me = client.getCurrentUserInfo()?.userId;
        (client.getAllUser() || []).forEach(u => { if (u.userId !== me) { ensureRemoteTile(u); renderRemote(u.userId); } });

        const onAdded = (list) => { asArray(list).forEach(u => { if (u.userId !== client.getCurrentUserInfo()?.userId) { ensureRemoteTile(u); renderRemote(u.userId); } }); };
        const onUpdated = (list) => { asArray(list).forEach(u => { const t = remoteTilesRef.current.get(u.userId); if (t?.label && u.displayName) t.label.textContent = u.displayName; }); };
        const onRemoved = (list) => { asArray(list).forEach(u => removeRemoteTile(u.userId)); };
        const onPeerVideo = ({ action, userId }) => { if (action === 'Start') renderRemote(userId); else stopRemoteRenderOnly(userId); };
        client.on('user-added', onAdded);
        client.on('user-updated', onUpdated);
        client.on('user-removed', onRemoved);
        client.on('peer-video-state-change', onPeerVideo);
        clientRef.current._handlers = { onAdded, onUpdated, onRemoved, onPeerVideo };

        if (!mounted) return;
        setJoining(false);
      } catch (e) {
        console.group('[VideoSDK][join] failed');
        console.error(e?.response?.data || e);
        console.groupEnd?.();
        if (!mounted) return;
        setBanner(e?.response?.data?.error || e?.response?.data?.message || e?.reason || e?.message || 'Failed to join session');
        setJoining(false);
      }
    })();

    return () => {
      const client = clientRef.current, media = mediaRef.current;
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
        const me = client?.getCurrentUserInfo()?.userId;
        if (me != null) { try { media?.detachVideo?.(me); } catch {} try { media?.stopRender?.(me); } catch {} }
      } catch {}
      try { media?.stopVideo(); } catch {}
      try { media?.stopAudio(); } catch {}
      try { client?.leave(); } catch {}
      clientRef.current = null; mediaRef.current = null;
    };
  }, [callId, locationName, role, userId, token, debug]);

  // controls
  const retryEnable = async () => {
    setBanner('');
    const client = clientRef.current, media = mediaRef.current || client?.getMediaStream();
    if (!client || !media) return;
    try {
      if (!micOn) { try { await media.startAudio(); setMicOn(true); } catch (e) { dbg('retry audio', e?.name || e?.message); } }
      if (!camOn) {
        // re-run the self start logic via toggling state
        setCamOn(false); setUseSelfCanvas(false);
        // simplest: let the effect path handle; but here directly retry:
        try {
          await media.startVideo({ videoElement: selfVideoRef.current });
          setCamOn(true); setBanner(''); return;
        } catch {}
        try {
          await media.startVideo();
          const me = client.getCurrentUserInfo()?.userId;
          if (selfVideoRef.current && me != null && media.attachVideo) {
            await media.attachVideo(selfVideoRef.current, me);
            setCamOn(true); setBanner(''); return;
          }
        } catch {}
        const probe = await probeCamera();
        if (!probe.ok) {
          if (/NotReadableError/i.test(probe.name) || /in use/i.test(probe.message))
            setBanner('Camera is in use by another app/tab. Close them and try again.');
          else if (/NotAllowedError|SecurityError/i.test(probe.name))
            setBanner('Camera permission is blocked. Allow it in the address bar and try again.');
          else setBanner(`${probe.name || 'Camera error'}: ${probe.message || 'Unknown error'}`);
          return;
        }
        try {
          const me = client.getCurrentUserInfo()?.userId;
          const cvs = selfCanvasRef.current; cvs.width = 320; cvs.height = 180;
          await media.startVideo(); await media.renderVideo(cvs, me, 320, 180, 0, 0, 2);
          setUseSelfCanvas(true); setCamOn(true); setBanner('');
        } catch (e) {
          setBanner(e?.reason || e?.message || e?.name || 'Could not start camera');
        }
      }
    } catch (e) {
      setBanner(e?.reason || e?.message || 'Could not start camera/mic');
    }
  };

  const toggleMic = async () => {
    const media = mediaRef.current; if (!media) return;
    try { if (micOn) { await media.stopAudio(); setMicOn(false); } else { await media.startAudio(); setMicOn(true); } }
    catch (e) { dbg('toggleMic', e?.name || e?.message); }
  };

  const toggleCam = async () => {
    const client = clientRef.current, media = mediaRef.current; if (!client || !media) return;
    try {
      if (camOn) {
        const me = client.getCurrentUserInfo()?.userId;
        if (me != null) { try { await media.detachVideo?.(me); } catch {} try { await media.stopRender?.(me); } catch {} }
        await media.stopVideo(); setCamOn(false); setUseSelfCanvas(false);
      } else {
        setUseSelfCanvas(false); await media.startVideo({ videoElement: selfVideoRef.current });
        setCamOn(true); setBanner('');
      }
    } catch (e) {
      const m = e?.reason || e?.message || e?.name || 'Could not start camera';
      dbg('toggleCam', m);
      if (/NotReadableError/i.test(m) || /in use/i.test(m)) setBanner('Camera is in use by another app/tab.');
      else if (/NotAllowedError|SecurityError/i.test(m)) setBanner('Camera permission is blocked.');
      else setBanner(m);
      setCamOn(false);
    }
  };

  return (
    <div style={{ width:'100%', height:'100%', display:'grid', gridTemplateRows:'auto 1fr', background:'#000', color:'#fff' }}>
      {/* Top bar */}
      <div style={{ padding:12, display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.06)', borderBottom:'1px solid rgba(255,255,255,.07)' }}>
        <strong>{locationName ? `Clinic – ${locationName}` : 'Clinic'}</strong>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={toggleMic} style={{ padding:'6px 12px', borderRadius:8, border:0, background: micOn ? '#2e8b57' : '#666', color:'#fff' }}>{micOn ? 'Mic On' : 'Mic Off'}</button>
          <button onClick={toggleCam} style={{ padding:'6px 12px', borderRadius:8, border:0, background: camOn ? '#2e8b57' : '#666', color:'#fff' }}>{camOn ? 'Cam On' : 'Cam Off'}</button>
          <button onClick={() => { try { mediaRef.current?.stopVideo(); } catch {} try { mediaRef.current?.stopAudio(); } catch {} try { clientRef.current?.leave(); } catch {} }} style={{ padding:'6px 12px', borderRadius:8, background:'#d33', color:'#fff', border:0 }}>Leave</button>
        </div>
      </div>

      {/* Stage */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(280px,360px) 1fr', gap:14, padding:14 }}>
        {/* Local tile */}
        <div style={{ position:'relative' }}>
          <div style={{ color:'#bbb', marginBottom:6, fontSize:14 }}>You</div>
          <div style={{ position:'relative', width:'100%', height:220, background:'#111', borderRadius:12, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,.35)' }}>
            {/* video or canvas */}
            <video ref={selfVideoRef} autoPlay muted playsInline style={{ width:'100%', height:'100%', objectFit:'cover', display: useSelfCanvas ? 'none' : 'block' }} />
            <canvas ref={selfCanvasRef} style={{ width:'100%', height:'100%', display: useSelfCanvas ? 'block' : 'none' }} />
            <div ref={selfLabelRef} style={{ position:'absolute', left:10, bottom:8, padding:'3px 8px', fontSize:12, background:'rgba(0,0,0,.55)', borderRadius:6 }}>You</div>
          </div>
        </div>

        {/* Remotes */}
        <div>
          <div style={{ color:'#bbb', marginBottom:6, fontSize:14 }}>Participants</div>
          <div ref={remoteGridRef} id="remote-grid" style={{ width:'100%', minHeight:220, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 }} />
        </div>
      </div>

      {joining && (
        <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', background:'rgba(0,0,0,.35)', fontSize:16 }}>
          Connecting to session…
        </div>
      )}

      {(!!banner || !camOn || !micOn) && (
        <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', background:'rgba(0,0,0,.25)' }}>
          <div style={{ display:'grid', gap:10, placeItems:'center' }}>
            {!!banner && <div style={{ background:'rgba(220,0,0,.85)', padding:'8px 12px', borderRadius:6, maxWidth:620, lineHeight:1.35 }}>{banner}</div>}
            <button onClick={retryEnable} style={{ padding:'10px 14px', borderRadius:8, border:0, background:'#1f8fff', color:'#fff', fontWeight:600 }}>Enable mic &amp; cam</button>
          </div>
        </div>
      )}

      {debug && (
        <div style={{ position:'absolute', right:8, bottom:8, width:380, maxHeight:260, overflow:'auto', fontFamily:'ui-monospace, Menlo, monospace', fontSize:11, background:'rgba(0,0,0,.55)', border:'1px solid rgba(255,255,255,.12)', borderRadius:6, padding:8, whiteSpace:'pre-wrap' }}>
          {debugLines.join('\n')}
        </div>
      )}
    </div>
  );
}
