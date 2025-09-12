// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';
const BUILD = 'ZMC-v9.2-mobileAttachAutoplay+subscribeOnce+gridReset-2025-09-12';

/* ---------------- tiny helpers ---------------- */
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const displayNameFor = (role, location) =>
  Number(role) === 1 ? `Doctor – ${location || ''}` : `Clinic – ${location || ''}`;

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

/* -------- env helpers -------- */
function mustUseVideoElForSelf() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isiOS = /iPhone|iPad|iPod/i.test(ua);
  const isChromiumFamily = /(Chrome|Chromium|Edg)\//i.test(ua) && !/OPR\//i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const hasSAB = 'SharedArrayBuffer' in window && window.crossOriginIsolated === true;
  return isiOS || ((isChromiumFamily || isAndroid) && !hasSAB);
}
function mustUseAttachForRemotes() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isiOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const hasSAB = 'SharedArrayBuffer' in window && window.crossOriginIsolated === true;
  return isiOS || (isAndroid && !hasSAB);
}

/* ------------ housekeeping ------------ */
const liveIntervals = new Set();
function safeInterval(fn, ms) { const id = setInterval(fn, ms); liveIntervals.add(id); return id; }
function clearAllIntervals() { liveIntervals.forEach(clearInterval); liveIntervals.clear(); }

/* -------------- small DOM helpers -------------- */
function fillEl(el) {
  try {
    Object.assign(el.style, {
      position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block'
    });
  } catch {}
}
function makeAutoplayFriendly(el) {
  try {
    // Works for <video> and usually for Zoom’s <video-player> custom element.
    el.setAttribute?.('playsinline', '');
    el.setAttribute?.('autoplay', '');
    el.setAttribute?.('muted', '');
    if ('muted' in el) el.muted = true;
  } catch {}
}
function forcePlay(el, dbg, ctx) {
  try {
    const p = el?.play?.();
    if (p && typeof p.catch === 'function') {
      p.catch((e) => dbg('remote.play.catch', { ctx, err: niceErr(e) }));
    }
  } catch (e) {
    dbg('remote.play.error', { ctx, err: niceErr(e) });
  }
}

/* ---------- inject CSS for Zoom's custom element ---------- */
function ensureVideoPlayerCSS() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('zmc-videoplayer-css')) return;
  const style = document.createElement('style');
  style.id = 'zmc-videoplayer-css';
  style.textContent = `
    video-player, .video-player, video-player-container {
      display: block !important; width: 100% !important; height: 100% !important;
    }
    /* Try to help some mobile builds that need explicit block sizing */
    video-player { position: relative; }
  `;
  document.head.appendChild(style);
}

/* -------------- REMOTE attach (mobile-safe) -------------- */
async function attachRemoteCompat(stream, uid, slotDiv, dbg, prefer = 'videoEl', attempt = 0) {
  const Q360 = (ZoomVideo?.VideoQuality?.Video_360P) ?? 2;

  slotDiv.style.height = '';
  Object.assign(slotDiv.style, {
    position: 'relative', background: '#111', minHeight: '180px', aspectRatio: '16 / 9'
  });
  await waitForNonZeroRect(slotDiv, 'remote.slot.beforeAttach', dbg, 2000, 60);

  const viaVideoEl = async () => {
    const ph = document.createElement('video');
    ph.autoplay = true; ph.playsInline = true; ph.muted = true;
    Object.assign(ph.style, {
      width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#111'
    });

    slotDiv.textContent = '';
    slotDiv.appendChild(ph);

    const ret = await maybeAwait(stream.attachVideo(uid, ph));
    const el = (ret && ret.nodeType === 1) ? ret : ph;

    // If SDK returned a different element (e.g. <video-player>), append it and remove ph.
    if (el !== ph) {
      try { ph.remove(); } catch {}
      slotDiv.appendChild(el);
    }

    if (!el.isConnected) slotDiv.appendChild(el);
    makeAutoplayFriendly(el);
    fillEl(el);
    try { el.style.width = '100%'; el.style.height = '100%'; el.style.display = 'block'; } catch {}
    dbg('remote.attach.ok', { uid, tag: el?.tagName?.toLowerCase?.() || 'video' });

    // Kick play on next frame too (for mobile)
    requestAnimationFrame(() => forcePlay(el, dbg, `uid:${uid}/viaVideoEl`));
    return el;
  };

  const viaQuality2Arg = async () => {
    // attachVideo(userId, quality) -> returns an element to append
    const ret = await maybeAwait(stream.attachVideo(uid, Q360));
    if (!ret || ret.nodeType !== 1) throw new Error('attachVideo(2-arg) did not return an element');
    const el = ret;
    slotDiv.textContent = '';
    slotDiv.appendChild(el);
    makeAutoplayFriendly(el);
    fillEl(el);
    try { el.style.width = '100%'; el.style.height = '100%'; el.style.display = 'block'; } catch {}
    dbg('remote.attach.ok', { uid, tag: el?.tagName?.toLowerCase?.() });

    requestAnimationFrame(() => forcePlay(el, dbg, `uid:${uid}/viaQuality`));
    return el;
  };

  try {
    const el = (prefer === 'quality') ? await viaQuality2Arg() : await viaVideoEl();
    // If element is 0×0 after a bit, retry once with the other signature.
    setTimeout(async () => {
      const er = sizeOf(el), sr = sizeOf(slotDiv);
      dbg('remote.postcheck', {
        uid, elW: er.w, elH: er.h, slotW: sr.w, slotH: sr.h, attempt, prefer
      });
      if ((er.w === 0 || er.h === 0) && attempt < 1) {
        try { await maybeAwait(stream.detachVideo?.(uid)); } catch {}
        await waitForNonZeroRect(slotDiv, 'remote.slot.beforeReattach', dbg, 1200, 60);
        const alt = prefer === 'quality' ? 'videoEl' : 'quality';
        await attachRemoteCompat(stream, uid, slotDiv, dbg, alt, attempt + 1);
      }
    }, 350);
    return el;
  } catch (e) {
    dbg('remote.attach.try.fail', { uid, err: niceErr(e) });
    // Try the other signature once
    if (attempt < 1) {
      const alt = prefer === 'quality' ? 'videoEl' : 'quality';
      return attachRemoteCompat(stream, uid, slotDiv, dbg, alt, attempt + 1);
    }
    throw e;
  }
}

