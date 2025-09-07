// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';
const BUILD = 'ZMC-v6.2-remote-canvas-fallback-2025-09-07';

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

async function maybeAwait(v) { if (v && typeof v.then === 'function') return await v; return v; }
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

/* ---------- tiny helpers to introspect video/canvas ---------- */
function findInnerVideo(root) {
  if (!root) return null;
  if (root.tagName?.toLowerCase() === 'video') return root;
  let v = root.querySelector?.('video') || null;
  if (v) return v;
  if (root.shadowRoot) v = root.shadowRoot.querySelector?.('video') || null;
  return v || null; // may be null for closed shadow DOM (video-player)
}
function hookVideoDebug(el, label, dbg) {
  const v = findInnerVideo(el);
  if (!v) { dbg('video.debug.no-inner-video', { label, tag: tag(el) }); return; }
  const id = `${label}-${Math.random().toString(36).slice(2,8)}`;
  const log = (ev) => dbg(`video.${label}.${ev.type}`, { id, rs: v.readyState, w: v.videoWidth, h: v.videoHeight });
  ['loadedmetadata','loadeddata','canplay','play','playing','pause','waiting','stalled','error','resize','emptied','ended']
    .forEach((e) => v.addEventListener(e, log));
  let n = 0; const t = setInterval(() => { n++; dbg(`video.${label}.size`, { id, w: v.videoWidth, h: v.videoHeight }); if (n>=10) clearInterval(t); }, 1000);
}

/* ---------- REMOTES: attach helpers ---------- */
const sizeOf = (el) => {
  const r = el.getBoundingClientRect?.();
  const w = Math.max(1, Math.round(r?.width || 640));
  const h = Math.max(1, Math.round(r?.height || 360));
  return { w, h };
};

/**
 * Attach remote video.
 * - Canvas path is the most reliable on Android/emulators, so we offer a forced/fallback route.
 */
async function attachRemoteCompat(stream, userId, container, dbg, useCanvas) {
  const Q = (ZoomVideo?.VideoQuality?.Video_360P) ?? 2;

  const attachViaCanvas = async () => {
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width:'100%', height:'100%', display:'block', background:'#111' });
    container.replaceChildren(canvas);

    const { w, h } = sizeOf(container);
    dbg('remote.canvas.render.begin', { userId, w, h });
    await maybeAwait(stream.renderVideo(canvas, userId, w, h, 0, 0));
    dbg('remote.canvas.render.ok', { userId, w, h });

    // keep canvas sized to container
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(async () => {
        const { w: nw, h: nh } = sizeOf(container);
        try {
          dbg('remote.canvas.resize', { userId, w: nw, h: nh });
          await maybeAwait(stream.renderVideo(canvas, userId, nw, nh, 0, 0));
        } catch (e) {
          dbg('remote.canvas.resize.fail', { userId, err: niceErr(e) });
        }
      });
      ro.observe(container);
      canvas._ro = ro; // stash for cleanup
    }
    return canvas;
  };

  if (useCanvas) return await attachViaCanvas();

  // Try new API first: attachVideo(userId, quality, container)
  try {
    dbg('remote.attach.new', { userId, target: tag(container) });
    const maybeEl = await maybeAwait(stream.attachVideo(userId, Q, container));
    const el = (maybeEl && maybeEl.nodeType === 1) ? maybeEl : container;

    // Make sure custom element fills the tile
    if (el && el !== container && container?.parentNode) container.parentNode.replaceChild(el, container);
    if (el && el !== container) Object.assign(el.style, { width:'100%', height:'100%', display:'block' });

    return el;
  } catch (e) {
    dbg('remote.attach.new.fail', { userId, err: niceErr(e) });
  }

  // Old API path: create a <video> and try legacy signatures
  try {
    const video = document.createElement('video');
    video.autoplay = true; video.playsInline = true; video.muted = true;
    Object.assign(video.style, { width:'100%', height:'100%', objectFit:'cover', display:'block', background:'#111' });
    container.replaceChildren(video);

    try {
      dbg('remote.attach.old.v1', { userId, target: 'video' });
      await maybeAwait(stream.attachVideo(video, userId));
      return video;
    } catch (e1) {
      dbg('remote.attach.old.v1.fail', { userId, err: niceErr(e1) });
    }

    dbg('remote.attach.old.v2', { userId, target: 'video' });
    const res = await maybeAwait(stream.attachVideo(userId, video));
    return (res && res.nodeType === 1) ? res : video;
  } catch (e2) {
    dbg('remote.attach.old.fail', { userId, err: niceErr(e2) });
  }

  // Last fallback: canvas
  return await attachViaCanvas();
}

async function detachRemoteCompat(stream, userId, el, dbg) {
  try { dbg('remote.detach.new', { userId }); await maybeAwait(stream.detachVideo?.(userId)); }
  catch { try { dbg('remote.detach.old', { userId, target: tag(el) }); await maybeAwait(stream.detachVideo?.(el, userId)); }
  catch { try { await maybeAwait(stream.stopRender?.(userId)); } catch {} } }
  if (el && el._ro && el._ro.disconnect) try { el._ro.disconnect(); } catch {}
}

