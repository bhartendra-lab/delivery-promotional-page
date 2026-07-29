# Implementation Prompt — First-Login Onboarding, Single Studio Number, and Billing/Upgrade UX

> **Audience:** an autonomous coding agent (Claude Sonnet 5) with write access to both repos.
> **Style of this document:** every decision is already made. Where you find yourself about to
> choose between two reasonable options, re-read this document — the choice is stated. If it
> genuinely is not stated, pick the option that changes the least existing behaviour and leave a
> `// NOTE(open-question):` comment. Do not invent new product behaviour.

---

## 0. Repos, paths, and how to run things

Two repos, both already checked out:

| Repo | Root | Stack |
|---|---|---|
| Frontend (studio dashboard + guest gallery) | `delivery-promotional-page/frontend` | Next.js App Router, TypeScript, Tailwind v4 (CSS custom properties, **no** theme config), client components |
| Backend (API) | `Vyavasth/backend` | Node ESM, Express, Mongoose, Razorpay |

Frontend routes live under `app/(dashboard)/…` (studio) and `app/(client)/…` (guest). Do not
touch `app/(client)/**` except where §2.5 explicitly says so.

Commands:

```bash
# frontend
cd delivery-promotional-page/frontend
npm run lint
npx tsc --noEmit
npm run dev

# backend
cd Vyavasth/backend
npm test          # vitest — billing.service.test.js, razorpay.service.test.js, whatsapp.service.test.js, mail.render.test.js
node --check src/**/*.js
```

**`npx tsc --noEmit` and `npm run lint` must both pass with zero new errors before you consider
any section done.** Backend tests must stay green.

---

## 1. Non-negotiable conventions

Read these before writing a line. They are inferred from the existing codebase and deviating
from them will make the diff unreviewable.

1. **Colours are CSS variables only.** `var(--color-brand-navy)`, `--color-brand-navy-deep`,
   `--color-brand-navy-soft`, `--color-brand-bg`, `--color-brand-surface`, `--color-brand-border`,
   `--color-brand-ink`, `--color-brand-muted`, `--color-brand-outline`, `--color-brand-danger`,
   `--color-brand-danger-soft`, `--color-brand-warning`, `--color-brand-warning-soft`,
   `--color-brand-success`. Never a hex literal, never a Tailwind palette class like `bg-blue-500`.
2. **Focus rings** come from the `brand-focus` utility class. Every interactive element gets it.
3. **Icons** come from `@/components/ui/icons` (the Phosphor barrel). If you need an icon that
   isn't exported yet, add the export to `components/ui/icons.tsx` in the same style as its
   neighbours — never import from `@phosphor-icons/react` at a call site.
4. **Minimum touch target is 44px** (`h-11` / `min-h-11`) for anything tappable.
5. **Money** is GST-inclusive rupees. Format with `formatInr` from `@/lib/plans`. Never compute
   tax on the client; the server is the only source of truth (`POST /billing/checkout/preview`).
6. **Epoch milliseconds** for every timestamp, on both sides of the wire. New Mongoose
   timestamp-ish fields are `Number`, not `Date`.
7. **Comments explain *why*, never *what*.** The existing codebase is unusually good at this
   (see `companies.model.js`, `SubscriptionProvider.tsx`). Match it. Every non-obvious decision
   in this document should end up as a comment in the code.
8. **No new dependencies.** Everything here is buildable with what is already in `package.json`.
9. **Backend writes go through the existing patterns**: `protect` middleware for auth,
   `express-validator` chains in `src/validators/*.validator.js` + the `validate` middleware,
   controller in `src/controllers/*.controller.js`, route wiring in `src/routes/*.routes.js`.
10. **Don't reformat files you're editing.** Surgical diffs only.

---

## 2. Work item A — One studio number: delete `contact_number`, keep `whatsapp_number`

### 2.1 The rule

A studio has **exactly one** phone number: `companies.whatsapp_number`. It is always the number
that passed WhatsApp OTP verification. `companies.contact_number` is deleted from the schema and
from every read path.

### 2.2 Schema (`Vyavasth/backend/src/models/companies.model.js`)

- **Remove** the `contact_number` field entirely.
- **Add** these fields:

```js
    // Holds a NEW number while its OTP is in flight during a post-onboarding
    // number change. Deliberately separate from whatsapp_number so a failed or
    // abandoned change never leaves the studio with an unverified live number.
    whatsapp_pending_number: {
        type: String,
    },
    // Set when the studio explicitly told us they have no Google Business
    // listing during onboarding. Distinct from "google_place_id is empty
    // because they haven't got that far yet" — that distinction is what lets
    // the dashboard nudge them without re-blocking them.
    gmb_skipped: {
        type: Boolean,
        default: false,
    },
    // Stamped when the studio finishes the LAST mandatory onboarding step.
    // Gating reads this, not whatsapp_verified, because onboarding grew a
    // second required step (Google Business) after WhatsApp verification.
    onboarding_completed_at: {
        type: Number,
        default: null,
    },
    // One-shot flag for the "2 free events" welcome dialog. Company-level (not
    // user-level) because onboarding itself is company-level.
    welcome_dialog_seen_at: {
        type: Number,
        default: null,
    },
```

- Update the comment above `whatsapp_number` — it currently calls the field a "Verified sibling of
  contact_number". It is now the studio's only number.

### 2.3 Backend read/write sites to change

| File | Line-ish | Change |
|---|---|---|
| `controllers/onboarding.controller.js` → `registerCompany` | destructure + `Companies.create` | Replace `contact_number` with `whatsapp_number`. Normalize it through `normalizePhoneNumber` (already imported). `whatsapp_verified` stays `false` — the admin path does not OTP-verify. |
| `controllers/onboarding.controller.js` → `updateCompanyDetails` | destructure + assignment | Delete `contact_number` handling. **Do NOT accept `whatsapp_number` here** — the number may only change via the OTP endpoints in §4.2. If a client sends it, ignore it silently. |
| `utils/deliverables.utils.js` → `createDeliveryLandingPageKvObject` | `company_contact_number` | See §2.5 — emit both keys. |
| `controllers/deliverables.controller.js` ~1677 | `company_contact_number: "$company.contact_number"` | See §2.5 — project both keys. |
| `controllers/deliverables.controller.js` ~2229 (`redirectQR`) | `company?.contact_number` | → `company?.whatsapp_number` |

**Do NOT touch** `utils/auth.utils.js` lines ~66 and ~121. Those read
`process.env.VYAVASTH_OFFICIAL_CONTACT_NUMBER` — that is *Vyavasth's own* support number used in
email/WhatsApp templates, unrelated to `companies.contact_number`.

### 2.4 Migration script

Create `Vyavasth/backend/src/scripts/migrate-contact-to-whatsapp.js`, following the style of
whatever already exists in `src/scripts/`. It must be idempotent and safe to re-run. It performs
**four** things in one pass:

```
1. For every company where whatsapp_number is missing/empty AND contact_number is non-empty:
     set whatsapp_number = normalizePhoneNumber(contact_number)
     (leave whatsapp_verified as-is — copying a number does not verify it)

2. $unset contact_number on ALL company documents.

3. For every company where whatsapp_verified === true AND onboarding_completed_at is null:
     set onboarding_completed_at = (company.updatedAt?.getTime?.() ?? Date.now())
   >>> THIS IS THE CRITICAL ONE. It is what guarantees that studios who already finished
   >>> WhatsApp verification before this release are NEVER dragged through the new Google
   >>> Business step. See §5.1.

4. For every company where welcome_dialog_seen_at is null AND onboarding_completed_at was just
   backfilled in step 3:
     set welcome_dialog_seen_at = onboarding_completed_at
   (existing studios must never see the "congratulations, 2 free events" dialog)
```

Log counts per step. Print a dry-run summary when invoked with `--dry-run` and only write when
invoked without it. Document in the file header that it must be run **before** deploying the new
backend, or immediately after, but that the app tolerates either order (it does — all new fields
have safe defaults).

### 2.5 Guest-gallery compatibility (do this exactly)

Published delivery pages are cached as JSON objects in Cloudflare KV. Renaming a key would break
every already-published page until it is re-published. So:

- **Backend emits both keys**, same value, sourced from `whatsapp_number`:
  - in `createDeliveryLandingPageKvObject`:
    ```js
    company_whatsapp_number: company.whatsapp_number,
    // Legacy alias for KV objects published before the contact_number removal.
    // Remove once all delivery pages have been re-published.
    company_contact_number: company.whatsapp_number,
    ```
  - in the `deliverables.controller.js` aggregation `$project`, add
    `company_whatsapp_number: "$company.whatsapp_number"` alongside the existing
    `company_contact_number`, and change the latter's source to `"$company.whatsapp_number"`.
- **Frontend** (`lib/types.ts`): on the delivery-landing-page type that currently declares
  `company_contact_number?: string` (~line 515), add `company_whatsapp_number?: string` and keep
  `company_contact_number` marked `/** @deprecated legacy KV alias */`.
- **Frontend consumers** — `components/event/screens/LoungeGallery.tsx` (~line 72) and
  `components/event/GalleryUnavailable.tsx` (~line 36) — change to:
  ```ts
  const waNumber = (event.company_whatsapp_number || event.company_contact_number || "").replace(/\D/g, "");
  ```

### 2.6 Frontend type/API surface

- `lib/types.ts` → `Company`: **remove** `contact_number`. Update the `whatsapp_number` doc
  comment. Add `whatsapp_pending_number?: string`, `gmb_skipped?: boolean`,
  `onboarding_completed_at?: number | null`, `welcome_dialog_seen_at?: number | null`.
- `lib/api.ts` → `CompanyUpdateInput`: **remove** `contact_number`. Remove its `fd.append` line
  in `updateCompanyDetails`.

---

## 3. Work item B — Studio Identity shows the verified WhatsApp number

File: `app/(dashboard)/dashboard/settings/page.tsx` (the "Studio Identity" tab).

### 3.1 Remove

- The `contactNumber` state, its `Field` ("Business contact"), its `changed(...)` term in `dirty`,
  and its payload line.
- The `samePhone` state, `toggleSamePhone`, and the `SameAsPersonalCheckbox` labelled
  "Same as personal phone". (Keep the *email* one — `sameEmail` stays exactly as it is.)
- The now-unused `personalPhone` const.

### 3.2 Add — a read-only verified WhatsApp row

Inside the existing `Card title="Business Information"`, immediately after the Business email
field, render a new presentational component `VerifiedWhatsappField` (put it in
`app/(dashboard)/dashboard/settings/SettingsUI.tsx` next to `CopyableIdField`, and export it).

Visual spec:

- Same label treatment as `Field` (`text-xs font-semibold uppercase tracking-[0.18em]
  text-[var(--color-brand-muted)]`), label text **"WhatsApp number"**.
- Value row: `h-10 rounded-lg border border-[var(--color-brand-border)]
  bg-[var(--color-brand-bg)] px-3` — visually identical to a `Field` but `readOnly` and with
  `cursor-default`.
- Displays `+91 98765 43210` formatting (helper: strip non-digits, take the trailing 10, render
  `+91 XXXXX XXXXX`). If the company somehow has no number, render the em-dash placeholder "—"
  and a muted "Not set yet".
- To the right of the value, a verified pill: `CheckIcon` +  text **"Verified"**, in
  `text-[var(--color-brand-success)]`, `bg-[var(--color-brand-success)]/10`, `rounded-full`,
  `px-2 py-0.5 text-[11px] font-semibold`. Only when `company.whatsapp_verified === true`.
- Below, helper copy: **"Delivery notifications, OTPs and client replies all go to this number."**
- A right-aligned text button **"Change number"** (`text-sm font-semibold
  text-[var(--color-brand-navy)]`, `brand-focus`, underline on hover) that opens the modal in §3.3.

This field is **not** part of the Studio Identity form's `dirty` calculation and is **never**
included in the `CompanyUpdateInput` payload. It has its own save path.

### 3.3 The "Change number" modal

New component: `app/(dashboard)/dashboard/settings/ChangeWhatsappModal.tsx`.

Built on the new shared `Modal` from §7.1 (title: **"Change WhatsApp number"**). Two internal
steps, mirroring the onboarding wizard's proven UX:

**Step 1 — new number**
- Explanatory line: *"We'll send a 6-digit code to the new number. Your current number stays
  active until the new one is verified."*
- `+91` prefix box + 10-digit `tel` input (copy the exact markup from
  `components/onboarding/StudioDetailsStep.tsx` — same border/height/prefix treatment).
- Validation: exactly 10 digits, and must differ from the current number (inline error:
  *"That's already your current number."*).
- Primary button **"Send code"** → `POST /onboarding/whatsapp/change-request-otp`.

**Step 2 — OTP**
- **Reuse the six-box OTP UI.** Extract the existing markup from
  `components/onboarding/WhatsappOtpStep.tsx` into a new presentational component
  `components/onboarding/OtpCodeInput.tsx` with props
  `{ value, onChange, shake, autoFocus?, length? }`, and have both `WhatsappOtpStep` and this
  modal consume it. Do not copy-paste the JSX twice.
- 30-second resend countdown, `429 retryAfter` drift handling — behave exactly like
  `WhatsappOtpStep.resend()` does today, hitting `POST /onboarding/whatsapp/change-resend-otp`.
- Auto-submits when 6 digits are entered.
- On success: call `setCompany(updatedCompany)` from `@/lib/auth`, refresh the Settings context
  company (`useSettings().save({})` is a no-op — instead expose a `setCompanyState` or simply
  call the context's existing `save` path is wrong here; add a `refreshCompany()` to
  `SettingsContext` that re-runs `getCompanyDetails()` and updates both the context and the
  `lib/auth` cache, and call that), close the modal, and flash a success toast-equivalent:
  reuse the `SaveBar` "saved" affordance style — a green inline line under the field reading
  **"WhatsApp number updated."** that clears after 3s.

Errors render in the same danger-styled `<p role="alert">` block used elsewhere.

---

## 4. Work item C — Backend endpoints

All new routes live in `src/routes/onboarding.routes.js`, are `protect`-guarded, and — like the
existing WhatsApp OTP routes — **must not** use `enforceSubscriptionState` (a studio must always
be able to resolve its own account state, even when suspended).

### 4.1 Refactor `issueCompanyWhatsappOtp`

`src/utils/auth.utils.js` — add an optional destructured param:

```js
async function issueCompanyWhatsappOtp({ company, userId, res, toNumber })
```

`toNumber` defaults to `company.whatsapp_number`; it is what `sendTemplateMessage({ to })`
receives. Everything else (cooldown, hash, TTL, attempts, idempotency key) is unchanged. All
existing call sites keep working without modification.

### 4.2 New: change-number endpoints

```
POST /onboarding/whatsapp/change-request-otp   body: { whatsapp_number: string }
POST /onboarding/whatsapp/change-resend-otp    body: {}
POST /onboarding/whatsapp/change-verify-otp    body: { code: string }
```

Controller behaviour (`onboarding.controller.js`):

- **change-request-otp**
  - `400` if `!company.whatsapp_verified` → *"Finish studio verification first."*
  - Normalize the input via `normalizePhoneNumber`. `400` if it equals the current
    `whatsapp_number` → *"That's already your current number."*
  - Set `company.whatsapp_pending_number = normalized` (do **not** touch `whatsapp_number`).
  - `await issueCompanyWhatsappOtp({ company, userId: req.user.id, res, toNumber: normalized })`
- **change-resend-otp** — `400` if no `whatsapp_pending_number`; otherwise re-issue to the pending
  number. Same cooldown/429 semantics.
