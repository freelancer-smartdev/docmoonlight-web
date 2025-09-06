import React from 'react';
import { FaCheckCircle, FaExclamationCircle, FaFileAlt } from 'react-icons/fa';

// This component displays information about regulatory and safety compliance.
const RegulatoryAlignmentSection = () => {
  return (
    <section className='bg-gray-50 py-12'>
      <div className='container mx-auto px-4'>
        <div className='flex flex-col md:flex-row gap-8 justify-center'>
          {/* Left Column: Regulatory & Safety Alignment details */}
          <div className='flex-1 max-w-2xl'>
            <h2 className='text-3xl font-bold text-[#101828] mb-4'>
              Regulatory & Safety Alignment
            </h2>
            <p className='text-[#667085] mb-6'>
              We follow federal policy and specialty safety expectations and
              align with state rules and your bylaws.
            </p>
            <ul className='space-y-4 text-[#667085]'>
              <li className='flex items-start'>
                <span className='mr-2 text-blue-500'>&bull;</span>
                <div>
                  <span className='font-semibold text-blue-700'>
                    Medicare (CMS):
                  </span>{' '}
                  For services requiring direct supervision in physician
                  offices, CMS currently permits supervising practitioners to be
                  immediately available via real-time audio/video through Dec
                  31, 2025. We configure workflows accordingly and update as CMS
                  finalizes future changes.
                </div>
              </li>
              <li className='flex items-start'>
                <span className='mr-2 text-blue-500'>&bull;</span>
                <div>
                  <span className='font-semibold text-blue-700'>
                    Hospital outpatient infusions:
                  </span>{' '}
                  CMS policy establishes general supervision as the minimum for
                  hospital outpatient therapeutic services; sites may choose a
                  higher level based on risk and policy.
                </div>
              </li>
              <li className='flex items-start'>
                <span className='mr-2 text-blue-500'>&bull;</span>
                <div>
                  <span className='font-semibold text-blue-700'>
                    Safety practices:
                  </span>{' '}
                  Initial higher-risk therapies (e.g., first IVIG dose or
                  product change) are planned with on-site physician/APP
                  presence; maintenance infusions may use virtual oversight per
                  policy.
                </div>
              </li>
              <li className='flex items-start'>
                <span className='mr-2 text-blue-500'>&bull;</span>
                <div>
                  <span className='font-semibold text-blue-700'>
                    State & credentialing:
                  </span>{' '}
                  We verify state supervision rules and telehealth requirements,
                  and complete license, NPDB, background, drug screen (as
                  applicable), and malpractice documentation.
                </div>
              </li>
            </ul>
          </div>

          {/* Right Column: HIPAA and other compliance details in a card */}
          <div className='flex-1 max-w-md bg-white rounded-2xl shadow-md p-8 flex flex-col items-start'>
            <div className='flex items-start mb-4'>
              <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-2 mr-4 flex-shrink-0'>
                <FaCheckCircle />
              </div>
              <div>
                <div className='font-semibold text-lg text-[#101828]'>
                  HIPAA-secure virtual presence
                </div>
                <div className='text-sm text-[#667085]'>
                  BAA, encrypted sessions, audit trails, administrative
                  controls.
                </div>
              </div>
            </div>
            <div className='flex items-start mb-4'>
              <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-2 mr-4 flex-shrink-0'>
                <FaExclamationCircle />
              </div>
              <div>
                <div className='font-semibold text-lg text-[#101828]'>
                  Emergency-ready SOPs
                </div>
                <div className='text-sm text-[#667085]'>
                  Epinephrine, oxygen, IV fluids on-site; ACLS-trained staff;
                  drills and post-event review.
                </div>
              </div>
            </div>
            <div className='flex items-start mb-4'>
              <div className='bg-[#e6f6fb] text-[#3bb0d6] rounded-full p-2 mr-4 flex-shrink-0'>
                <FaFileAlt />
              </div>
              <div>
                <div className='font-semibold text-lg text-[#101828]'>
                  Documentation & QA
                </div>
                <div className='text-sm text-[#667085]'>
                  Real-time supervision log; incident reports &le;24h; monthly
                  QA dashboards.
                </div>
              </div>
            </div>
            <p className='text-xs italic text-[#667085] mt-4'>
              Note: Sites may set higher supervision standards based on therapy
              risk and policy.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RegulatoryAlignmentSection;
