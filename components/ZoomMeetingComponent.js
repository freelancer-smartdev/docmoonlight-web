// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';
const BUILD = 'ZMC-v8.1-hybrid-self-video-canvas-remotes-2025-09-12';

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const displayNameFor = (role, location) =>
  Number(role) === 1 ? `Doctor – ${location || ''}` : `Clinic – ${location || ''}`;

/* ---------- utils ---------- */
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
async function maybeAwait(v) { return (v && typeof v.then === 'function') ? await v : v; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const niceErr = (e) =>
  typeof e === 'string'
    ? e
    : JSON.stringify({ name: e?.name, message: e?.message, reason: e?.reason, code: e?.code });

function sizeOf(el) {
  const r = el?.getBoundingClientRect?.();
  return { w: Math.max(0, Math.round(r?.width || 0)), h: Math.max(0, Math.round(r?.height || 0)) };
}
async function waitForNonZeroRect(el, label, dbg, timeoutMs = 1500, pollMs = 50) {
  const t0 = Date.now();
  let r = sizeOf(el);
  while ((r.w === 0 || r.h === 0) && Date.now() - t0 < timeoutMs) {
    await sleep(pollMs);
    r = sizeOf(el);
  }
  dbg('layout.nonzero-check', { label, rect: r, waitedMs: Date.now() - t0 });
  return r.w > 0 && r.h > 0;
}
function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p) => String.fromCharCode(parseInt(p, 16))));
}

/* ---------- environment helpers ---------- */
function mustUseVideoElForSelf() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isiOS = /iPhone|iPad|iPod/i.test(ua);
  const isChromiumFamily = /(Chrome|Chromium|Edg)\//i.test(ua) && !/OPR\//i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const hasSAB = 'SharedArrayBuffer' in window && window.crossOriginIsolated === true;
  // Zoom SDK requirement: iOS => video tag; Chromium/Android without SAB => video tag
  if (isiOS) return true;
  if ((isChromiumFamily || isAndroid) && !hasSAB) return true;
  return false;
}

/* ---------- global housekeeping ---------- */
const liveIntervals = new Set();
function safeInterval(fn, ms) {
  const id = setInterval(fn, ms);
  liveIntervals.add(id);
  return id;
}
function clearAllIntervals() {
  liveIntervals.forEach(clearInterval);
  liveIntervals.clear();
}

/* ---------- REMOTE: canvas rendering ---------- */
async function renderRemote(stream, uid, slotDiv, dbg) {
  await waitForNonZeroRect(slotDiv, 'remote.slot.beforeRender', dbg, 2000, 60);

  let canvas = slotDiv.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width:'100%', height:'100%', display:'block', background:'#111' });
    slotDiv.textContent = '';
    slotDiv.appendChild(canvas);
  }

  const { w, h } = sizeOf(slotDiv);
  await maybeAwait(stream.renderVideo(canvas, uid, Math.max(1, w), Math.max(1, h), 0, 0, 2)); // 2 = cover
  dbg('remote.render.ok', { uid, w, h });

  if (!slotDiv._ro) {
    const ro = new ResizeObserver(async () => {
      const { w: w2, h: h2 } = sizeOf(slotDiv);
      try {
        await maybeAwait(stream.updateVideoCanvasDimension(canvas, uid, Math.max(1, w2), Math.max(1, h2)));
      } catch (e) {
        dbg('remote.render.resize.fail', { uid, err: niceErr(e) });
      }
    });
    ro.observe(slotDiv);
    slotDiv._ro = ro;
  }
  return canvas;
}

async function unrenderRemote(stream, uid, slotDiv, dbg) {
  const canvas = slotDiv?.querySelector('canvas');
  try { if (canvas) await maybeAwait(stream.stopRenderVideo(canvas, uid)); } catch {}
  if (slotDiv?._ro) { try { slotDiv._ro.disconnect(); } catch {} delete slotDiv._ro; }
}

