# Implementation Prompt — Pricing, Checkout & Subscription Management

> **Read this whole document before writing a line of code.** It specifies work across **three repositories**: the two frontends (the bulk of it, §2–§11) plus **a small, tightly-scoped set of additive backend changes in §12 that are in scope and must be built**.
>
> Every API shape, field name, status code and error string quoted below was read directly out of the backend source, not inferred from the design doc. Where the design doc and the code disagree, **the code quoted here wins**.
>
> **Build order:** §12 first. The backend changes are small, purely additive, and three of them are prerequisites for UI specified in §7 and §8 — building the frontend first means writing copy around fields that don't exist yet. Ship §12, redeploy the API, then start §6/§7. Response shapes in §1 are written **as they will be after §12 lands**; the three fields this adds are marked `(§12)`.

---

## 0. Ground rules (non-negotiable)

### 0.1 The two repos

| Repo | Domain | Stack | What you build here |
|---|---|---|---|
| `Vyavasth-landing-page/` | `vyavasth.in` | Next.js `16.2.6`, React 19, Tailwind v4, **no auth** | Public `/pricing` page. Reads `GET /billing/plans`. Deep-links to the app. |
| `delivery-promotional-page/frontend/` | `deliver.vyavasth.in` | Next.js `16.2.6`, React 19, Tailwind v4, JWT auth, deployed via OpenNext → Cloudflare | `/checkout`, billing settings, plan chooser, Razorpay invocation, quota gates, suspension UI |

Backend origin for both: `api.vyavasth.in`.

**These two repos share no code and must not import from each other.** The plan-derivation logic (§5) is deliberately duplicated as a *verbatim copy* of one pure module in each repo. Copy it byte-for-byte so the tier math cannot drift.

### 0.2 Next.js version warning

Both repos carry this in `AGENTS.md`:

> **This is NOT the Next.js you know.** This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Take it literally. Before you write a server component, a route handler, `searchParams` access, `next/script`, or metadata, **read the corresponding doc in `node_modules/next/dist/docs/`**. Do not assume `searchParams` is a plain object, do not assume `params` is synchronous, do not assume the App Router caching defaults you remember.

### 0.3 Design system — the four things that never bend

Source of truth: `delivery-promotional-page/Vyavasth Design System.md`. Read §2, §4, §5 before styling anything.

1. **One accent on the Studio side: terracotta `#C25A3A`.** Every button, link, active state, slider fill, progress bar, focus ring. No second accent. No blue, no green-for-"good", no purple. (Functional status colors — success/warning/danger — exist and are listed below, but they are *status*, never decoration.)
2. **Warm backgrounds, never clinical.** Cream/warm-off-white canvas. Never `#FFF` as a page background, never a cool gray, never a gradient as a background.
3. **Editorial restraint.** More whitespace than feels comfortable, fewer elements than feel necessary. A pricing page is the single highest-temptation surface for decoration in the whole product — resist all of it. No glows, no gradient CTAs, no card tilt on hover, no confetti, no animated blobs.
4. **Cultural specificity.** `₹` always, Indian digit grouping (`₹1,80,000` — lakh/crore grouping via `Intl.NumberFormat("en-IN")`), Indian city names in examples, WhatsApp-friendly phrasing.

### 0.4 Token names differ between the two repos — do not mix them

This is the single most likely source of a broken build. They are **not** the same variables.

**Landing page** (`Vyavasth-landing-page/app/globals.css`):

```
--color-bg: #f5ede0        --color-primary: #2a2218     --color-accent: #c25a3a
--color-surface: #fbf8f1   --color-muted: #7a6f63       --color-accent-deep: #a8442a
--color-surface-2: #ede3d3 --color-faint: #b5ada4       --color-accent-soft: #f7e8e3
--color-line: #ddd4c4      --color-line-strong: #c4b9a8
--color-success: #2e7d52   --color-success-soft: #e8f5ee
--max-w: 1240px            --gutter: clamp(20px, 4vw, 56px)
--shadow-subtle / --shadow-raised / --shadow-floating
```

**App** (`delivery-promotional-page/frontend/app/globals.css`):

```
--color-brand-navy: #C25A3A          (terracotta — the name is legacy, ignore it)
--color-brand-navy-deep: #A8442A
--color-brand-navy-soft: #F7E8E3
--color-brand-ink: #2A2218           --color-brand-muted: #7A6F63
--color-brand-bg: #FAFAF8            --color-brand-surface: #EDE3D3
--color-brand-surface-raised: #FFFFFF
--color-brand-border: #DDD4C4        --color-brand-outline: #C4B9A8
--color-brand-success: #2E7D52       --color-brand-success-soft: #E8F5EE
--color-brand-warning: #B45309       --color-brand-warning-soft: #FEF3E2
--color-brand-danger:  #C0392B       --color-brand-danger-soft:  #FDECEA
```

The app also ships useful utility classes in `globals.css`: `.dash-rise`, `.dash-fade`, `.dash-stagger`, `.skeleton`, `.brand-focus`. **Use `.brand-focus` for every focusable control you add** — do not hand-roll focus rings.

Typeface in both: **Plus Jakarta Sans** only (`--font-jakarta` / `--font-plus-jakarta`). No second typeface anywhere in this work.

### 0.5 Money rules

- Every price the backend returns is **rupees (₹), GST-inclusive, 2-decimal `Number`**. Never paise.
- **Never add tax on top of a displayed price.** The number shown *is* the number charged. GST is reverse-calculated onto the invoice by the backend.
- Paise exists in exactly one place in the frontend: the `amount` field you hand to Razorpay Checkout.js, which is `Math.round(rupees * 100)`. Nowhere else.
- Display: `new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })` for whole-rupee headline prices; keep 2 decimals only where the amount actually has paise (proration charges do). Always `tabular-nums` on any number that changes live.

### 0.6 Language

Say "storage plan" and "pay per event" in the UI. `Monthly`, `Yearly`, `Event-based`, `Free` are **backend enum values** — branch on them in code, never print them raw.

---

## 1. Verified backend API contract

Base URL: `NEXT_PUBLIC_API_BASE_URL` (app) / `VYAVASTH_API_BASE_URL` (landing, server-side only).
Auth: stateless JWT, `Authorization: Bearer <token>`. **No cookies are sent to the API** (`credentials: false`), even though the app stores its token in a client-readable cookie.
Error envelope on every failure: `{ success: false, message: string }`. The app's `lib/api.ts` `request()` already unwraps `message` into `ApiError.message` and exposes `ApiError.status` — reuse it, do not write a second fetch wrapper.

### 1.1 `GET /billing/plans` — public, no auth

```jsonc
{
  "currency": "INR",
  "plans": [
    {
      "_id": "…",
      "name": "Studio 150",              // may be null/undefined on older docs
      "description": "…",                // (§12) added by B2
      "service_type": "Free" | "Event-based" | "Monthly" | "Yearly",
      "billing_interval": "one_time" | "monthly" | "yearly",  // OPTIONAL in schema — may be absent
      "price": 1800,                     // ₹, GST-inclusive. Meaningful for Monthly/Yearly.
      "event_unit_price": 299,           // ₹ per event. Meaningful for Event-based.
      "storage_limit": 150,              // GB. Meaningful for Monthly/Yearly.
      "included_events": 2,              // (§12) added by B3 — Free plan's starting allowance
      "qr_limit": 25,
      "features": ["…", "…"]
    }
  ]
}
```

Returns **every** active `source: "DH"` Service, already sorted by `sort_order` ascending — including the `Free` plan. Filtering by `service_type` is your job.

**Notes that matter:**
- `billing_interval` has **no default and is not required** in the Mongoose schema. Never trust it alone. Always derive: `interval = p.billing_interval ?? (p.service_type === "Yearly" ? "yearly" : p.service_type === "Monthly" ? "monthly" : "one_time")`.
- `included_events` is metadata for display only. **Never treat it as an entitlement.** The enforced cap is always `Subscription.limit` from `GET /billing/subscription`.
- Both `description` and `included_events` are added by §12 (B2, B3). Code defensively anyway — `description` may be null on older Service docs, and `included_events` is null on everything except the Free plan.

### 1.2 `GET /billing/coupons/public` — public, no auth

```jsonc
{ "coupons": [ { "code": "LAUNCH20", "percent_off": 20, "valid_until": 1790000000000 } ] }
```

`valid_until` is epoch **milliseconds**. Empty array is the normal case — the UI must be invisible when there are none.

### 1.3 `GET /billing/subscription` — auth + (`role === "admin"` OR `billing_user === true`)

Two shapes, discriminated by the plan family. Both share this base:

```jsonc
{
  "status": "active" | "pending_payment" | "past_due" | "suspended" | "cancelled" | "expired",
  "service": { "_id": "…", "name": "…", "service_type": "…", "billing_interval": "…" } | null,
  "current_period_start": 1780000000000 | null,   // epoch ms
  "current_period_end":   1782600000000 | null,
  "cancel_at_period_end": false,

  "grace_until": 1783000000000 | null,   // (§12) B1 — end of the dunning window while past_due
  "suspend_at":  null,                   // (§12) B1 — when read-only mode began
  "delete_at":   null                    // (§12) B1 — when archived galleries are purged (suspend + 7d)
}
```

