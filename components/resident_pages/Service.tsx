const Service = () => {
  return (
    <section className='service' id='WhatWeOffer'>
      <div className='mx-auto w-11/12 px-0 py-16 md:w-11.5/12 md:px-28'>
        <div className='mx-auto w-full '>
          <h2 className='text-2xl md:text-3xl font-bold sm:text-4xl text-color:black text-center'>
            What We Offer
          </h2>

          <p className='w-full mt-4 lg:text-xl xl:text-2xl text-color:black opacity-50 '>
            At DOCMOONLIGHT, we strive to provide doctors-in-training with
            unmatched advantages and support throughout their moonlighting
            journey. Our platform is designed to cater to your unique needs,
            ensuring a seamless experience while you focus on what truly
            matters.
          </p>
        </div>

        <div className='mt-8 grid grid-cols-2 gap-4 lg:gap-8 md:grid-cols-2 lg:grid-cols-3'>
          <div className='block bg-white rounded-lg border px-4 py-5 w-auto transition hover:border-pink-500/10 hover:shadow-blue-500/10'>
            <img
              src='/images/distance.svg'
              className='mx-auto w-20 lg:w-28 aspect-square lg:pt-8'
            />
            <p className='justify-center text-base lg:text-lg flex text-black text-center pt-5 lg:pb-5'>
              Proximity to residency and fellowship
            </p>
          </div>

          <div className='block bg-white rounded-lg border px-4 py-5 w-auto  transition hover:border-pink-500/10 hover:shadow-blue-500/10'>
            <img
              src='/images/calendar.svg'
              className='mx-auto w-20 lg:w-28 aspect-square lg:pt-8'
            />
            <p className='text-base lg:text-lg flex text-black text-center justify-center pt-5 lg:pb-5'>
              Maximum scheduling flexibility
            </p>
          </div>
          <div className='block bg-white rounded-lg border px-4 py-5 w-auto  transition hover:border-pink-500/10 hover:shadow-blue-500/10'>
            <img
              src='/images/work.svg'
              className='mx-auto w-20 lg:w-28 aspect-square lg:pt-8'
            />
            <p className='text-base lg:text-lg flex text-black text-center justify-center pt-5 lg:pb-5'>
              Evening and weekend shift
            </p>
          </div>
          <div className='block bg-white rounded-lg border px-4 py-5 w-auto  transition hover:border-pink-500/10 hover:shadow-blue-500/10'>
            <img
              src='/images/friendly.svg'
              className='mx-auto w-20 lg:w-28 aspect-square lg:pt-8'
            />
            <p className='text-base lg:text-lg flex text-black text-center justify-center pt-5 lg:pb-5'>
              User-friendly mobile app
            </p>
          </div>
          <div className='block bg-white rounded-lg border px-4 py-5 w-auto  transition hover:border-pink-500/10 hover:shadow-blue-500/10'>
            <img
              src='/images/Vector (1).svg'
              className='mx-auto w-20 lg:w-28 aspect-square lg:pt-8'
            />
            <p className='text-base lg:text-lg flex text-black text-center justify-center py-5 lg:pb-5'>
              No commitment
            </p>
          </div>
          <div className='block bg-white rounded-lg border px-4 py-5 w-auto  transition hover:border-pink-500/10 hover:shadow-blue-500/10'>
            <img
              src='/images/fees.svg'
              className='mx-auto w-20 lg:w-28 aspect-square lg:pt-8'
            />
            <p className='text-base lg:text-lg flex text-black text-center justify-center py-5 lg:pb-5'>
              No hidden fees
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
export default Service;
