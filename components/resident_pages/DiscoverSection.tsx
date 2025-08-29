/* eslint-disable @next/next/no-img-element */
const DiscoverSection = () => {
  return (
    <div className='demo-bg min-h-[950px]' id='Discover'>
      <div className='mx-auto max-w-3xl text-center'>
        <h2 className='text-2xl md:text-4xl font-bold sm:text-3xl ml-5 mr-5'>
          Discover the Ease of Moonlighting
        </h2>

        <p className='mt-4 lg:text-xl xl:text-2xl px-5 sm:px-2'>
          Watch our insightful video and learn how you can sign up with us under
          10 minutes! Experience the hassle-free way to moonlight and boost your
          income today!
        </p>
      </div>
      <div className='px-5 sm:px-0'>
        <div className='mt-10 mx-auto w-fit relative'>
          <img
            src='/images/laptop_frame.png'
            className='w-full max-w-[535px]'
            alt=''
          />

          <div className='absolute left-1/2 top-[4.5%] overflow-hidden -translate-x-1/2 w-[calc(78.5%)] bg-white aspect-video'>
            <iframe
              className='w-full h-full object-cover'
              src='https://www.youtube.com/embed/eqHMMHpwn2g'
              title='YouTube video player'
              frameBorder={0}
              allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
              allowFullScreen
            />
          </div>
        </div>
      </div>
      <div className='mx-auto max-w-6xl md:pt-5 pl-3 pr-3  w-full mt-8'>
        <h2 className='text-xl font-bold md:text-4xl text-center'>
          Join Our Growing Network and Stay Informed
        </h2>

        <p className='mt-4 opacity-50 lg:text-xl leading-7 w-full pl-5 pr-5'>
          We offer dynamic moonlighting opportunities in various states.
          Our unwavering commitment to expanding our network ensures that we continue to bring you closer
          to the most rewarding opportunities. If you&apos;re not currently in
          one of these states, don&apos;t worry! By joining our rapidly growing
          community, you&apos;ll be among the first to learn about new
          healthcare facility partnerships in your area. Register now to stay
          ahead of the curve and seize the perfect opportunities as they emerge
          near your residency or fellowship program. Stay connected with the
          latest news and updates by following us on Twitter, Facebook,
          LinkedIn, Instagram, and YouTube.
        </p>
      </div>
      <div className='mx-auto max-w-sm pt-11 flex justify-between pb-10 pl-6 pr-6'>
        <button style={{ marginRight: '15px' }}>
          <a
            target='_blank'
            href='https://play.google.com/store/apps/details?id=com.docmoonlight'
            rel='noreferrer'
          >
            <img
              style={{
                background: 'white',
                borderRadius: '10px',
                height: 55,
                width: 170,
              }}
              src='/images/google_play_btn.svg'
            />
          </a>
        </button>
        <button>
          <a
            target='_blank'
            href='https://apps.apple.com/us/app/docmoonlight/id6448665833'
            rel='noreferrer'
          >
            <img
              style={{
                background: 'white',
                borderRadius: '10px',
                height: 55,
                width: 170,
              }}
              src='/images/app_store_btn.svg'
            />
          </a>
        </button>
      </div>
    </div>
  );
};

export default DiscoverSection;