**Free / Event-based** additionally:
```jsonc
{ "limit": 7, "used": 4, "remaining": 3 }        // event COUNTS
```

**Monthly / Yearly** additionally:
```jsonc
{ "storage": { "limit": 150, "used": 62.4, "remaining": 87.6 } }   // GB
```

Failures: `404 { message: "No active subscription found" }` · `403 { message: "Access denied. Contact your administrator." }`

### 1.4 `POST /billing/coupons/validate` — auth + billing access

Request `{ coupon_code, service_id, quantity? }`.

**Both outcomes return HTTP 200** — branch on `valid`, never on status code:

```jsonc
{ "valid": true, "discount_amount": 360, "tax_amount": 219.66, "final_amount": 1440 }
{ "valid": false, "message": "Coupon is not valid for this purchase" }
```

`404` only when `service_id` doesn't resolve.

### 1.5 `POST /billing/checkout` — auth + billing access — **the one that needs care**

Request: `{ service_id: string, quantity?: number (int ≥ 1), coupon_code?: string }`.

The 200 response is a **discriminated union with six branches**. Narrow it in exactly this order:

```ts
type CheckoutResponse =
  | { status: "scheduled"; message: string; effective_at: number }                              // (F)
  | { razorpay_order_id: string; amount: number; razorpay_subscription_id: string; key_id: string } // (C)/(E)
  | { razorpay_order_id: string; amount: number; key_id: string }                                // (A)/(D)
  | { razorpay_subscription_id: string; short_url: string; key_id: string };                     // (B)
```

| # | Situation | Response fields | What the UI does |
|---|---|---|---|
| A | Event top-up (`quantity × event_unit_price`) | `razorpay_order_id`, `amount`, `key_id` | Checkout.js with `order_id` |
| B | Free/Event-based → Monthly/Yearly, **no coupon** | `razorpay_subscription_id`, `short_url`, `key_id` | Checkout.js with `subscription_id`; `short_url` is the fallback |
| C | Free/Event-based → Monthly/Yearly, **with coupon** | `razorpay_order_id`, `amount`, `razorpay_subscription_id`, `key_id` (no `short_url`) | Checkout.js with `order_id` |
| D | Same-interval tier upgrade (75→150 GB) | `razorpay_order_id`, `amount`, `key_id` | Checkout.js with `order_id`. `amount` is the **prorated difference**, not the full price. |
| E | Monthly → Yearly interval upgrade | `razorpay_order_id`, `amount`, `razorpay_subscription_id`, `key_id` | Checkout.js with `order_id`. `amount` is net of unused credit. |
| F | Downgrade (lower price same interval, or Yearly → Monthly) | `status: "scheduled"`, `message`, `effective_at` | **No payment at all.** Confirmation screen. |

**Narrowing rule, in order:** `if ("status" in res && res.status === "scheduled")` → F. `else if (res.razorpay_order_id)` → open Checkout.js on the **order**, even when `razorpay_subscription_id` is also present. `else` → subscription checkout on `razorpay_subscription_id`.

**Errors** (all `{ success: false, message }`):

| Status | `message` | When |
|---|---|---|
| `400` | `"The Free plan cannot be purchased directly"` | target is Free |
| `400` | `"You are already on this plan"` | same price, same interval |
| `400` | `"Coupon is not valid for this purchase"` | coupon rejected at redeem time |
| `400` | `"No upgrade charge due (insufficient time remaining in the current cycle)"` | tier upgrade with ~0 days left |
| `402` | `"No active subscription found — contact support before topping up."` | fully lapsed + Event-based target |
| `403` | `"Access denied. Contact your administrator."` | not admin / not `billing_user` |
| `404` | `"Service not found"` | bad or inactive `service_id` |
| `409` | `"Cannot switch from a Monthly/Yearly plan to Event-based"` | the hard rule |
| `500` | `"Current subscription is missing period details"` | data problem — show generic "Something went wrong, contact support" |

Surface `ApiError.message` verbatim for `400/402/409` — the backend copy is already user-facing and correct. Do not rewrite it, do not append "Please try again".

### 1.6 `POST /billing/subscription/cancel` — auth + billing access

No body. Turns **auto-renew off**; access continues to period end.
`200 { status: "cancelled", runs_until: number | null }` · `400 { message: "No active paid subscription to cancel" }`

### 1.6b `POST /billing/subscription/resume` — **new, built in §12 (B4)**

No body. Undoes a cancel: registers a fresh mandate that picks up at `current_period_end`. **Charges nothing now** — the current period is already paid for.

`200 { razorpay_subscription_id, short_url, key_id }` — the user completes a mandate-authorisation handshake, no payment. Then poll as usual (§7.6), waiting for `cancel_at_period_end === false`.
`400 { message: "No cancelled subscription to resume" }` when `cancel_at_period_end` is not set.

### 1.7 `GET /billing/invoices` / `GET /billing/invoices/:id`

```jsonc
{ "invoices": [ { "_id","invoice_number","company_id","subscription_id","payment_order_id",
                  "line_items":[{ "description","service_type","quantity","unit_price","amount" }],
                  "subtotal", "tax_lines":[{ "type":"CGST"|"SGST"|"IGST","percent","amount" }],
                  "total", "buyer_legal_name","buyer_gstin","seller_gstin","place_of_supply","currency",
                  "pdf_key","issued_at","status":"issued"|"void","createdAt","updatedAt" } ] }
```

`GET /billing/invoices/:id` → `{ invoice, pdf_url }`. **`pdf_url` is a short-lived presigned R2 URL.** Fetch it on click, open it, and throw it away. Never store it in state, never render it into an `href` at list-render time, never cache it.

### 1.8 The 402s you will meet elsewhere in the app

| Where | `message` |
|---|---|
| Creating an event past the cap | `"You have reached the maximum number of events for your current plan. Upgrade to create more."` |
| Any write while suspended | `"Your subscription is suspended. Renew to restore access."` |

Note: the suspension middleware (`enforceSubscriptionState`) exists but is **not yet mounted on any route**. Build the handling anyway — it must degrade gracefully today and light up the day it's wired.

### 1.9 The entitlement race — read this twice

**Razorpay's webhook grants entitlement. The client-side `handler` callback does not.** When Checkout.js calls your `handler`, the money is captured but the backend may not have processed `payment.captured` yet. `GET /billing/subscription` will still show the old plan for anywhere between a few hundred milliseconds and (rarely) a minute.

Therefore: **never** navigate straight to a "you're on the new plan!" screen from `handler`. Always go through the polling confirmation screen in §7.6. Getting this wrong produces the worst possible bug — a user who paid and is told they didn't.

---

## 2. Deliverables at a glance

### Landing page (`Vyavasth-landing-page/`)
```
app/pricing/page.tsx                 server component — fetches, renders shell + metadata
components/pricing/PricingClient.tsx "use client" island — all interactivity
components/pricing/ModeSwitch.tsx    Pay per event ↔ Storage plan
components/pricing/EventQuantity.tsx stepper + presets + live total
components/pricing/StorageSlider.tsx discrete snapping slider over derived tiers
components/pricing/IntervalToggle.tsx Monthly ↔ Yearly (+ savings badge)
components/pricing/PlanSummary.tsx   price, features, CTA
components/pricing/CouponRibbon.tsx  universal coupons (renders nothing when empty)
components/pricing/PricingFaq.tsx    static copy
lib/plans.ts                         PURE derivation module  ← copy A
lib/vyavasth-api.ts                  + getPlans(), getPublicCoupons()
components/Nav.tsx                   + "Pricing" link
components/Footer.tsx                + "Pricing" link
```

### App (`delivery-promotional-page/frontend/`)
```
lib/plans.ts                                  PURE derivation module  ← copy B (identical to A)
lib/billing.ts                                API client (uses the existing request() in lib/api.ts)
lib/billing-types.ts                          types for everything in §1
lib/razorpay.ts                               script loader + openCheckout() wrapper
components/billing/SubscriptionProvider.tsx   one fetch, app-wide status
components/billing/PlanChooser.tsx            shared chooser (used by /checkout AND the upgrade sheet)
components/billing/StorageSlider.tsx          app-themed twin of the landing slider
components/billing/EventQuantity.tsx          app-themed twin
components/billing/CouponField.tsx            enter → validate → applied/rejected
components/billing/CheckoutSummary.tsx        line items + total
components/billing/ConfirmingPayment.tsx      the polling screen (§7.6)
components/billing/UpgradeSheet.tsx           Drawer-based in-app upgrade/top-up
components/billing/SubscriptionBanner.tsx     past_due / suspended / cancelled
components/billing/UsageMeter.tsx             count-based OR storage-based
components/billing/PlanStatusCard.tsx         current plan summary
components/billing/InvoiceList.tsx            table + download
app/(dashboard)/checkout/page.tsx             the deep-link landing + payment
app/(dashboard)/dashboard/settings/billing/page.tsx
app/(dashboard)/dashboard/settings/SettingsNav.tsx   + "Plan & Billing" entry
app/(dashboard)/login/page.tsx                honour ?next= (verify current behaviour first)
components/dashboard/AddEventModal.tsx        catch 402 → UpgradeSheet
```

