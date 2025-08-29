import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Head from 'next/head';
import { useRouter } from 'next/router';
import axios from 'axios';
import { BASE_URL, issues, urgency } from '../constants/constant';
import '@babel/polyfill';

const QR = () => {
  const router = useRouter();

  const [errortext, setErrortext] = useState('');
  const [issueType, setIssueType] = useState('');
  const [otherIssueType, setOtherIssueType] = useState('');
  const [urgencyType, setUrgencyType] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitAlertVisible, setIsSubmitAlertVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisabled, setIsDisabled] = useState(false);

  const [callId, setCallId] = useState(null);
  const [callingStatus, setCallingStatus] = useState(null);
  const pollTimer = useRef(null);

  useEffect(() => {
    if (router.isReady) setIsLoading(false);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [router.isReady]);

  const alert = (msg) => window.alert(msg);

  const Validator = () => {
    setErrortext('');
    if (!issueType) return alert('Please choose issue type'), false;
    if (issueType === 'Other' && !otherIssueType) return alert('Please fill the issue type'), false;
    if (!urgencyType) return alert('Please choose urgency type'), false;
    if (!name) return alert('Please fill your name'), false;
    if (!phone) return alert('Please fill your phone'), false;
    if (phone.length > 11 || phone.length < 10) return alert('Enter Valid Number'), false;
    return true;
  };

  const handleSubmitPress = async () => {
    if (!Validator()) return;
    const dataToSend = {
      location_name: router.query?.name,
      location_id: router.query.id,
      issue_type: issueType !== 'Other' ? issueType : otherIssueType,
      urgency_type: urgencyType,
      name,
      phone,
    };
    try {
      const response = await axios.post(BASE_URL + 'qr/send', dataToSend);
      if (response.status === 200) setIsSubmitAlertVisible(true);
      else setErrortext(response.data.error || 'An unknown error occurred');
    } catch (e) {
      setErrortext(e?.response?.data?.error || e.message || 'Submission failed');
    }
  };

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const startPolling = (newCallId) => {
    stopPolling();

    pollTimer.current = setInterval(async () => {
      try {
        const { data } = await axios.get(
          `${BASE_URL}qr/calls/${encodeURIComponent(newCallId)}/status`,
          { headers: { 'Cache-Control': 'no-store' } }
        );
        setCallingStatus(data.status);
        const isReady = data.status === 'accepted';

        if (isReady) {
          stopPolling();
          setIsDisabled(false);

          router.push({
            pathname: '/ZoomMeeting',
            query: {
              callId: newCallId,
              location_name: router.query?.name || 'Clinic',
            },
          });
        }

        if (data.status === 'no_doctor') {
          stopPolling();
          setIsDisabled(false);
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 1000);
  };

  const handleZoomCall = async () => {
    try {
      setIsDisabled(true);
      setCallingStatus(null);
      setCallId(null);

      if (!router.query?.id) {
        alert('Missing location ID');
        setIsDisabled(false);
        return;
      }

      const { data } = await axios.post(
        `${BASE_URL}qr/calls/start`,
        { location_id: router.query.id },
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
        }
      );

      if (!data || !data.call_id) {
        throw new Error('Unexpected server response (no call_id)');
      }

      setCallId(data.call_id);
      setCallingStatus(data.status || 'ringing');
      startPolling(data.call_id);
    } catch (error) {
      console.error('Start call failed:', error);
      setIsDisabled(false);
      let message = 'Failed to start video call. ';
      if (error.response) message += `Server error: ${error.response.status}`;
      else if (error.request) message += 'No response from server. Check your network.';
      else message += error.message;
      alert(message);
    }
  };

  const handleOkPress = () => setIsSubmitAlertVisible(false);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100vh', fontFamily: 'Arial, sans-serif', background: 'rgb(0, 82, 155)',
      }}
    >
      <Head>
        <title>QR Form Screen</title>
        <meta name="referrer" content="no-referrer" />
      </Head>

      <main
        style={{
          display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center',
          background: isSubmitAlertVisible ? 'transparent' : 'white',
          padding: '20px', borderRadius: '10px', overflowY: 'auto', maxHeight: '96vh',
          width: 'min(900px, 96vw)',
        }}
      >
        <div style={{ marginTop: '16px' }}>
          <Image src="/favicon.ico" alt="Logo" width={100} height={50} />
        </div>

        {isSubmitAlertVisible ? (
          <div
            style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              padding: '20px', backgroundColor: 'white', borderRadius: '5px',
              boxShadow: '0px 0px 10px rgba(0, 0, 0, 0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}
          >
            <p>Thanks for submitting, we will reach out if needed.</p>
            <button
              style={{ backgroundColor: '#7DE24E', color: '#FFFFFF', padding: '10px 20px', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '20px' }}
              onClick={handleOkPress}
            >
              Ok
            </button>
          </div>
        ) : (
          <div
            style={{
              border: '2px solid', padding: '20px', marginTop: '20px', maxWidth: '400px',
              justifyContent: 'center', alignItems: 'center', borderRadius: '10px'
            }}
          >
            <input
              type="text" disabled value={router.query.name}
              style={{ width: '100%', padding: '10px', margin: '10px 0', boxSizing: 'border-box', borderRadius: '10px' }}
            />

            <select
              value={issueType} onChange={(e) => setIssueType(e.target.value)}
              style={{ width: '100%', padding: '10px', margin: '10px 0', boxSizing: 'border-box', borderRadius: '10px' }}
            >
              <option value="" disabled>Report an issue</option>
              {issues.map((issue) => <option key={issue} value={issue}>{issue}</option>)}
            </select>

            {issueType === 'Other' && (
              <input
                type="text" value={otherIssueType} onChange={(e) => setOtherIssueType(e.target.value)}
                placeholder="Please specify the issue"
                style={{ width: '100%', padding: '10px', margin: '10px 0', boxSizing: 'border-box', borderRadius: '10px' }}
              />
            )}

            <select
              value={urgencyType} onChange={(e) => setUrgencyType(e.target.value)}
              style={{ width: '100%', padding: '10px', margin: '10px 0', boxSizing: 'border-box', borderRadius: '10px' }}
            >
              <option value="" disabled>Urgency</option>
              {urgency.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>

            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name"
              style={{ width: '100%', padding: '10px', margin: '10px 0', boxSizing: 'border-box', borderRadius: '10px' }}
            />

            <input
              type="tel" inputMode="numeric" maxLength={11}
              value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="Contact cell phone so we can reach you"
              style={{ width: '100%', padding: '10px', margin: '10px 0', boxSizing: 'border-box', borderRadius: '10px' }}
            />

            {errortext !== '' && (
              <p style={{ color: 'red', textAlign: 'center' }}>{errortext}</p>
            )}

            <button
              onClick={handleSubmitPress}
              style={{ backgroundColor: '#7DE24E', color: '#FFFFFF', padding: '10px 20px', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'block', margin: '0 auto', width: '60%' }}
            >
              Submit
            </button>

            <div style={{ position: 'relative', marginTop: '20px', width: '100%', height: '2px', backgroundColor: '#000' }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, width: '100%', height: '1px' }} />
            </div>

            <p style={{ marginBottom: '16px' }}>
              For immediate virtual assistance, connect instantly via video call with a doctor, especially if you&apos;re part of our remote monitoring program. Audio calls are also available if an on-site resident or fellow is late.
            </p>

            <button
              onClick={handleZoomCall}
              disabled={isDisabled}
              style={{ backgroundColor: '#7DE24E', color: '#FFFFFF', padding: '10px 20px', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'block', marginTop: '20px', margin: '0 auto', width: '80%' }}
            >
              {isDisabled ? 'Calling…' : 'The On-call'}
            </button>

            {callId && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <div><b>Call ID:</b> {callId}</div>
                <div><b>Status:</b> {callingStatus || 'starting…'}</div>
                {callingStatus === 'no_doctor' && (
                  <div style={{ marginTop: 8, color: '#b00020' }}>
                    No doctor accepted. Please call the phone line or submit an urgent message.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default QR;
