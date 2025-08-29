import React from 'react';
import Image from 'next/image';
import Script from 'next/script';
import { Inter } from 'next/font/google';

// 1. Initialize the font using next/font
const inter = Inter({ subsets: ['latin'] });

const INoteAid: React.FC = () => {
  return (
    <>
      {/* 2. Load external scripts using the next/script component */}
      <Script
        src='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js'
        strategy='lazyOnload' // Loads the script after the page is interactive
      />

      {/* 3. Apply the font className to the main container */}
      <div
        id='INoteAid'
        className={`font-sans text-gray-800 bg-gray-100 ${inter.className}`}
      >
        <section id='inoteaid' className='py-16 bg-white'>
          <div className='container mx-auto px-4'>
            <div className='flex flex-col md:flex-row bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl overflow-hidden shadow-lg'>
              {/* Left Side (Text Content) */}
              <div className='md:w-1/2 p-8 md:p-12'>
                <div className='flex items-center mb-4'>
                  <h2 className='text-2xl md:text-3xl font-bold text-primary'>
                    DocMoonlight × iNoteAid
                  </h2>
                </div>
                <h3 className='text-xl md:text-2xl font-semibold mb-6'>
                  {/* 4. Escaped apostrophe with &apos; */}
                  Introducing iNoteAid &mdash; AI-Powered Documentation Built
                  for Moonlighters
                </h3>
                <p className='text-gray-700 mb-6'>
                  Take your moonlighting experience to the next level with
                  iNoteAid, our partner AI scribe tool tailored for physicians.
                  Whether you&apos;re seeing 5 or 25 patients a day, iNoteAid
                  helps you write faster, smarter notes with guideline-backed
                  recommendations.
                </p>

                <div className='mb-8'>
                  <h4 className='font-semibold mb-3'>Features:</h4>
                  <ul className='space-y-3'>
                    <li className='flex items-start'>
                      <span>Unlimited notes &amp; AI processing</span>
                    </li>
                    <li className='flex items-start'>
                      <span>Built-in guideline recommendations</span>
                    </li>
                    <li className='flex items-start'>
                      <span>Priority support for Docmoonlighters</span>
                    </li>
                    <li className='flex items-start'>
                      <span>
                        Special pricing for residents, fellows &amp;
                        Docmoonlight users
                      </span>
                    </li>
                  </ul>
                </div>

                <div className='mb-8 bg-blue-50 p-4 rounded-lg border border-blue-200'>
                  <h4 className='font-semibold mb-2'>Pricing &amp; Access:</h4>
                  <ul className='space-y-2'>
                    <li className='flex items-center'>
                      <span className='bg-green-100 text-green-800 font-medium px-3 py-1 rounded-full text-sm mr-2'>
                        FREE
                      </span>
                      <span>for actively working Docmoonlighters</span>
                    </li>
                    <li className='flex items-center'>
                      <span className='bg-blue-100 text-blue-800 font-medium px-3 py-1 rounded-full text-sm mr-2'>
                        $49/month
                      </span>
                      <span>
                        (67% off) for pending applicants listed in our database
                      </span>
                    </li>
                  </ul>
                </div>

                <a
                  href='https://inoteaid.com'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-block bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 px-6 rounded-lg transition duration-300 cursor-pointer'
                >
                  Explore iNoteAid →
                </a>
              </div>

              {/* Right Side (Visual) */}
              <div className='md:w-1/2 relative'>
                <div className='h-[56rem] bg-gradient-to-br from-blue-600 to-blue-800 p-8 md:p-12 text-white flex flex-col justify-between'>
                  <div>
                    <span className='inline-block bg-white/20 backdrop-blur-sm text-white text-sm font-medium px-4 py-1 rounded-full mb-4'>
                      Exclusive Partnership
                    </span>
                    <h3 className='text-2xl md:text-3xl font-bold mb-3'>
                      Save Time on Documentation
                    </h3>
                    <p className='text-lg text-blue-100 mb-8'>
                      Focus more on patients and less on paperwork with
                      AI-powered clinical notes
                    </p>
                  </div>

                  <div className='bg-white/10 backdrop-blur-sm rounded-lg p-6 mt-auto'>
                    <p className='italic text-blue-50 mb-3'>
                      {/* 4. Escaped quotes with &quot; */}
                      &quot;iNoteAid has cut my documentation time in half&quot;
                    </p>
                    <div className='flex items-center'>
                      {/* 5. Replaced <img> with next/image <Image> */}
                      <Image
                        src='https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg'
                        alt='Dr. Sarah Chen'
                        className='w-10 h-10 rounded-full mr-3'
                        width={40}
                        height={40}
                      />
                      <div>
                        <p className='font-medium'>Dr. Sarah Chen</p>
                        <p className='text-sm text-blue-200'>
                          Emergency Medicine
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Overlay image */}
                <div className='absolute inset-0 bg-cover bg-center opacity-10 mix-blend-overlay pointer-events-none'>
                  <Image
                    className='w-full h-full object-cover' // Note: h-full instead of h-[56rem] for responsiveness with fill
                    src='https://storage.googleapis.com/uxpilot-auth.appspot.com/ad9b39b879-a83226e69dcb5fc26568.png'
                    alt='doctor using tablet in hospital setting, professional medical environment, blue tones'
                    fill
                    sizes='50vw'
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default INoteAid;