---

## 3. The pricing model, in UI terms

Two mutually exclusive **parent options**, presented as a segmented control at the top of the page:

**① Pay per event** — one-off, arbitrary quantity. Backed by the single `Event-based` Service. Price = `quantity × event_unit_price`. Credits are cumulative and never expire while the account is active. Every studio starts on `Free` with 2 events; the first top-up flips them to Event-based and the 2 free events carry over.

**② Storage plan** — recurring. Backed by the `Monthly` and `Yearly` Services. Unlimited events, capped by GB of storage. Has its own Monthly ↔ Yearly interval toggle and a **discrete slider across storage tiers**.

The **one-way door** the UI must communicate up front: once you are on a storage plan you cannot go back to pay-per-event. Say it plainly and once, on the storage tab, in muted text near the CTA: *"Storage plans can be changed or cancelled anytime, but can't be switched back to pay-per-event."* Do not bury it in an FAQ; do not repeat it three times.

---

## 4. `lib/plans.ts` — the pure derivation module (identical in both repos)

This module is the whole reason the pricing page stays correct when someone adds a 500 GB plan through `POST /billing/admin/services`. **No component may filter or sort plans inline.** Everything goes through here.

```ts
// lib/plans.ts — PURE. No React, no fetch, no env. Identical byte-for-byte in
// Vyavasth-landing-page/lib/plans.ts and delivery-promotional-page/frontend/lib/plans.ts.
// If you change one, change the other in the same commit.

export type ServiceType = "Free" | "Event-based" | "Monthly" | "Yearly";
export type BillingInterval = "one_time" | "monthly" | "yearly";

export type Plan = {
  _id: string;
  name?: string | null;
  service_type: ServiceType;
  billing_interval?: BillingInterval | null;
  price?: number | null;
  event_unit_price?: number | null;
  storage_limit?: number | null;
  qr_limit?: number | null;
  features?: string[] | null;
};

/**
 * `billing_interval` is optional in the backend schema (no default, not
 * required) — older Service documents may not have it. service_type is
 * required, so derive from it and treat billing_interval as a hint only.
 */
export function intervalOf(p: Plan): BillingInterval {
  if (p.service_type === "Yearly") return "yearly";
  if (p.service_type === "Monthly") return "monthly";
  return "one_time";
}

export type StorageTier = {
  storage_limit: number;        // GB
  monthly: Plan | null;
  yearly: Plan | null;
};

/**
 * Every distinct storage_limit across active Monthly/Yearly plans, ascending.
 * A tier exists if EITHER interval offers it — so the slider track keeps the
 * same stops when the user toggles Monthly ↔ Yearly, and a tier that only
 * exists on one interval renders as an unavailable stop rather than silently
 * reshaping the track.
 *
 * Adding a new Service with a new storage_limit adds a stop automatically.
 * Nothing here is hardcoded.
 */
export function buildStorageTiers(plans: Plan[]): StorageTier[] {
  const storage = plans.filter(
    (p) =>
      (p.service_type === "Monthly" || p.service_type === "Yearly") &&
      typeof p.storage_limit === "number" &&
      p.storage_limit > 0 &&
      typeof p.price === "number" &&
      p.price > 0,
  );

  const limits = Array.from(new Set(storage.map((p) => p.storage_limit as number)))
    .sort((a, b) => a - b);

  return limits.map((gb) => ({
    storage_limit: gb,
    monthly: storage.find((p) => p.storage_limit === gb && intervalOf(p) === "monthly") ?? null,
    yearly:  storage.find((p) => p.storage_limit === gb && intervalOf(p) === "yearly")  ?? null,
  }));
}

export function planForTier(tier: StorageTier, interval: "monthly" | "yearly"): Plan | null {
  return interval === "monthly" ? tier.monthly : tier.yearly;
}

/** Nearest tier (by index) that HAS a plan for `interval`. Used when toggling
 *  interval would land on an unavailable stop. Prefers the lower tier on a tie. */
export function nearestAvailableIndex(
  tiers: StorageTier[],
  from: number,
  interval: "monthly" | "yearly",
): number {
  if (planForTier(tiers[from], interval)) return from;
  for (let d = 1; d < tiers.length; d++) {
    const lo = from - d;
    const hi = from + d;
    if (lo >= 0 && planForTier(tiers[lo], interval)) return lo;
    if (hi < tiers.length && planForTier(tiers[hi], interval)) return hi;
  }
  return from;
}

/** The one Event-based plan. Backend sorts by sort_order, so first wins. */
export function eventPlanOf(plans: Plan[]): Plan | null {
  return (
    plans.find(
      (p) =>
        p.service_type === "Event-based" &&
        typeof p.event_unit_price === "number" &&
        p.event_unit_price > 0,
    ) ?? null
  );
}

export function freePlanOf(plans: Plan[]): Plan | null {
  return plans.find((p) => p.service_type === "Free") ?? null;
}

/** Whole percent saved by paying yearly vs 12× monthly. null when incomparable. */
export function yearlySavingsPercent(tier: StorageTier): number | null {
  const m = tier.monthly?.price;
  const y = tier.yearly?.price;
  if (typeof m !== "number" || typeof y !== "number" || m <= 0 || y <= 0) return null;
  const pct = Math.round((1 - y / (m * 12)) * 100);
  return pct > 0 ? pct : null;
}

/** 150 → "150 GB" · 1024 → "1 TB" · 1536 → "1.5 TB" */
export function formatStorage(gb: number): string {
  if (gb >= 1024) {
    const tb = gb / 1024;
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB`;
  }
  return `${gb} GB`;
}

export function formatInr(amount: number, opts?: { paise?: boolean }): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: opts?.paise ? 2 : 0,
    maximumFractionDigits: opts?.paise ? 2 : 0,
  }).format(amount);
}

/** Display label for a plan — never print the raw enum. */
export function planLabel(p: Plan): string {
  if (p.name) return p.name;
  if (p.service_type === "Event-based") return "Pay per event";
  if (p.service_type === "Free") return "Free";
  if (typeof p.storage_limit === "number") {
    return `${formatStorage(p.storage_limit)} · ${p.service_type === "Yearly" ? "Yearly" : "Monthly"}`;
  }
  return p.service_type;
}
```

**Unit-test this module** (see §11). It is the only place in the frontend with real logic.

---

## 5. The storage slider — exact interaction spec

This is the centrepiece. Get it exactly right.

### 5.1 It is an index slider, not a value slider

```tsx
<input
  type="range"
  min={0}
  max={tiers.length - 1}
  step={1}
  value={index}
  onChange={(e) => setIndex(Number(e.target.value))}
  aria-label="Storage plan"
  aria-valuetext={`${formatStorage(tiers[index].storage_limit)} — ${priceLabel}`}
  list="storage-tiers"
/>
```

Because the range's own value is the **array index with `step={1}`**, snapping is free and exact: the thumb can only ever rest on a real plan. There is no `onMouseUp` rounding, no nearest-value search on drag end, no intermediate GB value that doesn't correspond to a Service. Do not implement a continuous slider and snap afterwards — it will produce off-by-one flicker and a thumb that visibly jumps.

Because stops come from `buildStorageTiers(plans)`, **adding a 500 GB Service in the DB adds a stop with no code change.**

### 5.2 Track and ticks

- Render tick marks at each stop, positioned at `index / (tiers.length - 1) * 100%`. The stops are **evenly spaced by index**, not proportional to GB. 75/150/300 GB gives three evenly spaced stops — this is correct and intended; proportional spacing would crush the low tiers.
- Filled portion of the track (left of thumb) is `--color-accent` / `--color-brand-navy`. Unfilled is `--color-line` / `--color-brand-border`. Track height 4px, radius full. Thumb 20px, accent fill, 2px cream ring, `--shadow-subtle`.
- Tick labels under each stop: `formatStorage(tier.storage_limit)`. The selected one goes ink + semibold; the rest muted + regular.
- **Mobile (< 640px):** labels will collide. Show only first / selected / last, or rotate to a vertical stack of tappable tier chips instead of a slider. A slider you can't read is worse than a list. Pick the chips.

### 5.3 Unavailable stops

A tier where `planForTier(tier, interval) === null` (e.g. 500 GB exists monthly but not yearly):

- The stop stays on the track (track shape must not change when toggling interval).
- Its tick label renders at `--color-faint` with a hairline strike or a small "—" beneath.
- Landing on it via drag/keyboard is allowed; the summary then shows *"Not available on yearly billing"* with the CTA disabled and a one-tap "Switch to monthly" link.
- **Toggling interval never leaves the user stranded:** on toggle, run `nearestAvailableIndex(tiers, index, nextInterval)`. If it moves, animate the thumb (180ms `cubic-bezier(0.2, 0.7, 0.3, 1)`) and show a quiet inline note: *"Moved to the closest yearly plan."* Do not use a toast, do not use an alert.

### 5.4 Keyboard & a11y

Native `<input type="range">` gives you ←/→/↑/↓ (±1 index), Home/End, PageUp/PageDown for free. Do not reimplement with divs and pointer events.

- `aria-valuetext` must announce the human string, not the index: `"150 GB — ₹1,800 per month"`.
- Visible focus via `.brand-focus` (app) or the landing page's `focus-visible:ring-2 ring-[var(--color-accent)]/50` idiom.
- Touch target ≥ 44px: give the input a transparent 44px-tall hit area even though the visible track is 4px.
- `prefers-reduced-motion`: both repos already zero out transitions globally. Do not add JS-driven animation that bypasses it.

### 5.5 Degenerate cases

| Case | Behaviour |
|---|---|
| `tiers.length === 0` | Hide the storage tab entirely. If Event-based is also missing, render the "pricing is being updated — talk to us" empty state (§9.4). |
| `tiers.length === 1` | No slider. Render the single tier as a plain card. |
| `tiers.length === 2` | Slider is fine, but consider two side-by-side cards — decide by eye at implementation time and keep it consistent between repos. |

### 5.6 Default selection

Second tier if one exists (`Math.min(1, tiers.length - 1)`), else the first. Default interval: `"yearly"` when any tier shows a positive `yearlySavingsPercent`, else `"monthly"`. On the app side, if the studio already has a storage plan, **default to their current tier** and mark it "Current plan".

---

## 6. Landing page — `vyavasth.in/pricing`

### 6.1 Data fetching

`app/pricing/page.tsx` is a **server component**. Fetch both endpoints there, in parallel, with revalidation — this gives SSR'd prices for SEO and keeps the API base URL server-side.

Add to `lib/vyavasth-api.ts`, matching its existing style (returns a discriminated `{ ok }` result, never throws):

```ts
export async function getPlans(): Promise<
  { ok: true; data: { currency: string; plans: Plan[] } } | { ok: false; error: string }
