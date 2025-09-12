// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';
const BUILD = 'ZMC-v8.4-joinAudio+forcePlay-remote-attach-2025-09-12';

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
  typeof e === 'string' ? e : JSON.stringify({ name: e?.name, message: e?.message, reason: e?.reason, code: e?.code });

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

/* ---------- env helpers ---------- */
function mustUseVideoElForSelf() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isiOS = /iPhone|iPad|iPod/i.test(ua);
  const isChromiumFamily = /(Chrome|Chromium|Edg)\//i.test(ua) && !/OPR\//i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const hasSAB = 'SharedArrayBuffer' in window && window.crossOriginIsolated === true;
  return isiOS || ((isChromiumFamily || isAndroid) && !hasSAB);
}

/* ---------- global housekeeping ---------- */
const liveIntervals = new Set();
function safeInterval(fn, ms) { const id = setInterval(fn, ms); liveIntervals.add(id); return id; }
function clearAllIntervals() { liveIntervals.forEach(clearInterval); liveIntervals.clear(); }

/* ---------- small helpers ---------- */
function fillEl(el) {
  try { Object.assign(el.style, { position:'absolute', inset:0, width:'100%', height:'100%', display:'block' }); } catch {}
}
function forcePlay(el, dbg, uid) {
  try {
    // If SDK gave us a real <video>, mute to satisfy autoplay and play().
    if (el && el.tagName && el.tagName.toLowerCase() === 'video') {
      el.muted = true;
      const p = el.play?.();
      p?.catch((e) => dbg('remote.play.video.catch', { uid, err: niceErr(e) }));
    } else {
      // SDK's <video-player> usually forwards play().
      const p = el?.play?.();
      p?.catch((e) => dbg('remote.play.player.catch', { uid, err: niceErr(e) }));
    }
  } catch (e) {
    dbg('remote.play.error', { uid, err: niceErr(e) });
  }
}

/* ---------- REMOTE: canvas then attachVideo fallback ---------- */
async function renderRemoteCanvas(stream, uid, slotDiv, dbg) {
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
  dbg('remote.render.canvas.ok', { uid, w, h });

  if (!slotDiv._ro) {
    const ro = new ResizeObserver(async () => {
      const { w: w2, h: h2 } = sizeOf(slotDiv);
      try { await maybeAwait(stream.updateVideoCanvasDimension(canvas, uid, Math.max(1, w2), Math.max(1, h2))); }
      catch (e) { dbg('remote.render.resize.fail', { uid, err: niceErr(e) }); }
    });
    ro.observe(slotDiv);
    slotDiv._ro = ro;
  }
  return canvas;
}

async function stopRemoteCanvas(stream, uid, slotDiv) {
  const canvas = slotDiv?.querySelector('canvas');
  try { if (canvas) await maybeAwait(stream.stopRenderVideo(canvas, uid)); } catch {}
  if (slotDiv?._ro) { try { slotDiv._ro.disconnect(); } catch {} delete slotDiv._ro; }
}

