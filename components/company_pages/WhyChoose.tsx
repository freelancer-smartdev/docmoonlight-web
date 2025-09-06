import {
  FaChartLine,
  FaGlobeAmericas,
  FaUserShield,
  FaSlidersH,
} from 'react-icons/fa';

const WhyChoose = () => (
  <section className=' min-h-fit bg-cover py-12' id='WhyUs'>
    <div className='unsplash-container px-0 lg:px-12 m-auto'>
      <h2 className='text-2xl lg:text-3xl text-center mb-12 text-[#101828]'>
        Why Choose DocMoonlight
      </h2>
      <div className='flex flex-col md:flex-row gap-8 justify-center items-stretch'>
        {/* Card 1 */}
        <div className='bg-[#f8fafc] rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-xs  flex flex-col items-start'>
          <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-3 mb-4'>
            <FaChartLine />
          </div>
          <div className=' text-lg mb-2 text-[#101828]'>
            Extend Hours, Grow Revenue
          </div>
          <div className='text-[#667085] text-sm'>
            Offer evenings/weekends without hiring full-time staff; capture more
            referrals and reduce delays.
          </div>
        </div>
        {/* Card 2 */}
        <div className='bg-[#f8fafc] rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-xs  flex flex-col items-start'>
          <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-3 mb-4'>
            <FaGlobeAmericas />
          </div>
          <div className=' text-lg mb-2 text-[#101828]'>
            Reliable Coverage, Guaranteed
          </div>
          <div className='text-[#667085] text-sm'>
            No cancellations for lack of coverage. Network redundancy covers
            holidays.
          </div>
        </div>
        {/* Card 3 */}
        <div className='bg-[#f8fafc] rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-xs  flex flex-col items-start'>
          <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-3 mb-4'>
            <FaUserShield />
          </div>
          <div className=' text-lg mb-2 text-[#101828]'>
            Expert Safety &amp; Compliance
          </div>
          <div className='text-[#667085] text-sm'>
            Physicians trained on ACR contrast algorithms; HIPAA-secure A/V; CMS
            virtual direct supervision ready.
          </div>
        </div>
        {/* Card 4 */}
        <div className='bg-[#f8fafc] rounded-2xl shadow-md p-8 flex-1 min-w-[250px] max-w-xs  flex flex-col items-start'>
          <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-3 mb-4'>
            <FaSlidersH />
          </div>
          <div className=' text-lg mb-2 text-[#101828]'>
            Flexible &amp; Cost-Effective
          </div>
          <div className='text-[#667085] text-sm'>
            Virtual, On-Site, or Hybrid plans; hourly pricing that scales with
            volume.
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default WhyChoose;
