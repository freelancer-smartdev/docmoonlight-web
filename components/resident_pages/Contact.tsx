import { useState } from 'react';
import { sendEmail } from '../../lib/api';
import validator from 'validator';

const initValues = { name: '', email: '', subject: '', message: '', type: '' };
const initState = { values: initValues };

const isValidEmail = (email: string) => validator.isEmail(email);
const sanitizeInput = (input: string) => validator.escape(input);

const Contact = () => {
  const [state, setState] = useState(initState);
  const { values } = state;
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleState = ({
    target,
  }: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setState((prev) => ({
      ...prev,
      values: { ...prev.values, [target.name]: target.value },
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(values.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (
      values.email &&
      values.message &&
      values.subject &&
      values.name &&
      values.type
    ) {
      setError('');
      values.name = sanitizeInput(values.name);
      values.message = sanitizeInput(values.message);
      values.subject = sanitizeInput(values.subject);
      values.type = sanitizeInput(values.type);

      await sendEmail(values);
      setSuccess('Email sent successfully!');
      setState(initState); // Reset the form fields
    } else {
      setError('Please fill in all the fields.');
    }
  };

  return (
    <section className='p-5 mx-auto ' id='Contact'>
      <div className='mx-auto flex flex-col md:flex-row md:w-9/12 w-full p-5 justify-center'>
        <div className='w-full md:pr-4 max-w-screen-lg justify-center'>
          <h2 className='font-medium sm:text-2xl text-blue-700'>
            Let us help!
          </h2>
          <p className='text-sm font-medium sm:text-sm my-3 text-blue-700'>
            Fill out the form below to get in touch with us directly. We&apos;re
            happy to answer all your questions, and you can expect a response
            within just 24-48 hours.
          </p>
          <form
            className='w-full max-w-screen-lg mx-auto'
            onSubmit={handleSubmit}
          >
            <div className='flex flex-wrap -mx-4 mb-6'>
              <div className='w-full md:w-1/2 px-4 mb-6 md:mb-0'>
                <input
                  className='appearance-none block w-full text-black border border-grey-500 rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white'
                  id='grid-first-name'
                  type='text'
                  placeholder='Name'
                  value={values.name}
                  name='name'
                  onChange={handleState}
                  required
                />
              </div>
              <div className='w-full md:w-1/2 px-4'>
                <input
                  className='appearance-none block w-full text-black border border-gray-200 rounded py-3 px-4 leading-tight focus:outline-none focus:bg-white focus:border-gray-500'
                  id='grid-last-name'
                  type='email'
                  placeholder='Email'
                  value={values.email}
                  name='email'
                  onChange={handleState}
                  required
                />
              </div>
            </div>
            <div className='flex flex-wrap -mx-4 mb-6'>
              <div className='w-full px-4'>
                <input
                  className='appearance-none block w-full text-black border border-gray-200 rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white focus:border-gray-500'
                  id='grid-password'
                  placeholder='Subject'
                  value={values.subject}
                  name='subject'
                  onChange={handleState}
                  required
                />
              </div>
            </div>

            <div className='flex flex-wrap -mx-4 mb-6'>
              <div className='w-full px-4'>
                <select
                  name='type'
                  value={values.type}
                  onChange={(value: any) => handleState(value)}
                  required
                  className='select-dropdown'
                >
                  <option value=''>Select a Category...</option>
                  <option value='General inquiries'>
                    General inquiries (No account yet)
                  </option>
                  <option value='Technical'>Technical</option>
                  <option value='Payment'>Payment</option>
                  <option value='Partnership'>
                    Partnership (for companies only)
                  </option>
                </select>
              </div>
            </div>

            <div className='flex flex-wrap -mx-4 mb-6'>
              <div className='w-full px-4'>
                <textarea
                  id='message'
                  rows={4}
                  className='block p-2.5 w-full text-sm text-black rounded-lg border border-gray-200 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
                  placeholder='Message'
                  value={values.message}
                  name='message'
                  onChange={handleState}
                  required
                ></textarea>
              </div>
            </div>
            {error && (
              <div className='text-red-500 text-sm mb-4 px-4'>{error}</div>
            )}
            {success && (
              <div className='text-green-500 text-sm mb-4 px-4'>{success}</div>
            )}
            <div className='flex px-4 flex-wrap -mx-4 md:mb-2 mb-10 justify-center '>
              <button
                className='appearance-none bg-blue-800 w-full text-white border border-gray-200 rounded py-3 px-4 mb-3 leading-tight focus:outline-none focus:bg-white focus:border-gray-500'
                id='grid-password'
                type='submit'
              >
                Send Message
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};

export default Contact;
