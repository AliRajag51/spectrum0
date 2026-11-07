import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms & Conditions | Spectrum Biosciences",
  description: "Website terms and conditions for Spectrum Biosciences.",
};

const sections: LegalSection[] = [
  {
    title: "1. Acceptance of Terms",
    paragraphs: [
      "By accessing or using the Spectrum Biosciences website, visitors agree to comply with the applicable terms and policies governing its use. Please review these terms before placing an order.",
    ],
  },
  {
    title: "2. Research Use Only",
    paragraphs: [
      "Products offered by Spectrum Biosciences are represented as intended exclusively for scientific, analytical, and laboratory research. They are not intended for human consumption, veterinary use, or clinical administration.",
    ],
  },
  {
    title: "3. Product Information",
    paragraphs: [
      "Product descriptions, availability, specifications, and prices may change. Customers should review the current product listing and available documentation before purchasing.",
    ],
  },
  {
    title: "4. Orders and Payments",
    paragraphs: [
      "Order placement does not necessarily guarantee acceptance or availability. Applicable prices, shipping charges, taxes, and payment requirements should be confirmed during the checkout process.",
    ],
  },
  {
    title: "5. Shipping and Delivery",
    paragraphs: [
      "Shipping options, costs, delivery areas, and estimated timelines depend on the available fulfillment services. Delivery estimates are not guarantees unless expressly confirmed.",
    ],
  },
  {
    title: "6. Returns and Refunds",
    paragraphs: [
      "Returns, cancellations, damaged shipments, and refund requests are addressed under the Refund Policy published on this website.",
    ],
  },
  {
    title: "7. Responsible Use",
    paragraphs: [
      "Purchasers are responsible for ensuring that their acquisition, storage, handling, and use of research materials comply with applicable laws, institutional requirements, and laboratory procedures.",
    ],
  },
  {
    title: "8. Intellectual Property",
    paragraphs: [
      "Website content, branding, images, and other materials may be protected by intellectual property rights. Unauthorized use of protected materials is prohibited where applicable.",
    ],
  },
  {
    title: "9. Website Availability",
    paragraphs: [
      "The website may undergo maintenance, updates, or temporary interruptions. Information presented online should be verified where accuracy is essential to a purchasing decision.",
    ],
  },
  {
    title: "10. Contact Information",
    paragraphs: [
      "Questions about website terms, product listings, or orders may be submitted through the Spectrum Biosciences contact page.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      description="Please review the conditions governing website access, product purchases, and responsible use of our research collection."
      sections={sections}
    />
  );
}