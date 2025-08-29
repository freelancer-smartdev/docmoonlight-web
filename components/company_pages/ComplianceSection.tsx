const ComplianceSection = () => (
  <section className='bg-[#f9fafb] py-16 px-4' id='ComplianceSection'>
    <div className='max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-8'>
      {/* Left Text Section */}
      <div className='max-w-xl'>
        <h2 className='text-2xl lg:text-4xl font-bold text-[#101828] mb-4'>
          Qualified, Compliant, Secure.
        </h2>
        <p className='text-[#667085] text-base mb-6'>
          We prioritize safety, compliance, and data security at every step.
        </p>
        <a
          href='#'
          className='text-[#0f62fe] font-medium text-sm hover:underline inline-flex items-center gap-1'
        >
          Learn more about our standards
          <svg width='16' height='16' fill='none' viewBox='0 0 24 24'>
            <path
              fill='currentColor'
              d='M13.172 12l-4.95-4.95 1.414-1.414L16 12l-6.364 6.364-1.414-1.414z'
            />
          </svg>
        </a>
      </div>

      {/* Right Bullet List */}
      <div className='flex-1'>
        <ul className='space-y-4 text-[#101828] text-sm'>
          <li className='flex items-start gap-2'>
            <span className='text-[#0f62fe] mt-0.5'>
              <svg width='18' height='18' fill='none' viewBox='0 0 24 24'>
                <circle cx='12' cy='12' r='10' fill='#e0f2fe' />
                <path
                  fill='#0f62fe'
                  d='M10 14.59l-2.29-2.3a1 1 0 011.41-1.41L10 11.76l4.88-4.88a1 1 0 011.41 1.41L10 14.59z'
                />
              </svg>
            </span>
            <span>
              Licensed MD/DO supervisors; trained on ACR contrast reaction
              protocols
            </span>
          </li>
          <li className='flex items-start gap-2'>
            <span className='text-[#0f62fe] mt-0.5'>
              <svg width='18' height='18' fill='none' viewBox='0 0 24 24'>
                <circle cx='12' cy='12' r='10' fill='#e0f2fe' />
                <path
                  fill='#0f62fe'
                  d='M10 14.59l-2.29-2.3a1 1 0 011.41-1.41L10 11.76l4.88-4.88a1 1 0 011.41 1.41L10 14.59z'
                />
              </svg>
            </span>
            <span>HIPAA-compliant encrypted A/V; audit-ready logs</span>
          </li>
          <li className='flex items-start gap-2'>
            <span className='text-[#0f62fe] mt-0.5'>
              <svg width='18' height='18' fill='none' viewBox='0 0 24 24'>
                <circle cx='12' cy='12' r='10' fill='#e0f2fe' />
                <path
                  fill='#0f62fe'
                  d='M10 14.59l-2.29-2.3a1 1 0 011.41-1.41L10 11.76l4.88-4.88a1 1 0 011.41 1.41L10 14.59z'
                />
              </svg>
            </span>
            <span>
              Aligned with CMS virtual direct supervision requirements
            </span>
          </li>
          <li className='flex items-start gap-2'>
            <span className='text-[#0f62fe] mt-0.5'>
              <svg width='18' height='18' fill='none' viewBox='0 0 24 24'>
                <circle cx='12' cy='12' r='10' fill='#e0f2fe' />
                <path
                  fill='#0f62fe'
                  d='M10 14.59l-2.29-2.3a1 1 0 011.41-1.41L10 11.76l4.88-4.88a1 1 0 011.41 1.41L10 14.59z'
                />
              </svg>
            </span>
            <span>Malpractice coverage for supervising physicians</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
);

export default ComplianceSection;
