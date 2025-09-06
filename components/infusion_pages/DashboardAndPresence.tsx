import React from 'react';

// This component displays information about the administrative dashboard and secure virtual presence.
const DashboardAndPresence = () => {
  return (
    <section className='py-12'>
      <div className='container mx-auto px-4'>
        <div className='flex flex-col md:flex-row gap-6 justify-center'>
          {/* Administrative Dashboard Card */}
          <div className='bg-white rounded-2xl shadow-md p-8 flex-1 max-w-lg'>
            <h3 className='text-2xl font-bold text-[#101828] mb-4'>
              Administrative Dashboard
            </h3>
            <ul className='list-disc list-inside space-y-2 text-[#667085]'>
              <li>Live session status & time-to-connect</li>
              <li>Ad-hoc and recurring scheduling</li>
              <li>Supervision log & incident reports</li>
              <li>Documents vault (SOPs, credentials, attestations)</li>
              <li>Unlimited team accounts—no per-seat fees</li>
            </ul>
          </div>

          {/* Secure Virtual Presence Card */}
          <div className='bg-white rounded-2xl shadow-md p-8 flex-1 max-w-lg border-2 border-[#e6f6fb]'>
            <h3 className='text-2xl font-bold text-[#101828] mb-4'>
              Secure Virtual Presence
            </h3>
            <p className='text-sm text-[#667085] mb-4'>
              Encrypted audio/video under a BAA. Redundant connectivity and
              phone back-up lines. Role-based access controls and audit trails.
            </p>
            <div className='flex flex-wrap gap-2'>
              <span className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full px-4 py-1 text-sm'>
                PHI safeguards
              </span>
              <span className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full px-4 py-1 text-sm'>
                Access controls
              </span>
              <span className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full px-4 py-1 text-sm'>
                Audit logging
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardAndPresence;
