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
  /** Whether the plan renews on its own (it has a Razorpay mandate that isn't
   *  cancelled). Optional: older API responses don't carry it — read it
   *  through autoRenews() in lib/subscription-status.ts. */
  auto_renews?: boolean;
  grace_until: number | null;
  suspend_at: number | null;
  delete_at: number | null;
  /** True when this studio would get the first-purchase bonus if it bought
   *  events now. Optional: older API responses don't carry it. Never show the
   *  offer to a studio without it. */
  first_purchase_offer_eligible?: boolean;
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

/**
 * POST /billing/coupons/validate
 *
 * `requires_payment: false` means the coupon covers the whole price (a
 * 100%-off coupon) — checkout will activate the plan outright instead of
 * returning anything to pay. Prefer it over testing `final_amount === 0`.
 */
export type CouponValidation =
  | { valid: true; discount_amount: number; tax_amount: number; final_amount: number; requires_payment: boolean }
  | { valid: false; message: string };

/**
 * POST /billing/checkout — a discriminated union (§1.5).
 *
 * Narrow on the `status` LITERAL first, never on `"status" in res` alone:
 * "scheduled" (F) and "activated" (a 100%-off coupon, granted server-side
 * with no Razorpay step at all) both carry a `status` and are otherwise
 * nothing alike. Then res.razorpay_order_id -> order-based checkout
 * (A/C/D/E), even when razorpay_subscription_id is also present; else
 * subscription-based (B).
 */
export type CheckoutResponse =
  | { status: "scheduled"; message: string; effective_at: number }
  | { status: "activated"; amount: number; discount_amount: number; coupon_code: string; subscription_id: string }
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
      mode: "event_topup" | "new_subscription" | "tier_upgrade" | "interval_upgrade" | "photo_cap_topup";
      description: string;
      gross_amount: number;
      discount_amount: number;
      taxable_value: number;
      tax_lines: InvoiceTaxLine[];
      total: number;
      /** false when a coupon covers the full price — show "Activate plan", not "Pay ₹0.00". */
      requires_payment: boolean;
      proration: CheckoutProration | null;
      /** Free events the first-purchase offer adds to this purchase; 0 or absent when none. */
      bonus_events?: number;
      /** Set when this event purchase leaves a lapsed storage plan that still
       *  has galleries: paying deletes them. Checkout refuses until the request
       *  carries `confirm_storage_clear: true`. */
      storage_data_warning?: StorageDataWarning | null;
      /** photo_cap_topup only: items this purchase adds to the event's cap. */
      photos_added?: number;
    };

export type StorageDataWarning = { galleries: number; message: string };

/**
 * Photo cap status of one event. Null (or absent) means the event has no cap,
 * which is every storage-plan event. Sent by GET /deliverables/archive-tiers,
 * by create-media next to `storage`, and inside the 402 both upload endpoints
 * answer with when the cap is hit ({ code: "PHOTO_CAP_EXCEEDED", photo_cap }).
 */
export type PhotoCap = {
  /** Base cap plus whatever was bought for this event. */
  cap: number;
  /** Media items in the event right now. */
  used: number;
  remaining: number;
  addon_size: number;
  /** GST-inclusive rupees per block. */
  addon_price: number;
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
