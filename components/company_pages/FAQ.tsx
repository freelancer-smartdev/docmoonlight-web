import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react'; // Optional if using Lucide icons

const faqs = [
  {
    question:
      'Is virtual direct supervision permitted, and are you prepared for the CMS proposal?',
    answer: `CMS recognizes real-time audio/video as meeting ‘direct supervision’ and has proposed making virtual direct supervision a permanent option for diagnostic tests (e.g., CT/MRI with contrast). DocMoonlight’s HIPAA-compliant platform supports virtual supervision with immediate physician availability via live A/V. We verify applicable state requirements and facility bylaws during onboarding and will update SOPs and configurations upon final CMS adoption. While virtual supervision is likely the industry’s direction, DocMoonlight also provides in-person coverage and can transition practices to hybrid or fully virtual models as appropriate.`,
  },
  {
    question: 'Who are the supervising doctors?',
    answer: `DocMoonlight assigns fully licensed MD/DO physicians who are ACLS-current and trained on ACR Contrast Reaction algorithms. Prior to the first shift, DocMoonlight completes license verification, NPDB query, criminal background check, drug screening (as applicable), and malpractice coverage confirmation. Documentation is available upon request.`,
  },
  {
    question: 'What technology is used, and is it HIPAA compliant?',
    answer: `DocMoonlight employs an encrypted, HIPAA-compliant video platform under a BAA. Administrators receive a dashboard with: live session status and time-to-connect, scheduling (ad-hoc and recurring), real-time supervision logs, incident reports, and a documents vault (SOPs, credentials, attestations). Unlimited team members may be granted access without per-seat fees.`,
  },
  {
    question: 'What is the typical implementation timeline?',
    answer: `Virtual supervision typically begins within days following execution of the BAA and service agreement, completion of a site technology check, and SOP alignment. On-site or hybrid coverage timelines depend on local credentialing. DocMoonlight forecasts one month in advance and allows mid-month additions or cancellations of coverage blocks.`,
  },
  {
    question: 'Do you provide in-person and hybrid coverage?',
    answer: `Yes. DocMoonlight provides virtual, on-site, or hybrid coverage (virtual supervision with a guaranteed on-site practitioner or rapid physician dispatch) to meet state requirements, bylaws, or operational preferences. `,
  },
  {
    question: 'How is liability addressed?',
    answer: `DocMoonlight physicians carry medical malpractice insurance. Certificates can be furnished, and where permitted, the facility may be added as a certificate holder. Operational responsibilities and documentation obligations are clearly detailed in the agreement.`,
  },
];

const FAQSection = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const toggleFAQ = (index: any) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section className='bg-gray-50 py-20 px-4' id='FAQ'>
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

export default FAQSection;
