import React from 'react';
import { FaCalendarAlt, FaRegClock, FaHeartbeat } from 'react-icons/fa';

const WhyPatientsLove = () => (
  <section className='bg-[#f9fbff] py-16 px-4' id='WhyPatientsLove'>
    <div className='max-w-6xl mx-auto text-center'>
      <h2 className='text-2xl lg:text-4xl font-bold text-[#101828] mb-12'>
        Why Patients & Staff Love DocMoonlight
      </h2>

      {/* Cards */}
      <div className='flex flex-col md:flex-row gap-6 justify-center'>
        {/* Card 1 */}
        <div className='bg-white rounded-xl shadow-sm p-6 text-left w-full md:max-w-sm'>
          <div className='bg-[#e0f2fe] text-[#06aed4] w-fit p-3 rounded-full mb-4'>
            <FaCalendarAlt size={24} />
          </div>
          <h3 className='text-lg font-semibold text-[#101828] mb-1'>
            Evening & Weekend Access
          </h3>
          <p className='text-sm text-[#667085]'>
            Patients can book after work or on Saturdays—less time off, happier
            schedules.
          </p>
        </div>

        {/* Card 2 */}
        <div className='bg-white rounded-xl shadow-sm p-6 text-left w-full md:max-w-sm'>
          <div className='bg-[#e0f2fe] text-[#06aed4] w-fit p-3 rounded-full mb-4'>
            <FaRegClock size={24} />
          </div>
          <h3 className='text-lg font-semibold text-[#101828] mb-1'>
            Faster Throughput
          </h3>
          <p className='text-sm text-[#667085]'>
            Smoother daypart coverage reduces reschedules and keeps scanners
            productive.
          </p>
        </div>

        {/* Card 3 */}
        <div className='bg-white rounded-xl shadow-sm p-6 text-left w-full md:max-w-sm'>
          <div className='bg-[#e0f2fe] text-[#06aed4] w-fit p-3 rounded-full mb-4'>
            <FaHeartbeat size={24} />
          </div>
          <h3 className='text-lg font-semibold text-[#101828] mb-1'>
            Confidence at the Scanner
          </h3>
          <p className='text-sm text-[#667085]'>
            Real-time physician support and clear protocols lower staff stress
            during contrast exams.
          </p>
        </div>
      </div>

      {/* Footer Note */}
      <p className='text-[#98a2b3] text-sm mt-10'>
        Based on partner feedback from outpatient imaging centers using
        after-hours coverage.
      </p>
    </div>
  </section>
);

export default WhyPatientsLove;
