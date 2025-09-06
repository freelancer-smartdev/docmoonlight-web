// components/ZoomMeetingComponent.js
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import ZoomVideo from '@zoom/videosdk';

const API_BASE = '/api';

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

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

const localDisplayName = (role, locationName) =>
  role === 1 ? `Doctor – ${locationName || ''}` : `Clinic – ${locationName || ''}`;

export default function ZoomMeetingComponent({
  callId,
  locationName,
  role = 0,
  userId,
  token,
}) {
  const clientRef = useRef(null);
  const mediaRef = useRef(null);

  const selfVideoRef = useRef(null);
  const selfLabelRef = useRef(null);

  const remoteGridRef = useRef(null);
  const remoteTilesRef = useRef(new Map());

  const [joining, setJoining] = useState(true);
  const [error, setError] = useState('');
  const [audioOn, setAudioOn] = useState(false);
  const [videoOn, setVideoOn] = useState(false);

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
      setDebugLines((prev) => prev.concat(line).slice(-150));
    }
    if (data !== undefined) console.log('[VideoSDK]', msg, data);
    else console.log('[VideoSDK]', msg);
  };

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
      width: '320px',
      height: '200px',
      background: '#111',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,.35)',
    });

    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    Object.assign(video.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
      background: '#111',
    });

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

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    remoteGridRef.current?.appendChild(wrapper);

    tile = { wrapper, video, label };
    remoteTilesRef.current.set(uid, tile);
    return tile;
  };

  const attachRemote = async (uid) => {
    const client = clientRef.current;
    const media = mediaRef.current;
    if (!client || !media) return;

    const user = (client.getAllUser() || []).find((u) => u.userId === uid) || { userId: uid };
    const tile = ensureRemoteTile(user);

    try {
      if (media.attachVideo && tile.video) {
        await media.attachVideo(tile.video, uid);
        dbg('remote.attachVideo ok', { uid });
        return;
      }
    } catch (e) {
      dbg('remote.attachVideo fail -> will fallback to canvas', { uid, err: e?.reason || e?.message });
    }

    try {
      if (!tile.canvas) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 200;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        tile.video.replaceWith(canvas);
        delete tile.video;
        tile.canvas = canvas;
      }
      await media.renderVideo(tile.canvas, uid, 320, 200, 0, 0, 2);
      dbg('remote.renderVideo ok', { uid });
    } catch (e) {
      dbg('remote.renderVideo fail', { uid, err: e?.reason || e?.message || String(e) });
    }
  };

  const clearRemoteVideo = (uid) => {
    const media = mediaRef.current;
    const tile = remoteTilesRef.current.get(uid);
    if (!tile) return;

    try {
      if (tile.video && media?.detachVideo) {
        media.detachVideo(tile.video, uid);
      }
    } catch { }

    try {
      if (tile.canvas && media?.stopRender) {
        media.stopRender(uid);
      }
    } catch { }

    try {
      if (tile.canvas) {
        const ctx = tile.canvas.getContext('2d');
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, tile.canvas.width, tile.canvas.height);
      }
    } catch { }
  };

  const removeRemoteTile = (uid) => {
    clearRemoteVideo(uid);
    const tile = remoteTilesRef.current.get(uid);
    if (!tile) return;
    tile.wrapper.remove();
    remoteTilesRef.current.delete(uid);
  };

  useEffect(() => {
    if (!callId && !token) return;
    let mounted = true;

    (async () => {
      try {
        setError('');
        setJoining(true);

        let sessionToken = token;
        let sessionName;
        let displayName;

        if (sessionToken) {
          const p = decodeJwtPayload(sessionToken);
          sessionName = p?.tpc;
          displayName = p?.user_identity || localDisplayName(role, locationName);
          if (!sessionName) throw new Error('Token is missing session name (tpc).');
        } else {
          const payload = {
            role: Number(role ?? 0),
            user_id: userId ?? undefined,
            call_id: callId,
            userName: localDisplayName(role, locationName),
            location_name: locationName || undefined,
          };
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
            window.location.replace(url.toString());
            return;
          }

          if (!data?.token || !data?.sessionName) {
            throw new Error('Unexpected join payload from server.');
          }

          sessionToken = String(data.token);
          sessionName = String(data.sessionName);

          const p = decodeJwtPayload(sessionToken);
          displayName = p?.user_identity || payload.userName;
        }

        const client = ZoomVideo.createClient();
        clientRef.current = client;

        await client.init('en-US', 'Global', { patchJsMedia: true });
        await client.join(sessionName, sessionToken, displayName);

        const media = client.getMediaStream();
        mediaRef.current = media;

        if (selfLabelRef.current) {
          selfLabelRef.current.textContent = `You — ${displayName}`;
        }

        try {
          await media.startAudio();
          setAudioOn(true);
        } catch (e) {
          setAudioOn(false);
          dbg('startAudio fail', e?.reason || e?.message);
        }

        try {
          if (media.attachVideo) {
            await media.startVideo();
            const me = client.getCurrentUserInfo()?.userId;
            if (selfVideoRef.current && me != null) {
              await media.attachVideo(selfVideoRef.current, me);
              setVideoOn(true);
            }
          } else {
            await media.startVideo({ videoElement: selfVideoRef.current });
            setVideoOn(true);
          }
        } catch (e) {
          setVideoOn(false);
          dbg('startVideo fail (no webcam is OK)', e?.reason || e?.message);
        }

        const me = client.getCurrentUserInfo()?.userId;
        (client.getAllUser() || []).forEach((u) => {
          if (u.userId !== me) attachRemote(u.userId);
        });

        const onAdded = (list) => {
          asArray(list).forEach((u) => {
            if (u.userId !== client.getCurrentUserInfo()?.userId) attachRemote(u.userId);
          });
        };
        const onRemoved = (list) => {
          asArray(list).forEach((u) => removeRemoteTile(u.userId));
        };
        const onUpdated = (list) => {
          asArray(list).forEach((u) => {
            const tile = remoteTilesRef.current.get(u.userId);
            if (tile?.label && u.displayName) tile.label.textContent = u.displayName;
          });
        };
        const onPeerVideo = ({ action, userId }) => {
          dbg('peer-video-state-change', { action, userId });
          if (action === 'Start') attachRemote(userId);
          if (action === 'Stop' || action === 'Inactive') clearRemoteVideo(userId);
        };

        client.on('user-added', onAdded);
        client.on('user-removed', onRemoved);
        client.on('user-updated', onUpdated);
        client.on('peer-video-state-change', onPeerVideo);
        clientRef.current._handlers = { onAdded, onRemoved, onUpdated, onPeerVideo };

        if (!mounted) return;
        setJoining(false);
      } catch (e) {
        try {
          console.group('[VideoSDK][join] failed');
          console.error('raw error:', e);
          if (e?.response) {
            console.error('HTTP status:', e.response.status);
            console.error('HTTP data:', e.response.data);
          }
        } finally {
          console.groupEnd?.();
        }
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

    return () => {
      const client = clientRef.current;
      const media = mediaRef.current;

      try {
        const h = client?._handlers;
        if (h && client?.off) {
          client.off('user-added', h.onAdded);
          client.off('user-removed', h.onRemoved);
          client.off('user-updated', h.onUpdated);
          client.off('peer-video-state-change', h.onPeerVideo);
        }
      } catch { }

      try { remoteTilesRef.current.forEach((_, uid) => removeRemoteTile(uid)); } catch { }
      remoteTilesRef.current.clear?.();

      try {
        const me = client?.getCurrentUserInfo()?.userId;
        if (selfVideoRef.current && media?.detachVideo && me != null) {
          media.detachVideo(selfVideoRef.current, me);
        }
      } catch { }

      try { media?.stopVideo(); } catch { }
      try { media?.stopAudio(); } catch { }
      try { client?.leave(); } catch { }

      clientRef.current = null;
      mediaRef.current = null;
    };
  }, [callId, locationName, role, userId, token, debug]);

  const toggleAudio = async () => {
    const media = mediaRef.current;
    if (!media) return;
    try {
      if (audioOn) { await media.stopAudio(); setAudioOn(false); }
      else { await media.startAudio(); setAudioOn(true); }
    } catch (e) {
      dbg('toggleAudio error', e?.reason || e?.message);
    }
  };

  const toggleVideo = async () => {
    const client = clientRef.current;
    const media = mediaRef.current;
    if (!client || !media) return;

    try {
      if (videoOn) {
        await media.stopVideo();
        setVideoOn(false);
      } else {
        if (media.attachVideo) {
          await media.startVideo();
          const me = client.getCurrentUserInfo()?.userId;
          if (selfVideoRef.current && me != null) {
            await media.attachVideo(selfVideoRef.current, me);
          }
        } else {
          await media.startVideo({ videoElement: selfVideoRef.current });
        }
        setVideoOn(true);
      }
    } catch (e) {
      dbg('toggleVideo error', e?.reason || e?.message);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        background: '#000',
        color: '#fff',
      }}
    >
      <div
        style={{
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255,255,255,.06)',
          borderBottom: '1px solid rgba(255,255,255,.07)',
        }}
      >
        <strong style={{ letterSpacing: '.2px' }}>
          {locationName ? `Clinic – ${locationName}` : 'Clinic'}
        </strong>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={toggleAudio}
            style={{ padding: '6px 10px', borderRadius: 8, border: 0, background: '#2a2a2a', color: '#fff' }}
            title="Toggle mic"
          >
            {audioOn ? 'Mute' : 'Unmute'}
          </button>
          <button
            onClick={toggleVideo}
            style={{ padding: '6px 10px', borderRadius: 8, border: 0, background: '#2a2a2a', color: '#fff' }}
            title="Toggle camera"
          >
            {videoOn ? 'Stop Video' : 'Start Video'}
          </button>
          <button
            onClick={() => {
              try { mediaRef.current?.stopVideo(); } catch { }
              try { mediaRef.current?.stopAudio(); } catch { }
              try { clientRef.current?.leave(); } catch { }
            }}
            style={{ padding: '6px 12px', borderRadius: 8, background: '#d33', color: '#fff', border: 0 }}
          >
            Leave
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,360px) 1fr', gap: 14, padding: 14 }}>
        <div style={{ position: 'relative' }}>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>You</div>
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 220,
              background: '#111',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 2px 10px rgba(0,0,0,.35)',
            }}
          >
            <video
              ref={selfVideoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div
              ref={selfLabelRef}
              style={{
                position: 'absolute',
                left: 10,
                bottom: 8,
                padding: '3px 8px',
                fontSize: 12,
                background: 'rgba(0,0,0,.55)',
                borderRadius: 6,
                letterSpacing: '.2px',
              }}
            >
              You
            </div>
          </div>
        </div>

        <div>
          <div style={{ color: '#bbb', marginBottom: 6, fontSize: 14 }}>Participants</div>
          <div
            ref={remoteGridRef}
            style={{
              width: '100%',
              minHeight: 220,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          />
        </div>
      </div>

      {joining && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(0,0,0,.35)',
            fontSize: 16,
          }}
        >
          Connecting…
        </div>
      )}

      {!!error && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            background: 'rgba(220,0,0,.8)',
            padding: '8px 12px',
            borderRadius: 6,
            maxWidth: 520,
          }}
        >
          {String(error)}
        </div>
      )}

      {debug && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            width: 360,
            maxHeight: 240,
            overflow: 'auto',
            fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: 11,
            background: 'rgba(0,0,0,.55)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 6,
            padding: 8,
            whiteSpace: 'pre-wrap',
          }}
        >
          {debugLines.join('\n')}
        </div>
      )}
    </div>
  );
}
