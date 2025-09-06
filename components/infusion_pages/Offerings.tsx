import React from 'react';

// This component displays information about the services offered in a card layout.
const Offerings = () => (
  // The section uses flexbox for a responsive layout and padding for spacing.
  <section className='container mx-auto px-4 py-12'>
    <div className='flex flex-col md:flex-row gap-6 md:gap-8 justify-center items-stretch'>
      {/* Card for "Outpatient infusion centers" */}
      <div className='bg-white rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-sm flex flex-col items-start'>
        <div className='text-xl lg:text-2xl mb-2 font-semibold text-[#101828]'>
          Outpatient infusion centers
        </div>
        <div className='text-sm text-[#667085]'>
          Biologics, IVIG, iron, antibiotics, and supportive
          therapies—continuous RN monitoring with physician availability.
        </div>
      </div>

      {/* Card for "Health systems & multi-site groups" */}
      <div className='bg-white rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-sm flex flex-col items-start'>
        <div className='text-xl lg:text-2xl mb-2 font-semibold text-[#101828]'>
          Health systems & multi-site groups
        </div>
        <div className='text-sm text-[#667085]'>
          Standardize coverage after hours or across satellites while meeting
          documentation and audit needs.
        </div>
      </div>

      {/* Card for "Hybrid models" */}
      <div className='bg-white rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-sm flex flex-col items-start'>
        <div className='text-xl lg:text-2xl mb-2 font-semibold text-[#101828]'>
          Hybrid models
        </div>
        <div className='text-sm text-[#667085]'>
          First-dose or therapy changes on-site; maintenance visits with virtual
          oversight when appropriate.
        </div>
      </div>
    </div>
  </section>
);

export default Offerings;
