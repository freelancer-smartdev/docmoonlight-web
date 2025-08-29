import Link from 'next/link';
import { useEffect, useState } from 'react';
interface linksObject {
  type: string;
  link: string;
}

const Footer = () => {
  const initialLinksState = {
    linkedin: '',
    twitter: '',
    facebook: '',
    youtube: '',
  };

  const [links, setLinks] = useState<{ [key: string]: string }>(
    initialLinksState
  );

  useEffect(() => {
    fetch('https://api.docmoonlight.com/links')
      .then((res) => res.json())
      .then((data) => {
        const links = Object.fromEntries(
          data.result.map((t: linksObject) => [t.type, t.link])
        );
        setLinks(links);
      });
  }, []);
  return (
    <footer className='footer text-center lg:text-left'>
      <div className='footer_container p-6'>
        <div className='text-center'>
          <div
            style={{
              width: '100%',
              justifyContent: 'center',
              alignItems: 'center',
              alignSelf: 'center',
              justifySelf: 'center',
              alignContent: 'center',
            }}
            className='mb-12 w-96'
          >
            <div className='align-items-center justify-content-center'>
              <img
                style={{
                  height: 70,
                  width: 70,
                  alignSelf: 'center',
                  alignContent: 'center',
                }}
                src='/images/footer_logo.svg'
                className='mb-0 pb-3'
              />
            </div>
            <ul
              style={{
                width: '100%',
                justifyContent: 'center',
                alignItems: 'center',
                alignSelf: 'center',
                justifySelf: 'center',
                alignContent: 'center',
              }}
              className='flex flex-col list-none mb-0'
            >
              <li>
                <p className='text-white text-sm md:text-base pb-3'>
                  Empowering aspiring physicians with flexible, high-paying
                  moonlighting opportunities while ensuring excellence in
                  patient care.
                </p>
              </li>
              <ul
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
                className='md:text-sm gap-3 md:font-medium mt-3'
              >
                <li>
                  <a target='_blank' href={links.linkedin} rel='noreferrer'>
                    <img
                      src='/images/linkedin.svg'
                      className='pb-3 w-10 md:w-[60px] aspect-square'
                    />
                  </a>
                </li>
                <li>
                  <a target='_blank' href={links.twitter} rel='noreferrer'>
                    <img
                      src='/images/twitter.svg'
                      className='pb-3 w-10 md:w-[60px] aspect-square'
                    />
                  </a>
                </li>
                <li>
                  <a target='_blank' href={links.youtube} rel='noreferrer'>
                    <img
                      src='/images/youtube.svg'
                      className='pb-3 w-10 md:w-[60px] aspect-square'
                    />
                  </a>
                </li>
              </ul>
            </ul>
          </div>
        </div>
      </div>
      <div className='mt-2 text-white text-center  opacity-70'>
        <Link href='/PrivacyPolicy'>Privacy Policy</Link>
      </div>
      <div className='text-white text-sm md:text-base text-center p-4 opacity-50'>
        Copyright © {new Date().getFullYear()} DOCMOONLIGHT, LLC.
        <Link href='/CopyRights'> All rights reserved.</Link>
      </div>
    </footer>
  );
};

export default Footer;
