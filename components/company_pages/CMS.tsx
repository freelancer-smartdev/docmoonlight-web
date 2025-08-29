import React from 'react';
import { FaVideo, FaUser, FaClipboardCheck } from 'react-icons/fa';

const CMS = () => (
  <div className='bg-gray-50 flex flex-col items-center justify-center py-12'>
    <div className='bg-white rounded-xl shadow-lg p-8 max-w-7xl w-full flex flex-col md:flex-row gap-8'>
      <div className='flex-1'>
        <div className='text-xs font-semibold text-blue-600 mb-2'>
          POLICY UPDATE
        </div>
        <h2 className='text-2xl md:text-3xl mb-3'>
          CMS 2026: Virtual Direct Supervision (Proposed)
        </h2>
        <p className='text-gray-700 mb-6'>
          CMS proposes allowing &apos;direct supervision&apos; via real-time A/V
          for CT/MRI with contrast. State rules &amp; ACR still apply.
          DocMoonlight keeps you compliant—virtual, on-site, or hybrid.
        </p>
        <hr className='my-6' />
        <p className='text-gray-400 text-sm'>
          We align SOPs to CMS/ACR and confirm state rules at onboarding.
        </p>
      </div>
      <div className='flex flex-col gap-6 justify-center min-w-[220px]'>
        <div className='flex items-center gap-3'>
          <span className='bg-cyan-100 text-cyan-600 rounded-full p-3'>
            <FaVideo />
          </span>
          <div>
            <div className='font-semibold'>Virtual-ready</div>
            <div className='text-xs text-gray-500'>
              HIPAA A/V, ≤60s connect, licensed MD/DOs.
            </div>
          </div>
        </div>
        <div className='flex items-center gap-3'>
          <span className='bg-cyan-100 text-cyan-600 rounded-full p-3'>
            <FaUser />
          </span>
          <div>
            <div className='font-semibold'>On-site assurance</div>
            <div className='text-xs text-gray-500'>
              MD/DO presence; hybrid &amp; rapid dispatch.
            </div>
          </div>
        </div>
        <div className='flex items-center gap-3'>
          <span className='bg-cyan-100 text-cyan-600 rounded-full p-3'>
            <FaClipboardCheck />
          </span>
          <div>
            <div className='font-semibold'>Audit-ready</div>
            <div className='text-xs text-gray-500'>
              Time-stamped logs, notes ≤24h, QA dashboard.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default CMS;