/* ---------- COMPONENT ---------- */
export default function ZoomMeetingComponent({
  callId, locationName, role = 0, userId, token,
}) {
  const clientRef = useRef(null);
  const mediaRef  = useRef(null);

  // self MUST be a <video> here
  const selfVideoRef = useRef(null);
  const selfLabelRef = useRef(null);

  // userId -> { wrapper, slot (DIV), label, actual?: HTMLElement }
  const remoteTilesRef = useRef(new Map());
  const remoteGridRef  = useRef(null);

  const [joining, setJoining] = useState(true);
  const [error, setError]     = useState('');
  const [micOn, setMicOn]     = useState(false);
  const [camOn, setCamOn]     = useState(false);

  const isMobileUA = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const forceCanvasParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('forceCanvas');
  // **Key**: prefer canvas for remotes if mobile OR ?forceCanvas=1
  const preferCanvasForRemotes = isMobileUA || forceCanvasParam;

  const [needsGesture, setNeedsGesture] = useState(isMobileUA);

  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState('');

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
    setDebugLines((p) => (debug ? p.concat(line).slice(-600) : p));
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

  // ---- Remote tiles ----
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
      overflow: 'hidden', minHeight: '180px', boxShadow: '0 2px 10px rgba(0,0,0,.35)', display: 'grid',
    });

    const slot = document.createElement('div'); // container for SDK element/canvas/video
    Object.assign(slot.style, { width: '100%', height: '100%', display: 'block', background: '#111' });

    const label = document.createElement('div');
    label.textContent = user.displayName || `User ${uid}`;
    Object.assign(label.style, {
      position: 'absolute', left: '10px', bottom: '8px',
      padding: '3px 8px', fontSize: '12px', color: '#fff',
      background: 'rgba(0,0,0,.55)', borderRadius: '6px', letterSpacing: '.2px', pointerEvents: 'none',
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

  const attachRemote = async (uid, attempt = 0) => {
    try {
      const client = clientRef.current;
      const media  = mediaRef.current;
      if (!client || !media) return;

      const meId = client.getCurrentUserInfo()?.userId;
      if (uid === meId) { dbg('remote.attach.skip-self', { uid }); return; }

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const tile = ensureRemoteTile(user);

      if (!user.bVideoOn) {
        if (attempt < 6) { dbg('remote.attach.wait-video', { uid, attempt }); await sleep(200); return attachRemote(uid, attempt + 1); }
        dbg('remote.attach.abort-no-video', { uid });
        return;
      }

      // First try (may return video-player)
      const el = await attachRemoteCompat(media, uid, tile.slot, dbg, preferCanvasForRemotes);
      tile.actual = el;
      dbg('remote.attach.ok', { uid, attempt, actual: tag(el) });

      // If SDK gave us a video-player (common on desktop), a few builds still paint black.
      // In that case, detach + force canvas.
      if (!preferCanvasForRemotes && tag(el) !== 'canvas') {
        // schedule a quick fallback if we still see nothing
        setTimeout(async () => {
          try {
            // We can't inspect video-player's inner <video> if shadow DOM is closed,
            // so just switch to canvas to be safe.
            dbg('remote.attach.fallback-canvas', { uid, from: tag(el) });
            await detachRemoteCompat(media, uid, el, dbg);
            const cv = await attachRemoteCompat(media, uid, tile.slot, dbg, true);
            tile.actual = cv;
          } catch (e) {
            dbg('remote.attach.fallback-canvas.fail', { uid, err: niceErr(e) });
          }
        }, 600);
      }

      if (tag(tile.actual) !== 'canvas') hookVideoDebug(tile.actual, `remote-${uid}`, dbg);
      else {
        // poll size a few times so we at least see canvas sizing
        const id = `remote-${uid}-${Math.random().toString(36).slice(2,6)}`;
        let n = 0; const t = setInterval(() => {
          n++; const r = tile.actual.getBoundingClientRect?.(); dbg('canvas.remote.size', { id, w: Math.round(r?.width||0), h: Math.round(r?.height||0) });
          if (n>=10) clearInterval(t);
        }, 1000);
      }
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

  // ---- Join & events ----
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
          const list = await maybeAwait(media.getCameraList?.());
          if (Array.isArray(list) && list.length) {
            setCams(list);
            setCamId((prev) => prev || list[0]?.deviceId || '');
          }
        } catch {}

        // Don’t auto-start (mobile autoplay)
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
          if (userId === meIdNow) return; // ignore our own camera events
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
        remoteTilesRef.current.forEach(async (_, uid) => {
          try { await detachRemoteCompat(media, uid, null, dbg); } catch {}
        });
        remoteTilesRef.current.clear();
      } catch {}

      try { maybeAwait(media?.stopVideo()); } catch {}
      try { maybeAwait(media?.stopAudio()); } catch {}
      try { client?.leave(); } catch {}

      clientRef.current = null;
      mediaRef.current  = null;
    };
  }, [callId, locationName, role, userId, token]);

  // ---- Camera start/stop/switch (SELF) ----
  const startCam = async () => {
    setError('');
    const media = mediaRef.current;
    const client = clientRef.current;
    if (!media || !client) return;

    // Pre-warm permission with the chosen device for better error messages
    try {
      const constraints = camId ? { video: { deviceId: { exact: camId } } } : { video: true };
      const tmp = await navigator.mediaDevices.getUserMedia(constraints);
      tmp.getTracks().forEach((t) => t.stop());
    } catch (e) { setError(mapCameraError(e)); return; }

    // Start video by binding directly to the <video> element
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
        if (media.switchCamera) { await maybeAwait(media.switchCamera(camId)); dbg('switchCamera.ok', { camId }); }
        else { await maybeAwait(media.stopVideo()); await startCam(); }
      } catch (e) { console.warn('[ZMC] switchCamera FAIL', e); }
    })();
  }, [camId, camOn]);

  const toggleCam = async () => (camOn ? stopCam() : startCam());

  // ---- Mic ----
  const toggleMic = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try { if (micOn) { await maybeAwait(media.stopAudio()); setMicOn(false); }
          else       { await maybeAwait(media.startAudio()); setMicOn(true); } }
    catch (e) { setError('Microphone error: ' + (e?.reason || e?.message || 'unknown')); }
  };

  const handleEnable = async () => { await startCam(); await toggleMic(); };

  // ---- UI ----
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', background: '#000', color: '#fff' }}>
      <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
        <strong style={{ letterSpacing: '.2px' }}>{locationName ? `Clinic – ${locationName}` : 'Clinic'}</strong>

        {cams.length > 1 && (
          <select value={camId} onChange={(e) => setCamId(e.target.value)} style={{ marginLeft: 12, background: '#111', color: '#fff', borderRadius: 6, border: '1px solid #333', padding: '4px 8px' }} title="Camera">
            {cams.map((c) => (<option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>))}
          </select>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={toggleMic} style={{ padding: '6px 12px', borderRadius: 8, border: 0, background: micOn ? '#2e8b57' : '#666', color: '#fff' }}>{micOn ? 'Mic On' : 'Mic Off'}</button>
          <button onClick={toggleCam} style={{ padding: '6px 12px', borderRadius: 8, border: 0, background: camOn ? '#2e8b57' : '#666', color: '#fff' }}>{camOn ? 'Cam On' : 'Cam Off'}</button>
          <button onClick={() => { try { maybeAwait(mediaRef.current?.stopVideo()); } catch {} try { maybeAwait(mediaRef.current?.stopAudio()); } catch {} try { clientRef.current?.leave(); } catch {} }}
                  style={{ padding: '6px 12px', borderRadius: 8, background: '#d33', color: '#fff', border: 0 }}>Leave</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,360px) 1fr', gap: 14, padding: 14 }}>
        {/* Self (VIDEO element) */}
        <div style={{ position: 'relative' }}>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>You</div>
          <div style={{ position: 'relative', width: '100%', height: 220, background: '#111', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,.35)' }}>
            <video ref={selfVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div ref={selfLabelRef} style={{ position: 'absolute', left: 10, bottom: 8, padding: '3px 8px', fontSize: 12, background: 'rgba(0,0,0,.55)', borderRadius: 6, letterSpacing: '.2px' }}>You</div>
          </div>
        </div>

        {/* Remotes (container DIV) */}
        <div>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>Participants</div>
          <div ref={remoteGridRef} id="remote-grid" style={{ width: '100%', minHeight: 220, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }} />
        </div>
      </div>

      {joining && (<div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)', fontSize: 16 }}>Connecting to session…</div>)}

      {(needsGesture || !!error) && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' }}>
          <div style={{ display: 'grid', gap: 10, placeItems: 'center' }}>
            {!!error && (<div style={{ background: 'rgba(220,0,0,.85)', padding: '8px 12px', borderRadius: 6, maxWidth: 520, lineHeight: 1.35 }}>{String(error)}</div>)}
            <button onClick={handleEnable} style={{ padding: '10px 14px', borderRadius: 8, border: 0, background: '#1f8fff', color: '#fff', fontWeight: 600 }}>Enable mic & cam</button>
          </div>
        </div>
      )}

      {debug && (
        <div style={{ position: 'absolute', right: 8, bottom: 8, width: 380, maxHeight: 280, overflow: 'auto',
                      fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11,
                      background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.12)',
                      borderRadius: 6, padding: 8, whiteSpace: 'pre-wrap' }}>
          {debugLines.join('\n')}
        </div>
      )}
    </div>
  );
}
