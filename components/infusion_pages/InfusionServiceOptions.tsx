import React from 'react';
import { FaVideo, FaUserCheck, FaSlidersH } from 'react-icons/fa';

// This component displays information about the different service options available.
const InfusionServiceOptions = () => {
  return (
    <section className='container mx-auto px-4 py-12' id='InfusionServices'>
      <div className='text-center mb-12'>
        <h2 className='text-3xl font-bold text-[#101828]'>Service Options</h2>
        <p className='text-[#667085] mt-2'>
          Pick the model that fits each therapy line and location.
        </p>
      </div>

      <div className='flex flex-col md:flex-row gap-8 justify-center items-stretch'>
        {/* Card for "Virtual Oversight" */}
        <div className='bg-white rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-sm flex flex-col items-center text-center'>
          <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-4 mb-4'>
            <FaVideo size={24} />
          </div>
          <div className='text-xl font-semibold mb-2 text-[#101828]'>
            Virtual Oversight
          </div>
          <div className='text-sm text-[#667085]'>
            Real-time audio/video supervision with immediate availability. Ideal
            for maintenance infusions and lower-risk regimens per policy.
          </div>
        </div>

        {/* Card for "On-Site Coverage" */}
        <div className='bg-white rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-sm flex flex-col items-center text-center border-2 border-[#3bb0d6]'>
          <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-4 mb-4'>
            <FaUserCheck size={24} />
          </div>
          <div className='text-xl font-semibold mb-2 text-[#101828]'>
            On-Site Coverage
          </div>
          <div className='text-sm text-[#667085]'>
            Physician/APP on premises for first-dose or higher-risk protocols;
            seamless escalation and collaboration.
          </div>
        </div>

        {/* Card for "Hybrid" */}
        <div className='bg-white rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-sm flex flex-col items-center text-center'>
          <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-4 mb-4'>
            <FaSlidersH size={24} />
          </div>
          <div className='text-xl font-semibold mb-2 text-[#101828]'>
            Hybrid
          </div>
          <div className='text-sm text-[#667085]'>
            On-site for initiation/changes; transition to virtual for
            maintenance with clear criteria and review checkpoints.
          </div>
        </div>
      </div>
    </section>
  );
};

export default InfusionServiceOptions;
