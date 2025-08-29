// pages/ZoomMeeting.jsx
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Head from 'next/head';

const ZoomMeetingComponent = dynamic(() => import('../components/ZoomMeetingComponent'), { ssr: false });

export default function ZoomMeeting() {
  const router = useRouter();
  const { callId, location_name, role, user_id, token } = router.query;

  return (
    <div style={{ height: '100vh', width: '100vw', background: '#000' }}>
      <Head><title>Video Session</title></Head>
      <ZoomMeetingComponent
        token={typeof token === 'string' ? token : undefined}
        callId={callId}
        locationName={location_name}
        role={Number(role ?? 0)}
        userId={user_id ? Number(user_id) : undefined}
      />
    </div>
  );
}
