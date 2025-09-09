// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';
const BUILD = 'ZMC-v6.9-android-container-no-reparent+deep-logs-2025-09-09';

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const displayNameFor = (role, location) =>
  Number(role) === 1 ? `Doctor – ${location || ''}` : `Clinic – ${location || ''}`;

/* ------------------- utils ------------------- */
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
const tag = (el) => (el && el.tagName ? el.tagName.toLowerCase() : String(el));
const niceErr = (e) =>
  typeof e === 'string' ? e :
  JSON.stringify({ name: e?.name, message: e?.message, reason: e?.reason, code: e?.code });

function mapCameraError(e) {
  const s = (e?.name || e?.message || e?.reason || '').toLowerCase();
  if (/video is started/i.test(s)) return '';
  if (/notallowed|permission|denied/i.test(s)) return 'Camera permission blocked';
  if (/notreadable|in use|busy|trackstart/i.test(s)) return 'Camera is in use by another app';
  if (/notfound|overconstrained|no suitable device|device not found/i.test(s)) return 'No camera found';
  return 'Could not start camera';
}

/* ----- probe inner <video> when possible ----- */
function findInnerVideo(root) {
  if (!root) return null;
  if (root.tagName?.toLowerCase() === 'video') return root;
  let v = root.querySelector?.('video') || null;
  if (v) return v;
  if (root.shadowRoot) v = root.shadowRoot.querySelector?.('video') || null;
  return v || null;
}
function hookVideoDebug(el, label, dbg) {
  const v = findInnerVideo(el);
  if (!v) { dbg('video.debug.no-inner-video', { label, tag: tag(el) }); return; }
  const id = `${label}-${Math.random().toString(36).slice(2,8)}`;
  const log = (ev) => dbg(`video.${label}.${ev.type}`, { id, rs: v.readyState, vw: v.videoWidth, vh: v.videoHeight });
  ['loadedmetadata','loadeddata','canplay','play','playing','pause','waiting','stalled','error','resize','emptied','ended']
    .forEach((e) => v.addEventListener(e, log));
  let n = 0; const t = setInterval(() => {
    n++; dbg(`video.${label}.size`, { id, vw: v.videoWidth, vh: v.videoHeight });
    if (n >= 10) clearInterval(t);
  }, 1000);
}

function sizeOf(el) {
  const r = el?.getBoundingClientRect?.();
  return { w: Math.max(1, Math.round(r?.width || 0)), h: Math.max(1, Math.round(r?.height || 0)) };
}

function makeVideoEl() {
  const v = document.createElement('video');
  v.autoplay = true;
  v.playsInline = true;
  v.muted = true;
  Object.assign(v.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#111' });
  return v;
}

function fill(el) {
  try { Object.assign(el.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }); } catch {}
  return el;
}

/* ------------------- REMOTE ATTACH (with deep logs) ------------------- */
/**
 * For Android/real phones:
 *  - Prefer: attachVideo(userId, quality, containerDiv)
 *  - Do NOT reparent/replace after SDK inserts its player
 *  - Style the container so the player fills it
 * Post-check: if 0×0 or inner video 0×0, retry via the <video> signature, then canvas.
 */
