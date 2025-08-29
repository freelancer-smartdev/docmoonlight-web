import React from 'react';
import {
  FaHandshake,
  FaDollarSign,
  FaUsers,
  FaClock,
  FaBolt,
  FaCheckCircle,
  FaRegClock,
} from 'react-icons/fa';

const WhyDocMoonlight = () => (
  <section
    className='bg-gradient-to-br from-[#f8fbff] to-[#fff9ef] py-12'
    id='WhyDocMoonlight'
  >
    <div className='unsplash-container px-4 lg:px-12 m-auto'>
      <h2 className='text-2xl lg:text-4xl font-bold text-center mb-2 text-[#101828]'>
        Why Imaging Centers Choose DocMoonlight
      </h2>
      <p className='text-center text-[#667085] mb-12 text-base'>
        No commitment, transparent pricing, everything included
      </p>
      {/* Feature cards */}
      <div className='flex flex-col md:flex-row flex-wrap gap-6 justify-center items-stretch'>
        {/* No Commitment */}
        <div className='bg-white rounded-2xl shadow-md p-6 flex-1 min-w-[260px] max-w-xs text-center'>
          <div className='bg-[#dcfce7] text-[#22c55e] w-fit mx-auto rounded-full p-3 mb-4'>
            <FaHandshake size={24} />
          </div>
          <div className='font-semibold text-lg text-[#101828] mb-1'>
            No Commitment
          </div>
          <div className='text-[#667085] text-sm'>
            Cancel anytime, pay as you go
          </div>
        </div>
        {/* No Hidden Fees */}
        <div className='bg-white rounded-2xl shadow-md p-6 flex-1 min-w-[260px] max-w-xs text-center'>
          <div className='bg-[#eff6ff] text-[#3b82f6] w-fit mx-auto rounded-full p-3 mb-4'>
            <FaDollarSign size={24} />
          </div>
          <div className='font-semibold text-lg text-[#101828] mb-1'>
            No Hidden Fees
          </div>
          <div className='text-[#667085] text-sm'>
            Setup, malpractice, all included
          </div>
        </div>
        {/* Talent Pipeline */}
        <div className='bg-white rounded-2xl shadow-md p-6 flex-1 min-w-[260px] max-w-xs text-center'>
          <div className='bg-[#f3e8ff] text-[#a855f7] w-fit mx-auto rounded-full p-3 mb-4'>
            <FaUsers size={24} />
          </div>
          <div className='font-semibold text-lg text-[#101828] mb-1'>
            Talent Pipeline
          </div>
          <div className='text-[#667085] text-sm'>Connect with residents</div>
        </div>
        {/* 24hr Response */}
        <div className='bg-white rounded-2xl shadow-md p-6 flex-1 min-w-[260px] max-w-xs text-center'>
          <div className='bg-[#fef3c7] text-[#f59e0b] w-fit mx-auto rounded-full p-3 mb-4'>
            <FaClock size={24} />
          </div>
          <div className='font-semibold text-lg text-[#101828] mb-1'>
            24hr Response
          </div>
          <div className='text-[#667085] text-sm'>Response within 24 hours</div>
        </div>
      </div>
      {/* Bottom Stats */}
      <div className='flex flex-wrap justify-center gap-4 mt-10 text-sm font-medium'>
        <div className='bg-white rounded-full shadow px-6 py-2 flex items-center gap-2 text-[#06aed4]'>
          <FaBolt size={18} />
          ≤60s median connect
        </div>
        <div className='bg-white rounded-full shadow px-6 py-2 flex items-center gap-2 text-[#16a34a]'>
          <FaCheckCircle size={18} />
          ≥99.9% uptime
        </div>
        <div className='bg-white rounded-full shadow px-6 py-2 flex items-center gap-2 text-[#f97316]'>
          <FaRegClock size={18} />
          24/7/365 coverage
        </div>
      </div>
    </div>
  </section>
);

export default WhyDocMoonlight;
