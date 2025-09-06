import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react'; // Optional if using Lucide icons

const faqs = [
  {
    question: 'Is virtual physician supervision permitted?',
    answer: `Medicare currently permits direct supervision via real-time audio/video through Dec 31, 2025 for services that require it in physician offices. Hospital outpatient therapeutic services operate under general supervision as the minimum. We implement virtual, hybrid, or on-site models consistent with these policies and your state rules/bylaws, and we update SOPs as regulations evolve.`,
  },
  {
    question: 'Which therapies are appropriate for virtual oversight?',
    answer: `Maintenance infusions (e.g., many biologics, iron, antibiotics, IV hydration) are commonly suited to virtual oversight with experienced RNs and emergency-ready protocols. Initial higher-risk doses or product changes may be scheduled with on-site physician/APP presence per policy.`,
  },
  {
    question: 'What staffing and equipment are required on-site?',
    answer: `Experienced infusion RNs, ACLS training, emergency kit (epinephrine, antihistamines, corticosteroids, bronchodilators, IV fluids, oxygen), monitoring equipment, and clear escalation pathways. We help validate readiness during onboarding.`,
  },
  {
    question: 'Who are the supervising physicians?',
    answer: `Fully licensed MD/DOs, credentialed for your state(s), current on emergency care requirements, with malpractice coverage. We complete license verification, NPDB, background, and (as applicable) drug screens before first shift.`,
  },
  {
    question: 'How quickly can we go live?',
    answer: `Many outpatient centers launch within 2–4 weeks depending on credentialing and state requirements. We schedule coverage blocks in advance and can scale hours as demand grows.`,
  },
];

const InfusionFAQ = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFAQ = (index: any) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section className='py-20 px-4' id='InfusionFAQ'>
      <div className='max-w-5xl mx-auto'>
        <h2 className='text-3xl font-bold text-[#101828] text-center mb-10'>
          Frequently Asked Questions
        </h2>

        <div className='space-y-6'>
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index} className='border-b pb-4'>
                <button
                  onClick={() => toggleFAQ(index)}
                  className='flex justify-between items-center w-full text-left group'
                >
                  <h3 className='text-[#101828] font-medium text-base md:text-lg'>
                    {faq.question}
                  </h3>
                  <span className='ml-4 text-[#667085] transition-transform duration-300'>
                    {isOpen ? (
                      <ChevronUp size={20} className='text-[#475569]' />
                    ) : (
                      <ChevronDown size={20} className='text-[#475569]' />
                    )}
                  </span>
                </button>
                {isOpen && (
                  <p className='text-sm text-[#667085] mt-3 leading-relaxed'>
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default InfusionFAQ;