async function attachRemoteCompat(stream, userId, slotDiv, dbg, prefer = 'container') {
  const Q = (ZoomVideo?.VideoQuality?.Video_360P) ?? 2;

  // Ensure the slot is a positioned box the SDK can fill
  Object.assign(slotDiv.style, { position: 'relative', background: '#111' });

  const viaContainer = async () => {
    dbg('remote.attach.container.begin', { uid: userId });
    slotDiv.textContent = ''; // clear, but do not create our own node
    const ret = await maybeAwait(stream.attachVideo(userId, Q, slotDiv));
    const player = (ret && ret.nodeType === 1) ? ret : (slotDiv.firstElementChild || slotDiv);
    if (player !== slotDiv) fill(player);
    const cb = sizeOf(slotDiv), pb = sizeOf(player);
    dbg('remote.attach.container.ok', { uid: userId, container: cb, player: { tag: tag(player), ...pb } });
    return player;
  };

  const viaVideo = async () => {
    const vid = makeVideoEl();
    slotDiv.textContent = '';
    slotDiv.appendChild(vid);
    dbg('remote.attach.video.begin', { uid: userId });
    const ret = await maybeAwait(stream.attachVideo(userId, Q, vid));
    const el = (ret && ret.nodeType === 1) ? ret : vid;
    fill(el);
    const sb = sizeOf(slotDiv), eb = sizeOf(el);
    dbg('remote.attach.video.ok', { uid: userId, slot: sb, el: { tag: tag(el), ...eb } });
    return el;
  };

  const viaCanvas = async () => {
    const canvas = document.createElement('canvas');
    fill(canvas);
    slotDiv.textContent = '';
    slotDiv.appendChild(canvas);
    const { w, h } = sizeOf(slotDiv);
    dbg('remote.canvas.render.begin', { uid: userId, w, h });
    await maybeAwait(stream.renderVideo(canvas, userId, Math.max(2, w), Math.max(2, h), 0, 0));
    dbg('remote.canvas.render.ok', { uid: userId });
    return canvas;
  };

  const order = (prefer === 'container') ? [viaContainer, viaVideo, viaCanvas]
                : (prefer === 'video')    ? [viaVideo, viaContainer, viaCanvas]
                                         : [viaCanvas, viaContainer, viaVideo];

  let el = null;
  for (const step of order) {
    try { el = await step(); break; }
    catch (e) { dbg(`remote.${step.name}.fail`, { uid: userId, err: niceErr(e) }); }
  }
  if (!el) throw new Error('attachRemoteCompat: no method succeeded');

  // Post-check & auto-retry with opposite preference if not painting
  setTimeout(async () => {
    try {
      const sb = sizeOf(slotDiv), eb = sizeOf(el);
      const inner = findInnerVideo(el);
      const vw = inner?.videoWidth || 0, vh = inner?.videoHeight || 0;
      dbg('remote.postcheck', { uid: userId, slot: sb, el: { tag: tag(el), ...eb }, vw, vh });

      // Try to "poke" playback on gesture (if any was pending)
      try { await inner?.play?.(); dbg('remote.inner.play.try', { uid: userId, ok: true }); } catch {}

      const notPainting = (sb.w === 0 || sb.h === 0 || eb.w === 0 || eb.h === 0 || vw === 0 || vh === 0);
      if (notPainting && tag(el) !== 'canvas') {
        dbg('remote.postcheck.retry', { uid: userId, from: tag(el), prefer });
        try { await stream.detachVideo?.(userId); } catch {}
        const alt = (prefer === 'container') ? 'video' : 'container';
        try {
          const el2 = await attachRemoteCompat(stream, userId, slotDiv, dbg, alt);
          dbg('remote.postcheck.retry.ok', { uid: userId, tag: tag(el2), prefer: alt });
        } catch (e2) {
          dbg('remote.postcheck.retry.fail', { uid: userId, err: niceErr(e2) });
        }
      }
    } catch (e) {
      dbg('remote.postcheck.error', { uid: userId, err: niceErr(e) });
    }
  }, 450);

  // Safety: ensure we never overlay this tile
  slotDiv.style.zIndex = '0';
  return el;
}

async function detachRemoteCompat(stream, userId, el, dbg) {
  try { dbg('remote.detach.new', { userId }); await maybeAwait(stream.detachVideo?.(userId)); }
  catch {
    try { dbg('remote.detach.old', { userId, target: tag(el) }); await maybeAwait(stream.detachVideo?.(el, userId)); }
    catch { try { await maybeAwait(stream.stopRender?.(userId)); } catch {} }
  }
}