>;
export async function getPublicCoupons(): Promise<
  { ok: true; data: { coupons: PublicCoupon[] } } | { ok: false; error: string }
>;
```

Use `fetch(url, { next: { revalidate: 300 } })`. **Check `node_modules/next/dist/docs/` for the current caching/revalidation API before writing this** — the defaults changed in this version.

The server component renders `<Nav />`, the hero/heading, `<PricingClient plans={plans} coupons={coupons} />`, `<PricingFaq />`, `<Footer />`. All interactivity lives inside `PricingClient` (`"use client"`).

### 6.2 Page structure

```
Nav
─────────────────────────────────────────
Eyebrow "PRICING"                          ← reuse components/Eyebrow.tsx
H1  "Pay for what you deliver."
Sub "Start free with 2 events. Buy more when you need them, or move
     to a storage plan when you're delivering every week."
CouponRibbon                               ← renders null when no coupons
─────────────────────────────────────────
ModeSwitch    [ Pay per event | Storage plan ]
─────────────────────────────────────────
  ┌ Pay per event ────────────────────┐   ┌ Storage plan ─────────────────────┐
  │ presets 1 / 5 / 10 / 25           │   │ IntervalToggle  Monthly | Yearly   │
  │ −  [ 5 ]  +   stepper             │   │           ·Save 20%·               │
  │                                   │   │ StorageSlider  ●━━━━━━━━━━         │
  │ ₹1,495                            │   │  75GB  150GB  300GB               │
  │ 5 events × ₹299                   │   │                                   │
  │ ✓ never expires  ✓ all features   │   │ ₹1,800 /month                     │
  │                                   │   │ 150 GB · unlimited events         │
  │ [ Continue → ]                    │   │ [ Continue → ]                    │
  └───────────────────────────────────┘   └───────────────────────────────────┘