/* ---------- COMPONENT ---------- */
export default function ZoomMeetingComponent({ callId, locationName, role = 0, userId, token }) {
  const clientRef = useRef(null);
  const mediaRef  = useRef(null);

  // self: both canvas and video — choose at runtime
  const selfCanvasRef = useRef(null);
  const selfVideoRef  = useRef(null);
  const selfContainerRef = useRef(null);
  const selfLabelRef = useRef(null);
  const selfModeRef = useRef('auto'); // 'canvas' | 'video'
  const [selfMode, setSelfMode] = useState('auto');

  // userId -> { wrapper, slot, label }
  const remoteTilesRef = useRef(new Map());
  const remoteGridRef  = useRef(null);

  const [joining, setJoining] = useState(true);
  const [error, setError]     = useState('');
  const [micOn, setMicOn]     = useState(false);
  const [camOn, setCamOn]     = useState(false);

  const isiOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [needsGesture, setNeedsGesture] = useState(false);

  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState('');

  // Responsive
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Debug overlay
  const [debug, setDebug] = useState(false);
  const [debugLines, setDebugLines] = useState([]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDebug(new URLSearchParams(window.location.search).has('debug'));
      console.info('[ZMC] build', BUILD, {
        crossOriginIsolated: window.crossOriginIsolated,
        hasSAB: 'SharedArrayBuffer' in window,
        ua: navigator.userAgent,
      });
    }
  }, []); // eslint-disable-line
  const dbg = (msg, data) => {
    const line = `[VideoSDK] ${msg} ${data ? JSON.stringify(data) : ''}`;
    setDebugLines((p) => (debug ? p.concat(line).slice(-900) : p));
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  const joinedRef = useRef(false);

  /* ---- Remote tiles ---- */
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
      display: 'block',
      boxShadow: '0 2px 10px rgba(0,0,0,.35)'
    });

    const slot = document.createElement('div');
    Object.assign(slot.style, {
      width: '100%',
      height: '100%',
      position: 'relative',
      background: '#111'
    });

    const label = document.createElement('div');
    label.textContent = user.displayName || `User ${uid}`;
    Object.assign(label.style, {
      position: 'absolute', left: 10, bottom: 8, padding: '3px 8px', fontSize: 12,
      color: '#fff', background: 'rgba(0,0,0,.55)', borderRadius: 6, letterSpacing: '.2px', pointerEvents: 'none'
    });

    wrapper.appendChild(slot);
    wrapper.appendChild(label);
    remoteGridRef.current?.appendChild(wrapper);

    const tileObj = { wrapper, slot, label };
    remoteTilesRef.current.set(uid, tileObj);
    return tileObj;
  };

  const logUsers = (client, label) => {
    try {
      const me = client.getCurrentUserInfo();
      const list = (client.getAllUser() || []).map((u) => ({
        id: u.userId, name: u.displayName, bVideoOn: !!u.bVideoOn, self: u.userId === me?.userId,
      }));
      dbg(`users.${label}`, { me: me?.userId, list });
    } catch {}
  };

  const renderRemoteUser = async (uid, attempt = 0) => {
    try {
      const client = clientRef.current;
      const stream = mediaRef.current;
      if (!client || !stream) return;

      const meId = client.getCurrentUserInfo()?.userId;
      if (uid === meId) { dbg('remote.render.skip-self', { uid }); return; }

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const tile = ensureRemoteTile(user);

      await waitForNonZeroRect(tile.slot, 'tile.slot.beforeRender', dbg, 1600, 60);

      if (!user.bVideoOn) {
        if (attempt < 8) { dbg('remote.render.wait-video', { uid, attempt }); await sleep(200); return renderRemoteUser(uid, attempt + 1); }
        dbg('remote.render.abort-no-video', { uid });
        return;
      }

      await renderRemote(stream, uid, tile.slot, dbg);
    } catch (e) {
      dbg('remote.render.fail', { uid, attempt, err: niceErr(e) });
      if (attempt < 6) { await sleep(260); return renderRemoteUser(uid, attempt + 1); }
    }
  };

  const unrenderRemoteUser = async (uid) => {
    const tile = remoteTilesRef.current.get(uid);
    try { await unrenderRemote(mediaRef.current, uid, tile?.slot, dbg); } catch {}
  };
  const removeRemoteTile = async (uid) => {
    await unrenderRemoteUser(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (tile?.wrapper) tile.wrapper.remove();
    remoteTilesRef.current.delete(uid);
  };

  /* ---- Join & events ---- */
  useEffect(() => {
    if (!callId && !token) return;
    if (joinedRef.current) return;
    joinedRef.current = true;

    let mounted = true;

    (async () => {
      try {
        setError(''); setJoining(true);

        // resolve token + session
        let sessionToken = token, sessionName, myDisplayName;
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

          if (data?.meetingNumber) {
            const url = new URL(`https://app.zoom.us/wc/join/${data.meetingNumber}`);
            if (data.password) url.searchParams.set('pwd', data.password);
            url.searchParams.set('prefer', '1');
            url.searchParams.set('un', b64EncodeUnicode(payload.userName));
            window.location.replace(url.toString()); return;
          }

          if (!data?.token || !data?.sessionName) throw new Error('Unexpected join payload from server.');
          sessionToken = String(data.token);
          sessionName  = String(data.sessionName);
          const p = decodeJwtPayload(sessionToken);
          myDisplayName = p?.user_identity || payload.userName;
        }

        // init/join
        const client = ZoomVideo.createClient();
        clientRef.current = client;

        await client.init('en-US', 'Global', { patchJsMedia: true });
        await client.join(sessionName, sessionToken, myDisplayName);

        const meId = client.getCurrentUserInfo()?.userId;
        dbg('session', { sessionName, meId, platform: navigator.platform, ua: navigator.userAgent });
        if (selfLabelRef.current) selfLabelRef.current.textContent = `You — ${myDisplayName}`;

        // media
        const media = client.getMediaStream();
        mediaRef.current = media;

        // camera list + hot-plug
        try {
          const list = await maybeAwait(media.getCameraList?.());
          if (Array.isArray(list) && list.length) { setCams(list); setCamId((prev) => prev || list[0]?.deviceId || ''); }
        } catch {}
        const onDeviceChange = async () => {
          try {
            const list = await maybeAwait(media.getCameraList?.());
            if (Array.isArray(list)) setCams(list);
          } catch {}
        };
        navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

        setNeedsGesture(isiOS);
        setMicOn(false);
        setCamOn(false);

        // hydrate remotes
        logUsers(client, 'after-join');
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== meId) {
            ensureRemoteTile(u);
            if (u.bVideoOn) renderRemoteUser(u.userId);
          }
        });

        // events
        const onAdded = (list) => {
          logUsers(client, 'user-added');
          asArray(list).forEach((u) => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) {
              ensureRemoteTile(u);
              if (u.bVideoOn) renderRemoteUser(u.userId);
            }
          });
        };
        const onUpdated = (list) => {
          logUsers(client, 'user-updated');
          asArray(list).forEach((u) => {
            const t = remoteTilesRef.current.get(u.userId);
            if (t?.label && u.displayName) t.label.textContent = u.displayName;
          });
        };
        const onRemoved = (list) => {
          logUsers(client, 'user-removed');
          asArray(list).forEach((u) => removeRemoteTile(u.userId));
        };
        const onPeerVideo = ({ action, userId }) => {
          const meIdNow = clientRef.current?.getCurrentUserInfo()?.userId;
          const u = (clientRef.current?.getAllUser?.() || []).find(x => x.userId === userId);
          dbg('peer-video-state-change', { action, userId, isSelf: userId === meIdNow, name: u?.displayName, bVideoOn: u?.bVideoOn });
          if (userId === meIdNow) return;
          if (action === 'Start') renderRemoteUser(userId, 0);
          else unrenderRemoteUser(userId);
        };

        client.on('user-added', onAdded);
        client.on('user-updated', onUpdated);
        client.on('user-removed', onRemoved);
        client.on('peer-video-state-change', onPeerVideo);
        clientRef.current._handlers = { onAdded, onUpdated, onRemoved, onPeerVideo };
        clientRef.current._onDeviceChange = onDeviceChange;

        // debug
        safeInterval(() => {
          try {
            const me = client.getCurrentUserInfo();
            dbg('rect.tick', { me: me?.userId, tiles: Array.from(remoteTilesRef.current.keys()) });
          } catch {}
        }, 3000);

        if (!mounted) return;
        setJoining(false);
      } catch (e) {
        console.group('[VideoSDK][join] failed');
        console.error('raw error:', e);
        if (e?.response) { console.error('HTTP status:', e.response.status); console.error('HTTP data:', e.response.data); }
        console.groupEnd?.();

        if (!mounted) return;
        setError(e?.response?.data?.error || e?.response?.data?.message || e?.reason || e?.message || 'Failed to join session');
        setJoining(false);
      }
    })();

    return () => {
      mounted = false;

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
        navigator.mediaDevices?.removeEventListener?.('devicechange', clientRef.current?._onDeviceChange);
      } catch {}

      try {
        remoteTilesRef.current.forEach(async (tile, uid) => {
          try { await unrenderRemote(media, uid, tile.slot, () => {}); } catch {}
        });
        remoteTilesRef.current.clear();
      } catch {}

      try {
        const meId = client?.getCurrentUserInfo?.()?.userId;
        if (meId && selfCanvasRef.current) {
          media?.stopRenderVideo?.(selfCanvasRef.current, meId);
        }
      } catch {}

      try { maybeAwait(media?.stopVideo?.()); } catch {}
      try { maybeAwait(media?.stopAudio?.()); } catch {}
      try { client?.leave?.(); } catch {}
      try { clearAllIntervals(); } catch {}

      clientRef.current = null;
      mediaRef.current  = null;
      joinedRef.current = false;
    };
  }, [callId, token, role, locationName, userId]); // computed at runtime, but safe here

  /* ---- Self camera: hybrid (canvas first, fallback to <video> if required) ---- */
  const startCam = async () => {
    setError('');
    const media = mediaRef.current;
    const client = clientRef.current;
    if (!media || !client) return;

    const preferVideo = mustUseVideoElForSelf();
    try {
      if (preferVideo) {
        // Start directly with <video> element
        await maybeAwait(media.startVideo({ deviceId: camId || undefined, videoElement: selfVideoRef.current }));
        setSelfMode('video'); selfModeRef.current = 'video';
        setCamOn(true);
        setNeedsGesture(false);
        return;
      }

      // Try canvas path first
      await maybeAwait(media.startVideo({ deviceId: camId || undefined }));

      const parent = selfContainerRef.current;
      await waitForNonZeroRect(parent, 'self.container.beforeRender', dbg, 2000, 60);

      const meId = client.getCurrentUserInfo()?.userId;
      const { w, h } = sizeOf(parent);
      await maybeAwait(media.renderVideo(selfCanvasRef.current, meId, Math.max(1, w), Math.max(1, h), 0, 0, 2));
      setSelfMode('canvas'); selfModeRef.current = 'canvas';
      setCamOn(true);
      setNeedsGesture(false);

      // responsive for canvas mode
      if (!parent._ro) {
        const ro = new ResizeObserver(async () => {
          const { w: w2, h: h2 } = sizeOf(parent);
          try { await maybeAwait(media.updateVideoCanvasDimension(selfCanvasRef.current, meId, Math.max(1, w2), Math.max(1, h2))); } catch {}
        });
        ro.observe(parent);
        parent._ro = ro;
      }
    } catch (e) {
      // If canvas failed (SDK warning you pasted), fall back to <video>
      try {
        await maybeAwait(media.stopVideo());
      } catch {}

      try {
        await maybeAwait(media.startVideo({ deviceId: camId || undefined, videoElement: selfVideoRef.current }));
        setSelfMode('video'); selfModeRef.current = 'video';
        setCamOn(true);
        setNeedsGesture(false);
        dbg('self.fallback.videoElement.ok');
      } catch (e2) {
        setSelfMode('auto'); selfModeRef.current = 'auto';
        setCamOn(false);
        setError(mapCameraError(e2) || mapCameraError(e) || 'Could not start camera');
        dbg('self.fallback.videoElement.fail', { err: niceErr(e2) });
      }
    }
  };

  const stopCam = async () => {
    const media = mediaRef.current;
    const client = clientRef.current;
    try {
      if (selfModeRef.current === 'canvas') {
        const meId = client?.getCurrentUserInfo?.()?.userId;
        if (meId && selfCanvasRef.current) {
          await maybeAwait(media?.stopRenderVideo(selfCanvasRef.current, meId));
        }
      }
    } catch {}
    try { await maybeAwait(media?.stopVideo()); } catch {}
    setCamOn(false);
  };

  // camera switch
  useEffect(() => {
    (async () => {
      const media = mediaRef.current;
      if (!media || !camOn || !camId) return;
      try {
        if (media.switchCamera) { await maybeAwait(media.switchCamera(camId)); }
        else { await maybeAwait(media.stopVideo()); await startCam(); }
      } catch {}
    })();
  }, [camId, camOn]); // eslint-disable-line
  const toggleCam = async () => (camOn ? stopCam() : startCam());

  /* ---- Mic ---- */
  const toggleMic = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      if (micOn) { await maybeAwait(media.stopAudio()); setMicOn(false); }
      else       { await maybeAwait(media.startAudio()); setMicOn(true); }
    } catch (e) {
      setError('Microphone error: ' + (e?.reason || e?.message || 'unknown'));
    }
  };

  const handleEnable = async () => {
    setNeedsGesture(false);
    try { await maybeAwait(mediaRef.current?.startAudio()); setMicOn(true); } catch {}
    try { await startCam(); } catch {}
  };

  /* ---- UI ---- */
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', background: '#000', color: '#fff' }}>
      <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <strong style={{ letterSpacing: '.2px' }}>{locationName ? `Clinic – ${locationName}` : 'Clinic'}</strong>

        {cams.length > 1 && (
          <select value={camId} onChange={(e) => setCamId(e.target.value)}
                  style={{ marginLeft: 12, background: '#111', color: '#fff', borderRadius: 6, border: '1px solid #333', padding: '4px 8px' }}
                  title="Camera">
            {cams.map((c) => (<option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>))}
          </select>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={toggleMic}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 0, background: micOn ? '#2e8b57' : '#666', color: '#fff' }}>
            {micOn ? 'Mic On' : 'Mic Off'}
          </button>
          <button onClick={toggleCam}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 0, background: camOn ? '#2e8b57' : '#666', color: '#fff' }}>
            {camOn ? 'Cam On' : 'Cam Off'}
          </button>
          <button onClick={() => {
            try { maybeAwait(mediaRef.current?.stopVideo()); } catch {}
            try { maybeAwait(mediaRef.current?.stopAudio()); } catch {}
            try { clientRef.current?.leave(); } catch {}
          }}
                  style={{ padding: '6px 12px', borderRadius: 8, background: '#d33', color: '#fff', border: 0 }}>
            Leave
          </button>
        </div>
      </div>

      {/* Main content: 2 columns on desktop, stacked on mobile */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? '1fr' : 'minmax(280px,360px) 1fr',
        gap: 14,
        padding: 14
      }}>
        {/* Self */}
        <div style={{ position: 'relative' }}>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>You</div>
          <div ref={selfContainerRef}
               style={{ position: 'relative', width: '100%', height: 220, background: '#111', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.35)' }}>
            {/* both elements present; we toggle via display */}
            <canvas ref={selfCanvasRef}
                    style={{ width: '100%', height: '100%', display: selfMode === 'canvas' ? 'block' : 'none', background: '#111' }} />
            <video ref={selfVideoRef}
                   autoPlay muted playsInline
                   style={{ width: '100%', height: '100%', objectFit: 'cover', display: selfMode === 'video' ? 'block' : 'none', background: '#111' }} />
            <div ref={selfLabelRef} style={{ position: 'absolute', left: 10, bottom: 8, padding: '3px 8px', fontSize: 12, background: 'rgba(0,0,0,.55)', borderRadius: 6, letterSpacing: '.2px' }}>You</div>
          </div>
        </div>

        {/* Remotes */}
        <div>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>Participants</div>
          <div ref={remoteGridRef} id="remote-grid"
               style={{ width: '100%', minHeight: 220, display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }} />
        </div>
      </div>

      {joining && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)', fontSize: 16 }}>
          Connecting to session…
        </div>
      )}

      {!!error && (
        <div style={{
          position:'absolute', left:8, right:8, top:8, zIndex:30,
          background:'rgba(220,0,0,.9)', padding:'8px 12px', borderRadius:6, lineHeight:1.35
        }}>
          {String(error)}
        </div>
      )}

      {needsGesture && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' }}>
          <button onClick={handleEnable} style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: '#1f8fff', color: '#fff', fontWeight: 600 }}>
            Enable mic & cam
          </button>
        </div>
      )}

      {debug && (
        <div style={{
          position: 'absolute', right: 8, bottom: 8, width: 420, maxHeight: 300, overflow: 'auto',
          fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11,
          background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 6, padding: 8, whiteSpace: 'pre-wrap', zIndex: 20
        }}>
          {debugLines.join('\n')}
        </div>
      )}
    </div>
  );
}

/* ---------- camera error mapping (end) ---------- */
function mapCameraError(e) {
  const s = (e?.name || e?.message || e?.reason || '').toLowerCase();
  if (/video is started/i.test(s)) return '';
  if (/notallowed|permission|denied/i.test(s)) return 'Camera permission blocked';
  if (/notreadable|in use|busy|trackstart/i.test(s)) return 'Camera is in use by another app';
  if (/notfound|overconstrained|no suitable device|device not found/i.test(s)) return 'No camera found';
  return 'Could not start camera';
}