/* ------------------- COMPONENT ------------------- */
export default function ZoomMeetingComponent({ callId, locationName, role = 0, userId, token }) {
  const clientRef = useRef(null);
  const mediaRef  = useRef(null);

  // self is a <video>
  const selfVideoRef = useRef(null);
  const selfLabelRef = useRef(null);

  // userId -> { wrapper, slot, label, actual }
  const remoteTilesRef = useRef(new Map());
  const remoteGridRef  = useRef(null);

  const [joining, setJoining] = useState(true);
  const [error, setError]     = useState('');
  const [micOn, setMicOn]     = useState(false);
  const [camOn, setCamOn]     = useState(false);

  const isMobileUA = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [needsGesture, setNeedsGesture] = useState(isMobileUA);

  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState('');

  // Attach method override via query (?attach=container|video|canvas)
  const attachPref = (() => {
    if (typeof window === 'undefined') return 'container';
    const p = new URLSearchParams(window.location.search).get('attach');
    if (p === 'video' || p === 'canvas') return p;
    return 'container';
  })();

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
  }, []);
  const dbg = (msg, data) => {
    const line = `[VideoSDK] ${msg} ${data ? JSON.stringify(data) : ''}`;
    setDebugLines((p) => (debug ? p.concat(line).slice(-900) : p));
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  /* ------------ Remote tiles ------------ */
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
      minHeight: '180px', boxShadow: '0 2px 10px rgba(0,0,0,.35)', display: 'grid'
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

    tile = { wrapper, slot, label, actual: null };
    remoteTilesRef.current.set(uid, tile);
    return tile;
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

  const measureTile = (uid, tile, element, stage) => {
    try {
      const rw = sizeOf(tile.wrapper), rs = sizeOf(tile.slot), re = sizeOf(element);
      dbg(`remote.tile.bounds.${stage}`, { uid, wrapper: rw, slot: rs, el: { tag: tag(element), ...re } });
    } catch {}
  };

  const attachRemote = async (uid, attempt = 0) => {
    try {
      const client = clientRef.current;
      const stream = mediaRef.current;
      if (!client || !stream) return;

      const meId = client.getCurrentUserInfo()?.userId;
      if (uid === meId) { dbg('remote.attach.skip-self', { uid }); return; }

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const tile = ensureRemoteTile(user);

      if (!user.bVideoOn) {
        if (attempt < 8) { dbg('remote.attach.wait-video', { uid, attempt }); await sleep(200); return attachRemote(uid, attempt + 1); }
        dbg('remote.attach.abort-no-video', { uid });
        return;
      }

      const el = await attachRemoteCompat(stream, uid, tile.slot, dbg, attachPref);
      tile.actual = el;

      measureTile(uid, tile, el, 'immediate');
      requestAnimationFrame(() => measureTile(uid, tile, el, 'raf'));
      setTimeout(() => measureTile(uid, tile, el, 't+300ms'), 300);

      if (tag(el) !== 'canvas') hookVideoDebug(el, `remote-${uid}`, dbg);
    } catch (e) {
      dbg('remote.attach.fail', { uid, attempt, err: niceErr(e) });
      if (attempt < 8) { await sleep(260); return attachRemote(uid, attempt + 1); }
    }
  };

  const detachRemote = async (uid) => {
    const tile = remoteTilesRef.current.get(uid);
    try { await detachRemoteCompat(mediaRef.current, uid, tile?.actual || tile?.slot, dbg); } catch {}
  };
  const removeRemoteTile = async (uid) => {
    await detachRemote(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (tile?.wrapper) tile.wrapper.remove();
    remoteTilesRef.current.delete(uid);
  };

  /* ------------ Join & events ------------ */
  useEffect(() => {
    if (!callId && !token) return;
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
            url.searchParams.set('un', btoa(unescape(encodeURIComponent(payload.userName))));
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
        dbg('session', { sessionName, meId });
        if (selfLabelRef.current) selfLabelRef.current.textContent = `You — ${myDisplayName}`;

        // media
        const media = client.getMediaStream();
        mediaRef.current = media;

        try {
          const cams = await maybeAwait(media.getCameraList?.());
          if (Array.isArray(cams) && cams.length) { setCams(cams); setCamId((prev) => prev || cams[0]?.deviceId || ''); }
        } catch {}

        setMicOn(false); setCamOn(false); setNeedsGesture(true);

        // hydrate remotes
        logUsers(client, 'after-join');
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== meId) {
            ensureRemoteTile(u);
            if (u.bVideoOn) attachRemote(u.userId);
          }
        });

        // events
        const onAdded = (list) => {
          logUsers(client, 'user-added');
          asArray(list).forEach((u) => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) {
              ensureRemoteTile(u);
              if (u.bVideoOn) attachRemote(u.userId);
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
          const meIdNow = client.getCurrentUserInfo()?.userId;
          dbg('peer-video-state-change', { action, userId, meId: meIdNow });
          if (userId === meIdNow) return;
          if (action === 'Start') attachRemote(userId, 0);
          else detachRemote(userId);
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
        remoteTilesRef.current.forEach(async (_, uid) => { try { await detachRemoteCompat(media, uid, null, dbg); } catch {} });
        remoteTilesRef.current.clear();
      } catch {}

      try { maybeAwait(media?.stopVideo()); } catch {}
      try { maybeAwait(media?.stopAudio()); } catch {}
      try { client?.leave(); } catch {}

      clientRef.current = null;
      mediaRef.current  = null;
    };
  }, [callId, locationName, role, userId, token]); // eslint-disable-line

  /* ------------------- Self camera ------------------- */
  const startCam = async () => {
    setError('');
    const media = mediaRef.current;
    const client = clientRef.current;
    if (!media || !client) return;

    try {
      const constraints = camId ? { video: { deviceId: { exact: camId } } } : { video: true };
      const tmp = await navigator.mediaDevices.getUserMedia(constraints);
      tmp.getTracks().forEach((t) => t.stop());
    } catch (e) { setError(mapCameraError(e)); return; }

    const el = selfVideoRef.current;
    try {
      dbg('self.startVideo.withElement', { deviceId: camId || '(default)', tag: tag(el) });
      await maybeAwait(media.startVideo({ deviceId: camId || undefined, videoElement: el }));
      dbg('self.startVideo.withElement.ok');
      setCamOn(true);
      setNeedsGesture(false);
      hookVideoDebug(el, 'self', dbg);
    } catch (e1) {
      dbg('self.startVideo.withElement.fail', { err: niceErr(e1) });
      setError(mapCameraError(e1) || 'Could not start camera');
    }
  };

  const stopCam = async () => { try { await maybeAwait(mediaRef.current?.stopVideo()); } catch {} setCamOn(false); };

  useEffect(() => {
    (async () => {
      const media = mediaRef.current;
      if (!media || !camOn || !camId) return;
      try {
        if (media.switchCamera) { await maybeAwait(media.switchCamera(camId)); }
        else { await maybeAwait(media.stopVideo()); await startCam(); }
        console.log('[ZMC] switchCamera ok', camId);
      } catch (e) { console.warn('[ZMC] switchCamera FAIL', e); }
    })();
  }, [camId, camOn]); // eslint-disable-line

  const toggleCam = async () => (camOn ? stopCam() : startCam());

  /* ------------------- Mic ------------------- */
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

  const handleEnable = async () => { await startCam(); await toggleMic(); };

  /* ------------------- UI ------------------- */
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
          <button onClick={() => { try { maybeAwait(mediaRef.current?.stopVideo()); } catch {} try { maybeAwait(mediaRef.current?.stopAudio()); } catch {} try { clientRef.current?.leave(); } catch {} }}
                  style={{ padding: '6px 12px', borderRadius: 8, background: '#d33', color: '#fff', border: 0 }}>
            Leave
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,360px) 1fr', gap: 14, padding: 14 }}>
        {/* Self */}
        <div style={{ position: 'relative' }}>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>You</div>
          <div style={{ position: 'relative', width: '100%', height: 220, background: '#111', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.35)' }}>
            <video ref={selfVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div ref={selfLabelRef} style={{ position: 'absolute', left: 10, bottom: 8, padding: '3px 8px', fontSize: 12, background: 'rgba(0,0,0,.55)', borderRadius: 6, letterSpacing: '.2px' }}>You</div>
          </div>
        </div>

        {/* Remotes */}
        <div>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>Participants</div>
          <div ref={remoteGridRef} id="remote-grid"
               style={{ width: '100%', minHeight: 220, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }} />
        </div>
      </div>

      {joining && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)', fontSize: 16 }}>
          Connecting to session…
        </div>
      )}

      {/* Keep overlay from covering tiles once user enabled devices */}
      {((needsGesture && !camOn && !micOn) || (!!error && !camOn)) && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' }}>
          <div style={{ display: 'grid', gap: 10, placeItems: 'center' }}>
            {!!error && <div style={{ background: 'rgba(220,0,0,.85)', padding: '8px 12px', borderRadius: 6, maxWidth: 520, lineHeight: 1.35 }}>{String(error)}</div>}
            <button onClick={handleEnable} style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: '#1f8fff', color: '#fff', fontWeight: 600 }}>
              Enable mic & cam
            </button>
          </div>
        </div>
      )}

      {debug && (
        <div style={{
          position: 'absolute', right: 8, bottom: 8, width: 420, maxHeight: 300, overflow: 'auto',
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