─────────────────────────────────────────
Comparison strip (what's in every plan)
PricingFaq  (GST-inclusive · what happens at the cap · switching · cancelling)
CtaSection (existing component)
Footer
```

Both panels stay mounted; hide with CSS rather than unmounting, so switching tabs doesn't lose the user's quantity or tier. Cross-fade 160ms.

### 6.3 Event quantity control

- Presets `1 / 5 / 10 / 25` as pill buttons; selected pill = accent fill, white text. Custom quantities deselect all pills.
- `−` / `+` stepper flanking a numeric input. Input is `inputMode="numeric"`, clamps to `[1, 100]` **on blur, not on keystroke** (so the user can clear the field and retype).
- Soft cap 100 with a muted line: *"Delivering more than 100 events? [Talk to us]"* linking to `openEnquiry()` from the existing `EnquiryProvider`.
- Total updates instantly: `formatInr(qty * event_unit_price)`, `tabular-nums`, 150ms opacity transition on change. **No count-up animation** — that reads as gimmick on a price.
- Under the total, always: *"GST included. One-time payment — credits never expire."*

### 6.4 Interval toggle

Two-segment pill. When any tier saves money yearly, put a small terracotta badge on the Yearly segment: `Save {maxSavings}%` where `maxSavings = Math.max(...tiers.map(yearlySavingsPercent))`. On the selected yearly tier, show under the price: *"₹{yearly.price / 12 formatted}/month, billed yearly"*. Compute per-tier, don't reuse the max.

### 6.5 The CTA — deep link to the app

```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://deliver.vyavasth.in";
const qs = new URLSearchParams({ plan: selected._id });
if (mode === "event" && qty > 1) qs.set("qty", String(qty));
if (appliedCoupon) qs.set("coupon", appliedCoupon);
const href = `${appUrl}/checkout?${qs}`;
```

Add `NEXT_PUBLIC_APP_URL` to the landing repo's env. Render as a real `<a href>` (right-click / open-in-new-tab must work), not a JS navigation.

**Only non-sensitive values cross the domain boundary** — a Mongo `_id`, an integer, a coupon code. No token, no email, no phone, no name. Ever.

### 6.6 Coupon ribbon

If `coupons.length === 0`, render `null` — no empty state, no placeholder. Otherwise a single restrained line above the mode switch, in `--color-accent-soft` with a hairline border:

> **LAUNCH20** — 20% off your first payment · ends 12 Aug

Click copies the code and passes it into the deep link. Copy feedback: swap the label to "Copied" for 1.5s. No toast library.

### 6.7 Metadata & SEO

```ts
export const metadata: Metadata = {
  title: "Pricing — Vyavasth",
  description: "Pay per event or pick a storage plan. Start free with 2 events. GST included, no hidden fees.",
  alternates: { canonical: "/pricing" },
  openGraph: { /* mirror app/layout.tsx's shape */ },
};
```

Emit a `Product` + `AggregateOffer` JSON-LD block built from the fetched plans, mirroring the `dangerouslySetInnerHTML` pattern already used in `app/page.tsx`. `priceCurrency: "INR"`, `lowPrice` = cheapest plan, `highPrice` = dearest.

### 6.8 Nav & Footer

Add `{ label: "Pricing", href: "/pricing" }` to `NAV_LINKS` in `components/Nav.tsx` (it belongs after "Features"), to the mobile drawer, and to the Footer's link list. Keep "Book a demo" as the primary nav CTA — pricing is a link, not a button.

---

## 7. App — `deliver.vyavasth.in`

### 7.1 `lib/billing.ts`

Thin wrappers over the **existing** `request()` in `lib/api.ts`. Do not create a second fetch layer — `request()` already handles the bearer token, `cache: "no-store"`, 401 → `clearToken()`, and `ApiError` with `.status`/`.message`/`.body`.

`lib/api.ts` currently keeps `request()` module-private. Either export it, or (cleaner, and consistent with how the file is organised today) add the billing functions to `lib/api.ts` and re-export them from `lib/billing.ts`. Pick one; don't duplicate `request()`.

```ts
export function getBillingPlans(): Promise<PlansResponse>;                    // auth:false
export function getPublicCoupons(): Promise<{ coupons: PublicCoupon[] }>;     // auth:false
export function getSubscription(): Promise<SubscriptionSnapshot>;
export function validateCoupon(i: { coupon_code: string; service_id: string; quantity?: number }): Promise<CouponValidation>;
export function checkout(i: { service_id: string; quantity?: number; coupon_code?: string }): Promise<CheckoutResponse>;
export function cancelSubscription(): Promise<{ status: "cancelled"; runs_until: number | null }>;
export function listInvoices(): Promise<{ invoices: Invoice[] }>;
export function getInvoice(id: string): Promise<{ invoice: Invoice; pdf_url: string }>;
```

Every function gets a JSDoc comment naming the endpoint and its failure modes — that is the house style in `lib/api.ts`, and it is genuinely load-bearing here given the six-branch union.

### 7.2 `lib/razorpay.ts`

```ts
/** Loads https://checkout.razorpay.com/v1/checkout.js exactly once. Resolves
 *  when window.Razorpay is available; rejects if the script fails (blocked,
 *  offline). Callers fall back to `short_url` when available. */
export function loadRazorpay(): Promise<RazorpayConstructor>;

export type OpenCheckoutArgs = {
  keyId: string;
  orderId?: string;          // mutually exclusive with subscriptionId at the call site
  subscriptionId?: string;
  amountRupees?: number;     // display only when orderId is set
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (r: { razorpay_payment_id: string }) => void;
  onDismiss: () => void;
};
export function openCheckout(a: OpenCheckoutArgs): Promise<void>;
```

Options handed to `new window.Razorpay({...})`:

```js
{
  key: keyId,
  ...(orderId ? { order_id: orderId, amount: Math.round(amountRupees * 100), currency: "INR" }
              : { subscription_id: subscriptionId }),
  name: "Vyavasth",
  description,                              // e.g. "5 events" / "150 GB · Monthly"
  image: "/vyavasth-icon.svg",
  prefill,
  theme: { color: "#C25A3A" },              // the one accent, hardcoded — Razorpay can't read CSS vars
  handler: (r) => onSuccess(r),
  modal: { ondismiss: onDismiss, confirm_close: true, escape: true },
}
```

- Load the script **lazily, only on `/checkout` and when the UpgradeSheet opens.** It must not be in the dashboard's critical path.
- `Math.round(rupees * 100)` is the **only** place paise appears. The order amount is authoritative server-side; this field is display-only, but it must still match or Razorpay complains.
- If `loadRazorpay()` rejects and a `short_url` is present, offer a plain link: *"Open secure payment page →"*. If there's no `short_url`, show the failure state with a retry.

### 7.3 `SubscriptionProvider`

Mount inside the dashboard chrome, **alongside** the existing `ChromeProvider` — not replacing it.

```ts
type SubscriptionState = {
  snapshot: SubscriptionSnapshot | null;
  loading: boolean;
  /** false when GET /billing/subscription returned 403 — the user is neither
   *  admin nor billing_user. Hide all billing UI; do NOT show an error. */
  hasBillingAccess: boolean;
  refresh: () => Promise<SubscriptionSnapshot | null>;
};
```

**Do not try to read `role` / `billing_user` from cached state to gate the UI.** The password-login response includes the full user object, but the Google-SSO callback returns only a token — so a cached role is not reliably available. Probing the endpoint and treating `403` as "no access" is correct, cheap, and works on both auth paths.

`404` (no subscription) → `snapshot: null`, `hasBillingAccess: true`. Render the "no plan on record — contact support" state, not an error.

Keep `ChromeContext.dlpUsage` as the source for the sidebar meter: `getDlpUsage()` has **no role gate**, so non-billing users still see their usage. The billing snapshot is additive.

### 7.4 `/checkout` — the deep-link landing

Route: `app/(dashboard)/checkout/page.tsx`. It lives in the `(dashboard)` group so it inherits the auth-aware layout, but it renders **without** the sidebar — a focused, single-purpose page.

Wrap the `useSearchParams()` consumer in `<Suspense>`, exactly as `app/(dashboard)/login/page.tsx` already does.

**Flow:**

1. **Parse** `plan` (required, Mongo ObjectId shape), `qty` (optional int ≥ 1, clamp `[1, 100]`), `coupon` (optional). A missing/garbage `plan` → render the in-app PlanChooser instead of erroring. The user came here to buy something; give them the thing.

2. **Auth gate.** No token → `router.replace('/login?next=' + encodeURIComponent('/checkout' + window.location.search))`.
   **Verify `app/(dashboard)/login/page.tsx` honours `next` before relying on it** — it already imports `useSearchParams`, but confirm it redirects to `next` (validated as a same-origin *relative path starting with `/`* — never an absolute URL, or you've built an open redirect) instead of hardcoding `/dashboard`. Extend it if needed. Do the same for the Google-SSO return path.

3. **Load** `getBillingPlans()` + `getSubscription()` in parallel. Skeleton while loading.

4. **Pre-flight guards, client-side, before any network call.** These mirror the server's rules so the user gets an instant, specific answer rather than a round-trip to a 409:
   - target `service_type === "Free"` → "The Free plan can't be purchased."
   - current is Monthly/Yearly **and** target is Event-based → the §1.5 409 copy, plus a link to the storage plans.
   - `target._id === snapshot.service._id` → "You're already on this plan." + link to billing settings.
   The server enforces all of these anyway. This is UX, not security — never rely on it alone.

5. **Summary + auto-open.** Render `<CheckoutSummary>` (plan name, quantity, unit price, coupon line, total, "GST included") and, on first mount only, auto-invoke checkout once. If the user dismisses the Razorpay modal, they are left on the summary with a **Pay ₹X** button. `useRef` guards the auto-open so a re-render never fires it twice.

6. **Call** `POST /billing/checkout` → narrow per §1.5 → branch:
   - **F (`scheduled`)** — no payment. Success screen: the server's `message` plus *"Effective {formatDate(effective_at)}"*, and a "Back to billing" button. Do **not** open Razorpay.
   - **A/C/D/E (`razorpay_order_id`)** — `openCheckout({ orderId, amountRupees: amount, ... })`.
   - **B (`razorpay_subscription_id` + `short_url`)** — `openCheckout({ subscriptionId })`, `short_url` as the fallback link.

7. **`handler` fires** → go to `<ConfirmingPayment>` (§7.6). **Never** straight to success.

8. **`ondismiss` fires** → state `"dismissed"`. Copy: *"Payment wasn't completed. You're still on {current plan name}."* + **Try again** + **Back to dashboard**. Not an error style — amber at most, ideally neutral. Abandoning a checkout is not a failure.

### 7.5 Coupon field

Live on both `/checkout` and the UpgradeSheet.

- Collapsed by default: a muted text button *"Have a coupon?"*.
- Expanded: uppercase-transforming input + **Apply**. On apply → `POST /billing/coupons/validate` with the current `service_id` + `quantity`.
- `{ valid: true }` → replace the field with an applied chip: `LAUNCH20 · −₹360` + a remove ✕. Summary gains a discount line and the total drops to `final_amount`.
- `{ valid: false }` → inline error under the field using the server's `message` (still HTTP 200 — do not treat it as a failure). Field stays, value stays, so the user can fix a typo.
- **Re-validate whenever `quantity` or the selected plan changes** — `discount_amount` is computed off the gross. If the user changes quantity with a coupon applied, silently re-run validate and update the total. Never show a stale discount.
- The coupon is still redeemed atomically server-side at checkout; a coupon that validates can still fail at `POST /billing/checkout` with `400 "Coupon is not valid for this purchase"` if it was exhausted in between. Handle that: clear the applied chip, show the message, keep the user on the summary with the undiscounted total.

### 7.6 `<ConfirmingPayment>` — the polling screen

The most important component in this build. Read §1.9 again if you skipped it.

```
Props: {
  purpose: "event_topup" | "subscription" | "tier_upgrade";
  targetServiceId: string;
  before: SubscriptionSnapshot | null;   // captured BEFORE checkout was called
  onConfirmed: (s: SubscriptionSnapshot) => void;
}
```

Behaviour:

- Poll `GET /billing/subscription` every **2s, up to 15 attempts (~30s)**.
- **Done when:**
  - `event_topup`: `snapshot.limit > before.limit` (or `before` had no `limit` and one now exists).
  - `subscription` / `tier_upgrade`: `snapshot.service?._id === targetServiceId` **and** `snapshot.status === "active"`.
- **Visual:** centred, calm. A slow terracotta pulse (reuse the app's existing loader idiom), heading *"Confirming your payment…"*, sub *"This usually takes a few seconds. Don't close this window."* Nothing spins fast, nothing flashes. **No progress bar** — you don't know the duration and a stalled bar reads as broken.
- **On confirmed:** success state — *"You're on {plan name}."* + what they got (`+N events` / `{X} GB · unlimited events`) + *"Invoice is on its way to {email}."* + **Go to dashboard**. Call `refresh()` on both `SubscriptionProvider` and `ChromeContext.refreshDlpUsage()` so the sidebar meter updates immediately.
- **On timeout (this is not an error):**
  > **Payment received.** Your plan is being activated — this usually completes within a minute. Your invoice will be emailed to you.
  > [ Check again ]  [ Go to dashboard ]

  Neutral or success styling. **Never** red, never the word "failed", never "something went wrong". The money is captured; the only thing outstanding is a webhook. Telling a paying customer their payment failed is the worst bug this feature can ship.
- Poll only while the tab is visible (`document.visibilityState`); resume on focus. Always clear the interval on unmount.

### 7.7 Billing settings page

Route `app/(dashboard)/dashboard/settings/billing/page.tsx`. Add to `SETTINGS_GROUPS` in `SettingsNav.tsx`, as its own group so it reads as a distinct concern:

```ts
{ heading: "Billing", items: [{ label: "Plan & Billing", href: "/dashboard/settings/billing" }] }
```

Place it after "Brand & Delivery", before "Your Account". Match the existing page shell — read `SettingsUI.tsx` and one existing settings page (`settings/page.tsx`) and reuse their section/card/heading primitives rather than inventing new ones.

Sections, in order:

**a) `<SubscriptionBanner>`** — only for non-`active` states. See §8.

**b) `<PlanStatusCard>`**
- Plan name (`planLabel`), plan family as a subtitle.
- Storage plans: *"Renews on {date}"* — or, when `cancel_at_period_end`, *"Access until {date}"*.
- Free/Event-based: *"No renewal — credits don't expire."*
- `formatDate` = `Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" })`. All period fields are **epoch ms**.

**c) `<UsageMeter>`** — one component, two modes, driven by which fields are present in the snapshot (see §1.3):
- Count mode: `used / limit` events, bar, `remaining` below.
- Storage mode: `storage.used / storage.limit` GB with one decimal, bar, `remaining` below.
- Bar colour from the existing `getUsageSeverity(pct)` in `lib/types.ts`: `ok` → `--color-brand-navy`, `warning` → `--color-brand-warning`, `danger` → `--color-brand-danger`. **Reuse that helper — do not re-derive thresholds.** `DlpUsageCard.tsx` is the visual reference for bar + label proportions.

