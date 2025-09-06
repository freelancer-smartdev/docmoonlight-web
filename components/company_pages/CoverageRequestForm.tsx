import React, { useState, ChangeEvent, FormEvent } from 'react';
import { FaFileAlt } from 'react-icons/fa';
import { sendPartnerEmail } from '../../lib/api';
// import validator from 'validator';

// Define the shape of the form values
interface FormValues {
  fullName: string;
  workEmail: string;
  company: string;
  website: string;
  locations: string;
  hours: string;
  startDate: string;
  message: string;
}

// Define the shape of the form state
interface FormState {
  values: FormValues;
  errors: Partial<Record<keyof FormValues, string | null>>;
}

const initValues: FormValues = {
  fullName: '',
  workEmail: '',
  company: '',
  website: '',
  locations: '',
  hours: '',
  startDate: '',
  message: '',
};

const initState: FormState = { values: initValues, errors: {} };

// A mock function for email validation to avoid external library dependency for this demo
const isValidEmail = (email: string): boolean => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// A mock function for input sanitization to avoid external library dependency for this demo
const sanitizeInput = (input: string): string => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  const reg = /[&<>"'/]/gi;
  return input.replace(reg, (match) => (map as any)[match]);
};

const CoverageRequestForm: React.FC = () => {
  const [state, setState] = useState<FormState>(initState);
  const { values, errors } = state;
  const [success, setSuccess] = useState<string>('');

  // Handle changes to form inputs
  const handleState = ({
    target,
  }: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setState((prev) => ({
      ...prev,
      values: { ...prev.values, [target.name]: target.value },
      errors: { ...prev.errors, [target.name]: null }, // Clear error on change
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const newErrors: Partial<Record<keyof FormValues, string | null>> = {};
    if (!values.fullName) newErrors.fullName = 'This field is required';
    if (!values.workEmail) newErrors.workEmail = 'This field is required';
    if (!values.company) newErrors.company = 'This field is required';
    if (!values.locations) newErrors.locations = 'This field is required';
    if (!values.hours) newErrors.hours = 'This field is required';
    if (!values.startDate) newErrors.startDate = 'This field is required';

    if (Object.keys(newErrors).length > 0) {
      setState((prev) => ({ ...prev, errors: newErrors }));
      setSuccess('');
    } else if (!isValidEmail(values.workEmail)) {
      newErrors.workEmail = 'Please enter a valid email address.';
      setState((prev) => ({ ...prev, errors: newErrors }));
      setSuccess('');
    } else {
      const sanitizedValues: Partial<Record<keyof FormValues, string>> = {};
      (Object.keys(values) as Array<keyof FormValues>).forEach((key) => {
        sanitizedValues[key] = sanitizeInput(values[key]);
      });
      console.log({ ...sanitizedValues, subject: 'Coverage Request Form' });
      await sendPartnerEmail({
        ...sanitizedValues,
        subject: 'Coverage Request Form',
      });

      setSuccess('Your quote request was submitted successfully!');
      setState(initState);
    }
  };

  const inputClass = (name: keyof FormValues) =>
    `w-full p-3 border rounded-lg focus:outline-none focus:ring-2 ${
      errors[name]
        ? 'border-red-500 focus:ring-red-500'
        : 'border-gray-300 focus:ring-blue-500'
    }`;

  const labelClass = (name: keyof FormValues) =>
    `block text-sm font-medium mb-1 ${
      errors[name] ? 'text-red-500' : 'text-gray-700'
    }`;

  return (
    <section
      className='bg-gray-100 py-12 px-4 rounded-xl shadow-md max-w-3xl mx-auto mb-6 mt-6'
      id='ContactPartner'
    >
      <div className='text-center mb-10'>
        <div className='flex justify-center mb-3'>
          <div className='bg-blue-100 text-[#1d4ed8] p-3 rounded-full'>
            <FaFileAlt size={24} />
          </div>
        </div>
        <h2 className='text-2xl font-bold text-[#101828] mb-2'>
          Tell us about your coverage needs
        </h2>
        <p className='text-[#667085] text-sm max-w-md mx-auto'>
          Share a few details and we&apos;ll send a tailored plan within 1
          business day.
        </p>
      </div>

      <form onSubmit={handleSubmit} className='space-y-6'>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {/* Full name */}
          <div>
            <label htmlFor='fullName' className={labelClass('fullName')}>
              Full name *
            </label>
            <input
              id='fullName'
              name='fullName'
              value={values.fullName}
              onChange={handleState}
              className={inputClass('fullName')}
            />
            {errors.fullName && (
              <p className='text-red-500 text-xs mt-1'>{errors.fullName}</p>
            )}
          </div>

          {/* Work email */}
          <div>
            <label htmlFor='workEmail' className={labelClass('workEmail')}>
              Work email *
            </label>
            <input
              id='workEmail'
              name='workEmail'
              value={values.workEmail}
              onChange={handleState}
              className={inputClass('workEmail')}
            />
            {errors.workEmail && (
              <p className='text-red-500 text-xs mt-1'>{errors.workEmail}</p>
            )}
          </div>

          {/* Company */}
          <div>
            <label htmlFor='company' className={labelClass('company')}>
              Company / practice *
            </label>
            <input
              id='company'
              name='company'
              value={values.company}
              onChange={handleState}
              className={inputClass('company')}
            />
            {errors.company && (
              <p className='text-red-500 text-xs mt-1'>{errors.company}</p>
            )}
          </div>

          {/* Website */}
          <div>
            <label
              htmlFor='website'
              className='block text-sm font-medium mb-1 text-gray-700'
            >
              Website
            </label>
            <input
              id='website'
              name='website'
              value={values.website}
              onChange={handleState}
              className='w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
            />
          </div>

          {/* Locations */}
          <div>
            <label htmlFor='locations' className={labelClass('locations')}>
              Expected number of locations *
            </label>
            <input
              id='locations'
              name='locations'
              value={values.locations}
              onChange={handleState}
              className={inputClass('locations')}
              type='number'
            />
            {errors.locations && (
              <p className='text-red-500 text-xs mt-1'>{errors.locations}</p>
            )}
          </div>

          {/* Hours */}
          <div>
            <label htmlFor='hours' className={labelClass('hours')}>
              Hours of operation *
            </label>
            <input
              id='hours'
              name='hours'
              value={values.hours}
              onChange={handleState}
              className={inputClass('hours')}
            />
            {errors.hours && (
              <p className='text-red-500 text-xs mt-1'>{errors.hours}</p>
            )}
          </div>

          {/* Start Date */}
          <div>
            <label htmlFor='startDate' className={labelClass('startDate')}>
              Desired start date *
            </label>
            <input
              id='startDate'
              name='startDate'
              type='date'
              value={values.startDate}
              onChange={handleState}
              className={inputClass('startDate')}
            />
            {errors.startDate && (
              <p className='text-red-500 text-xs mt-1'>{errors.startDate}</p>
            )}
          </div>

          {/* Message */}
          <div>
            <label
              htmlFor='message'
              className='block text-sm font-medium mb-1 text-gray-700'
            >
              Message (optional)
            </label>
            <textarea
              id='message'
              name='message'
              value={values.message}
              onChange={handleState}
              placeholder='Share any details about modalities, states, or coverage windows...'
              rows={3}
              className='w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
            />
          </div>
        </div>

        {Object.keys(errors).length > 0 && (
          <p className='text-red-500 text-sm text-center'>
            Please fill in all required fields.
          </p>
        )}
        {success && (
          <p className='text-green-500 text-sm text-center'>{success}</p>
        )}

        <button
          type='submit'
          className='bg-blue-600 text-white w-full py-3 rounded-lg font-semibold hover:bg-blue-700 transition'
        >
          Request my quote
        </button>

        <p className='text-xs text-center text-gray-400 mt-2'>
          We use your information only to respond to your request. No spam—ever.
        </p>
      </form>
    </section>
  );
};

export default CoverageRequestForm;
