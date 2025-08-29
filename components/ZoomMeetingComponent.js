// components/VideoSessionComponent.jsx
import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import ZoomVideo from '@zoom/videosdk'

// Use the Next.js rewrite so this works on localhost and via ngrok HTTPS
const API_BASE = '/api'

// tiny JWT payload decoder (base64url -> JSON)
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1]
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

// If server falls back to Meeting SDK, redirect to Zoom web client
function redirectToMeetingSdk(data, displayName) {
  const url = new URL(`https://app.zoom.us/wc/join/${data.meetingNumber}`)
  if (data.password) url.searchParams.set('pwd', data.password)
  url.searchParams.set('prefer', '1')
  url.searchParams.set('un', btoa(unescape(encodeURIComponent(displayName || 'Guest'))))
  window.location.replace(url.toString())
}

export default function VideoSessionComponent({
  callId,
  locationName,
  role = 0,
  userId,
  token, // optional: if mobile passed a token in the URL
}) {
  const selfVideoRef = useRef(null)
  const clientRef = useRef(null)
  const streamRef = useRef(null)
  const remotesRef = useRef(new Map()) // userId -> canvas

  const [joining, setJoining] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!callId && !token) return
    let mounted = true

      ; (async () => {
        try {
          setError('')
          setJoining(true)

          // ---- 1) Get sessionName + token ----
          let sessionName
          let sessionToken = token

          if (sessionToken) {
            const payload = decodeJwtPayload(sessionToken)
            sessionName = payload?.tpc
            if (!sessionName) throw new Error('Token is missing session name (tpc).')
          } else {
            const payload = {
              role: Number(role ?? 0),
              user_id: userId ?? undefined,
              call_id: callId,
              userName: role === 1 ? `Doctor – ${locationName || ''}` : `Clinic – ${locationName || ''}`,
              location_name: locationName || undefined,
            }

            const { data } = await axios.post(
              `${API_BASE}/qr/calls/${encodeURIComponent(String(callId))}/join`,
              payload,
              { headers: { 'Content-Type': 'application/json' } },
            )

            // Meeting SDK fallback
            if (data?.meetingNumber) {
              redirectToMeetingSdk(data, payload.userName)
              return
            }

            if (!data?.token || !data?.sessionName) {
              throw new Error('Unexpected join payload from server.')
            }

            sessionToken = String(data.token)
            sessionName = String(data.sessionName)
          }

          const displayName = role === 1 ? `Doctor – ${locationName || ''}` : `Clinic – ${locationName || ''}`

          // ---- 2) Init and join (correct order!) ----
          const client = ZoomVideo.createClient()
          clientRef.current = client

          await client.init('en-US', 'Global', { patchJsMedia: true })
          // IMPORTANT: sessionName, token, userName
          await client.join(sessionName, sessionToken, displayName)

          const media = client.getMediaStream()
          streamRef.current = media

          try {
            await media.startAudio()
          } catch { }

          try {
            // for web, pass videoElement for self preview
            await media.startVideo({ videoElement: selfVideoRef.current })
          } catch { }

          // ---- 3) Remote rendering helpers ----
          const ensureRemoteCanvas = (uid) => {
            if (remotesRef.current.has(uid)) return remotesRef.current.get(uid)
            const cvs = document.createElement('canvas')
            cvs.style.width = '100%'
            cvs.style.height = '180px'
            cvs.style.background = '#000'
            cvs.style.borderRadius = '8px'
            document.getElementById('remote-grid')?.appendChild(cvs)
            remotesRef.current.set(uid, cvs)
            return cvs
          }

          const renderRemote = async (uid) => {
            try {
              const cvs = ensureRemoteCanvas(uid)
              await media.renderVideo(cvs, uid, 320, 180, 0, 0, 2)
            } catch { }
          }

          const unrenderRemote = (uid) => {
            try {
              const cvs = remotesRef.current.get(uid)
              if (cvs) media.stopRender(uid)
            } catch { }
            const cvs = remotesRef.current.get(uid)
            if (cvs) {
              cvs.remove()
              remotesRef.current.delete(uid)
            }
          }

          // Initial users
          const me = client.getCurrentUserInfo()?.userId
          client.getAllUser()?.forEach((u) => {
            if (u.userId !== me) renderRemote(u.userId)
          })

          // Events
          client.on('user-added', (list) => {
            list?.forEach((u) => {
              if (u.userId !== client.getCurrentUserInfo()?.userId) renderRemote(u.userId)
            })
          })

          client.on('user-removed', (list) => {
            list?.forEach((u) => unrenderRemote(u.userId))
          })

          client.on('peer-video-state-change', ({ action, userId }) => {
            if (action === 'Start') renderRemote(userId)
            else unrenderRemote(userId)
          })

          if (!mounted) return
          setJoining(false)
        } catch (e) {
          // dump useful details
          try {
            console.group('[VideoSDK][join] failed')
            console.error('raw error:', e)
            if (e?.response) {
              console.error('HTTP status:', e.response.status)
              console.error('HTTP data:', e.response.data)
            }
          } finally {
            console.groupEnd?.()
          }

          if (!mounted) return
          setError(
            e?.response?.data?.error ||
            e?.response?.data?.message ||
            e?.reason ||
            e?.message ||
            'Failed to join session',
          )
          setJoining(false)
        }
      })()

    // ---- Cleanup ----
    return () => {
      mounted = false
      const client = clientRef.current
      const media = streamRef.current
      clientRef.current = null
      streamRef.current = null

      try {
        remotesRef.current.forEach((_, uid) => {
          try {
            media?.stopRender(uid)
          } catch { }
        })
        remotesRef.current.clear()
      } catch { }

      try {
        media?.stopVideo()
      } catch { }
      try {
        media?.stopAudio()
      } catch { }

      try {
        client?.leave()
      } catch { }
    }
  }, [callId, locationName, role, userId, token])

  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr', background: '#000', color: '#fff' }}>
      {/* Toolbar */}
      <div style={{ padding: 10, display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,.05)' }}>
        <div style={{ fontWeight: 600 }}>{locationName ? `Clinic – ${locationName}` : 'Clinic'}</div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => {
              try { streamRef.current?.stopVideo() } catch { }
              try { streamRef.current?.stopAudio() } catch { }
              try { clientRef.current?.leave() } catch { }
            }}
            style={{ padding: '6px 12px', borderRadius: 6, background: '#c33', color: '#fff', border: 0 }}
          >
            Leave
          </button>
        </div>
      </div>

      {/* Stage */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px,360px) 1fr', gap: 12, padding: 12 }}>
        <div>
          <div style={{ color: '#bbb', marginBottom: 6 }}>You</div>
          <video ref={selfVideoRef} autoPlay muted playsInline style={{ width: '100%', height: 200, background: '#111', borderRadius: 8 }} />
        </div>

        <div>
          <div style={{ color: '#bbb', marginBottom: 6 }}>Participants</div>
          <div id="remote-grid" style={{ width: '100%', minHeight: 200, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }} />
        </div>
      </div>

      {joining && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.35)', fontSize: 16 }}>
          Connecting to session…
        </div>
      )}
      {!!error && (
        <div style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(220,0,0,.8)', padding: '8px 12px', borderRadius: 6, maxWidth: 520 }}>
          {String(error)}
        </div>
      )}
    </div>
  )
}
