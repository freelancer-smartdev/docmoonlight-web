import React from 'react';
import { FaVideo, FaLaptop, FaUser } from 'react-icons/fa';

const PricingPlans = () => (
  <section className='bg-white py-20 px-4' id='Pricing'>
    <div className='max-w-7xl mx-auto text-center'>
      <h2 className='text-3xl lg:text-4xl font-bold text-[#101828] mb-3'>
        Plans & Pricing
      </h2>
      <p className='text-[#667085] mb-12 text-base max-w-2xl mx-auto'>
        Transparent, usage-based pricing. Final quote depends on hours, sites,
        state rules, and on-site needs.
      </p>

      <div className='flex flex-col md:flex-row gap-6 justify-center items-start'>
        {/* Plan 1 - Occasional */}
        <div className='bg-white rounded-2xl shadow-md p-6 w-full md:max-w-sm text-left'>
          <h3 className='text-lg font-semibold text-[#101828] mb-1'>
            Occasional Coverage
          </h3>
          <p className='text-sm text-[#667085] mb-6'>
            Pay-as-you-go. Ideal for &lt;10 days/month. No retainer.
          </p>
          <ul className='space-y-4 mb-6'>
            <li className='flex justify-between items-center text-sm text-[#101828]'>
              <span className='flex gap-2 items-center'>
                <span className='bg-[#e0f2fe] text-[#06aed4] p-1 rounded'>
                  <FaVideo />
                </span>
                Virtual
              </span>
              <span>~$50–$85/hr</span>
            </li>
            <li className='flex justify-between items-center text-sm text-[#101828]'>
              <span className='flex gap-2 items-center'>
                <span className='bg-[#fff7e0] text-[#fbbf24] p-1 rounded'>
                  <FaLaptop />
                </span>
                Hybrid
              </span>
              <span>~$70–$120/hr</span>
            </li>
            <li className='flex justify-between items-center text-sm text-[#101828]'>
              <span className='flex gap-2 items-center'>
                <span className='bg-[#e0e7ff] text-[#3b82f6] p-1 rounded'>
                  <FaUser />
                </span>
                On-Site
              </span>
              <span>~$95–$170/hr</span>
            </li>
          </ul>
          <a
            href='#ContactPartner'
            className='bg-[#1d4ed8] text-white w-full py-2 rounded-lg font-semibold text-sm text-center inline-block'
          >
            Request a Quote
          </a>
        </div>

        {/* Plan 2 - Standard (Popular) */}
        <div className='bg-white rounded-2xl shadow-lg p-6 w-full md:max-w-sm text-left border-2 border-[#1d4ed8] relative'>
          <span className='absolute -top-4 left-1/2 transform -translate-x-1/2 bg-[#1d4ed8] text-white text-xs font-bold px-4 py-1 rounded-full'>
            POPULAR
          </span>
          <h3 className='text-lg font-semibold text-[#101828] mb-1'>
            Standard Coverage
          </h3>
          <p className='text-sm text-[#667085] mb-6'>
            10–20 days/month. Priority scheduling + monthly QA report.
          </p>
          <ul className='space-y-4 mb-6'>
            <li className='flex justify-between items-center text-sm text-[#101828]'>
              <span className='flex gap-2 items-center'>
                <span className='bg-[#e0f2fe] text-[#06aed4] p-1 rounded'>
                  <FaVideo />
                </span>
                Virtual
              </span>
              <span>~$35–$60/hr</span>
            </li>
            <li className='flex justify-between items-center text-sm text-[#101828]'>
              <span className='flex gap-2 items-center'>
                <span className='bg-[#fff7e0] text-[#fbbf24] p-1 rounded'>
                  <FaLaptop />
                </span>
                Hybrid
              </span>
              <span>~$60–$100/hr</span>
            </li>
            <li className='flex justify-between items-center text-sm text-[#101828]'>
              <span className='flex gap-2 items-center'>
                <span className='bg-[#e0e7ff] text-[#3b82f6] p-1 rounded'>
                  <FaUser />
                </span>
                On-Site
              </span>
              <span>~$85–$160/hr</span>
            </li>
          </ul>
          <a
            href='#ContactPartner'
            className='bg-[#1d4ed8] text-white w-full py-2 rounded-lg font-semibold text-sm text-center inline-block'
          >
            Request a Quote
          </a>
        </div>

        {/* Plan 3 - Full Coverage */}
        <div className='bg-white rounded-2xl shadow-md p-6 w-full md:max-w-sm text-left'>
          <h3 className='text-lg font-semibold text-[#101828] mb-1'>
            Full Coverage (Multi-Site / Enterprise)
          </h3>
          <p className='text-sm text-[#667085] mb-6'>
            20+ days/month or multi-site. Best effective hourly rate.
          </p>
          <ul className='space-y-4 mb-6'>
            <li className='flex justify-between items-center text-sm text-[#101828]'>
              <span className='flex gap-2 items-center'>
                <span className='bg-[#e0f2fe] text-[#06aed4] p-1 rounded'>
                  <FaVideo />
                </span>
                Virtual (high-volume)
              </span>
              <span>~$20–$35/hr</span>
            </li>
            <li className='flex justify-between items-center text-sm text-[#101828]'>
              <span className='flex gap-2 items-center'>
                <span className='bg-[#fff7e0] text-[#fbbf24] p-1 rounded'>
                  <FaLaptop />
                </span>
                Hybrid
              </span>
              <span>~$50–$90/hr</span>
            </li>
            <li className='flex justify-between items-center text-sm text-[#101828]'>
              <span className='flex gap-2 items-center'>
                <span className='bg-[#e0e7ff] text-[#3b82f6] p-1 rounded'>
                  <FaUser />
                </span>
                On-Site
              </span>
              <span>~$75–$150/hr</span>
            </li>
          </ul>
          <a
            href='#ContactPartner'
            className='bg-[#1d4ed8] text-white w-full py-2 rounded-lg font-semibold text-sm text-center inline-block'
          >
            Request a Quote
          </a>
        </div>
      </div>

      {/* Bottom Note */}
      <div className='text-[#667085] text-sm mt-8 max-w-3xl mx-auto'>
        More locations, longer blocks, and extended hours unlock our best rates.
        We tailor quotes to practice size, modality mix, and hours of operation.
        <br />
        <span className='text-xs mt-2 block'>
          Figures are illustrative bands for scoping. Final pricing provided
          after schedule and compliance review.
        </span>
      </div>
    </div>
  </section>
);

export default PricingPlans;
