import React from 'react';

const HowInfusionWorks = () => {
  return (
    <section className='bg-[#f9fafb] py-12' id='InfusionHowItWorks'>
      <div className='container mx-auto px-4'>
        <div className='text-center mb-12'>
          <h2 className='text-3xl font-bold text-[#101828]'>How It Works</h2>
          <p className='text-[#667085] mt-2'>
            Streamlined rollout that respects your workflows.
          </p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6'>
          {/* Step 1: Set-up */}
          <div className='bg-white rounded-2xl shadow-md p-6 flex flex-col items-center text-center'>
            <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-2 mb-4'>
              <span className='font-semibold'>1</span>
            </div>
            <div className='text-lg font-semibold mb-2 text-[#101828]'>
              Set-up
            </div>
            <div className='text-sm text-[#667085]'>
              Align SOPs, confirm state rules/bylaws, configure secure A/V and
              contingency lines.
            </div>
          </div>

          {/* Step 2: Scheduling */}
          <div className='bg-white rounded-2xl shadow-md p-6 flex flex-col items-center text-center'>
            <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-2 mb-4'>
              <span className='font-semibold'>2</span>
            </div>
            <div className='text-lg font-semibold mb-2 text-[#101828]'>
              Scheduling
            </div>
            <div className='text-sm text-[#667085]'>
              Block coverage in advance; flex ad-hoc hours as clinic volume
              shifts.
            </div>
          </div>

          {/* Step 3: Oversight */}
          <div className='bg-white rounded-2xl shadow-md p-6 flex flex-col items-center text-center'>
            <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-2 mb-4'>
              <span className='font-semibold'>3</span>
            </div>
            <div className='text-lg font-semibold mb-2 text-[#101828]'>
              Oversight
            </div>
            <div className='text-sm text-[#667085]'>
              Licensed MD/DO immediately available during operating hours
              (virtual or on-site per plan).
            </div>
          </div>

          {/* Step 4: Response */}
          <div className='bg-white rounded-2xl shadow-md p-6 flex flex-col items-center text-center'>
            <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-2 mb-4'>
              <span className='font-semibold'>4</span>
            </div>
            <div className='text-lg font-semibold mb-2 text-[#101828]'>
              Response
            </div>
            <div className='text-sm text-[#667085]'>
              Nurses initiate standing orders; physician directs care and
              escalation pathways.
            </div>
          </div>

          {/* Step 5: Documentation */}
          <div className='bg-white rounded-2xl shadow-md p-6 flex flex-col items-center text-center'>
            <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-2 mb-4'>
              <span className='font-semibold'>5</span>
            </div>
            <div className='text-lg font-semibold mb-2 text-[#101828]'>
              Documentation
            </div>
            <div className='text-sm text-[#667085]'>
              Real-time log; incident report &le; 24h; monthly QA and
              credentialing packet updates.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowInfusionWorks;
