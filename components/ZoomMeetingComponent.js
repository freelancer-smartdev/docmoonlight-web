// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';
const BUILD = 'ZMC-v7.4-mobile-attach-only-video-player-postcheck-2025-09-09';

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
const tag = (el) => (el && el.tagName ? el.tagName.toLowerCase() : String(el));
const niceErr = (e) =>
  typeof e === 'string'
    ? e
    : JSON.stringify({ name: e?.name, message: e?.message, reason: e?.reason, code: e?.code });

function mapCameraError(e) {
  const s = (e?.name || e?.message || e?.reason || '').toLowerCase();
  if (/video is started/i.test(s)) return '';
  if (/notallowed|permission|denied/i.test(s)) return 'Camera permission blocked';
  if (/notreadable|in use|busy|trackstart/i.test(s)) return 'Camera is in use by another app';
  if (/notfound|overconstrained|no suitable device|device not found/i.test(s)) return 'No camera found';
  return 'Could not start camera';
}

/* ---------- helpers ---------- */
function sizeOf(el) {
  const r = el?.getBoundingClientRect?.();
  return { w: Math.max(0, Math.round(r?.width || 0)), h: Math.max(0, Math.round(r?.height || 0)) };
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
function logComputed(dbg, el, label) {
  try {
    const cs = window.getComputedStyle(el);
    dbg('css.computed', { label, tag: tag(el), display: cs.display, visibility: cs.visibility, opacity: cs.opacity });
  } catch {}
}

/* ---------- per-user attach attempts ---------- */
const attachAttempts = new Map(); // userId -> number

/* ---------- REMOTE ATTACH (attachVideo only) ---------- */
async function attachRemoteCompat(stream, userId, slotDiv, dbg, prefer = 'auto') {
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const Q360 = (ZoomVideo?.VideoQuality?.Video_360P) ?? 2;

  Object.assign(slotDiv.style, { position: 'relative', background: '#111', minHeight: '160px' });

  // ATTACH SIGNATURES (attachVideo only; no canvas)
  const viaSigB = async () => {
    // (userId, videoEl)
    const vid = makeVideoEl();
    slotDiv.textContent = '';
    slotDiv.appendChild(vid);
    dbg('remote.attach.sigB (userId, videoEl)', { uid: userId });
    const ret = await maybeAwait(stream.attachVideo(userId, vid));
    const el = (ret && ret.nodeType === 1) ? ret : vid; // some SDKs return <video-player>
    fill(el);
    return el;
  };

  const viaSigD = async () => {
    // (userId, quality, containerDiv)
    dbg('remote.attach.sigD (userId, quality, containerDiv)', { uid: userId, Q: Q360 });
    slotDiv.textContent = '';
    const ret = await maybeAwait(stream.attachVideo(userId, Q360, slotDiv));
    const player = (ret && ret.nodeType === 1) ? ret : (slotDiv.firstElementChild || slotDiv);
    if (player !== slotDiv) fill(player);
    return player;
  };

  // On mobile prefer container (lets SDK pick best renderer)
  let order;
  if (prefer === 'video') order = [viaSigB, viaSigD];
  else if (prefer === 'container') order = [viaSigD, viaSigB];
  else order = isMobile ? [viaSigD, viaSigB] : [viaSigB, viaSigD];

  let el = null;
  for (const step of order) {
    try {
      el = await step();
      dbg('remote.attach.ok', { uid: userId, via: step.name, tag: tag(el) });
      break;
    } catch (e) {
      dbg(`remote.${step.name}.fail`, { uid: userId, err: niceErr(e) });
    }
  }
  if (!el) throw new Error('attachRemoteCompat: attachVideo failed for all signatures');

  // Post-check for visibility/layout (NOT pixel painting; <video-player> uses closed shadow)
  setTimeout(async () => {
    try {
      const eb = sizeOf(el), sb = sizeOf(slotDiv);
      logComputed(dbg, el, 'remote.element');
      logComputed(dbg, slotDiv, 'remote.slot');
      dbg('remote.postcheck.layout', { uid: userId, el: { tag: tag(el), ...eb }, slot: sb });

      // Periodic rect ticks (prove size stays non-zero)
      let ticks = 0;
      const t = setInterval(() => {
        ticks++;
        const er = sizeOf(el), sr = sizeOf(slotDiv);
        dbg('remote.rect.tick', { uid: userId, el: er, slot: sr, tag: tag(el) });
        if (ticks >= 10) clearInterval(t);
      }, 1000);

      // If the SDK returned its custom <video-player>, we cannot read videoWidth/videoHeight.
      // Trust the SDK; just ensure the element is visible and sized.
      if (tag(el) === 'video-player') {
        attachAttempts.set(userId, 0);
        return;
      }

      // If SDK actually returned <video>, do a basic vw/vh check (rare in your build)
      const v = el.tagName?.toLowerCase() === 'video' ? el : null;
      const vw = v?.videoWidth || 0, vh = v?.videoHeight || 0;
      dbg('remote.postcheck.video-metrics', { uid: userId, vw, vh });
      if (vw > 0 && vh > 0) {
        attachAttempts.set(userId, 0);
        return;
      }

      // Retry once switching signature (only attach paths)
      const tries = (attachAttempts.get(userId) || 0) + 1;
      attachAttempts.set(userId, tries);
      if (tries <= 1) {
        const nextPrefer = (prefer === 'container') ? 'video' : 'container';
        dbg('remote.postcheck.retry-attach', { uid: userId, from: tag(el), prefer, tries, nextPrefer });
        try { await maybeAwait(stream.detachVideo?.(userId)); } catch {}
        try {
          const el2 = await attachRemoteCompat(stream, userId, slotDiv, dbg, nextPrefer);
          dbg('remote.postcheck.retry-attach.ok', { uid: userId, tag: tag(el2), prefer: nextPrefer });
        } catch (e2) {
          dbg('remote.postcheck.retry-attach.fail', { uid: userId, err: niceErr(e2) });
        }
      }
    } catch (e) {
      dbg('remote.postcheck.error', { uid: userId, err: niceErr(e) });
    }
  }, 400);

  slotDiv.style.zIndex = '0';
  return el;
}

async function detachRemoteCompat(stream, userId, el, dbg) {
  try { dbg('remote.detach.byUserId', { userId }); await maybeAwait(stream.detachVideo?.(userId)); } catch {}
}

/* ---------- COMPONENT ---------- */
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

  // Attach preference via query (?attach=auto|video|container)
  const attachPref = (() => {
    if (typeof window === 'undefined') return 'auto';
    const p = new URLSearchParams(window.location.search).get('attach');
    return ['auto', 'video', 'container'].includes(p) ? p : 'auto';
  })();

  // Responsive: stack vertically on narrow screens
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
        attachPref
      });
    }
  }, []); // eslint-disable-line
  const dbg = (msg, data) => {
    const line = `[VideoSDK] ${msg} ${data ? JSON.stringify(data) : ''}`;
    setDebugLines((p) => (debug ? p.concat(line).slice(-900) : p));
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

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
    } catch (e) {
      dbg('remote.attach.fail', { uid, attempt, err: niceErr(e) });
      if (attempt < 6) { await sleep(260); return attachRemote(uid, attempt + 1); }
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

  /* ---- Join & events ---- */
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
        dbg('session', { sessionName, meId, attachPref, platform: navigator.platform, ua: navigator.userAgent });
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
          const meIdNow = clientRef.current?.getCurrentUserInfo()?.userId;
          const u = (clientRef.current?.getAllUser?.() || []).find(x => x.userId === userId);
          dbg('peer-video-state-change', { action, userId, isSelf: userId === meIdNow, name: u?.displayName, bVideoOn: u?.bVideoOn });

          if (userId === meIdNow) return;
          if (action === 'Start') { attachAttempts.set(userId, 0); attachRemote(userId, 0); }
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
        remoteTilesRef.current.forEach(async (_, uid) => { try { await detachRemoteCompat(media, uid, null, () => {}); } catch {} });
        remoteTilesRef.current.clear();
      } catch {}

      try { maybeAwait(media?.stopVideo()); } catch {}
      try { maybeAwait(media?.stopAudio()); } catch {}
      try { client?.leave(); } catch {}

      clientRef.current = null;
      mediaRef.current  = null;
    };
  }, [callId, locationName, role, userId, token]); // eslint-disable-line

  /* ---- Self camera ---- */
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
      console.warn('The "videoElement" option will be removed in v2.x (from SDK). Using it for now for self-view.');
      await maybeAwait(media.startVideo({ deviceId: camId || undefined, videoElement: el }));
      setCamOn(true);
      setNeedsGesture(false);
    } catch (e1) {
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
    console.log('[VideoSDK] gesture.enable.begin', { ua: navigator.userAgent });
    await startCam();
    await toggleMic();
    console.log('[VideoSDK] gesture.enable.done', {});
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
          <div style={{ position: 'relative', width: '100%', height: 220, background: '#111', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.35)' }}>
            <video ref={selfVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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

      {/* Gesture + error overlay */}
      {(needsGesture || !!error) && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' }}>
          <div style={{ display: 'grid', gap: 10, placeItems: 'center' }}>
            {!!error && <div style={{ background: 'rgba(220,0,0,.85)', padding: '8px 12px', borderRadius: 6, maxWidth: 520, lineHeight: 1.35 }}>{String(error)}</div>}
            <button onClick={handleEnable} style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: '#1f8fff', color: '#fff', fontWeight: 600 }}>
              Enable mic & cam
            </button>
          </div>
        </div>
      )}

      {/* Debug window (only if ?debug) */}
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
