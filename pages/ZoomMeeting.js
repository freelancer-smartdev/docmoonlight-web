// pages/ZoomMeeting.jsx
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Head from 'next/head';

const ZoomMeetingComponent = dynamic(
  () => import('../components/ZoomMeetingComponent'),
  { ssr: false }
);

export default function ZoomMeeting() {
  
  const { query } = useRouter();

  const callId =
    typeof query.callId === 'string' ? query.callId : Array.isArray(query.callId) ? query.callId[0] : undefined;

  const token =
    typeof query.token === 'string' ? query.token : Array.isArray(query.token) ? query.token[0] : undefined;

  const role = Number(
    typeof query.role === 'string' ? query.role : Array.isArray(query.role) ? query.role[0] : '0'
  ) || 0;

  const userId = (() => {
    const raw = typeof query.user_id === 'string' ? query.user_id : Array.isArray(query.user_id) ? query.user_id[0] : '';
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  const locationName =
    typeof query.location_name === 'string'
      ? query.location_name
      : Array.isArray(query.location_name)
        ? query.location_name[0]
        : undefined;

  return (
    <div style={{ height: '100vh', width: '100vw', background: '#000' }}>
      <Head><title>Video Session</title></Head>
      <ZoomMeetingComponent
        token={token}
        callId={callId}
        locationName={locationName}
        role={role}
        userId={userId}
      />
    </div>
  );
}
