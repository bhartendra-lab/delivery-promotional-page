import type { Plan, ServiceType } from "./plans";

export type SubscriptionStatus =
  | "active"
  | "pending_payment"
  | "past_due"
  | "suspended"
  | "cancelled"
  | "expired";

/** GET /billing/plans */
export type PlansResponse = {
  currency: string;
  plans: Plan[];
};

export type PublicCoupon = { code: string; percent_off: number; valid_until: number };

/** GET /billing/subscription — base fields common to every plan family. */
type SubscriptionBase = {
  status: SubscriptionStatus;
  service: { _id: string; name: string | null; service_type: ServiceType; billing_interval: string | null } | null;
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  grace_until: number | null;
  suspend_at: number | null;
  delete_at: number | null;
};

export type CountBasedSnapshot = SubscriptionBase & {
  limit: number | null;
  used: number;
  remaining: number | null;
};

export type StorageBasedSnapshot = SubscriptionBase & {
  storage: { limit: number | null; used: number; remaining: number | null };
};

export type SubscriptionSnapshot = CountBasedSnapshot | StorageBasedSnapshot;

export function isStorageSnapshot(s: SubscriptionSnapshot): s is StorageBasedSnapshot {
  return "storage" in s;
}

/** POST /billing/coupons/validate */
export type CouponValidation =
  | { valid: true; discount_amount: number; tax_amount: number; final_amount: number }
  | { valid: false; message: string };

/**
 * POST /billing/checkout — a discriminated union with six branches (§1.5).
 * Narrow in this order: "status" in res -> scheduled (F); else
 * res.razorpay_order_id -> order-based checkout (A/C/D/E), even when
 * razorpay_subscription_id is also present; else subscription-based (B).
 */
export type CheckoutResponse =
  | { status: "scheduled"; message: string; effective_at: number }
  | { razorpay_order_id: string; amount: number; razorpay_subscription_id: string; key_id: string }
  | { razorpay_order_id: string; amount: number; key_id: string }
  | { razorpay_subscription_id: string; short_url: string; key_id: string };

export type CancelSubscriptionResponse = { status: "cancelled"; runs_until: number | null };

export type ResumeSubscriptionResponse = { razorpay_subscription_id: string; short_url: string; key_id: string };

export type InvoiceLineItem = {
  description: string;
  service_type: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

export type InvoiceTaxLine = { type: "CGST" | "SGST" | "IGST"; percent: number; amount: number };

/** GET/PUT /billing/profile */
export type BillingProfile = {
  legal_name: string | null;
  gstin: string | null;
  billing_address: string | null;
  place_of_supply_state: string | null;
};

export type CheckoutProration = {
  mode: "tier_upgrade" | "interval_upgrade";
  remaining_fraction: number;
  old_price: number;
  new_price: number;
  unused_credit: number | null;
};

/**
 * POST /billing/checkout/preview — same body as POST /billing/checkout, but
 * read-only (never redeems a coupon, never creates a Razorpay order). Used
 * to render the real tax/proration breakdown on the confirm-purchase page
 * before the user pays.
 */
export type CheckoutPreview =
  | { mode: "scheduled"; message: string; effective_at: number }
  | {
      mode: "event_topup" | "new_subscription" | "tier_upgrade" | "interval_upgrade";
      description: string;
      gross_amount: number;
      discount_amount: number;
      taxable_value: number;
      tax_lines: InvoiceTaxLine[];
      total: number;
      proration: CheckoutProration | null;
    };

export type Invoice = {
  _id: string;
  invoice_number: string;
  company_id: string;
  subscription_id: string | null;
  payment_order_id: string;
  line_items: InvoiceLineItem[];
  subtotal: number;
  tax_lines: InvoiceTaxLine[];
  total: number;
  buyer_legal_name: string | null;
  buyer_gstin: string | null;
  seller_gstin: string | null;
  place_of_supply: string | null;
  currency: string;
  pdf_key: string | null;
  issued_at: number;
  status: "issued" | "void";
  createdAt: string;
  updatedAt: string;
};