- **change-verify-otp**
  - Same guard ladder as the existing `verifyWhatsappOtp`: no hash → 400; expired → 400;
    `attempts >= 5` → 429; bad code → increment + 400.
  - On success: `whatsapp_number = whatsapp_pending_number`, `whatsapp_pending_number = undefined`,
    clear `whatsapp_otp_code_hash` / `whatsapp_otp_expires_at`, `whatsapp_otp_attempts = 0`.
    `whatsapp_verified` stays `true`. Save and return `{ message, company }` with `-billing`
    projection semantics (same shape `getCompanyDetails` returns).

Validators go in `onboarding.validator.js` mirroring `requestWhatsappOtpValidation` /
`verifyWhatsappOtpValidation`.

### 4.3 New: Google Business onboarding step

```
POST /onboarding/google-business
body: { google_place_id?: string, address?: string, skipped?: boolean }
```

- If `skipped === true`: set `gmb_skipped = true`; leave `google_place_id` / `address` untouched.
- Else: **require** a non-empty `google_place_id` (`400` — *"Pick your studio from the list."*).
  Set `google_place_id`, set `address` if provided, set `gmb_skipped = false`.
- In **both** cases: if `company.whatsapp_verified !== true` → `400` *"Verify your WhatsApp number
  first."*; otherwise stamp `onboarding_completed_at = Date.now()` (only if currently null — keep
  it idempotent) and return `{ message, company }`.

### 4.4 New: welcome-dialog acknowledgement

```
POST /onboarding/welcome-dialog-seen   body: {}
```

Sets `welcome_dialog_seen_at = Date.now()` if null. Idempotent. Returns `{ message, company }`.

### 4.5 Frontend API client (`lib/api.ts`)

Add, following the exact style of the existing `requestWhatsappOtp` / `verifyWhatsappOtp` helpers:

```ts
export function requestWhatsappChangeOtp(input: { whatsappNumber: string })
export function resendWhatsappChangeOtp()
export function verifyWhatsappChangeOtp(input: { code: string })
export function saveGoogleBusiness(input: { googlePlaceId?: string; address?: string; skipped?: boolean })
export function markWelcomeDialogSeen()
```

All return `{ message: string; company: Company }` except the request/resend pair which return
`{ message: string }`.

---

## 5. Work item D — The first-login onboarding wizard

File: `app/(dashboard)/onboarding/page.tsx` plus `components/onboarding/*`.

### 5.1 Gating — get this exactly right

Replace `needsOnboarding` in **`app/(dashboard)/dashboard/layout.tsx`**:

```ts
/**
 * Onboarding is a two-gate flow now: WhatsApp verification, then Google
 * Business. `onboarding_completed_at` (stamped by the LAST step) is the single
 * source of truth — checking whatsapp_verified alone would let a studio slip
 * past the Google step by refreshing.
 *
 * Studios that verified WhatsApp before the Google step existed were
 * backfilled with onboarding_completed_at by
 * scripts/migrate-contact-to-whatsapp.js, so they are never re-gated.
 */
function needsOnboarding(company: Company): boolean {
  return Boolean(company.onboarding_required) && !company.onboarding_completed_at;
}
```

Apply the same predicate — extracted into a shared exported helper, **not** duplicated — in:

- `app/(dashboard)/auth/callback/page.tsx` (currently
  `company.onboarding_required && !company.whatsapp_verified`)
- `app/(dashboard)/onboarding/page.tsx`'s `proceed()` early-return
  (currently `if (!c.onboarding_required || c.whatsapp_verified) → /dashboard`)

Put the helper in `lib/auth.ts` as `export function needsOnboarding(company: Company): boolean`.

### 5.2 Step machine

`type Step = "details" | "otp" | "google";`

Resume logic on mount, after the company loads — **this is what makes a mid-flow refresh work**:

```
if (!company.onboarding_required || company.onboarding_completed_at)  → router.replace("/dashboard")
else if (company.whatsapp_verified)                                   → step = "google"
else                                                                  → step = "details"
```

Transitions:

- `details` → (OTP sent) → `otp`
- `otp` → back → `details`
- `otp` → (verified) → `google` (also `setCompany(updatedCompany)`)
- `google` → (saved or skipped) → `setCompany(updatedCompany)` then `router.replace("/dashboard")`

There is **no** back button on the `google` step. Verification already happened server-side.

### 5.3 Progress indicator

Add a 3-dot / 3-segment progress bar above the card, inside the existing `max-w-md` wrapper:

- Three equal segments, `h-1 rounded-full`, gap `gap-1.5`.
- Completed + current segments: `bg-[var(--color-brand-navy)]`. Upcoming:
  `bg-[var(--color-brand-border)]`.
- Above it, muted `text-xs`: **"Step 1 of 3"** / **"Step 2 of 3"** / **"Step 3 of 3"**.
- `role="progressbar"` with `aria-valuenow` / `aria-valuemin={1}` / `aria-valuemax={3}` and
  `aria-label="Studio setup progress"`.

Keep the eyebrow text inside each step, but retune it: step 1 eyebrow **"Set up your studio"**,
step 2 **"Verify WhatsApp"**, step 3 **"Find your studio on Google"**.

### 5.4 New component — `components/onboarding/GoogleBusinessStep.tsx`

Props: `{ initialStudioName: string; onDone: (company: Company) => void }`.

Layout (matches the card the other two steps render into — no card of its own):

- Heading `text-2xl font-bold`: **"Find your studio on Google"**
- Sub: *"This links your Google reviews so clients can leave one in a single tap from their
  gallery. Search your studio name and pick the matching listing."*
- An `AddressField` (imported from `app/(dashboard)/dashboard/settings/SettingsUI.tsx` — it is
  already exported; move it to `components/ui/AddressField.tsx` and re-export from `SettingsUI`
  so the onboarding route doesn't import from a settings route folder). Props:
  - `label="Your studio on Google"`
  - `value={address}` / `onChange={setAddress}`
  - `placeholder={initialStudioName || "Search for your studio"}`
  - `onPlaceSelect={({ placeId, address }) => { setPlaceId(placeId); setAddress(address); }}`
  - **Prefill `value` with `initialStudioName` on first render** so the Places dropdown opens on
    something useful the moment they focus it.
- Once `placeId` is set, render the same confirmation block Studio Identity uses: a
  `CopyableIdField label="Google Reviews ID"`, the green `CheckIcon` line
  *"This is the page clients land on when they tap Leave a review."*, and the external
  "See your Google Reviews page" link to
  `https://search.google.com/local/writereview?placeid=…`.
- Primary button, full width, `h-11`: **"Finish setup"** — disabled until `placeId` is truthy;
  shows **"Saving…"** while in flight. Calls `saveGoogleBusiness({ googlePlaceId, address })`.
- Below it, centered, `text-xs`: a plain-text button **"I don't have a Google listing yet"**
  (`text-[var(--color-brand-muted)]`, underline on hover, `brand-focus`). Clicking it opens a
  small inline confirm (not a nested modal — swap the button row for a bordered muted block):
  > **Skip for now?** Without a Google listing, clients can't leave you a review from their
  > gallery, and you'll need to enter your billing address manually when you buy a plan. You can
  > add it any time from Settings → Studio Identity.
  >
  > [ Go back ]  [ Skip anyway ]

  **"Skip anyway"** calls `saveGoogleBusiness({ skipped: true })`.
- If `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is not configured, `AddressField` silently degrades to a
  plain text input and no `place_id` can ever be produced. Detect this
  (`!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) and in that case show the skip affordance as a
  normal-weight secondary button rather than tiny muted text, so the user is never trapped.

### 5.5 Persistent nudge after a skip

In `app/(dashboard)/dashboard/page.tsx`, when
`company.gmb_skipped === true && !company.google_place_id`, render a dismissible-per-session info
strip above the page content:

- Style: `rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)]
  px-4 py-3`, `GlobeIcon` on the left, `text-sm`.
- Copy: **"Add your Google listing to collect reviews."** + muted sub *"Clients can leave a
  review straight from their gallery once it's linked."*
- Right side: a link-styled button **"Add it now"** → `/dashboard/settings` (Studio Identity),
  and an `IconX` dismiss that hides it for the session only (`useState`, not localStorage — this
  should come back next visit until they actually fix it).

---

## 6. Work item E — The "2 free events" welcome dialog

### 6.1 Trigger

New component `components/onboarding/WelcomeDialog.tsx`, mounted in
`app/(dashboard)/dashboard/page.tsx` (the dashboard home, **not** the layout — it must not fire
while the user is deep-linked into an event page).

Show when **all** are true:

```
company.onboarding_required === true
company.onboarding_completed_at != null
company.welcome_dialog_seen_at == null
```

`company` comes from the reactive `useCompany()` hook backed by `lib/auth.ts`.

### 6.2 Content

Built on the shared `Modal` from §7.1, `size="sm"`, **not dismissible by backdrop click** (it's a
one-time celebration with a real CTA; Escape and the X still work).

- A celebratory mark at the top: a 56px circle,
  `bg-[var(--color-brand-navy-soft)]`, containing a `CheckIcon` (or `IconSparkle`/`IconGift` if
  you add one to the barrel) in `text-[var(--color-brand-navy)]`. Centered.
- Title, centered, `text-2xl font-bold`: **"You're all set 🎉"**
- Body, centered, `text-sm text-[var(--color-brand-muted)]`:
  > Your studio is verified. You've got **{n} free events** to try everything out — create a
  > gallery, share the QR, and watch the deliveries land.

  `{n}` is **read from live data, not hardcoded**: `useSubscription().snapshot`, and when it is a
  count-based snapshot use `snapshot.limit`. Fall back to `2` if the snapshot is null or
  storage-based. Pluralise correctly (`1 free event`).
- Buttons, stacked on mobile / side-by-side on `sm:`:
  - Primary, full-width-on-mobile: **"Upgrade plan"** → marks seen, closes, then
    `openUpgradeModal()` (§7).
  - Secondary: **"Start with free events"** → marks seen, closes.
- Both paths, plus Escape and the X, call `markWelcomeDialogSeen()` and then
  `setCompany(res.company)`.

### 6.3 Idempotency

- Guard with a `useRef` so the POST fires at most once per mount even if two dismiss paths race.
- If `markWelcomeDialogSeen()` fails (network), still close the dialog locally **and** optimistically
  write `welcome_dialog_seen_at: Date.now()` into the cached company via `setCompany`, so the user
  is not nagged in the same session. The server flag will be set on the next successful call —
  add a retry on the next dashboard mount if the server still reports null.

---

## 7. Work item F — Replace the upgrade drawer with a modal

### 7.1 New shared `Modal` primitive

Create `components/ui/Modal.tsx`. This is the component every new dialog in this document uses.

```ts
type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** sm ≈ max-w-md, md ≈ max-w-lg (default), lg ≈ max-w-2xl — desktop only. */
  size?: "sm" | "md" | "lg";
  /** Defaults true. Set false for the welcome dialog. */
  dismissOnBackdrop?: boolean;
  /** Optional left-side header control, e.g. a Back button in a multi-step flow. */
  headerLeading?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};
```

**Responsive behaviour — this is the decided design:**

- **`< 640px` (mobile): full screen.** `fixed inset-0`, no border radius, no backdrop visible.
  Header is `sticky top-0` with the title and a right-aligned close button, sitting on
  `bg-[var(--color-brand-surface)]` with a bottom border. Content area is
  `flex-1 overflow-y-auto`. Footer (when provided) is `sticky bottom-0` with a top border. Respect
  the safe area: `pb-[max(1rem,env(safe-area-inset-bottom))]` on the footer,
  `pt-[env(safe-area-inset-top)]` on the header.
- **`≥ 640px` (desktop): centered modal.** Backdrop `bg-[var(--color-brand-ink)]/40
  backdrop-blur-sm`. Panel: `rounded-2xl border border-[var(--color-brand-border)]
  bg-[var(--color-brand-bg)] shadow-[0_24px_60px_rgba(42,34,24,0.18)]`, width per `size`,
  `max-h-[85vh]`, internal scroll on the body only — header and footer stay pinned.

**Motion** (add keyframes to `app/globals.css` next to the existing `drawer-slide` /
`drawer-fade`):

- Backdrop: `modal-fade` — opacity 0→1 over `0.2s ease-out`.
- Panel on desktop: `modal-pop` — `opacity 0→1` and `transform: translateY(8px) scale(.98)` →
  `translateY(0) scale(1)` over `0.24s cubic-bezier(0.32, 0.72, 0.32, 1)`.
- Panel on mobile: `modal-slide-up` — `translateY(100%) → translateY(0)` over
  `0.28s cubic-bezier(0.32, 0.72, 0.32, 1)`.
- Wrap all three in `@media (prefers-reduced-motion: reduce) { animation: none; }`.

**Behaviour:**

- Escape closes (always, even when `dismissOnBackdrop` is false).
- Body scroll lock while open (`document.body.style.overflow = "hidden"`, restored on cleanup —
  copy the existing `Drawer` effect).
- **Focus trap**: on open, focus the first focusable element in the panel (or the panel itself
  with `tabIndex={-1}`); Tab/Shift-Tab cycle within the panel; on close, return focus to the
  element that was focused before opening (capture it in a ref).
- `role="dialog" aria-modal="true" aria-labelledby={titleId}` and
  `aria-describedby={subtitleId}` when a subtitle exists. Generate ids with `useId()`.
- Renders `null` when `!open` (same as `Drawer` — no portal machinery needed, it's already inside
  a full-height client layout).

### 7.2 Rename the upgrade surface

| Old | New |
|---|---|
| `components/billing/UpgradeSheet.tsx` | `components/billing/UpgradeModal.tsx` |
| `components/billing/UpgradeSheetProvider.tsx` | `components/billing/UpgradeModalProvider.tsx` |
| `UpgradeSheet` | `UpgradeModal` |
| `UpgradeSheetProvider` | `UpgradeModalProvider` |
| `useUpgradeSheet()` | `useUpgradeModal()` |
| `openUpgradeSheet(opts)` | `openUpgradeModal(opts)` |

Update every call site (there are five, all found by grepping `UpgradeSheet`):
`app/(dashboard)/dashboard/layout.tsx`, `app/(dashboard)/dashboard/page.tsx`,
`app/(dashboard)/dashboard/events/page.tsx`, `app/(dashboard)/dashboard/settings/billing/page.tsx`,
`components/dashboard/AddEventModal.tsx`.

**Delete `components/ui/Drawer.tsx`** once nothing imports it (it currently has exactly one
consumer, the upgrade sheet). Also delete the now-orphaned `.drawer-slide` / `.drawer-fade` CSS
and their keyframes from `app/globals.css` — but only if nothing else references them; grep first.

### 7.3 The modal's step machine

`UpgradeModal` becomes an explicit four-step flow. Track it as
`type Step = "choose" | "billing" | "confirm" | "status"`.

```
choose  ──(selection made)──▶  needsBillingDetails ? "billing" : "confirm"
billing ──(saved)───────────▶  "confirm"
billing ──(back)────────────▶  "choose"
confirm ──(back)────────────▶  needsBillingDetails ? "billing" : "choose"
confirm ──(pay)─────────────▶  "status"   (useCheckoutFlow's state.phase !== "idle")
```

Header title / `headerLeading` per step:

| Step | Title | Subtitle | Leading |
|---|---|---|---|
| `choose` | "Upgrade plan" | see below | — |
| `billing` | "Billing details" | "Needed on your invoice — and to work out GST correctly." | Back button → `choose` |
| `confirm` | "Confirm your purchase" | — | Back button → previous step |
| `status` | "Upgrade plan" | — | — |

