import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Refund Policy | Spectrum Biosciences",
  description: "Refund and return information for Spectrum Biosciences.",
};

const sections: LegalSection[] = [
  {
    title: "1. Policy Overview",
    paragraphs: [
      "This page explains how customers can request assistance with cancellations, returns, damaged products, or refund inquiries. Eligibility and procedures are subject to the refund terms adopted by Spectrum Biosciences.",
    ],
  },
  {
    title: "2. Order Cancellations",
    paragraphs: [
      "If you need to cancel an order, contact our support team as soon as possible and provide your order number. Whether cancellation is possible depends on the order's fulfillment status.",
    ],
  },
  {
    title: "3. Damaged or Incorrect Items",
    paragraphs: [
      "If your shipment arrives damaged, incomplete, or contains an incorrect item, contact our team promptly. Include your order number, a description of the issue, and relevant photographs when available.",
    ],
  },
  {
    title: "4. Return Requests",
    paragraphs: [
      "Contact customer support before returning an item. Research material handling and product integrity considerations may affect return eligibility. Do not ship items back without receiving return instructions.",
    ],
  },
  {
    title: "5. Refund Review",
    paragraphs: [
      "Refund requests are reviewed based on the circumstances of the order and the applicable refund terms. Approved refunds, where available, are generally processed through the original payment method, subject to payment provider procedures.",
    ],
  },
  {
    title: "6. Shipping Charges",
    paragraphs: [
      "Whether original shipping charges or return shipping costs are refundable depends on the applicable policy, the reason for the request, and any mandatory consumer protections.",
    ],
  },
  {
    title: "7. Contact Support",
    paragraphs: [
      "For assistance with an order, use our contact page and include your order number and a brief description of your concern.",
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      description="Information about order cancellations, damaged shipments, returns, and refund requests."
      sections={sections}
    />
  );
}