**d) Change plan** — a "Change plan" / "Buy more events" button opening `<UpgradeSheet>`.
- Current plan Free/Event-based → sheet opens on the **Pay per event** tab, storage tab also available.
- Current plan Monthly/Yearly → **the pay-per-event tab is not rendered at all.** Don't show a disabled tab for something that is permanently unavailable; explain it once in muted text instead.

**e) `<CouponField>`** — only meaningful in the context of a purchase, so it lives inside the sheet, not standalone here.

**f) `<InvoiceList>`**
- Columns: Invoice # · Date · Amount · Status · Download.
- `issued_at` (fall back to `createdAt`), `formatInr(total)`, status chip (`issued` neutral, `void` muted + strikethrough).
- Download: on click → `getInvoice(id)` → `window.open(pdf_url, "_blank", "noopener")`. Per-row loading state. Presigned URL is fetched fresh every time (§1.7).
- Empty state: *"No invoices yet. They'll appear here after your first payment."*

**g) Auto-renew** — storage plans with `status === "active"` and `!cancel_at_period_end` only.
- Text button, **not** a red danger button: *"Turn off auto-renew"*.
- Confirm dialog, and be precise about consequences:
  > Your plan stays active until **{date}**. After that your dashboard becomes read-only and your galleries are archived — and permanently deleted 7 days later.
  > [ Keep auto-renew ]  [ Turn it off ]
- Copy the deletion date from `delete_at` **only if it is set**; while merely `cancelled` it is null, so compute the wording from `current_period_end` + "7 days later" as above rather than printing a date you don't have.
- On confirm → `POST /billing/subscription/cancel` → refresh → banner switches to the `cancel_at_period_end` variant.
- Once off, the card offers **"Turn auto-renew back on"** → `POST /billing/subscription/resume` (§1.6b) → mandate handshake via `openCheckout({ subscriptionId })` → `<ConfirmingPayment>` polling until `cancel_at_period_end === false`. Make clear in the copy that **nothing is charged today**: *"You've already paid through {date} — we'll just re-arm the auto-renew for after that."*

### 7.8 `<UpgradeSheet>`

Reuse the existing `components/ui/Drawer.tsx`. Contains `<PlanChooser>` (the app-side twin of the landing page's chooser — same `lib/plans.ts`, app tokens) + `<CouponField>` + `<CheckoutSummary>` + a Pay button. On pay, it runs the **exact same** checkout → narrow → Razorpay → `<ConfirmingPayment>` sequence as `/checkout`.

Extract that sequence into a shared hook, `useCheckoutFlow()`, so `/checkout` and `<UpgradeSheet>` cannot drift. This is the highest-value abstraction in the app-side work — six response branches implemented twice will diverge.

Differences from the landing chooser:
- Current plan is marked "Current plan" on its tier and pre-selected.
- Tiers below the current one show *"Takes effect at renewal"* (a downgrade) rather than a price to pay now — that's branch F.
- Tiers above show *"You'll pay {amount} now"* — but note **the exact prorated amount is only known after calling `POST /billing/checkout`** (branch D returns it in `amount`). Do not attempt to compute proration client-side; the server owns that math. Show *"Prorated for the rest of your cycle"* until the response arrives, then show the real number in the Razorpay modal and the confirmation.

### 7.9 Quota gate on event creation

`components/dashboard/AddEventModal.tsx` calls `createBooking`. Add:

```ts
catch (e) {
  if (e instanceof ApiError && e.status === 402) { openUpgradeSheet({ preset: "event" }); return; }
  /* existing handling */
}
```

Also, **pre-empt it**: `ChromeContext.dlpUsage` is already loaded app-wide. When `isCountBasedPlan(service_type)` and `remaining <= 0`, the "Add event" button should already read **"Buy more events"** and open the sheet directly — hitting a 402 should be the rare fallback, not the normal path. When `remaining <= 2`, show a muted hint under the button: *"{remaining} events left."*

### 7.10 Login / SSO `next` handling

Both auth entries must preserve and honour a `next` param:
- Password login (`app/(dashboard)/login/page.tsx`)
- Google SSO callback (backend redirects to `${FRONTEND_URL_DELIVERY_DASHBOARD}/auth/callback?token=…`)

For SSO, stash `next` in `sessionStorage` before starting the OAuth hop and read it back in the callback — the token round-trip won't carry your query string.

**Validate `next` before redirecting:** accept only strings starting with a single `/` (reject `//evil.com` and any string containing `://`). Otherwise you have an open redirect on a page users arrive at from a marketing site — exactly the shape attackers look for.

---

## 8. Subscription status → UI, exhaustively

| `status` | Banner | Tone | Copy | Blocks writes? |
|---|---|---|---|---|
| `active` | none | — | (Plan card shows "Renews on {date}") | no |
| `active` + `cancel_at_period_end` | inline, settings only | warning-soft | "Auto-renew is off. You have access until {date}." + **Turn auto-renew back on** | no |
| `pending_payment` | inline, settings only | neutral | "A payment is being confirmed. This usually takes a few seconds." | no |
| `past_due` | **app-wide sticky** | warning | "We couldn't take your renewal payment. We'll keep retrying until **{grace_until}** — update your payment method to avoid interruption." + **Fix payment** | no |
| `suspended` | **app-wide sticky, dismissible=false** | danger | "Your studio is read-only. All galleries are archived and will be **permanently deleted on {delete_at}**. Renew now to restore everything." + **Renew now** | **yes** |
| `cancelled` | app-wide sticky | warning | "Your plan ends on {date}. After that your galleries are archived and deleted 7 days later." + **Turn auto-renew back on** | no |
| `expired` | **app-wide sticky** | danger | "Your subscription has ended. Choose a plan to start again." + **Choose a plan** | **yes** |

**Read-only mode** (`suspended` / `expired`):
- Disable primary write CTAs — Add event, Upload, Publish, Delete, Settings save — with `title`/`aria-describedby` pointing at the banner reason. Reads, downloads and the billing pages stay fully usable.
- Backstop: any `402` from any endpoint → toast with the server `message` + a "Go to billing" action.
- **`enforceSubscriptionState` is already live** on every write route across `bookings` (7), `leads` (11), `deliverables` (22), `accounting` (2) and `onboarding` (2) — and correctly **absent** from `/billing` and `/auth`, so a suspended studio can still pay its way out. Those 402s are real today, not hypothetical. Build the handler properly.

**Dates:** `grace_until` and `delete_at` arrive with §12 (B1). Both are **nullable** — render the date-bearing clause only when the value is non-null, and fall back to the dateless phrasing ("we'll keep retrying over the next few days", "will be permanently deleted") otherwise. **Never** substitute `current_period_end` for `delete_at`; they are different moments and a wrong deletion date is worse than no date.

---

## 9. State matrix — every component, every state

Nothing ships with only a happy path.

### 9.1 Loading
- Landing: SSR'd, so the first paint has real prices. No skeleton needed on the server path; the client island hydrates with data already in props.
- App: `.skeleton` blocks matching the final layout's height (see `DlpUsageCard`'s `h-[88px]` idiom). No spinners for page loads. Never a layout shift when data lands.

### 9.2 Error
- Landing `getPlans` fails → the pricing section renders a quiet fallback: *"We're having trouble loading prices right now."* + **Book a demo** (existing `openEnquiry`). The rest of the page still renders. Never a blank page.
- App fetch fails → inline error card with **Retry**. Never a full-page error for a settings sub-page.

### 9.3 Empty
- No coupons → ribbon renders `null`.
- No invoices → §7.7(f) copy.
- No storage tiers → hide the storage tab.
- No Event-based plan → hide the pay-per-event tab.

### 9.4 Nothing at all
Both tabs empty (misconfigured catalog): *"We're updating our pricing. Talk to us and we'll sort you out."* + demo CTA. Never render a broken slider with zero stops.

### 9.5 Disabled / unavailable
- Tier not offered on the selected interval → §5.3.
- Downgrade target → CTA reads **"Schedule change"**, not "Pay".
- Already on this plan → CTA disabled, label "Current plan".

### 9.6 In-flight
Every button that fires a network call: disabled + label change (`Pay ₹1,800` → `Opening payment…`), and **guarded against double-submit with a ref**, not just the disabled attribute. A double-fired checkout creates two Razorpay orders.

