export const PAYMENT_LINK_TYPES = ["SINGLE_USE", "REUSABLE"] as const;
export type PaymentLinkType = (typeof PAYMENT_LINK_TYPES)[number];
