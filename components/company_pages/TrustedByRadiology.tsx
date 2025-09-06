import { FaHandsHelping } from 'react-icons/fa';

const TrustedByRadiology = () => (
  <section className='bg-white py-20 px-4' id='Partners'>
    <div className='max-w-7xl mx-auto text-center'>
      {/* Icon */}
      <div className='flex justify-center mb-4'>
        <div className='bg-[#f0f9ff] p-3 rounded-xl'>
          <FaHandsHelping className='text-[#0e7490] w-8 h-8' />
        </div>
      </div>

      {/* Heading */}
      <h2 className='text-2xl lg:text-4xl font-bold text-[#0e7490] mb-4'>
        Trusted by Leading Radiology Groups
      </h2>

      {/* Subtext */}
      <p className='text-[#667085] max-w-2xl mx-auto mb-12 text-base'>
        From enterprise networks to independent practices, we provide virtual,
        on-site, and hybrid contrast supervision that keeps schedules full and
        patients safe.
      </p>

      {/* Company Cards */}
      <div className='flex flex-wrap justify-center gap-6'>
        {[
          { name: 'Radiology Partners', logo: '/images/RP.svg' }, // { name: 'Jefferson Radiology', logo: '/images/jefferson.svg' }, // { name: 'Premier Radiology', logo: '/images/premier.svg' }, // { name: 'South Jersey Radiology', logo: '/images/southjersey.svg' }, // { name: 'Hackensack Radiology', logo: '/images/hackensack.svg' },
        ].map((partner, idx) => (
          <div
            key={idx}
            className='bg-white border border-[#f1f5f9] text-[#475569] text-sm font-medium rounded-2xl py-6 px-4 shadow-sm transition-all duration-300 hover:shadow-lg hover:text-[#0e7490] hover:border-[#bae6fd] cursor-pointer text-center flex items-center justify-center'
          >
            {partner.logo ? (
              <img
                src={partner.logo}
                alt={partner.name}
                className='h-8 max-w-full'
              />
            ) : (
              <span>{partner.name}</span>
            )}
          </div>
        ))}
      </div>
    </div>
    <div className='max-w-6xl mx-auto flex flex-col items-center gap-6 mt-8'>
      {/* Gradient Feature Strip */}
      <div className='flex flex-col md:flex-row justify-between items-center w-full text-center rounded-3xl shadow-sm overflow-hidden bg-gradient-to-r from-[#f0f9ff] via-[#ecfdf5] to-[#fdf2e9] py-6 px-4 md:px-12'>
        {/* Column 1 */}
        <div className='flex-1 px-4 mb-4 md:mb-0'>
          <h3 className='text-lg font-bold text-[#0e7490]'>
            Hybrid-ready coverage
          </h3>
          <p className='text-sm text-[#64748b] mt-1'>Virtual + On-site</p>
        </div>

        {/* Column 2 */}
        <div className='flex-1 px-4 mb-4 md:mb-0'>
          <h3 className='text-lg font-bold text-[#16a34a]'>
            Safety & compliance
          </h3>
          <p className='text-sm text-[#64748b] mt-1'>ACR • HIPAA • CMS</p>
        </div>

        {/* Column 3 */}
        <div className='flex-1 px-4'>
          <h3 className='text-lg font-bold text-[#ca8a04]'>
            Reliability & Reporting
          </h3>
          <p className='text-sm text-[#64748b] mt-1'>SLAs & dashboards</p>
        </div>
      </div>

      {/* Trademark Note */}
      <div className='bg-[#f8fafc] border border-[#e2e8f0] rounded-full px-6 py-2 text-[#64748b] text-xs shadow-sm'>
        ⓘ Logos shown with permission. All trademarks are the property of their
        respective owners.
      </div>
    </div>
  </section>
);

export default TrustedByRadiology;