/** attachVideo with sizing + forcePlay + reattach if 0×0 */
async function attachRemoteCompat(stream, uid, slotDiv, dbg, prefer = 'videoEl', attempt = 0) {
  const Q360 = (ZoomVideo?.VideoQuality?.Video_360P) ?? 2;

  Object.assign(slotDiv.style, { position:'relative', background:'#111', minHeight:'180px', aspectRatio:'16 / 9' });
  await waitForNonZeroRect(slotDiv, 'remote.slot.beforeAttach', dbg, 2000, 60);

  const viaVideoEl = async () => {
    const v = document.createElement('video');
    v.autoplay = true; v.playsInline = true; v.muted = true; // muted => autoplay OK
    Object.assign(v.style, { width:'100%', height:'100%', objectFit:'cover', display:'block', background:'#111' });
    slotDiv.textContent = '';
    slotDiv.appendChild(v);
    const ret = await maybeAwait(stream.attachVideo(uid, v));
    const el = (ret && ret.nodeType === 1) ? ret : v;
    if (el !== slotDiv) fillEl(el);
    return el;
  };
  const viaContainer = async () => {
    slotDiv.textContent = '';
    const ret = await maybeAwait(stream.attachVideo(uid, Q360, slotDiv));
    const el = (ret && ret.nodeType === 1) ? ret : (slotDiv.firstElementChild || slotDiv);
    if (el !== slotDiv) fillEl(el);
    return el;
  };

  let el = null;
  if (prefer === 'container') {
    try { el = await viaContainer(); dbg('remote.attach.container.ok', { uid, tag: el?.tagName?.toLowerCase?.() }); }
    catch (e1) { dbg('remote.attach.container.fail', { uid, err: niceErr(e1) }); el = await viaVideoEl(); dbg('remote.attach.videoEl.ok', { uid, tag: el?.tagName?.toLowerCase?.() }); }
  } else {
    try { el = await viaVideoEl(); dbg('remote.attach.videoEl.ok', { uid, tag: el?.tagName?.toLowerCase?.() }); }
    catch (e1) { dbg('remote.attach.videoEl.fail', { uid, err: niceErr(e1) }); el = await viaContainer(); dbg('remote.attach.container.ok', { uid, tag: el?.tagName?.toLowerCase?.() }); }
  }

  // Force playback (autoplay gate)
  forcePlay(el, dbg, uid);

  // If element or slot ended 0×0, reattach with the alternate signature once
  setTimeout(async () => {
    try {
      const er = sizeOf(el), sr = sizeOf(slotDiv);
      dbg('remote.postcheck', { uid, el: { tag: el?.tagName?.toLowerCase?.(), ...er }, slot: sr, attempt, prefer });

      if ((er.w === 0 || er.h === 0 || sr.w === 0 || sr.h === 0) && attempt < 1) {
        try { await maybeAwait(stream.detachVideo?.(uid)); } catch {}
        await waitForNonZeroRect(slotDiv, 'remote.slot.beforeReattach', dbg, 1200, 60);
        const el2 = await attachRemoteCompat(stream, uid, slotDiv, dbg, prefer === 'videoEl' ? 'container' : 'videoEl', attempt+1);
        dbg('remote.postcheck.reattach.ok', { uid, tag: el2?.tagName?.toLowerCase?.() });
      }
    } catch (e) {
      dbg('remote.postcheck.error', { uid, err: niceErr(e) });
    }
  }, 350);

  return el;
}

async function detachRemoteCompat(stream, uid) {
  try { await maybeAwait(stream.detachVideo?.(uid)); } catch {}
}

