import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Spectrum Biosciences",
  description: "Privacy information for Spectrum Biosciences.",
};

const sections: LegalSection[] = [
  {
    title: "1. Introduction",
    paragraphs: [
      "Spectrum Biosciences respects the privacy of visitors and customers. This policy explains the personal information that may be collected through our website and how it may be used.",
    ],
  },
  {
    title: "2. Information We Collect",
    paragraphs: [
      "Depending on how you interact with our website, we may collect the following information:",
    ],
    items: [
      "Contact information such as your name, email address, and phone number.",
      "Billing, shipping, and order information.",
      "Messages and inquiries submitted through contact forms.",
      "Technical information such as browser type, device information, and website usage data.",
    ],
  },
  {
    title: "3. How Information Is Used",
    paragraphs: [
      "Personal information may be used to process orders, communicate with customers, provide support, maintain website functionality, prevent fraudulent activity, and meet applicable legal obligations.",
    ],
  },
  {
    title: "4. Information Sharing",
    paragraphs: [
      "Information may be shared with service providers where necessary to operate the website, process transactions, arrange deliveries, or provide customer support. The specific providers and disclosures should reflect the services actually used by Spectrum Biosciences.",
    ],
  },
  {
    title: "5. Cookies and Website Analytics",
    paragraphs: [
      "Our website may use cookies or similar technologies to support essential functionality and, where enabled, understand website performance. Cookie practices depend on the technologies installed on the website.",
    ],
  },
  {
    title: "6. Data Security",
    paragraphs: [
      "We aim to use appropriate safeguards to protect personal information. However, no internet transmission or electronic storage system can be guaranteed to be completely secure.",
    ],
  },
  {
    title: "7. Data Retention",
    paragraphs: [
      "Personal information should be retained only for as long as necessary for legitimate business purposes, applicable legal obligations, or other permitted purposes.",
    ],
  },
  {
    title: "8. Privacy Requests",
    paragraphs: [
      "Depending on applicable law, individuals may have rights to request access to, correction of, or deletion of their personal information. Please contact us through our contact page to submit a privacy inquiry.",
    ],
  },
  {
    title: "9. Policy Updates",
    paragraphs: [
      "This policy may be updated to reflect changes in website operations, business practices, or applicable requirements. The current version will be published on this page.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="Learn how personal information may be collected, used, and protected when interacting with Spectrum Biosciences."
      sections={sections}
    />
  );
}