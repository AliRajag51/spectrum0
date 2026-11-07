import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Research Disclaimer | Spectrum Biosciences",
  description: "Research use information and product limitations.",
};

const sections: LegalSection[] = [
  {
    title: "1. Research Use Only",
    paragraphs: [
      "Products offered by Spectrum Biosciences are intended exclusively for scientific, analytical, and laboratory research in appropriate research environments.",
      "These products are not intended for human consumption, veterinary use, medical treatment, or clinical administration.",
    ],
  },
  {
    title: "2. Not for Medical Use",
    paragraphs: [
      "Research compounds are not presented as medicines, dietary supplements, foods, or cosmetics. No product information on this website should be interpreted as medical advice or as an instruction for personal use.",
    ],
  },
  {
    title: "3. No Dosing Instructions",
    paragraphs: [
      "Spectrum Biosciences does not provide human dosing recommendations, injection instructions, administration protocols, or guidance for therapeutic use.",
    ],
  },
  {
    title: "4. Laboratory Handling",
    paragraphs: [
      "Researchers should handle materials using appropriate laboratory safety procedures, applicable product documentation, and institutional standard operating procedures.",
    ],
    items: [
      "Follow product-specific handling and storage requirements.",
      "Use appropriate protective equipment and laboratory controls.",
      "Maintain suitable environmental conditions.",
      "Maintain accurate batch and material records.",
      "Follow applicable institutional and regulatory requirements.",
    ],
  },
  {
    title: "5. Scientific Information",
    paragraphs: [
      "References to scientific research, experimental applications, or published studies are provided for informational purposes. Such information does not establish that a particular product is safe or effective for human or veterinary use.",
    ],
  },
  {
    title: "6. Product Documentation",
    paragraphs: [
      "Where available, laboratory certificates and analytical results should be reviewed in relation to the specific documented batch. Results from one batch should not automatically be assumed to apply to another.",
    ],
  },
  {
    title: "7. Purchaser Responsibility",
    paragraphs: [
      "Purchasers are responsible for determining whether acquisition, possession, handling, and use of a research compound are lawful and appropriate for their intended research activities.",
    ],
  },
  {
    title: "8. Questions",
    paragraphs: [
      "For questions about product documentation or laboratory research information, contact Spectrum Biosciences through the website's contact page.",
    ],
  },
];

export default function ResearchDisclaimerPage() {
  return (
    <LegalPage
      title="Research Disclaimer"
      description="Important information concerning the intended purpose, handling, and limitations of research compounds."
      sections={sections}
    />
  );
}
