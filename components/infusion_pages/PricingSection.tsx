import React from 'react';

// This component displays information about the pricing model.
const PricingSection = () => {
  return (
    <section className='bg-gray-50 py-12'>
      <div className='container mx-auto px-4 text-center'>
        <h2 className='text-3xl font-bold text-[#101828] mb-2'>
          <span className='text-blue-600'>Transparent,</span> Usage-Based
          Pricing
        </h2>
        <p className='text-md text-[#667085] max-w-2xl mx-auto'>
          Quotes reflect therapy mix, hours of operation, risk profile
          (first-dose vs maintenance), number of locations, and supervision
          level (virtual, hybrid, on-site). Multi-site and longer blocks unlock
          our best effective rates.
        </p>
      </div>
    </section>
  );
};

export default PricingSection;
