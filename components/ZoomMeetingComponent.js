// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';
const BUILD = 'ZMC-v9.1-mobileRetryAttachOnUpdate+gestureKick-2025-09-12';

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const displayNameFor = (role, location) =>
  Number(role) === 1 ? `Doctor – ${location || ''}` : `Clinic – ${location || ''}`;

/* ---------------- utils ---------------- */
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
  return { w: Math.round(r?.width || 0), h: Math.round(r?.height || 0) };
}
async function waitForNonZeroRect(el, label, dbg, timeoutMs = 1600, pollMs = 60) {
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

/* -------- env helpers -------- */
function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}
function hasSAB() {
  return typeof window !== 'undefined' && 'SharedArrayBuffer' in window && window.crossOriginIsolated === true;
}
function mustUseVideoElForSelf() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isiOS = /iPhone|iPad|iPod/i.test(ua);
  const isChromiumFamily = /(Chrome|Chromium|Edg)\//i.test(ua) && !/OPR\//i.test(ua);
  const isAndroid = /Android/i.test(ua);
  return isiOS || ((isChromiumFamily || isAndroid) && !hasSAB());
}

/* ---------- Zoom custom element CSS ---------- */
function ensureVideoPlayerCSS() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('zmc-videoplayer-css')) return;
  const style = document.createElement('style');
  style.id = 'zmc-videoplayer-css';
  style.textContent = `
    video-player, .video-player, video-player-container {
      display:block !important; width:100% !important; height:100% !important;
    }
  `;
  document.head.appendChild(style);
}

/* ---------- helpers ---------- */
function fillAbsolute(el) {
  try { Object.assign(el.style, { position:'absolute', inset:0, width:'100%', height:'100%', display:'block' }); } catch {}
}
function forcePlay(el, dbg, ctx) {
  try {
    const p = el?.play?.();
    if (p && typeof p.catch === 'function') p.catch((e)=>dbg('video.play.catch',{ctx,err:niceErr(e)}));
  } catch (e) { dbg('video.play.error',{ctx,err:niceErr(e)}); }
}

/* ---------- REMOTE attach (mobile = attach only) ---------- */
async function attachRemote(stream, uid, slotDiv, dbg, attempt = 0) {
  const preferAttachOnly = isMobile() && !hasSAB();

  Object.assign(slotDiv.style, {
    position: 'relative',
    background: '#111',
    aspectRatio: '16 / 9',
    minHeight: '180px'
  });

  await waitForNonZeroRect(slotDiv, 'remote.slot.beforeAttach', dbg);

  // subscribe first (idempotent)
  try { await maybeAwait(stream.subscribeVideo?.(uid)); dbg('remote.subscribe.ok', { uid }); }
  catch (e) { dbg('remote.subscribe.fail', { uid, err: niceErr(e) }); }

  const attachViaVideoEl = async () => {
    const ph = document.createElement('video');
    ph.autoplay = true; ph.playsInline = true; ph.muted = true;
    Object.assign(ph.style, { width:'100%', height:'100%', objectFit:'cover', display:'block', background:'#111' });
    slotDiv.textContent = '';
    slotDiv.appendChild(ph);

    const ret = await maybeAwait(stream.attachVideo(uid, ph));
    const el = (ret && ret.nodeType === 1) ? ret : ph;

    if (el !== ph) { try { ph.remove(); } catch {} slotDiv.appendChild(el); }
    // hint attributes (some builds pass them through)
    try {
      el.setAttribute?.('autoplay','');
      el.setAttribute?.('playsinline','');
    } catch {}
    fillAbsolute(el);
    try { el.style.width = '100%'; el.style.height = '100%'; el.style.display = 'block'; } catch {}
    dbg('remote.attach.ok', { uid, tag: el?.tagName?.toLowerCase?.() || 'video' });
    forcePlay(el, dbg, `uid:${uid}`);
    return el;
  };

  const renderViaCanvas = async () => {
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width:'100%', height:'100%', display:'block', background:'#111' });
    slotDiv.textContent = '';
    slotDiv.appendChild(canvas);
    const { w, h } = sizeOf(slotDiv);
    await maybeAwait(stream.renderVideo(canvas, uid, Math.max(1,w), Math.max(1,h), 0, 0, 2));
    dbg('remote.render.canvas.ok', { uid, w, h });
    if (!slotDiv._ro) {
      const ro = new ResizeObserver(async () => {
        const { w: w2, h: h2 } = sizeOf(slotDiv);
        try { await maybeAwait(stream.updateVideoCanvasDimension(canvas, uid, Math.max(1,w2), Math.max(1,h2))); }
        catch(e){ dbg('remote.render.resize.fail',{uid,err:niceErr(e)}); }
      });
      ro.observe(slotDiv);
      slotDiv._ro = ro;
    }
    return canvas;
  };

  let node = null;
  if (preferAttachOnly) {
    node = await attachViaVideoEl();
  } else {
    try { node = await renderViaCanvas(); }
    catch (e1) { dbg('remote.render.fail', { uid, err: niceErr(e1) }); node = await attachViaVideoEl(); }
  }

  // post-check & bounded retry if the element is still 0×0
  setTimeout(async () => {
    try {
      const er = sizeOf(node), sr = sizeOf(slotDiv);
      dbg('remote.postcheck', { uid, elW: er.w, elH: er.h, slotW: sr.w, slotH: sr.h, attempt });
      if ((er.w === 0 || er.h === 0) && attempt < 3) {
        try { await maybeAwait(stream.detachVideo?.(uid)); } catch {}
        await waitForNonZeroRect(slotDiv, 'remote.slot.reattach.wait', dbg);
        const again = await attachRemote(stream, uid, slotDiv, dbg, attempt + 1);
        dbg('remote.postcheck.reattach.ok', { uid, attempt: attempt + 1, tag: again?.tagName?.toLowerCase?.() });
      }
    } catch (e) { dbg('remote.postcheck.error', { uid, err: niceErr(e) }); }
  }, 400);

  // visibility kick
  const onVis = () => { if (!document.hidden) forcePlay(node, dbg, `uid:${uid}/vis`); };
  document.addEventListener('visibilitychange', onVis);
  node._onVis = onVis;

  return { node, mode: node?.tagName?.toLowerCase?.() === 'canvas' ? 'canvas' : 'attach' };
}

