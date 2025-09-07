// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';
const BUILD = 'ZMC-v3-2025-09-07r'; // <- check this appears in console

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
const niceErr = (e) => typeof e === 'string' ? e : JSON.stringify({ name: e?.name, message: e?.message, reason: e?.reason, code: e?.code });

function mapCameraError(e) {
  const s = (e?.name || e?.message || e?.reason || '').toLowerCase();
  if (/video is started/i.test(s)) return '';
  if (/notallowed|permission|denied/i.test(s)) return 'Camera permission blocked';
  if (/notreadable|in use|busy|trackstart/i.test(s)) return 'Camera is in use by another app';
  if (/notfound|overconstrained|no suitable device|device not found/i.test(s)) return 'No camera found';
  return 'Could not start camera';
}

/* ---------- REMOTES: attach into a container DIV ---------- */
async function attachRemoteCompat(stream, userId, container, dbg) {
  const Q = (ZoomVideo?.VideoQuality?.Video_360P) ?? 2;

  try {
    dbg?.('remote.attach.new', { userId, target: tag(container) });
    const maybeEl = await maybeAwait(stream.attachVideo(userId, Q, container));
    const el = (maybeEl && maybeEl.nodeType === 1) ? maybeEl : container;
    if (el !== container && container?.parentNode) container.parentNode.replaceChild(el, container);
    return el;
  } catch (e) {
    dbg?.('remote.attach.new.fail', { err: niceErr(e) });
  }

  // Old API needs <video>
  try {
    const video = document.createElement('video');
    video.autoplay = true; video.playsInline = true; video.muted = true;
    Object.assign(video.style, { width:'100%', height:'100%', objectFit:'cover', display:'block', background:'#111' });
    container.replaceChildren(video);

    try { // attachVideo(video, userId)
      dbg?.('remote.attach.old.v1', { userId, target: 'video' });
      await maybeAwait(stream.attachVideo(video, userId));
      return video;
    } catch (e1) { dbg?.('remote.attach.old.v1.fail', { err: niceErr(e1) }); }

    // attachVideo(userId, video)
    dbg?.('remote.attach.old.v2', { userId, target: 'video' });
    const res = await maybeAwait(stream.attachVideo(userId, video));
    return (res && res.nodeType === 1) ? res : video;
  } catch (e2) {
    dbg?.('remote.attach.old.fail', { err: niceErr(e2) });
  }

  // Last-ditch: renderVideo(canvas)
  try {
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width:'100%', height:'100%', display:'block', background:'#111' });
    container.replaceChildren(canvas);
    const rect = container.getBoundingClientRect?.() || { width: 640, height: 360 };
    dbg?.('remote.renderVideo.fallback', { userId, w: rect.width|0, h: rect.height|0 });
    await maybeAwait(stream.renderVideo(canvas, userId, (rect.width|0)||640, (rect.height|0)||360, 0, 0));
    return canvas;
  } catch (e3) {
    dbg?.('remote.renderVideo.fail', { err: niceErr(e3) });
    throw new Error('Could not attach remote video');
  }
}

async function detachRemoteCompat(stream, userId, el, dbg) {
  try { dbg?.('remote.detach.new', { userId }); await maybeAwait(stream.detachVideo?.(userId)); }
  catch { try { dbg?.('remote.detach.old', { userId, target: tag(el) }); await maybeAwait(stream.detachVideo?.(el, userId)); }
  catch { try { await maybeAwait(stream.stopRender?.(userId)); } catch {} } }
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
  const [needsGesture, setNeedsGesture] = useState(isMobileUA);

  const [cams, setCams] = useState([]);
  const [camId, setCamId] = useState('');

  // Debug
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
    setDebugLines((p) => (debug ? p.concat(line).slice(-500) : p));
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

  const attachRemote = async (uid, attempt = 0) => {
    try {
      const client = clientRef.current;
      const media  = mediaRef.current;
      if (!client || !media) return;

      const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
      const tile = ensureRemoteTile(user);

      if (!user.bVideoOn) {
        if (attempt < 4) { await sleep(150); return attachRemote(uid, attempt + 1); }
        return;
      }

      const el = await attachRemoteCompat(media, uid, tile.slot, dbg);
      tile.actual = el;
      dbg('remote.attach.ok', { uid, attempt, actual: tag(el) });
    } catch (e) {
      dbg('remote.attach.fail', { uid, attempt, err: niceErr(e) });
      if (attempt < 4) { await sleep(200); return attachRemote(uid, attempt + 1); }
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
        const me = client.getCurrentUserInfo()?.userId;
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== me) {
            ensureRemoteTile(u);
            if (u.bVideoOn) attachRemote(u.userId);
          }
        });

        // events
        const onAdded   = (list) => asArray(list).forEach((u) => { if (u.userId !== client.getCurrentUserInfo()?.userId) { ensureRemoteTile(u); if (u.bVideoOn) attachRemote(u.userId); }});
        const onUpdated = (list) => asArray(list).forEach((u) => { const t = remoteTilesRef.current.get(u.userId); if (t?.label && u.displayName) t.label.textContent = u.displayName; });
        const onRemoved = (list) => asArray(list).forEach((u) => removeRemoteTile(u.userId));
        const onPeerVideo = ({ action, userId }) => { dbg('peer-video-state-change', { action, userId }); if (action === 'Start') attachRemote(userId, 0); else detachRemote(userId); };

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

    // Start video by binding directly to the <video> element (this is the key fix)
    const el = selfVideoRef.current;
    try {
      dbg('self.startVideo.withElement', { deviceId: camId || '(default)', tag: tag(el) });
      await maybeAwait(media.startVideo({ deviceId: camId || undefined, videoElement: el }));
      dbg('self.startVideo.withElement.ok');
      setCamOn(true);
      setNeedsGesture(false);
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
        <div style={{ position: 'absolute', right: 8, bottom: 8, width: 360, maxHeight: 260, overflow: 'auto', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11, background: 'rgba(0,0,0,.55)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, padding: 8, whiteSpace: 'pre-wrap' }}>
          {debugLines.join('\n')}
        </div>
      )}
    </div>
  );
}
