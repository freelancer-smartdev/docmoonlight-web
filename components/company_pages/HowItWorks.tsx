import React from 'react';

// The steps array is updated with direct CSS gradient strings for clarity
const steps = [
  {
    number: '1',
    title: 'Quick Setup',
    desc: 'Start in 24 hours—plus free, unlimited team dashboard access for live coverage viewing, on-file documents.',
    gradient: 'linear-gradient(135deg, #0ea5e9, #0a4c8b)',
  },
  {
    number: '2',
    title: 'Easy Scheduling',
    desc: 'We project your needs and lock coverage a month ahead. Add or cancel anytime during the month.',
    gradient: 'linear-gradient(135deg, #0ea5e9, #fbbf24)',
  },
  {
    number: '3',
    title: 'Supervision',
    desc: 'Licensed MD/DO physician available throughout each contrast exam with ≤60s connect.',
    gradient: 'linear-gradient(135deg, #fbbf24, #0a4c8b)',
  },
  {
    number: '4',
    title: 'Response',
    desc: 'Instant physician direction using ACR algorithms if reactions occur. On-site staff execute protocols.',
    gradient: 'linear-gradient(135deg, #fbbf24, #0a4c8b)',
  },
  {
    number: '5',
    title: 'Documentation',
    desc: 'Every contrast reaction is logged in real time with a detailed incident report ≤24h to comply with ACR.',
    gradient: 'linear-gradient(135deg, #0ea5e9, #0a4c8b)',
  },
];

const HowItWorks = () => (
  <section className='bg-white py-16' id='HowItWorks'>
    <div className='unsplash-container px-0 lg:px-12 m-auto'>
      <h2 className='text-3xl lg:text-4xl text-center mb-4 text-[#0f7db0]'>
        How It Works
      </h2>
      <p className='text-center text-lg text-[#7b93b6] mb-12 max-w-3xl mx-auto'>
        Get started in minutes with our streamlined process designed for imaging
        centers
      </p>
      <div className='flex flex-col md:flex-row gap-6 justify-center items-stretch'>
        {steps.map((step, idx) => (
          <div
            key={step.number}
            className='bg-white rounded-2xl shadow-md p-8 flex-1 min-w-[220px] max-w-xs mx-auto flex flex-col items-center'
          >
            <div
              className={`w-14 h-14 rounded-xl mb-6 flex items-center justify-center text-white text-2xl font-bold shadow-lg`}
              // The style is simplified to apply the gradient string directly
              style={{ background: step.gradient }}
            >
              {step.number}
            </div>
            <div className='font-semibold text-lg mb-2 text-[#101828] text-center'>
              {step.title}
            </div>
            <div className='text-[#7b93b6] text-base text-center'>
              {step.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default HowItWorks;