/* -------------- COMPONENT -------------- */
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

  // remotes: uid -> { wrapper, slot, label, mode: 'attach', node?:HTMLElement }
  const remoteTilesRef = useRef(new Map());
  const remoteGridRef  = useRef(null);
  const subscribedRef  = useRef(new Set()); // avoid duplicate subscribes

  const [joining, setJoining] = useState(true);
  const [error, setError]     = useState('');
  const [audioOn, setAudioOn] = useState(false);
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
      if (uid === meId) { dbg('remote.skip-self', { uid }); return; }

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const tile = ensureRemoteTile(user);

      await waitForNonZeroRect(tile.slot, 'tile.slot.beforeShow', dbg, 1600, 60);

      if (!user.bVideoOn) {
        if (attempt < 8) { dbg('remote.wait-video', { uid, attempt }); await sleep(200); return showRemote(uid, attempt + 1); }
        dbg('remote.abort-no-video', { uid }); return;
      }

      // subscribe once
      if (!subscribedRef.current.has(uid)) {
        try { await maybeAwait(stream.subscribeVideo?.(uid)); dbg('remote.subscribe.ok', { uid }); }
        catch (eSub) { dbg('remote.subscribe.fail', { uid, err: niceErr(eSub) }); }
        subscribedRef.current.add(uid);
      }

      // mobile: attach only; desktop: try canvas first
      const attachOnly = mustUseAttachForRemotes();
      if (!attachOnly) {
        // try light canvas first for desktop; if SDK rejects, fall through to attach
        try {
          const canvas = document.createElement('canvas');
          tile.slot.textContent = '';
          tile.slot.appendChild(canvas);
          const { w, h } = sizeOf(tile.slot);
          await maybeAwait(stream.renderVideo(canvas, uid, Math.max(1, w), Math.max(1, h), 0, 0, 2));
          tile.mode = 'canvas';
          tile.node = canvas;
          dbg('remote.mode', { uid, mode: 'canvas' });
          // keep a resize observer
          if (!tile._ro) {
            const ro = new ResizeObserver(async () => {
              const { w: w2, h: h2 } = sizeOf(tile.slot);
              try { await maybeAwait(stream.updateVideoCanvasDimension(canvas, uid, Math.max(1, w2), Math.max(1, h2))); } catch {}
            });
            ro.observe(tile.slot);
            tile._ro = ro;
          }
          return;
        } catch (e) {
          dbg('remote.render.fail', { uid, err: niceErr(e) });
        }
      }

      // attach path (works on mobile)
      const el = await attachRemoteCompat(stream, uid, tile.slot, dbg, 'videoEl', 0);
      tile.mode = 'attach';
      tile.node = el;
      dbg('remote.mode', { uid, mode: 'attach' });

      // ensure playback if page becomes visible
      const onVis = () => { if (!document.hidden) forcePlay(el, dbg, `uid:${uid}/vis`); };
      document.addEventListener('visibilitychange', onVis);
      tile._onVis = onVis;
      return;
    } catch (e) {
      dbg('remote.show.unhandled', { uid, err: niceErr(e) });
      if (attempt < 3) { await sleep(300); return showRemote(uid, attempt + 1); }
    }
  }

  async function hideRemote(uid) {
    const stream = mediaRef.current;
    const tile = remoteTilesRef.current.get(uid);
    if (!tile || !stream) return;
    try {
      if (tile._onVis) { document.removeEventListener('visibilitychange', tile._onVis); delete tile._onVis; }
      if (tile._ro) { try { tile._ro.disconnect(); } catch {} delete tile._ro; }
      if (tile.mode === 'canvas' && tile.node) await maybeAwait(stream.stopRenderVideo(tile.node, uid));
      if (tile.mode === 'attach') await maybeAwait(stream.detachVideo?.(uid));
    } catch {}
    try { await maybeAwait(stream.unsubscribeVideo?.(uid)); } catch {}
    subscribedRef.current.delete(uid);
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

    // HARD RESET any leftover DOM/tiles before a fresh join
    try { remoteTilesRef.current.forEach((t) => t?.wrapper?.remove?.()); } catch {}
    remoteTilesRef.current = { current: new Map() }.current; // fresh map
    subscribedRef.current = new Set();
    if (remoteGridRef.current) remoteGridRef.current.innerHTML = '';

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
          const p2 = decodeJwtPayload(sessionToken);
          myDisplayName = p2?.user_identity || payload.userName;
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

        // Audio join immediately (helps autoplay unlock)
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
            // If a user turns camera ON later, attach now.
            if (u.bVideoOn && (!t?.mode || t?.mode === 'pending')) showRemote(u.userId);
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

        // debug heartbeat
        safeInterval(() => {
          try {
            const me = client.getCurrentUserInfo();
            dbg('rect.tick', { me: me?.userId, tiles: Array.from(remoteTilesRef.current.keys()) });
          } catch {}
        }, 3000);

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
          try {
            if (tile._onVis) { document.removeEventListener('visibilitychange', tile._onVis); }
            if (tile._ro) { try { tile._ro.disconnect(); } catch {} }
            if (tile.mode === 'canvas' && tile.node) await maybeAwait(media?.stopRenderVideo(tile.node, uid));
            else if (tile.mode === 'attach') await maybeAwait(media?.detachVideo?.(uid));
          } catch {}
          try { await maybeAwait(media?.unsubscribeVideo?.(uid)); } catch {}
        });
        remoteTilesRef.current.clear();
        subscribedRef.current.clear();
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

      if (remoteGridRef.current) remoteGridRef.current.innerHTML = '';
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

  /* ---- Audio (speaker) join toggle ---- */
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

  // Extra “kick” after gesture to unstick remote playback on mobile
  const handleEnable = async () => {
    setNeedsGesture(false);
    try { await maybeAwait(mediaRef.current?.startAudio()); setAudioOn(true); dbg('gesture.audio.ok'); } catch (e) { dbg('gesture.audio.fail', { err: niceErr(e) }); }
    try { await startCam(); } catch {}
    // Nudge all remote elements to play
    try {
      remoteTilesRef.current.forEach((t, uid) => {
        if (t?.node) forcePlay(t.node, dbg, `uid:${uid}/gestureKick`);
      });
    } catch {}
  };

  /* ---- UI ---- */
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', background: '#000', color: '#fff' }}>
      <div style={{
        padding: 12, display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.07)'
      }}>
        <strong style={{ letterSpacing: '.2px' }}>{locationName ? `Clinic – ${locationName}` : 'Clinic'}</strong>

        {cams.length > 0 && (
          <select
            value={camId}
            onChange={(e) => setCamId(e.target.value)}
            style={{
              marginLeft: 12, background: '#111', color: '#fff', borderRadius: 6,
              border: '1px solid #333', padding: '4px 8px', maxWidth: 220,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}
            title="Camera"
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
            <div ref={selfLabelRef}
                 style={{ position: 'absolute', left: 10, bottom: 8, padding: '3px 8px', fontSize: 12, background: 'rgba(0,0,0,.55)', borderRadius: 6, letterSpacing: '.2px' }}>
              You
            </div>
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