async function stopRemote(stream, uid, tile, dbg) {
  try {
    if (tile?.node?._onVis) {
      document.removeEventListener('visibilitychange', tile.node._onVis);
      delete tile.node._onVis;
    }
    if (tile?.mode === 'canvas') {
      const canvas = tile.node;
      try { await maybeAwait(stream.stopRenderVideo(canvas, uid)); } catch {}
      if (tile.slot?._ro) { try { tile.slot._ro.disconnect(); } catch {} delete tile.slot._ro; }
    } else {
      try { await maybeAwait(stream.detachVideo?.(uid)); } catch {}
    }
  } finally {
    try { await maybeAwait(stream.unsubscribeVideo?.(uid)); } catch {}
  }
}

/* -------------- COMPONENT -------------- */
export default function ZoomMeetingComponent({ callId, locationName, role = 0, userId, token }) {
  const clientRef = useRef(null);
  const mediaRef  = useRef(null);

  // self
  const selfCanvasRef = useRef(null);
  const selfVideoRef  = useRef(null);
  const selfContainerRef = useRef(null);
  const selfLabelRef = useRef(null);
  const selfModeRef = useRef('auto');
  const [selfMode, setSelfMode] = useState('auto');

  // remotes: uid -> { wrapper, slot, label, mode, node }
  const remoteTilesRef = useRef(new Map());
  const remoteGridRef  = useRef(null);

  const [joining, setJoining] = useState(true);
  const [error, setError]     = useState('');
  const [audioOn, setAudioOn] = useState(false);
  const [camOn, setCamOn]     = useState(false);

  const isiOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  const [needsGesture, setNeedsGesture] = useState(false);

  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState('');

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

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
      ensureVideoPlayerCSS();
    }
  }, []);
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
      display: 'block',
      boxShadow: '0 2px 10px rgba(0,0,0,.35)'
    });

    const slot = document.createElement('div');
    Object.assign(slot.style, {
      width: '100%',
      position: 'relative',
      background: '#111',
      aspectRatio: '16 / 9',
      minHeight: '180px'
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

    const tileObj = { wrapper, slot, label, mode: null, node: null };
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

  async function showRemote(uid, attempt = 0) {
    try {
      const client = clientRef.current, stream = mediaRef.current;
      if (!client || !stream) return;

      const meId = client.getCurrentUserInfo()?.userId;
      if (uid === meId) return;

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const tile = ensureRemoteTile(user);

      await waitForNonZeroRect(tile.slot, 'tile.slot.beforeShow', dbg);

      // Try to attach regardless of bVideoOn (Android sometimes keeps it false)
      try {
        const { node, mode } = await attachRemote(stream, uid, tile.slot, dbg, 0);
        tile.node = node; tile.mode = mode;
        dbg('remote.mode', { uid, mode });
      } catch (e) {
        dbg('remote.attach.try.fail', { uid, err: niceErr(e), attempt });
        if (attempt < 8) { await sleep(300); return showRemote(uid, attempt + 1); }
      }
    } catch (e) {
      dbg('remote.show.unhandled', { uid, err: niceErr(e) });
      if (attempt < 6) { await sleep(300); return showRemote(uid, attempt + 1); }
    }
  }

  async function hideRemote(uid) {
    const stream = mediaRef.current;
    const tile = remoteTilesRef.current.get(uid);
    if (!tile || !stream) return;
    await stopRemote(stream, uid, tile, dbg);
  }

  async function removeRemoteTile(uid) {
    await hideRemote(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (tile?.wrapper) tile.wrapper.remove();
    remoteTilesRef.current.delete(uid);
  }

  // Kick all remotes after any user gesture (helps Android autoplay)
  const kickAllRemotes = () => {
    remoteTilesRef.current.forEach((tile, uid) => {
      if (tile?.node) forcePlay(tile.node, dbg, `uid:${uid}/kick`);
      else showRemote(uid, 0);
    });
  };

  /* ---- Join & events ---- */
  useEffect(() => {
    if (!callId && !token) return;
    if (joinedRef.current) return;
    joinedRef.current = true;

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

        const client = ZoomVideo.createClient();
        clientRef.current = client;

        await client.init('en-US', 'Global', { patchJsMedia: true });
        await client.join(sessionName, sessionToken, myDisplayName);

        const meId = client.getCurrentUserInfo()?.userId;
        dbg('session', { sessionName, meId, platform: navigator.platform, ua: navigator.userAgent });

        if (selfLabelRef.current) selfLabelRef.current.textContent = `You — ${myDisplayName}`;

        const media = client.getMediaStream();
        mediaRef.current = media;

        // Join audio immediately (unlocks autoplay)
        try { await media.startAudio(); setAudioOn(true); dbg('audio.start.ok'); }
        catch (e) { dbg('audio.start.fail', { err: niceErr(e) }); }

        // camera list
        try {
          const list = await maybeAwait(media.getCameraList?.());
          if (Array.isArray(list) && list.length) { setCams(list); setCamId((prev) => prev || list[0]?.deviceId || ''); }
        } catch (e) { dbg('camera.list.fail', { err: niceErr(e) }); }

        setNeedsGesture(isiOS);
        setCamOn(false);

        // hydrate remotes already in the room
        logUsers(client, 'after-join');
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== meId) {
            ensureRemoteTile(u);
            showRemote(u.userId); // try immediately (don’t wait for bVideoOn)
          }
        });

        // events
        const onAdded = (list) => {
          logUsers(client, 'user-added');
          asArray(list).forEach((u) => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) {
              ensureRemoteTile(u);
              showRemote(u.userId);
            }
          });
        };
        const onUpdated = (list) => {
          logUsers(client, 'user-updated');
          asArray(list).forEach((u) => {
            const t = ensureRemoteTile(u);
            if (t?.label && u.displayName) t.label.textContent = u.displayName;
            if (u.userId !== client.getCurrentUserInfo()?.userId) {
              // Attach when we notice bVideoOn flipped true; detach if turned off
              if (u.bVideoOn && !t.mode) showRemote(u.userId);
              if (!u.bVideoOn && t.mode) hideRemote(u.userId);
            }
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
          if (action === 'Start') showRemote(userId, 0);
          else hideRemote(userId);
        };

        client.on('user-added', onAdded);
        client.on('user-updated', onUpdated);
        client.on('user-removed', onRemoved);
        client.on('peer-video-state-change', onPeerVideo);
        clientRef.current._handlers = { onAdded, onUpdated, onRemoved, onPeerVideo };

        setJoining(false);
      } catch (e) {
        console.group('[VideoSDK][join] failed');
        console.error('raw error:', e);
        if (e?.response) { console.error('HTTP status:', e.response.status); console.error('HTTP data:', e.response.data); }
        console.groupEnd?.();
        setError(e?.response?.data?.error || e?.response?.data?.message || e?.reason || e?.message || 'Failed to join session');
        setJoining(false);
      }
    })();

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
        remoteTilesRef.current.forEach(async (tile, uid) => {
          try { await stopRemote(media, uid, tile, dbg); } catch {}
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

      clientRef.current = null;
      mediaRef.current  = null;
      joinedRef.current = false;
    };
  }, [callId, token, role, locationName, userId]);

  /* ---- Self camera: hybrid ---- */
  const startCam = async () => {
    setError('');
    const media = mediaRef.current;
    const client = clientRef.current;
    if (!media || !client) return;

    const preferVideo = mustUseVideoElForSelf();
    try {
      if (preferVideo) {
        await maybeAwait(media.startVideo({ deviceId: camId || undefined, videoElement: selfVideoRef.current }));
        setSelfMode('video'); selfModeRef.current = 'video';
        setCamOn(true);
        setNeedsGesture(false);
        return;
      }

      await maybeAwait(media.startVideo({ deviceId: camId || undefined }));

      const parent = selfContainerRef.current;
      await waitForNonZeroRect(parent, 'self.container.beforeRender', dbg);

      const meId = client.getCurrentUserInfo()?.userId;
      const { w, h } = sizeOf(parent);
      await maybeAwait(media.renderVideo(selfCanvasRef.current, meId, Math.max(1, w), Math.max(1, h), 0, 0, 2));
      setSelfMode('canvas'); selfModeRef.current = 'canvas';
      setCamOn(true);
      setNeedsGesture(false);

      if (!parent._ro) {
        const ro = new ResizeObserver(async () => {
          const { w: w2, h: h2 } = sizeOf(parent);
          try { await maybeAwait(media.updateVideoCanvasDimension(selfCanvasRef.current, meId, Math.max(1, w2), Math.max(1, h2))); } catch {}
        });
        ro.observe(parent);
        parent._ro = ro;
      }
    } catch (e) {
      try { await maybeAwait(media.stopVideo()); } catch {}
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

  useEffect(() => {
    (async () => {
      const media = mediaRef.current;
      if (!media || !camOn || !camId) return;
      try {
        if (media.switchCamera) { await maybeAwait(media.switchCamera(camId)); }
        else { await maybeAwait(media.stopVideo()); await startCam(); }
      } catch {}
    })();
  }, [camId, camOn]);
  const toggleCam = async () => { const wasOn = camOn; await (wasOn ? stopCam() : startCam()); kickAllRemotes(); };

  /* ---- Audio (speaker) join toggle ---- */
  const toggleAudioJoin = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      if (audioOn) { await maybeAwait(media.stopAudio()); setAudioOn(false); }
      else { await maybeAwait(media.startAudio()); setAudioOn(true); kickAllRemotes(); }
    } catch (e) {
      setError('Audio error: ' + (e?.reason || e?.message || 'unknown'));
    }
  };

  const handleEnable = async () => {
    setNeedsGesture(false);
    try { await maybeAwait(mediaRef.current?.startAudio()); setAudioOn(true); dbg('gesture.audio.ok'); } catch (e) { dbg('gesture.audio.fail', { err: niceErr(e) }); }
    kickAllRemotes();
  };

  /* ---- UI ---- */
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', background: '#000', color: '#fff' }}>
      <div
        style={{
          padding: 12, display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.07)'
        }}
      >
        <strong style={{ letterSpacing: '.2px' }}>{locationName ? `Clinic – ${locationName}` : 'Clinic'}</strong>

        {cams.length > 1 && (
          <select
            value={camId}
            onChange={(e) => setCamId(e.target.value)}
            title="Camera"
            style={{
              marginLeft: 12, background: '#111', color: '#fff', borderRadius: 6, border: '1px solid #333',
              padding: '4px 8px', maxWidth: 180, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'
            }}
          >
            {cams.map((c) => (<option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>))}
          </select>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={toggleAudioJoin}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 0, background: audioOn ? '#2e8b57' : '#666', color: '#fff' }}>
            {audioOn ? 'Audio On' : 'Audio Off'}
          </button>
          <button onClick={toggleCam}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 0, background: camOn ? '#2e8b57' : '#666', color: '#fff' }}>
            {camOn ? 'Cam On' : 'Cam Off'}
          </button>
          <button onClick={() => { try { maybeAwait(mediaRef.current?.stopVideo()); } catch {} try { maybeAwait(mediaRef.current?.stopAudio()); } catch {} try { clientRef.current?.leave(); } catch {} }}
                  style={{ padding: '6px 12px', borderRadius: 8, background: '#d33', color: '#fff', border: 0 }}>
            Leave
          </button>
        </div>
      </div>

      {/* Main content */}
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
            <canvas ref={selfCanvasRef}
                    style={{ width: '100%', height: '100%', display: selfMode === 'canvas' ? 'block' : 'none', background: '#111' }} />
            <video ref={selfVideoRef}
                   autoPlay muted playsInline
                   style={{ width: '100%', height: '100%', objectFit: 'cover', display: selfMode === 'video' ? 'block' : 'none', background: '#111' }} />
            <div ref={selfLabelRef} style={{ position: 'absolute', left: 10, bottom: 8, padding: '3px 8px', fontSize: 12, background: 'rgba(0,0,0,.55)', borderRadius: 6, letterSpacing: '.2px' }}>You</div>
          </div>
        </div>

        {/* Remotes */}
        <div onClick={kickAllRemotes} onTouchEnd={kickAllRemotes}>
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
            Enable audio
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

/* ---------- camera error mapping ---------- */
function mapCameraError(e) {
  const s = (e?.name || e?.message || e?.reason || '').toLowerCase();
  if (/video is started/i.test(s)) return '';
  if (/notallowed|permission|denied/i.test(s)) return 'Camera permission blocked';
  if (/notreadable|in use|busy|trackstart/i.test(s)) return 'Camera is in use by another app';
  if (/notfound|overconstrained|no suitable device|device not found/i.test(s)) return 'No camera found';
  return 'Could not start camera';
}
