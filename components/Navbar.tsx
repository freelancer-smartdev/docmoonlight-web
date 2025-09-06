import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import classNames from 'classnames';

// Define props for the component
interface MobileMenuButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

// Mobile menu button component
const MobileMenuButton: React.FC<MobileMenuButtonProps> = ({
  isOpen,
  onClick,
}) => (
  <button
    data-collapse-toggle='navbar-default'
    type='button'
    className='inline-flex items-center p-2 ml-3 text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600'
    aria-controls='navbar-default'
    aria-expanded={isOpen}
    onClick={onClick}
  >
    <span className='sr-only'>Open main menu</span>
    <svg
      className='w-6 h-6'
      fill='none'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth='2'
      viewBox='0 0 24 24'
      stroke='currentColor'
    >
      {isOpen ? (
        <path d='M6 18L18 6M6 6l12 12'></path>
      ) : (
        <path d='M4 6h16M4 12h16M4 18h16'></path>
      )}
    </svg>
  </button>
);

// Define props for NavItem
interface NavItemProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

// Nav item component
const NavItem: React.FC<NavItemProps> = ({
  href,
  children,
  className = '',
}) => (
  <li>
    <a
      href={href}
      className={`block py-2 pl-3 pr-4 text-gray-700 rounded hover:bg-gray-100 md:hover:bg-transparent md:border-0 md:hover:text-blue-700 md:p-0 dark:text-gray-400 md:dark:hover:text-white dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent ${className}`}
    >
      {children}
    </a>
  </li>
);

// Define props for Navbar
interface NavbarProps {
  activeView: 'residents' | 'imaging' | 'infusion';
  onToggleView: (view: 'residents' | 'imaging' | 'infusion') => void;
}

// Main Navbar component
const Navbar: React.FC<NavbarProps> = ({ activeView, onToggleView }) => {
  const [mobileView, setMobileView] = useState(false);
  const router = useRouter();

  // Use useEffect to check for the URL parameter and set the active view
  useEffect(() => {
    // Get the 'view' parameter from the URL query
    const { view } = router.query;
    if (view === 'imaging' || view === 'residents' || view === 'infusion') {
      onToggleView(view);
    }
  }, [router.query, onToggleView]); // Rerun the effect when the URL query changes

  return (
    <nav className='bg-white border-gray-200 px-2 sm:px-4 py-2.5 rounded dark:bg-gray-900'>
      <div className='container flex flex-wrap items-center justify-between mx-auto'>
        <a href='#' className='flex items-center'>
          <img
            src='/images/logo.svg'
            alt='Your Logo'
            className='h-10 w-12 ml-3 md:h-20 md:w-24'
          />
        </a>

        <div className='flex items-center gap-2'>
          <button
            className={`px-1 py-0.5 text-xs rounded-full font-semibold ${
              activeView === 'residents'
                ? 'bg-blue-900 text-white'
                : 'bg-gray-100 text-gray-700'
            } sm:px-4 sm:py-2 sm:text-sm`}
            onClick={() => onToggleView('residents')}
          >
            Residents
          </button>
          <button
            className={`px-1 py-0.5 text-xs rounded-full font-semibold ${
              activeView === 'imaging'
                ? 'bg-blue-900 text-white'
                : 'bg-gray-100 text-gray-700'
            } sm:px-4 sm:py-2 sm:text-sm`}
            onClick={() => onToggleView('imaging')}
          >
            Radiology
          </button>
          <button
            className={`px-1 py-0.5 text-xs rounded-full font-semibold ${
              activeView === 'infusion'
                ? 'bg-blue-900 text-white'
                : 'bg-gray-100 text-gray-700'
            } sm:px-4 sm:py-2 sm:text-sm`}
            onClick={() => onToggleView('infusion')}
          >
            Infusion
          </button>
        </div>

        <MobileMenuButton
          isOpen={mobileView}
          onClick={() => setMobileView(!mobileView)}
        />

        <div
          className={classNames('w-full md:block md:w-auto', {
            hidden: !mobileView,
          })}
          id='navbar-default'
        >
          <ul className='flex flex-col p-4 mt-4 border border-gray-100 rounded-lg bg-gray-50 md:flex-row md:space-x-8 md:mt-0 md:text-sm items-center md:font-medium md:border-0 md:bg-white dark:bg-gray-800 md:dark:bg-gray-900 dark:border-gray-700'>
            {activeView === 'residents' ? (
              <>
                <NavItem href='#Home'>Our Mission</NavItem>
                <NavItem href='#WhatWeOffer'>What We Offer</NavItem>
                <NavItem href='#Discover'>Discover</NavItem>
                <NavItem href='#ReferPage'>Refer and Earn</NavItem>
                <NavItem href='#INoteAid' className='text-blue-700 '>
                  iNoteAid{' '}
                  <span className='bg-blue-100 text-blue-800 text-sm font-medium mr-2 px-2.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300'>
                    New
                  </span>
                </NavItem>
                <NavItem href='#Location'>Our Locations</NavItem>
                <NavItem href='#Contact'>Contact</NavItem>
              </>
            ) : activeView === 'imaging' ? (
              <>
                <NavItem href='#WhyUs'>Why Us</NavItem>
                <NavItem href='#Services'>Services</NavItem>
                <NavItem href='#HowItWorks'>How It Works</NavItem>
                <NavItem href='#ComplianceSection'>Compliance</NavItem>
                <NavItem href='#Pricing'>Pricing</NavItem>
                <NavItem href='#Partners'>Partners</NavItem>
                <NavItem href='#FAQ'>FAQ</NavItem>
                <NavItem href='#ContactPartner'>Contact</NavItem>
              </>
            ) : (
              <>
                <NavItem href='#Overview'>Overview</NavItem>
                <NavItem href='#InfusionServices'>Services</NavItem>
                <NavItem href='#InfusionHowItWorks'>How it works</NavItem>
                <NavItem href='#InfusionFAQ'>FAQ</NavItem>
                <NavItem href='#InfusionContact'>Contact</NavItem>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
