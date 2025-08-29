/* eslint-disable @next/next/no-img-element */
const Oversight = () => {
  return (
    <section className='unsplash min-h-fit bg-cover' id='Oversight'>
      <div className='unsplash-container flex flex-col lg:justify-between lg:flex-row px-0 lg:px-12 m-auto'>
        <div className='w-full lg:w-1/2'>
          <div>
            <h2 className='text-2xl lg:text-5xl'>
              Virtual & On-Site Contrast Supervision, On-Demand
            </h2>

            <div className='pt-2 text-xs lg:text-lg mt-4'>
              Keep your CT & MRI schedule full and your patients safe. Licensed
              physicians provide real-time HIPAA-compliant virtual supervision
              or on-site coverage—day, night, and weekends.
            </div>

            <div
              style={{ justifyContent: 'start', alignItems: 'start' }}
              className='flex items-center w-full lg:max-w-lg justify-between pt-6 lg:pt-8'
            >
              <div style={{ display: 'flex', gap: 12 }}>
                <span className='px-4 py-2 rounded-full bg-blue-800 text-white text-sm font-semibold flex items-center'>
                  <span className='mr-2'>🔒</span> HIPAA Secure
                </span>
                <span className='px-4 py-2 rounded-full bg-blue-100 text-blue-900 text-sm font-semibold flex items-center'>
                  <span className='mr-2'>🌟</span> ACR-Aligned
                </span>
                <span className='px-4 py-2 rounded-full bg-blue-100 text-blue-900 text-sm font-semibold flex items-center'>
                  <span className='mr-2'>⚡</span> Fast Connect
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className='px-5 sm:px-0'>
          <div className='mt-10 mx-auto w-fit relative'>
            <img
              src='/images/laptop_frame.png'
              className='w-full max-w-[535px]'
              alt=''
            />

            <div className='absolute left-1/2 top-[4.5%] overflow-hidden -translate-x-1/2 w-[calc(79%)] bg-white aspect-video'>
              <iframe
                className='w-full h-full object-cover'
                src='https://www.youtube.com/embed/C1lxHDlCoI8'
                title='YouTube video player'
                frameBorder={0}
                allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Oversight;