---

## 10. Accessibility

- Mode switch and interval toggle: `role="tablist"` / `role="tab"` with `aria-selected`, arrow-key navigation between tabs, panels wired via `aria-controls`/`aria-labelledby`.
- Slider: native `<input type="range">`, meaningful `aria-valuetext` (§5.4).
- Live price: wrap the total in `aria-live="polite"` so screen readers announce changes. Announce the *total*, not every intermediate keystroke — debounce 300ms.
- Razorpay modal: focus returns to the triggering button on dismiss.
- Drawer/dialog: focus trap, Escape closes, `aria-modal="true"`. `Drawer.tsx` may already handle this — read it before adding your own.
- Contrast: every price, label and tick must clear WCAG AA (4.5:1) against its warm background. `--color-faint` (#b5ada4) on cream **fails** for body text — use it for decorative rules and disabled ticks only, never for anything that must be read.
- Touch targets ≥ 44×44 on stepper buttons, preset pills, slider thumb, tick labels.
- Full keyboard walk-through: Tab reaches every control in visual order; nothing is mouse-only.

---

## 11. Testing & verification

**Unit-test `lib/plans.ts`** — it is pure, so this is cheap and it is where correctness actually lives:

- `buildStorageTiers`: unsorted input → ascending tiers; duplicate `storage_limit` across Monthly+Yearly → **one** tier with both slots filled; a tier with only Monthly → `yearly: null`; plans missing `price`/`storage_limit` are excluded; a plan with `billing_interval` absent still lands in the right slot via `intervalOf`.
- `nearestAvailableIndex`: prefers the lower tier on a tie; returns `from` when nothing is available.
- `yearlySavingsPercent`: `monthly 1800, yearly 18000` → `17`; returns `null` when yearly is not cheaper; `null` when either side is missing.
- `formatStorage`: `75 → "75 GB"`, `1024 → "1 TB"`, `1536 → "1.5 TB"`.
- `formatInr`: `180000 → "₹1,80,000"` (lakh grouping, not `₹180,000`).

**Manual, Razorpay test mode**, all of these:

1. `GET /billing/plans` in a browser — confirm the real `services` docs, and confirm the derived tier list matches them exactly. **Do this first**, before building the slider.
2. Add a new Service with a storage tier that doesn't exist yet (`POST /billing/admin/services`) → reload `/pricing` → **a new stop appears with no code change**. This is the acceptance test for the whole dynamic-tiers requirement.
3. Deactivate a Service (`is_active: false`) → its stop disappears; if it was selected, selection falls back gracefully.
4. Create a Yearly Service at a tier with no Monthly twin → toggling to Monthly moves the thumb and shows the "moved to closest" note.
5. Landing → pick 5 events → Continue → logged out → bounced to login → after login, land on `/checkout` with `plan` and `qty=5` intact and the summary showing ₹(5 × unit).
6. Pay a top-up in test mode → confirming screen → `limit` increases → sidebar meter updates without a manual reload → invoice appears in the list and downloads.
7. Dismiss the Razorpay modal → dismissed state, plan unchanged, **Try again** works.
8. Subscribe to a storage plan (no coupon, branch B) → `subscription_id` checkout → confirming → active with `current_period_end` set.
9. Same, **with** a coupon (branch C) → response has both `razorpay_order_id` and `razorpay_subscription_id` → order path is taken.
10. Tier upgrade 75 → 150 (branch D) → the charge is the **prorated difference**, not the full price → renewal date unchanged after confirmation.
11. Downgrade 150 → 75 (branch F) → **no Razorpay modal at all** → scheduled confirmation with `effective_at`.
12. From an active storage plan, hand-craft `POST /billing/checkout` with an Event-based `service_id` → `409` → the message renders cleanly, no crash.
13. Non-admin, non-`billing_user` token → `/billing/subscription` 403 → billing nav and CTAs are **absent**, and the sidebar usage meter still works.
14. Free plan at 2/2 events → "Add event" already reads "Buy more events"; forcing the API call returns 402 and opens the sheet.
15. Block `checkout.razorpay.com` in devtools → the `short_url` fallback link appears on branch B; branches without `short_url` show a clean retry.
16. Throttle to Slow 3G → no layout shift, no double-submit, no stuck spinner.
17. `prefers-reduced-motion: reduce` → thumb still moves on interval switch, but instantly.
18. Keyboard-only: complete a full purchase without touching the mouse.
19. Mobile 375px: no horizontal scroll; slider (or chips) usable one-handed; tick labels legible.
20. Lighthouse a11y on `/pricing` ≥ 95.

---

## 12. Backend changes — **in scope, build these first**

Five changes in `Vyavasth/backend`. Four are small and purely additive; B4 is the only one with real design in it. Nothing here alters existing entitlement, proration or webhook logic, and **no existing response field changes shape** — every change adds fields or adds a route.

Match the house conventions throughout: ESM, named exports, `async (req,res,next) => { try {…} catch (e) { next(e) } }`, `company_id` always from `req.user`, errors via `err.statusCode` + `next(err)`, successes as ad-hoc top-level fields with no `{success:true}` wrapper, timestamps as **Unix-ms Numbers**.

---

### B1 — Return lifecycle timestamps from the subscription snapshot

**File:** `src/services/billing.service.js` → `getSubscriptionSnapshot`, the `base` object (~line 160).

Add three fields, straight off the document:

```js
grace_until: subscription.grace_until ?? null,
suspend_at:  subscription.suspend_at  ?? null,
delete_at:   subscription.delete_at   ?? null,
```

All three already exist on `subscriptionSchema` and are already written by the lifecycle handlers — they're simply not projected. Purely additive; no existing consumer breaks.

**Why it's a prerequisite:** without `delete_at` the suspension banner cannot state *when* a studio's galleries get destroyed. That is the single most important number on the most important screen in this feature.

---

### B2 — Return `description` from the public plans endpoint

**File:** `src/controllers/billing.controller.js` → `getPlans`, inside `plans.map(...)`.

Add `description: p.description ?? null`. The field is on `serviceSchema` and is already writable through `POST /billing/admin/services`; it just never reaches the pricing page. One line.

---

### B3 — Make the Free allowance discoverable

The `2` in "2 free events" is currently a magic number at `src/services/billing.service.js:95`, inside `provisionFreeSubscription`. Move it onto the Service so it becomes data, and expose it publicly.

1. **`src/models/onboarding.model.js`** — add to `serviceSchema`:
   ```js
   // Starting event allowance granted at provisioning (Free plan). Display +
   // provisioning input only — the ENFORCED cap is always Subscription.limit.
   included_events: { type: Number, default: null },
   ```
2. **`provisionFreeSubscription`** — replace the literal with `limit: freeService.included_events ?? 2`. Keep the `?? 2` fallback so an unseeded Free Service still provisions correctly.
3. **`getPlans`** — add `included_events: p.included_events ?? null` to the projection.
4. **`billing.validator.js`** — add `body("included_events").optional({ nullable: true }).isInt({ min: 0 })` to `createOrUpdateAdminServiceValidation`.
5. **`createOrUpdateAdminService`** — destructure `included_events` and handle it on both the create path and the `if (x !== undefined)` update path, exactly like `qr_limit`.
6. **Seed:** set `included_events: 2` on the existing Free Service.

**Hard constraint:** `assertEventQuotaAvailable`, `countCompanyDhEventUsage` and `getDlpUsage` must **not** be touched. `Subscription.limit` remains the sole enforcement field. `included_events` is a label, not a permission — if it ever appears in an enforcement branch, the change is wrong.

---

### B4 — Resume auto-renew

Today `cancel_at_period_end` can be set but never unset, and the obvious workaround is broken: re-buying the same plan hits `decideProrationMode` → `REJECT_SAME_PLAN` → `400 "You are already on this plan"`. A cancelled studio currently has **no path back**.

**Verify before building.** Determine from the actual published SDK source — `node_modules/razorpay/dist/`, the same method §5.1 of the backend plan used to verify the other call signatures, *not* docs prose — whether an already-`cancel_at_cycle_end` subscription can be un-cancelled. Note that Razorpay's documented `subscriptions.resume` targets **paused** subscriptions, which is a different state; do not assume it applies here. Record what you find in a comment.

- **If a genuine un-cancel exists:** call it, clear `cancel_at_period_end`, set `status = "active"`, return `{ status: "active", renews_on: current_period_end }`. Frontend needs no payment step; simplify §7.7(g) accordingly and say so in the PR.
- **If it does not** (the expected outcome): implement a **fresh deferred mandate**, below.

**New endpoint** — `POST /billing/subscription/resume`, mounted in `billing.routes.js` next to `/subscription/cancel` with the same `protect, requireBillingAccess` guards.

**New service function** — `resumeSubscriptionForCompany(companyId)` in `billing.service.js`:

1. Load the active subscription. If `!cancel_at_period_end` → throw `400 "No cancelled subscription to resume"`.
2. If `!current_period_end` or it has already passed → throw `400` telling the user to pick a plan instead (they're past recovery; the normal checkout path applies).
3. `createSubscription({ planId: <current service's razorpay_plan_id via createOrGetPlan>, totalCount: getTotalCountForInterval(interval), startAtMs: subscription.current_period_end, notes: { purpose: "resume", company_id } })`.
4. Create a new `Subscription` document with `status: "pending_payment"`, `is_active: false`, the new `razorpay_subscription_id`, and `storage_used` carried over — **exactly** the "new mandate ⇒ new Subscription document" rule already used by `initiateNewSubscription` and the Case-B interval upgrade. Do not mutate the live record; it stays active and entitling until the new mandate authenticates.
5. Create a `PaymentOrder` with a new `purpose: "resume"` enum value, `amount: 0`, `status: "created"` — for audit symmetry with every other mandate creation.
6. Return `{ razorpay_subscription_id, short_url, key_id: process.env.RAZORPAY_KEY_ID }`.

**Charge nothing now.** The current period is already paid for; the deferred `start_at` means the new mandate's first debit lands at `current_period_end`. This is the same deferred-`start_at` mechanic as proration Case B, minus the Order.

**Webhook side:** confirm `subscription.authenticated` / `subscription.activated` promotes this pending document and — critically — **clears `cancel_at_period_end` and restores `status: "active"`** on promotion. If `promoteSubscriptionToActive` doesn't already reset that flag, add it. A resumed subscription that promotes while still flagged `cancel_at_period_end: true` would silently die at the next period end, which is the worst possible failure for this endpoint.

Also add `purpose: "resume"` to the `PaymentOrder` enum, and cover the new path in `billing.service.test.js`.

---

### B5 — Fix a stale docstring (documentation only)

`src/middleware/subscription.middleware.js` claims:

> *NOT YET applied to any existing route (bookings/leads/deliverables/etc.) — retrofitting it across the app's existing write-route surface is a broader integration task beyond this pass, not attempted here…*

**This is false.** It is mounted on 44 write routes: `bookings` 7, `leads` 11, `deliverables` 22, `accounting` 2, `onboarding` 2 — and correctly **zero** on `billing.routes.js`, `auth.routes.js`, `whatsapp.routes.js` and `dashboard.routes.js`.

Replace the paragraph with an accurate one, and state the invariant explicitly so nobody "fixes" it later:

> **Never mount this on `/billing` or `/auth`.** A suspended studio must still be able to authenticate and pay — guarding the billing routes would trap them in a state they cannot buy their way out of.

While you're there, add a cheap regression guard — a test asserting `billing.routes.js` contains no `enforceSubscriptionState` reference — so the invariant survives future edits.

---

### B6 — QR limits: no backend change

`GET /billing/subscription` returns no `qr_limit`, but `GET /deliverables/get-all-qr-codes` already returns `{ qrs, qr_limit }`. If the billing page wants a QR meter, read it from there. **Do not add a QR field to the billing snapshot** — it would create a second source of truth for the same cap.

---

### §12 verification

- `GET /billing/subscription` on an `active` studio → the three new keys present and `null`; on a `past_due` one → `grace_until` populated; on a `suspended` one → `suspend_at` and `delete_at` populated and exactly 7 days apart.
- `GET /billing/plans` → `description` and `included_events` present; Free shows `included_events: 2`, others `null`.
- Register a brand-new company → still provisions Free with `limit: 2`, sourced from the Service.
- Temporarily unset `included_events` on the Free Service → provisioning still yields `limit: 2` via the fallback.
- Cancel a live subscription → `POST /billing/subscription/resume` → mandate handshake in test mode → `subscription.authenticated` → `cancel_at_period_end` is `false`, `status` is `active`, exactly one `is_active: true` subscription for the company (the partial unique index will catch a violation — make sure it doesn't fire).
- `POST /billing/subscription/resume` on a non-cancelled subscription → `400`.
- Existing suite green: `billing.service.test.js`, `billing-math.utils.test.js`, `razorpay.service.test.js`.
- `npm run` the index sync script if `included_events` affects any index (it shouldn't).

---

## 13. Definition of done

**Backend (§12) — done and deployed before frontend work starts:**

- [ ] B1: `grace_until`, `suspend_at`, `delete_at` returned by `GET /billing/subscription`.
- [ ] B2: `description` returned by `GET /billing/plans`.
- [ ] B3: `included_events` on `Service`, sourced by `provisionFreeSubscription`, exposed publicly, admin-writable, Free seeded to `2`.
- [ ] B3: no enforcement path reads `included_events` — `Subscription.limit` is still the only cap.
- [ ] B4: SDK un-cancel behaviour verified against `node_modules/razorpay/dist/` and the finding recorded in a comment.
- [ ] B4: `POST /billing/subscription/resume` charges nothing, defers to `current_period_end`, creates a new Subscription doc rather than mutating the live one.
- [ ] B4: promotion clears `cancel_at_period_end` and restores `status: "active"`.
- [ ] B5: docstring corrected; the "never guard /billing or /auth" invariant is written down and regression-tested.
- [ ] B6: no QR field added to the billing snapshot.
- [ ] Existing backend tests green.

**Frontend:**

- [ ] `lib/plans.ts` is byte-identical in both repos and unit-tested.
- [ ] Zero hardcoded storage tiers, prices, plan names or event unit prices anywhere in either repo.
- [ ] Adding a Service in Mongo changes both the pricing page and the in-app chooser with no deploy.
- [ ] All six `POST /billing/checkout` branches implemented and manually exercised in Razorpay test mode.
- [ ] `useCheckoutFlow()` is the single implementation shared by `/checkout` and `<UpgradeSheet>`.
- [ ] No path from Razorpay's `handler` to a success screen bypasses `<ConfirmingPayment>`.
- [ ] The polling timeout state never says "failed" and never shows danger styling.
- [ ] Every backend `message` for 400/402/409 is surfaced verbatim, not paraphrased.
- [ ] `403` on `/billing/subscription` hides billing UI silently; the usage meter still works.
- [ ] `next` is validated as a relative path on both auth entries (no open redirect).
- [ ] Landing page uses only `--color-*`; app uses only `--color-brand-*`. No cross-contamination.
- [ ] One accent colour. No second accent anywhere in the new UI.
- [ ] Every new focusable control uses `.brand-focus` (app) or the landing focus-visible idiom.
- [ ] Keyboard-only purchase completes end to end.
- [ ] Lighthouse a11y ≥ 95 on `/pricing`.
- [ ] `npm run lint` clean, `npm run build` clean, in both repos.
- [ ] `graphify update .` run in `delivery-promotional-page` (per project CLAUDE.md).
- [ ] No invented data anywhere: every date, cap and price on screen came from an API field, not a guess.

---

## Appendix A — files to read before starting

**Backend — read all of these; §12 modifies the ones marked ✎:**
✎ `src/controllers/billing.controller.js` (B2, B3) · ✎ `src/services/billing.service.js` (B1, B3, B4) · ✎ `src/routes/billing.routes.js` (B4) · ✎ `src/validators/billing.validator.js` (B3) · ✎ `src/models/onboarding.model.js` — `Service`, `Subscription` (B3) · ✎ `src/models/payment-order.model.js` (B4, `purpose` enum) · ✎ `src/middleware/subscription.middleware.js` (B5, docstring) · `src/models/invoice.model.js` · `src/models/coupon.model.js` · `src/utils/billing-math.utils.js` · `src/services/razorpay.service.js` · `node_modules/razorpay/dist/` (B4 verification) · `src/services/billing.service.test.js` (B4 coverage)

Everything else in the backend is reference only. **Do not touch entitlement, proration, webhook or quota logic** — §12 is additive by design.

**Landing page:**
`app/globals.css` · `app/layout.tsx` · `app/page.tsx` · `components/Nav.tsx` · `components/Eyebrow.tsx` · `components/FeatureSection.tsx` (section rhythm) · `components/EnquiryProvider.tsx` · `lib/vyavasth-api.ts` · `AGENTS.md`

**App:**
`app/globals.css` · `lib/api.ts` (esp. `request()` + `ApiError`) · `lib/auth.ts` · `lib/types.ts` (`DlpUsage`, `isCountBasedPlan`, `isStorageBasedPlan`, `getUsageSeverity`) · `components/dashboard/ChromeContext.tsx` · `components/ui/DlpUsageCard.tsx` · `components/ui/Drawer.tsx` · `components/ui/icons.tsx` · `app/(dashboard)/dashboard/settings/SettingsNav.tsx` + `SettingsUI.tsx` + `page.tsx` · `app/(dashboard)/login/page.tsx` · `components/dashboard/AddEventModal.tsx` · `AGENTS.md`

**Design:**
`delivery-promotional-page/Vyavasth Design System.md` — §2 (Design Language), §4 (Non-Negotiables), §5 (Color System), §10 (Icons).

Icons: **Phosphor** (`@phosphor-icons/react`) primary in the app, `lucide-react` fallback; the landing page uses `lucide-react`. The app wraps icons in `components/ui/icons.tsx` — add new ones there, don't import Phosphor directly into a feature component.
