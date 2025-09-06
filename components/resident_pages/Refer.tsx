/* eslint-disable @next/next/no-img-element */
const ReferPage = () => {
  return (
    <div className='demo-bg pb-16' id='ReferPage'>
      {/* Header Section */}
      <div className='mx-auto max-w-3xl text-center mt-8'>
        <h2 className='text-2xl md:text-4xl font-bold sm:text-3xl ml-5 mr-5'>
          Refer & Earn with Docmoonlight!
        </h2>
        <p className='mt-4 lg:text-xl xl:text-2xl px-5 sm:px-2'>
          Earn $100 for Every Successful Referral! Help your colleagues
          moonlight with ease while earning rewards.
        </p>
      </div>

      {/* Content Section */}
      <div className='px-5 sm:px-0 flex flex-col items-center'>
        <div className='mt-10 grid grid-cols-1 md:grid-cols-2 gap-8  '>
          {/* How It Works Card */}
          <div className='bg-white rounded-xl shadow-lg p-6 max-w-[600px]'>
            <h2 className='text-lg md:text-2xl font-bold text-[#00509E] mb-4'>
              How It Works
            </h2>
            <ol className='list-decimal list-inside text-base leading-7 text-gray-700'>
              <li>
                <strong className='font-bold text-black'>
                  Spread the Word:
                </strong>{' '}
                Share Docmoonlight with your colleagues.
              </li>
              <li>
                <strong className='font-bold text-black'>Get Mentioned:</strong>{' '}
                Ensure they list your name during sign-up.
              </li>
              <li>
                <strong className='font-bold text-black'>Earn Rewards:</strong>{' '}
                Receive $100 once they’re onboarded.
              </li>
            </ol>
          </div>

          {/* Eligible Locations Card */}
          <div className='bg-white rounded-xl shadow-lg p-6 max-w-[600px]'>
            <h2 className='text-lg md:text-2xl font-bold text-[#00509E] mb-4'>
              Eligible Locations
            </h2>
            <p className='text-base leading-7 text-gray-700'>
              <strong className='font-bold text-black'>Connecticut:</strong>{' '}
              Bloomfield, Enfield, Glastonbury, Wethersfield, and West Hartford.
            </p>
            <p className='text-base leading-7 mt-2 text-gray-700'>
              <strong className='font-bold text-black'>New Jersey:</strong>{' '}
              Oradell, Hackensack, and Hoboken.
            </p>
          </div>
        </div>
      </div>

      {/* Important Note */}
      <div className='mt-10 mx-auto max-w-3xl bg-[#00509E] text-[#ffffff] rounded-lg p-6 shadow-md'>
        <p className='font-medium'>
          <strong className='font-bold text-black text-[#ffffff]'>
            Important:
          </strong>{' '}
          To qualify for the bonus, please download the Docmoonlight app, sign
          up, and activate your Stripe account to receive payments.
        </p>
      </div>
    </div>
  );
};

export default ReferPage;
