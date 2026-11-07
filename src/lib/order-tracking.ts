import { z } from "zod";

export const trackingInputSchema = z.object({
  orderNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/^#/, ""))
    .pipe(
      z
        .string()
        .regex(
          /^[1-9]\d{0,11}$/,
          "Enter the order number from your confirmation email.",
        ),
    ),
  email: z
    .string()
    .trim()
    .email("Enter the billing email used at checkout.")
    .max(254)
    .transform((value) => value.toLowerCase()),
});
export type TrackingInput = z.infer<typeof trackingInputSchema>;
export type TrackingStatus =
  | "pending"
  | "on-hold"
  | "processing"
  | "completed"
  | "cancelled"
  | "refunded"
  | "failed";
export type TrackedOrder = {
  number: string;
  status: TrackingStatus;
  placedAt: string | null;
  currency: string;
  total: string;
  items: { name: string; quantity: number; total: string }[];
  shipments: { carrier: string; number: string; url: string }[];
};

export const trackingStatusCopy: Record<
  TrackingStatus,
  { title: string; description: string; step: number }
> = {
  pending: {
    title: "Awaiting payment.",
    description:
      "Your order has been received. Payment confirmation is still pending.",
    step: 0,
  },
  "on-hold": {
    title: "Your order is on hold.",
    description:
      "Your order needs a little more time. Contact us if you need an update.",
    step: 0,
  },
  processing: {
    title: "Your order is being prepared.",
    description: "Payment is confirmed. Your order is awaiting fulfillment.",
    step: 1,
  },
  completed: {
    title: "Your order is complete.",
    description:
      "The store has marked this order complete. Carrier tracking confirms delivery progress.",
    step: 2,
  },
  cancelled: {
    title: "This order was cancelled.",
    description: "Contact our team if you need help with this order.",
    step: -1,
  },
  refunded: {
    title: "This order was refunded.",
    description:
      "The store has marked this order as refunded. Contact us with any questions.",
    step: -1,
  },
  failed: {
    title: "Payment needs attention.",
    description:
      "Payment could not be completed. Contact our team before placing another order.",
    step: -1,
  },
};

// Explicitly synthetic; never returned by the live lookup endpoint.
export const sampleTrackedOrder: TrackedOrder = {
  number: "EXAMPLE-10428",
  status: "processing",
  placedAt: "2026-09-04T14:30:00Z",
  currency: "USD",
  total: "100.00",
  items: [
    { name: "Tesamorelin · 10 MG", quantity: 1, total: "62.00" },
    { name: "GHK-Cu · 50 MG", quantity: 1, total: "38.00" },
  ],
  shipments: [],
};
