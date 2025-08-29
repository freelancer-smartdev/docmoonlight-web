import { useState } from 'react';
import Navbar from '@/components/Navbar';
import MissionSection from '@/components/resident_pages/MissionSection';
import Service from '@/components/resident_pages/Service';
import DiscoverSection from '@/components/resident_pages/DiscoverSection';
import Contact from '@/components/resident_pages/Contact';
import Footer from '@/components/Footer';
import Refer from '@/components/resident_pages/Refer';
import Locations from '@/components/resident_pages/Locations';
import INoteAid from '@/components/resident_pages/INoteAid';
import Oversight from '@/components/company_pages/Oversight';
import CMS from '@/components/company_pages/CMS';
import WhyChoose from '@/components/company_pages/WhyChoose';
import ServiceOptions from '@/components/company_pages/ServiceOptions';
import HowItWorks from '@/components/company_pages/HowItWorks';
import WhyDocMoonlight from '@/components/company_pages/WhyDocMoonlight';
import ComplianceSection from '@/components/company_pages/ComplianceSection';
import PricingPlans from '@/components/company_pages/PricingPlans';
import WhyPatientsLove from '@/components/company_pages/WhyPatientsLove';
import TrustedByRadiology from '@/components/company_pages/TrustedByRadiology';
import FAQSection from '@/components/company_pages/FAQ';
import CoverageRequestForm from '@/components/company_pages/CoverageRequestForm';
import Overview from '@/components/infusion_pages/Overview';
import Offerings from '@/components/infusion_pages/Offerings';
import RegulatoryAlignmentSection from '@/components/infusion_pages/RegulatoryAlignmentSection';
import InfusionServiceOptions from '@/components/infusion_pages/InfusionServiceOptions';
import HowInfusionWorks from '@/components/infusion_pages/HowInfusionWorks';
import DashboardAndPresence from '@/components/infusion_pages/DashboardAndPresence';
import PricingSection from '@/components/infusion_pages/PricingSection';
import InfusionFAQ from '@/components/infusion_pages/InfusionFAQ';
import InfusionContactForm from '@/components/infusion_pages/InfusionContactForm';

export default function Home() {
  const [activeView, setActiveView] = useState<
    'residents' | 'imaging' | 'infusion'
  >('residents');

  return (
    <>
      <Navbar activeView={activeView} onToggleView={setActiveView} />
      {activeView === 'residents' ? (
        <>
          <MissionSection />
          <Service />
          <DiscoverSection />
          <Refer />
          <INoteAid />
          <Locations />
          <Contact />
        </>
      ) : activeView === 'imaging' ? (
        <>
          <Oversight />
          <CMS />
          <WhyChoose />
          <ServiceOptions />
          <HowItWorks />
          <WhyDocMoonlight />
          <ComplianceSection />
          <PricingPlans />
          <WhyPatientsLove />
          <TrustedByRadiology />
          <FAQSection />
          <CoverageRequestForm />
        </>
      ) : (
        <>
          <Overview />
          <Offerings />
          <RegulatoryAlignmentSection />
          <InfusionServiceOptions />
          <HowInfusionWorks />
          <DashboardAndPresence />
          <PricingSection />
          <InfusionFAQ />
          <InfusionContactForm />
        </>
      )}
      <Footer />
    </>
  );
}