The `choose` subtitle is **conditional on `eventOptionAvailable`** (§8.4 rule 1):

- both models offered → `"Pay per event, or move to a storage plan."`
- storage-plan studio → `"Pick the storage tier that fits."` — must not hint that a second
  pricing model exists.

`size="lg"` on `choose` and `billing`, `size="md"` on `confirm` and `status`.

Reset **all** local state on close (`selection`, `appliedCoupon`, `preview`, `step`, and
`reset()` from `useCheckoutFlow`) — the existing `handleClose` already does most of this; extend it.

---

## 8. Work item G — The event-vs-storage selection flow

The current `PlanChooser` puts the mode switch in a small pill tab-strip that is easy to miss,
and hides the event tab entirely for storage-plan customers. Rework the **`choose`** step into
two screens.

### 8.1 Screen 1 — pick a pricing model

Only rendered when **both** models are available to this studio (see §8.4). Two large selectable
cards, stacked on mobile, `sm:grid-cols-2`:

**Card A — "Pay per event"**
- Icon: a calendar/ticket icon from the barrel.
- Headline price: `{formatInr(eventPlan.event_unit_price)}` + muted `/ event`.
- Bullets (`text-xs`, muted, with tiny check marks):
  - "Buy exactly what you need"
  - "Credits never expire"
  - "No monthly commitment"

**Card B — "Storage plan"**
- Icon: the existing `StorageIcon`.
- Headline price: `From {formatInr(cheapest monthly tier price)}` + muted `/ month`.
- Bullets:
  - "Unlimited events"
  - "{largest tier} GB of storage" (computed from `buildStorageTiers`)
  - "Cancel any time"
- If `maxSavings > 0`, a small pill in the card corner: **"Save up to {maxSavings}% yearly"**.

Card styling: `rounded-xl border p-5 text-left`, `border-[var(--color-brand-border)]
bg-[var(--color-brand-surface)]`; on hover `border-[var(--color-brand-outline)]`; when selected
`border-[var(--color-brand-navy)] ring-1 ring-[var(--color-brand-navy)]
bg-[var(--color-brand-navy-soft)]`. Each card is a `<button type="button">` with
`brand-focus`, `role="radio"` inside a `role="radiogroup" aria-label="Pricing model"`, and
arrow-key navigation between the two.

Selecting a card advances immediately to screen 2 (no separate Continue button — one tap).

### 8.2 Screen 2 — details for the chosen model

A small back affordance at the top: **"← Pricing model"** (`text-xs`, muted), returning to
screen 1 — rendered **only when `eventOptionAvailable` is true**. A storage-plan studio never saw
screen 1, so showing it a way back to a model chooser would leak the existence of pay-per-event
(§8.4 rule 1). Then:

**Event-based details**
- Line: **"{formatInr(unit)} per event · GST included"**.
- The existing `EventQuantity` component (presets 1/5/10/25, −/+ stepper, free-typed input,
  clamped 1–100). Keep it, but:
  - Add a label above it: **"How many events?"** (`text-sm font-semibold`).
  - Below the stepper, a live running total that updates on every change:
    `{qty} × {formatInr(unit)}` on the left, `{formatInr(qty * unit)}` in
    `text-2xl font-bold tabular-nums` on the right, inside the existing
    `rounded-lg bg-[var(--color-brand-bg)] px-4 py-3` block.
  - The multiplication is **display only**. The authoritative amount is always
    `previewCheckout(...)` on the `confirm` step. Add a muted line:
    *"Final total with any discounts is shown at the next step."*
- Primary button: **"Continue"**.

**Storage details** — unchanged from today (interval toggle, `StorageSlider`, tier summary,
downgrade/current-plan CTA states). Only the surrounding chrome changes.

### 8.3 `PlanChooser` API changes

Keep the component and its `PlanChooserSelection` union exactly as they are — `app/(dashboard)/checkout/page.tsx` also consumes it. Add:

```ts
/** "cards" renders the new two-screen picker (upgrade modal). "tabs" keeps the
 *  legacy pill strip (the standalone /checkout deep-link page, which usually
 *  arrives with a plan already chosen). Defaults to "tabs". */
variant?: "tabs" | "cards";
```

`UpgradeModal` passes `variant="cards"`. `/checkout` keeps the default. This way the deep-link
page is untouched and un-regressed.

### 8.4 Availability rules and empty states — read carefully

The reported symptom is *"the event-based pricing and selection flow is missing in frontend."*
Three independent things can cause that. Handle all three:

1. **Storage-plan studios must never see any trace of event-based pricing. Total suppression.**
   When `isStorageBasedPlan(currentSnapshot?.service?.service_type)` is true, a Monthly/Yearly
   studio must not encounter the words "pay per event", a per-event price, an event quantity
   control, or an explanation of why any of those are absent. The backend already rejects
   storage → event downgrades (see `/checkout`'s `guardMessage`), so there is nothing to offer
   and nothing to apologise for. Concretely:

   - Screen 1 (the two pricing-model cards) is **not rendered at all** — the `choose` step opens
     directly on storage details. No "you're on a storage plan…" note, no disabled card, no
     tooltip. The user should simply experience a plan picker that only ever had storage tiers.
   - Screen 2 renders **without** the "← Pricing model" back affordance (§8.2) — there is nothing
     to go back to.
   - The modal subtitle is `"Pick the storage tier that fits."`, not the dual-model copy (§7.3).
   - Any `preset: "event"` passed by a caller is ignored outright (see rule 2 below).
   - Audit the surrounding surfaces for leaks too, and fix any you find: `CheckoutSummary`'s
     `note` prop must not receive the "One-time payment — credits never expire." string on this
     path; `UsageMeter` must read "Storage used"; and the empty/error states in rule 3 must not
     name pay-per-event.

   Implement this as a single derived boolean at the top of `PlanChooser`
   (`const eventOptionAvailable = Boolean(eventPlan) && !isStorageBasedPlan(currentServiceType)`)
   and branch every one of the above off it, so there is one place to reason about.
2. **Blank-panel bug — the most visible face of the reported symptom.** `PlanChooser` sets
   `mode = initialMode ?? …` **before** checking availability, so when a caller passes
   `preset: "event"` (`AddEventModal`, the dashboard's 402 handler, `events/page.tsx`) while
   `eventOptionAvailable` is `false`, **neither** the event block nor the storage block renders —
   the user gets a completely empty panel. Clamp the initial mode to what is actually available:

   ```ts
   const requestedMode = initialMode ?? initialFromDeepLink?.mode ?? (eventOptionAvailable ? "event" : "storage");
   const [mode, setMode] = useState<Mode>(
     () => (requestedMode === "event" && !eventOptionAvailable ? "storage" : requestedMode),
   );
   ```

   When the clamp fires, say **nothing** — per rule 1, fall through to storage silently.

   **Do not add an `event_unit_price ?? price` fallback to `eventPlanOf`.** The backend's
   `computeGrossAmount` (`billing.service.js:282`) multiplies `service.event_unit_price` by the
   quantity and reads nothing else, so a client-side fallback would desync the displayed total
   from the amount actually charged. `event_unit_price` staying the single source of truth is
   deliberate — leave `eventPlanOf` as it is.

3. **Un-swallow the plan fetch.** `UpgradeModalProvider`'s `getBillingPlans().catch(() => {})`
   hides every failure. Store the error in state and render it in the modal's `choose` step as a
   danger-styled block with a Retry button, instead of the generic "We're updating our pricing."

4. **Plan `name` is null on every service document** returned by `GET /billing/plans`, so
   `planLabel()` always falls through to its derived labels. Not a blocker — do not work around it
   in code — but flag it in the PR so someone can populate real names via
   `POST /billing/admin/services`.
5. **Genuinely nothing purchasable.** If neither an event plan nor any storage tier exists, keep
   the existing graceful message ("We're updating our pricing. Contact support to change your
   plan.") — but also log a `console.warn` naming the missing plan family, so this failure mode is
   diagnosable from a browser console next time. The user-facing string must stay model-agnostic;
   do not name pay-per-event in it (rule 1).

---

## 9. Work item H — Billing details inside the purchase flow

### 9.1 Detecting incompleteness

Today `UpgradeSheet` catches `BILLING_PROFILE_INCOMPLETE` from `previewCheckout` and shows a
dead-end link to the settings page. Replace this with an in-flow step.

Two detection paths — implement both:

- **Proactive**: when the modal opens, fire `getBillingProfile()` alongside the plans fetch.
  A profile is complete when `legal_name`, `billing_address`, and `place_of_supply_state` are all
  non-empty (GSTIN is optional). Store as `billingComplete: boolean | null` (`null` = unknown).
- **Reactive**: keep the existing `getApiErrorCode(err) === "BILLING_PROFILE_INCOMPLETE"` catch on
  `previewCheckout` as a backstop, and on that error force `step = "billing"` rather than
  rendering the warning banner.

### 9.2 The `billing` step

Extract the form body of `app/(dashboard)/dashboard/settings/billing/BillingDetailsCard.tsx`
into a reusable `components/billing/BillingDetailsForm.tsx`:

```ts
type BillingDetailsFormProps = {
  /** Studio address offered as a one-tap prefill; omit/null to hide that option. */
  studioAddress?: string | null;
  studioName?: string | null;
  /** Rendered in the modal footer instead of the settings SaveBar when set. */
  submitLabel?: string;
  onSaved: (profile: BillingProfile) => void;
  onCancel?: () => void;
};
```

- `BillingDetailsCard` becomes a thin wrapper: `<Card>` + `<BillingDetailsForm>` + the existing
  `SaveBar`. Its behaviour on the settings page must not change at all.
- The modal renders `<BillingDetailsForm submitLabel="Save & continue" … />` with its submit
  button in the `Modal` footer.
- **Same fields, same validation, same error handling** as today, including the
  `GSTIN_STATE_MISMATCH` message and the Google-Places-driven `place_of_supply_state` prefill via
  `findGstStateByName`.

### 9.3 The "Same as studio address" rule (explicitly decided)

The `SameAsPersonalCheckbox` labelled **"Same as studio address"**:

- Is **shown and enabled** only when `company.address` is non-empty **and**
  `company.gmb_skipped !== true`.
- When `company.gmb_skipped === true`, render it **disabled** (`opacity-60`,
  `cursor-not-allowed`, `aria-disabled`) with the helper line:
  > **"You skipped the Google Business step, so we don't have a studio address on file. Enter
  > your billing address below."**

  Do **not** hide it — a visibly disabled control with an explanation is what tells the user why
  the shortcut they expected isn't there. This applies in **both** places the form renders (the
  modal step and the settings card).

### 9.4 After saving

- `onSaved` sets `billingComplete = true`, advances to `confirm`, and **re-runs
  `previewCheckout`** with the current selection (the previous attempt failed, so there is no
  cached preview).
- Persisted server-side by `PUT /billing/profile` — the existing endpoint. Nothing new. Once
  saved, the modal never asks again, and neither does the settings page, because they read the
  same profile.

### 9.5 The `confirm` step

Unchanged from the current sheet's confirm view — `CheckoutSummary`, `CouponField`, the
proration/scheduled/estimate labelling, and `runCheckout` — with two adjustments:

- Delete the `billingProfileIncomplete` warning banner and its `totalPendingLabel` branch
  ("Add billing details to continue"), which the `billing` step now supersedes. `canPay` becomes
  `!previewLoading && (isScheduled || displayTotal !== null)`.
- Move the Back / Pay button pair into the `Modal` `footer` prop so it stays pinned above the fold
  on mobile. On mobile the pay button is full-width with the Back button above it as a text
  button; on `sm:` they sit side by side exactly as today.

---

## 10. Work item I — Settings navigation and copy

### 10.1 `SettingsNav.tsx`

`SETTINGS_GROUPS` becomes exactly:

```ts
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    heading: "Brand & Delivery",
    items: [
      { label: "Studio Identity", href: "/dashboard/settings" },
      { label: "Social Links", href: "/dashboard/settings/social-links" },
      { label: "Watermark Presets", href: "/dashboard/settings/watermarks" },
    ],
  },
  {
    heading: "Your Account",
    items: [
      { label: "Personal Information", href: "/dashboard/settings/personal" },
      { label: "Plan & Billing", href: "/dashboard/settings/billing" },
    ],
  },
];
```

The standalone **"Billing"** group heading is gone. **"Plan & Storage"** is gone.

### 10.2 Delete the Plan & Storage route

- Delete `app/(dashboard)/dashboard/settings/plan/page.tsx` and its directory.
- Add `app/(dashboard)/dashboard/settings/plan/page.tsx` back as a **permanent redirect stub** so
  bookmarks and any stale link don't 404:
  ```tsx
  import { redirect } from "next/navigation";
  export default function PlanRedirect() {
    redirect("/dashboard/settings/billing");
  }
  ```
  (Server component, no `"use client"`.)
- Before deleting, check the billing page still surfaces everything the old page did. It does:
  `UsageMeter` handles both count-based and storage-based snapshots and shows used/limit/remaining
  with a severity-coloured bar. **One thing is missing** — the old page showed the reset date. Add
  it: under `UsageMeter` on the billing page's "Current plan" card, a muted `text-xs` line
  **"Resets {date}"** using the same `en-IN` `Intl.DateTimeFormat` already defined at the top of
  `billing/page.tsx`, sourced from `snapshot.current_period_end` (or, for Free/Event-based where
  that's null, omit the line entirely rather than inventing a date).
- The `SectionHeading` on the billing page keeps `title="Plan & Billing"` but its `eyebrow`
  changes from `"Billing"` to `"Your Account"` (three occurrences in that file — the access-denied
  branch, the resume-confirming branch, and the main render). Keep the description.

### 10.3 Button copy

In `app/(dashboard)/dashboard/settings/billing/page.tsx`, replace:

```tsx
{isStorageBasedPlan(snapshot?.service?.service_type) ? "Change plan" : "Buy more events"}
```

with the literal string `Upgrade plan` — unconditionally, both plan families. The
`isStorageBasedPlan` import may become unused there; remove it if so.

Also retitle the modal's `choose` step to **"Upgrade plan"** (§7.3) so the button and the surface
it opens agree.

---

## 11. Responsiveness and accessibility — the bar

Every screen touched by this work must satisfy all of the following. Check them on
**375×667 (small phone), 390×844, 768×1024, and 1440×900**.

- **No horizontal scroll at any width.** Test the upgrade modal at 320px too.
- **Onboarding wizard**: card is `w-full max-w-md`, padded `p-7 sm:p-9`; at ≤375px the OTP boxes
  must not overflow — they're `flex-1` with `gap-2`, verify. The Google step's Places dropdown
  must be reachable and not clipped by the card (`overflow` must not be hidden on an ancestor).
- **Upgrade modal**: full-screen under 640px with a sticky header and sticky footer; the body
  scrolls, the buttons never do. Above 640px, `max-h-[85vh]` with internal scroll.
- **Pricing-model cards**: single column under 640px, two columns at `sm:` and up. Each card is
  its own tap target with ≥44px height.
- **Storage slider**: already degrades to a pill row under `sm:` — keep that.
- **Billing form in the modal**: `grid gap-4 sm:grid-cols-2`, single column on mobile. The state
  `<select>` must be a native select (iOS wheel picker) — do not replace it with a custom dropdown.
- **Keyboard**: every flow completable with keyboard alone. Tab order follows visual order. Focus
  is trapped inside modals and restored on close.
- **Screen readers**: modals labelled via `aria-labelledby`; the pricing cards form a
  `radiogroup`; the progress indicator is a `progressbar`; all error blocks are
  `role="alert"`; the OTP resend countdown is `aria-live="polite"` (already is).
- **Contrast**: all text on `--color-brand-surface` / `--color-brand-bg` must hit 4.5:1. Muted
  text on coloured pills is the risky one — check the "Save up to X%" pill and the "Verified" pill.
- **Reduced motion**: all new keyframes disabled under `prefers-reduced-motion: reduce`.
- **Loading states**: use the existing `skeleton` utility class, never a bare spinner in place of
  content that has a known shape.
- **Disabled buttons** are `disabled:cursor-not-allowed disabled:opacity-60` — the existing
  convention.

---

## 12. Exact copy deck

Use these strings verbatim. Sentence case. No exclamation marks except the one noted. Never use
"Oops", "Whoops", or blame-the-user phrasing.

**Onboarding step 1** — eyebrow "Set up your studio" · h2 "Tell us about your studio" ·
sub "Confirm your studio name and verify a WhatsApp number — delivery notifications and client
replies go here." · fields "Studio name", "WhatsApp number" · button "Send code" / "Sending code…"

**Onboarding step 2** — eyebrow "Verify WhatsApp" · h2 "Enter the code" · sub "Code sent to
{masked}" · button "Verify" / "Verifying…" · "Resend in 0:{ss}" / "Resend OTP" · back "Change
details"

**Onboarding step 3** — eyebrow "Almost there" · h2 "Find your studio on Google" · sub "This
links your Google reviews so clients can leave one in a single tap from their gallery." ·
button "Finish setup" / "Saving…" · skip "I don't have a Google listing yet" ·
skip confirm h3 "Skip for now?" · skip confirm buttons "Go back" / "Skip anyway"

**Welcome dialog** — h2 "You're all set 🎉" · body "Your studio is verified. You've got {n} free
events to try everything out — create a gallery, share the QR, and watch the deliveries land." ·
primary "Upgrade plan" · secondary "Start with free events"

**Studio Identity** — label "WhatsApp number" · pill "Verified" · helper "Delivery notifications,
OTPs and client replies all go to this number." · action "Change number"

**Change-number modal** — title "Change WhatsApp number" · body "We'll send a 6-digit code to the
new number. Your current number stays active until the new one is verified." · button "Send code"
→ "Verify" · success "WhatsApp number updated."

**Upgrade modal** — title "Upgrade plan" · sub "Pay per event, or move to a storage plan."
(**storage-plan studios instead get** "Pick the storage tier that fits." — never the dual-model
line) · card A "Pay per event" · card B "Storage plan" · event label "How many events?" ·
event footnote "Final total with any discounts is shown at the next step." ·
billing step title "Billing details" · sub "Needed on your invoice — and to work out GST
correctly." · billing submit "Save & continue" · confirm title "Confirm your purchase" ·
pay button "Pay {amount}" / "Schedule change"

**GMB nudge strip** — "Add your Google listing to collect reviews." · sub "Clients can leave a
review straight from their gallery once it's linked." · action "Add it now"

**Disabled same-as-studio helper** — "You skipped the Google Business step, so we don't have a
studio address on file. Enter your billing address below."

---

## 13. File-by-file manifest

### Backend — `Vyavasth/backend`

| File | Action |
|---|---|
| `src/models/companies.model.js` | Remove `contact_number`; add `whatsapp_pending_number`, `gmb_skipped`, `onboarding_completed_at`, `welcome_dialog_seen_at` |
| `src/utils/auth.utils.js` | `issueCompanyWhatsappOtp` gains optional `toNumber` |
| `src/controllers/onboarding.controller.js` | Drop `contact_number` from `registerCompany` + `updateCompanyDetails`; add `requestWhatsappChangeOtp`, `resendWhatsappChangeOtp`, `verifyWhatsappChangeOtp`, `saveGoogleBusiness`, `markWelcomeDialogSeen` |
| `src/validators/onboarding.validator.js` | Validators for the five new endpoints |
| `src/routes/onboarding.routes.js` | Wire the five new routes (`protect`, no `enforceSubscriptionState`) |
| `src/utils/deliverables.utils.js` | Emit `company_whatsapp_number` + legacy `company_contact_number` alias |
| `src/controllers/deliverables.controller.js` | `$project` both keys from `whatsapp_number`; `redirectQR` reads `whatsapp_number` |
| `src/scripts/migrate-contact-to-whatsapp.js` | **New** — the 4-step migration in §2.4 |

### Frontend — `delivery-promotional-page/frontend`

| File | Action |
|---|---|
| `lib/types.ts` | `Company`: drop `contact_number`, add 4 fields; delivery-page type gains `company_whatsapp_number` |
| `lib/api.ts` | Drop `contact_number` from `CompanyUpdateInput`; add 5 new functions (§4.5) |
| `lib/auth.ts` | Add exported `needsOnboarding(company)` |
| `components/ui/Modal.tsx` | **New** — §7.1 |
| `components/ui/AddressField.tsx` | **New** — moved out of `SettingsUI.tsx`, re-exported from there |
| `components/ui/Drawer.tsx` | **Delete** once unused |
| `components/ui/icons.tsx` | Add any missing icons (gift/sparkle/ticket) to the barrel |
| `app/globals.css` | Add `modal-fade` / `modal-pop` / `modal-slide-up`; remove `drawer-*` if orphaned |
| `app/(dashboard)/onboarding/page.tsx` | 3-step machine + resume logic + progress bar |
| `components/onboarding/StudioDetailsStep.tsx` | Copy tweaks only |
| `components/onboarding/WhatsappOtpStep.tsx` | Consume the extracted `OtpCodeInput` |
| `components/onboarding/OtpCodeInput.tsx` | **New** — extracted six-box input |
| `components/onboarding/GoogleBusinessStep.tsx` | **New** — §5.4 |
| `components/onboarding/WelcomeDialog.tsx` | **New** — §6 |
| `app/(dashboard)/dashboard/layout.tsx` | Use shared `needsOnboarding`; rename provider import |
| `app/(dashboard)/auth/callback/page.tsx` | Use shared `needsOnboarding` |
| `app/(dashboard)/dashboard/page.tsx` | Mount `WelcomeDialog`; add GMB nudge strip; rename hook |
| `app/(dashboard)/dashboard/events/page.tsx` | Rename hook |
| `components/dashboard/AddEventModal.tsx` | Rename hook |
| `app/(dashboard)/dashboard/settings/SettingsNav.tsx` | New `SETTINGS_GROUPS` (§10.1) |
| `app/(dashboard)/dashboard/settings/SettingsUI.tsx` | Add `VerifiedWhatsappField`; re-export `AddressField` |
| `app/(dashboard)/dashboard/settings/SettingsContext.tsx` | Add `refreshCompany()` |
| `app/(dashboard)/dashboard/settings/page.tsx` | Remove contact field + same-as-phone; add verified WA row + change modal |
| `app/(dashboard)/dashboard/settings/ChangeWhatsappModal.tsx` | **New** — §3.3 |
| `app/(dashboard)/dashboard/settings/plan/page.tsx` | Replace with redirect stub |
| `app/(dashboard)/dashboard/settings/billing/page.tsx` | "Upgrade plan" copy; eyebrow → "Your Account"; reset-date line |
| `app/(dashboard)/dashboard/settings/billing/BillingDetailsCard.tsx` | Thin wrapper over the new shared form |
| `components/billing/BillingDetailsForm.tsx` | **New** — extracted, §9.2 |
| `components/billing/UpgradeModal.tsx` | Renamed from `UpgradeSheet.tsx`; 4-step machine on `Modal` |
| `components/billing/UpgradeModalProvider.tsx` | Renamed from `UpgradeSheetProvider.tsx` |
| `components/billing/PlanChooser.tsx` | `variant` prop; `cards` two-screen flow |
| `components/billing/EventQuantity.tsx` | Label + live total wiring |
| `components/event/screens/LoungeGallery.tsx` | Read `company_whatsapp_number` first |
| `components/event/GalleryUnavailable.tsx` | Read `company_whatsapp_number` first |

---

## 14. Verification checklist — run every line

Do not report the work as complete until each of these has actually been exercised.

**Build & static**
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` — zero new warnings
- [ ] `npm test` in the backend — all green
- [ ] `grep -rn "contact_number" --include=*.ts --include=*.tsx frontend/` returns only the
      deprecated legacy-alias declaration and the two guest-gallery fallbacks
- [ ] `grep -rn "UpgradeSheet\|openUpgradeSheet\|useUpgradeSheet" frontend/` returns nothing
- [ ] `grep -rn "ui/Drawer" frontend/` returns nothing

**Migration**
- [ ] `--dry-run` output reviewed against a copy of production-shaped data
- [ ] Re-running the migration a second time changes nothing (idempotent)
- [ ] A company with `whatsapp_verified: true` and no `onboarding_completed_at` gets both
      `onboarding_completed_at` **and** `welcome_dialog_seen_at` backfilled

**New-signup happy path** (fresh Google/email signup)
- [ ] Lands on `/onboarding` at step 1, not the dashboard
- [ ] Studio name + 10-digit number → OTP received on WhatsApp
- [ ] Wrong code shakes, clears, increments; 6th attempt returns 429
- [ ] Correct code → step 3, and `company.name` is persisted
- [ ] Hard-refresh at step 3 resumes at step 3 (does not restart at step 1)
- [ ] Manually navigating to `/dashboard` at step 3 bounces back to `/onboarding`
- [ ] Picking a Google listing → `/dashboard`, `google_place_id` + `address` saved,
      `onboarding_completed_at` stamped
- [ ] Welcome dialog appears once, shows the real free-event count from the subscription snapshot
- [ ] Reload the dashboard → dialog does **not** reappear
- [ ] Log out, log back in, different browser → dialog still does not reappear
- [ ] "Upgrade plan" in the dialog closes it and opens the upgrade modal

**Skip path**
- [ ] "I don't have a Google listing yet" → confirm → dashboard, `gmb_skipped: true`
- [ ] GMB nudge strip appears on the dashboard; dismisses for the session; returns on next visit
- [ ] In the upgrade modal's billing step, "Same as studio address" is visibly **disabled** with
      the explanatory helper
- [ ] Same disabled state on the settings Billing details card

**Existing studios (regression — the important one)**
- [ ] A company with `onboarding_required: true, whatsapp_verified: true` (post-migration) goes
      straight to `/dashboard`, never sees the Google step, never sees the welcome dialog
- [ ] A company with `onboarding_required` unset/false is never gated at all

**Studio Identity**
- [ ] WhatsApp number renders prefilled, formatted `+91 XXXXX XXXXX`, read-only, "Verified" pill
- [ ] No "Business contact" field, no "Same as personal phone" checkbox
- [ ] Saving other fields does not send or clear `whatsapp_number`
- [ ] "Change number" → OTP to the **new** number → on success the field and the Topbar/Sidebar
      cached company both update without a reload
- [ ] Abandoning the change (close the modal mid-OTP) leaves the **old** number live and verified
- [ ] Entering the current number as the "new" number is rejected client- and server-side

**Settings nav**
- [ ] Only two groups: Brand & Delivery, Your Account
- [ ] "Plan & Billing" sits under Your Account; no "Billing" heading anywhere
- [ ] `/dashboard/settings/plan` redirects to `/dashboard/settings/billing`
- [ ] Breadcrumb reads "Settings › Plan & Billing"

**Billing / upgrade**
- [ ] The button reads "Upgrade plan" on Free, Event-based, Monthly and Yearly
- [ ] A Free-plan studio hitting its event cap via `AddEventModal` sees the quantity screen, not
      an empty panel (§8.4 rule 2)
- [ ] Killing the network before opening the modal shows a retryable error, not "We're updating
      our pricing." (§8.4 rule 3)
- [ ] Free-plan studio: modal opens on the two-card pricing-model screen
- [ ] "Pay per event" → quantity screen; typing 7 shows `7 × ₹X` and the correct running total
- [ ] Quantity clamps to 1 and 100; the − button at 1 and + at 100 are no-ops
- [ ] "Storage plan" → interval toggle, slider, tier summary all behave as before

**Storage-plan total suppression (§8.4 rule 1) — audit as a Monthly and as a Yearly studio**
- [ ] Modal opens straight on storage tiers; the two-card screen never appears
- [ ] No "← Pricing model" back affordance anywhere in the flow
- [ ] Subtitle reads "Pick the storage tier that fits." — not the dual-model line
- [ ] Forcing `openUpgradeModal({ preset: "event" })` from the console lands on storage tiers
      silently — no empty panel, no explanatory message
- [ ] `CheckoutSummary`'s note never says "One-time payment — credits never expire."
- [ ] `UsageMeter` reads "Storage used"; the billing page shows no event counts
- [ ] Search the rendered DOM for "event" (case-insensitive) across the whole modal and the
      billing page — the only permitted hits are unrelated words like "Events" in the sidebar nav
      and event/gallery names
- [ ] With no billing profile: selecting a plan routes to the billing step, not a dead-end banner
- [ ] Saving billing details advances to confirm and the preview total appears
- [ ] Reopening the modal later skips the billing step entirely
- [ ] Settings → Billing details still saves independently and shows the same saved values
- [ ] `GSTIN_STATE_MISMATCH` still produces its specific message in both places
- [ ] Coupon apply/remove still updates the preview
- [ ] Razorpay opens; dismissing it lands on the "dismissed" state; success lands on "confirming"
- [ ] A scheduled downgrade still shows "Schedule change" / "No charge now"

**Modal mechanics**
- [ ] < 640px: full screen, sticky header + footer, body scrolls, no page scroll behind
- [ ] ≥ 640px: centered, `max-h-[85vh]`, backdrop blur, internal scroll only
- [ ] Escape closes; backdrop closes (except the welcome dialog); X closes
- [ ] Focus is trapped; Tab cycles; focus returns to the trigger on close
- [ ] Reopening after a close starts from a clean `choose` step with no stale selection
- [ ] `prefers-reduced-motion` kills the animations

**Guest side (regression)**
- [ ] An already-published gallery (old KV object, only `company_contact_number`) still shows the
      WhatsApp contact button with the right number
- [ ] A freshly published gallery uses `company_whatsapp_number`
- [ ] `/error/qr-not-assigned?phone=…` still gets a number

---

## 15. Out of scope — do not touch

- Razorpay webhook handling, proration maths, invoice generation, `billing-math.utils.js`.
- The guest-facing gallery experience beyond the two number-fallback lines in §2.5.
- `app/(dashboard)/checkout/page.tsx` beyond the `variant` default staying `"tabs"` (it must keep
  working exactly as it does today).
- The `registerCompany` admin flow's email/password behaviour.
- Any change to `enforceSubscriptionState` or the `requireBillingAccess` rule.
- Adding a Free→paid auto-upgrade, trials, or any pricing change. The unit price and tier prices
  come from the database, always.

---

## 16. Deliverable

A single branch off `develop` per repo. Backend PR first (the frontend depends on the new
endpoints and fields). In each PR description include:

1. The migration dry-run output.
2. Screenshots or a short recording of: the 3-step onboarding, the welcome dialog, the upgrade
   modal at 375px and 1440px, the disabled "Same as studio address" state, and the upgrade modal
   as seen by a Monthly-plan studio (proving §8.4 rule 1).
3. Any `// NOTE(open-question):` comments you left, listed explicitly.
