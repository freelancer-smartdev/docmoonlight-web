import {
  FaVideo,
  FaBolt,
  FaUser,
  FaMapMarkerAlt,
  FaLaptop,
  FaBalanceScale,
  FaInfoCircle,
} from 'react-icons/fa';

const ServiceOptions = () => (
  <section className='bg-[#f9fafb] min-h-fit bg-cover py-12' id='Services'>
    <div className='unsplash-container px-0 lg:px-12 m-auto'>
      <h2 className='text-2xl lg:text-4xl font-bold text-center mb-12 text-[#101828]'>
        Service Options
      </h2>
      <div className='flex flex-col md:flex-row gap-8 justify-center items-stretch'>
        {/* Card 1: Virtual Supervision */}
        <div className='bg-[#fff] rounded-2xl shadow-md p-8 flex-1 min-w-[300px] max-w-sm flex flex-col items-start'>
          <div className='bg-[#c6f0fa] text-[#06aed4] rounded-xl p-4 mb-6'>
            {/* Video Camera Icon */}
            <FaVideo className='text-2xl' />
          </div>
          <div className='font-semibold text-xl mb-2 text-[#101828]'>
            Virtual Supervision
          </div>
          <div className='text-[#667085] text-base mb-6'>
            Real-time A/V presence; ≤60s median connect; audit-ready
            documentation ≤24h.
          </div>
          <hr className='w-full my-4 border-[#f0f2f5]' />
          <div className='flex items-center gap-2 text-[#06aed4] font-semibold text-sm mt-2'>
            <FaBolt />
            Instant connection
          </div>
        </div>
        {/* Card 2: On-Site Supervision */}
        <div className='bg-[#fff] rounded-2xl shadow-md p-8 flex-1 min-w-[300px] max-w-sm flex flex-col items-start relative'>
          <div className='bg-[#e6eaf3] text-[#6b7280] rounded-xl p-4 mb-6'>
            {/* Doctor Icon */}
            <FaUser className='text-2xl' />
          </div>
          <div className='absolute top-6 right-6'>
            <span className='bg-[#0a2540] text-white text-xs font-bold px-3 py-1 rounded-full'>
              POPULAR
            </span>
          </div>
          <div className='font-semibold text-xl mb-2 text-[#101828]'>
            On-Site Supervision
          </div>
          <div className='text-[#667085] text-base mb-6'>
            Local MD/DO or qualified practitioner on premises per state/bylaws;
            rapid escalation.
          </div>
          <hr className='w-full my-4 border-[#f0f2f5]' />
          <div className='flex items-center gap-2 text-[#3b82f6] font-semibold text-sm mt-2'>
            <FaMapMarkerAlt />
            Physical presence
          </div>
        </div>
        {/* Card 3: Hybrid Coverage */}
        <div className='bg-[#fff] rounded-2xl shadow-md p-8 flex-1 min-w-[300px] max-w-sm flex flex-col items-start'>
          <div className='bg-[#fff7e0] text-[#fbbf24] rounded-xl p-4 mb-6'>
            {/* Laptop/Hybrid Icon */}
            <FaLaptop className='text-2xl' />
          </div>
          <div className='font-semibold text-xl mb-2 text-[#101828]'>
            Hybrid Coverage
          </div>
          <div className='text-[#667085] text-base mb-6'>
            Virtual by default plus guaranteed on-site practitioner or rapid MD
            dispatch SLA.
          </div>
          <hr className='w-full my-4 border-[#f0f2f5]' />
          <div className='flex items-center gap-2 text-[#fbbf24] font-semibold text-sm mt-2'>
            <FaBalanceScale />
            Best of both
          </div>
        </div>
      </div>
      {/* Bottom note */}
      <div className='flex justify-center mt-8'>
        <div className='bg-white rounded-full shadow px-6 py-2 flex items-center gap-2 text-[#06aed4] text-sm font-medium'>
          <FaInfoCircle />
          State-specific rules/hospital bylaws confirmed during onboarding
        </div>
      </div>
    </div>
  </section>
);

export default ServiceOptions;
