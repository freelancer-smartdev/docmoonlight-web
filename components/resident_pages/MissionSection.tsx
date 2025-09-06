/* eslint-disable @next/next/no-img-element */
const MissionSection = () => {
  return (
    <section className='unsplash min-h-fit bg-cover' id='Home'>
      <div className='unsplash-container flex flex-col lg:justify-between lg:flex-row px-0 lg:px-12 m-auto'>
        <div className='w-full lg:w-1/2'>
          <div>
            <div>
              <h2 className='text-2xl lg:text-5xl font-bold'>Our Mission</h2>
              <h4 className='text-xl lg:text-4xl font-medium pt-6'>
                Unlock Limitless Moonlighting Opportunities for
                Doctors-in-Training
              </h4>
            </div>
            <div className='pt-2 text-xs lg:text-lg '>
              Our mission is to empower doctors-in-training with flexible,
              high-paying moonlighting opportunities that supplement their
              income during residency or fellowship, while maintaining a healthy
              work-life balance.
            </div>

            <div
              style={{ justifyContent: 'start', alignItems: 'start' }}
              className='flex items-center w-full lg:max-w-lg justify-between pt-6 lg:pt-8'
            >
              <div style={{ flex: 1 }}>
                <p className='text-xs lg:text-base'>Why Choose Us?</p>
                <ul style={{ fontSize: 12 }} className='mission'>
                  <li>Competitive Pay Rates</li>
                  <li>Flexible Work Schedules</li>
                  <li>Streamlined Hiring Process</li>
                </ul>
              </div>
              <div style={{ marginLeft: 8, flex: 1 }}>
                <p className='text-xs lg:text-base'>What Do You Need?</p>
                <ul style={{ fontSize: 12 }} className='mission'>
                  <li>Unrestricted license</li>
                  <li>Download the App</li>
                  <li>Schedule availability</li>
                </ul>
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
                src='https://www.youtube.com/embed/H4IVgacqWOY'
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

export default MissionSection;
