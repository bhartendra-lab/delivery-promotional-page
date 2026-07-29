/**
 * Billing API surface — thin re-export of the functions added to lib/api.ts,
 * which already owns the shared `request()` helper (bearer token, no-store,
 * 401 handling, ApiError). Kept as a separate module so billing call sites
 * don't need to reach into the general api.ts grab-bag.
 */
export {
  getBillingPlans,
  getPublicCoupons,
  getSubscription,
  validateCoupon,
  checkout,
  previewCheckout,
  getBillingProfile,
  updateBillingProfile,
  cancelSubscription,
  resumeSubscription,
  listInvoices,
  getInvoice,
  ApiError,
  getApiErrorCode,
} from "./api";
export type { BillingProfileInput } from "./api";

export type {
  PlansResponse,
  PublicCoupon,
  SubscriptionSnapshot,
  CountBasedSnapshot,
  StorageBasedSnapshot,
  CouponValidation,
  CheckoutResponse,
  CancelSubscriptionResponse,
  ResumeSubscriptionResponse,
  Invoice,
  InvoiceLineItem,
  InvoiceTaxLine,
  SubscriptionStatus,
  BillingProfile,
  CheckoutProration,
  CheckoutPreview,
} from "./billing-types";
export { isStorageSnapshot } from "./billing-types";