/* ---------- COMPONENT ---------- */
export default function ZoomMeetingComponent({ callId, locationName, role = 0, userId, token }) {
  const clientRef = useRef(null);
  const mediaRef  = useRef(null);

  // self (hybrid)
  const selfCanvasRef = useRef(null);
  const selfVideoRef  = useRef(null);
  const selfContainerRef = useRef(null);
  const selfLabelRef = useRef(null);
  const selfModeRef = useRef('auto'); // 'canvas' | 'video'
  const [selfMode, setSelfMode] = useState('auto');

  // remotes map: uid -> { wrapper, slot, label, mode: 'canvas' | 'attach', node?:HTMLElement }
  const remoteTilesRef = useRef(new Map());
  const remoteGridRef  = useRef(null);

  const [joining, setJoining] = useState(true);
  const [error, setError]     = useState('');
  const [audioOn, setAudioOn] = useState(false); // joined speaker (not mic publish)
  const [camOn, setCamOn]     = useState(false);

  const isiOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
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
      position: 'relative', background: '#111', borderRadius: '12px', overflow: 'hidden',
      minHeight: '180px', display: 'block', boxShadow: '0 2px 10px rgba(0,0,0,.35)'
    });

    const slot = document.createElement('div');
    Object.assign(slot.style, { width: '100%', height: '100%', position: 'relative', background: '#111' });

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
      if (uid === meId) { dbg('remote.skip-self', { uid }); return; }

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const tile = ensureRemoteTile(user);

      await waitForNonZeroRect(tile.slot, 'tile.slot.beforeShow', dbg, 1600, 60);

      if (!user.bVideoOn) {
        if (attempt < 8) { dbg('remote.wait-video', { uid, attempt }); await sleep(200); return showRemote(uid, attempt + 1); }
        dbg('remote.abort-no-video', { uid });
        return;
      }

      // Try canvas, then fallback to attachVideo
      try {
        const canvas = await renderRemoteCanvas(stream, uid, tile.slot, dbg);
        tile.mode = 'canvas';
        tile.node = canvas;
        dbg('remote.mode.canvas', { uid });
        return;
      } catch (e1) {
        dbg('remote.render.fail', { uid, err: niceErr(e1) });
        try {
          const el = await attachRemoteCompat(stream, uid, tile.slot, dbg, 'videoEl', 0);
          tile.mode = 'attach';
          tile.node = el;
          dbg('remote.mode.attach', { uid, tag: el?.tagName?.toLowerCase?.() });

          // ensure playback on visibility regain (if Chrome blocked autoplay earlier)
          const onVis = () => { if (!document.hidden) forcePlay(el, dbg, uid); };
          document.addEventListener('visibilitychange', onVis);
          tile._onVis = onVis;

          return;
        } catch (e2) {
          dbg('remote.attach.fail', { uid, err: niceErr(e2) });
          if (attempt < 6) { await sleep(260); return showRemote(uid, attempt + 1); }
        }
      }
    } catch (e) {
      dbg('remote.show.unhandled', { uid, err: niceErr(e) });
      if (attempt < 6) { await sleep(260); return showRemote(uid, attempt + 1); }
    }
  }

  async function hideRemote(uid) {
    const stream = mediaRef.current;
    const tile = remoteTilesRef.current.get(uid);
    if (!tile || !stream) return;
    try {
      if (tile._onVis) { document.removeEventListener('visibilitychange', tile._onVis); delete tile._onVis; }
      if (tile.mode === 'canvas') await stopRemoteCanvas(stream, uid, tile.slot);
      else if (tile.mode === 'attach') await detachRemoteCompat(stream, uid);
    } catch {}
  }

  async function removeRemoteTile(uid) {
    await hideRemote(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (tile?.wrapper) tile.wrapper.remove();
    remoteTilesRef.current.delete(uid);
  }

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

        try {
          const list = await maybeAwait(media.getCameraList?.());
          if (Array.isArray(list) && list.length) { setCams(list); setCamId((prev) => prev || list[0]?.deviceId || ''); }
        } catch {}

        // Immediately join audio (speaker) to unlock autoplay for remote <video-player>
        try { await media.startAudio(); setAudioOn(true); } catch (e) { dbg('audio.start.fail', { err: niceErr(e) }); }

        setNeedsGesture(isiOS);
        setCamOn(false);

        // hydrate remotes
        logUsers(client, 'after-join');
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== meId) {
            ensureRemoteTile(u);
            if (u.bVideoOn) showRemote(u.userId);
          }
        });

        // events
        const onAdded = (list) => {
          logUsers(client, 'user-added');
          asArray(list).forEach((u) => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) {
              ensureRemoteTile(u);
              if (u.bVideoOn) showRemote(u.userId);
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
          if (action === 'Start') showRemote(userId, 0);
          else hideRemote(userId);
        };

        client.on('user-added', onAdded);
        client.on('user-updated', onUpdated);
        client.on('user-removed', onRemoved);
        client.on('peer-video-state-change', onPeerVideo);
        clientRef.current._handlers = { onAdded, onUpdated, onRemoved, onPeerVideo };

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
          try {
            if (tile._onVis) { document.removeEventListener('visibilitychange', tile._onVis); }
            if (tile.mode === 'canvas') await stopRemoteCanvas(media, uid, tile.slot);
            else if (tile.mode === 'attach') await detachRemoteCompat(media, uid);
          } catch {}
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
      await waitForNonZeroRect(parent, 'self.container.beforeRender', dbg, 2000, 60);

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
  const toggleCam = async () => (camOn ? stopCam() : startCam());

  /* ---- Audio join toggle (speaker) ---- */
  const toggleAudioJoin = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      if (audioOn) { await maybeAwait(media.stopAudio()); setAudioOn(false); }
      else { await maybeAwait(media.startAudio()); setAudioOn(true); }
    } catch (e) {
      setError('Audio error: ' + (e?.reason || e?.message || 'unknown'));
    }
  };

  const handleEnable = async () => {
    setNeedsGesture(false);
    try { await maybeAwait(mediaRef.current?.startAudio()); setAudioOn(true); } catch {}
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
            Enable audio & cam
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
