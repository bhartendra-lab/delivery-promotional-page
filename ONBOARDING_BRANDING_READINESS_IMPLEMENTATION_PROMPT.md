# Implementation Prompt — Onboarding Cleanup, Business-Email OTP & Branding-Readiness Reminders

You are working across two projects:

- **Backend**: `Vyavasth/backend` — Node.js (ESM), Express, Mongoose, Passport (Google OAuth), WhatsApp Cloud API, Nodemailer. Relevant files: `src/config/passport.js`, `src/controllers/auth.controller.js`, `src/controllers/onboarding.controller.js`, `src/controllers/deliverables.controller.js`, `src/routes/onboarding.routes.js`, `src/validators/onboarding.validator.js`, `src/models/companies.model.js`, `src/models/user.model.js`, `src/models/deliverables.model.js`, `src/utils/auth.utils.js`, `src/utils/crypto.utils.js`, `src/services/mail.service.js`, `src/services/mail.render.js`, `src/middleware/auth.middleware.js`, `src/middleware/subscription.middleware.js`.
- **Frontend**: `delivery-promotional-page/frontend` — Next.js 16 (app router), React 19, TypeScript, Tailwind v4. Relevant files: `app/(dashboard)/onboarding/page.tsx`, `components/onboarding/*`, `app/(dashboard)/dashboard/layout.tsx`, `app/(dashboard)/dashboard/settings/**`, `app/(dashboard)/dashboard/events/[booking_id]/**`, `app/(dashboard)/checkout/page.tsx`, `components/billing/*`, `components/ui/Modal.tsx`, `components/ui/icons.tsx`, `lib/api.ts`, `lib/types.ts`, `lib/auth.ts`, `lib/plans.ts`, `lib/useCompany.ts`, `BACKEND_NOTES.md`. Backend billing entry point: `src/controllers/billing.controller.js`.

**Read every file named above before writing any code.** Match the existing conventions, comment style (explain *why*, not *what*), and design language exactly. Do not introduce new npm dependencies in either project. `frontend/AGENTS.md` applies: this is Next.js 16 — consult `node_modules/next/dist/docs/` before reaching for any router/params API you're unsure about.

## Goal

Eight related changes, grouped into four themes:

1. **Onboarding hygiene** — stop inventing a studio name from the Google profile, and stop pre-filling either name field during mandatory onboarding (§1, §2).
2. **Verified business email** — add an email-OTP flow for `business_email`, sent and verified inline on Settings → Studio Identity (§4), and a real `get-user-details` / `update-user-details` pair backing Settings → Personal Information (§6).
3. **Two branding-readiness reminders** — a watermark nudge before the first upload (§3) and a pre-share branding checklist on the event's Access & Sharing tab (§5), both driven by one **server-side** reminder-status API (§3a).
4. **Upgrade flow** — stop the upgrade modal from skipping the pricing-model picker (§7), and rewrite the pay-per-event bullets (§8).

---

## What already exists (do not rebuild)

### Mandatory onboarding (3 steps, company-scoped)
`app/(dashboard)/onboarding/page.tsx` drives `"details" → "otp" → "google"`:

- **Step 1** `components/onboarding/StudioDetailsStep.tsx` — studio name + 10-digit WhatsApp number → `POST /onboarding/whatsapp/request-otp`.
- **Step 2** `components/onboarding/WhatsappOtpStep.tsx` — 6-digit code → `POST /onboarding/whatsapp/verify-otp` with `{ code, studio_name }`. `verifyWhatsappOtp` in `onboarding.controller.js` is what actually persists `company.name` (deliberately folded in here so an abandoned attempt never half-saves a name).
- **Step 3** `components/onboarding/GoogleBusinessStep.tsx` — Google Places search → `POST /onboarding/google-business` with `{ google_place_id, address }` or `{ skipped: true }`. Stamps `onboarding_completed_at`, which is what gates `/dashboard` (see `needsOnboarding` in `lib/auth.ts`).

`AddressField` (`components/ui/AddressField.tsx`) fires `onChange` on every keystroke and `onPlaceSelect` **only** when Google resolves a place. With no `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` it silently degrades to a plain text input and can never produce a `place_id`.

### Company OTP infrastructure (WhatsApp) — the pattern to mirror for email
- `issueCompanyWhatsappOtp` in `src/utils/auth.utils.js`: cooldown check → `generateNumericCode(6)` → bcrypt hash → persist (`*_otp_code_hash`, `*_otp_expires_at`, `*_otp_attempts`, `*_otp_last_sent_at`) → send → **writes the HTTP response itself**. `OTP_TTL_MS` = 10 min, `OTP_RESEND_COOLDOWN_MS` = 30 s; 429 responses carry `{ message, retryAfter }`.
- `WHATSAPP_OTP_MAX_ATTEMPTS = 5` in `onboarding.controller.js`.
- `whatsapp_pending_number` on `companies` holds an in-flight new number so a failed change never disturbs the live verified one.
- Frontend: `components/onboarding/OtpCodeInput.tsx` (segmented input, `shake` prop), `app/(dashboard)/dashboard/settings/ChangeWhatsappModal.tsx` (two-step number → OTP, live resend countdown, `retryAfter` drift-safety), `VerifiedWhatsappField` in `settings/SettingsUI.tsx` (read-only value + "Verified" pill + "Change number" link).

### Settings area
`settings/layout.tsx` wraps everything in `SettingsProvider` (`SettingsContext.tsx`), which fetches the company **once** for the whole area and exposes `{ company, userProfile, save, saveProfile, setCompanyState }` plus `useSectionSave()` / `useProfileSectionSave()`. Nav lives in `SettingsNav.tsx` (`SETTINGS_GROUPS`):

| Tab | Route | File |
| --- | --- | --- |
| Studio Identity | `/dashboard/settings` | `settings/page.tsx` |
| Social Links | `/dashboard/settings/social-links` | `social-links/page.tsx` |
| Watermark Presets | `/dashboard/settings/watermarks` | `watermarks/page.tsx` |
| Personal Information | `/dashboard/settings/personal` | `personal/page.tsx` |
| Plan & Billing | `/dashboard/settings/billing` | `billing/page.tsx` |

The Studio Logo card in `settings/page.tsx` already carries `id="studio-logo"` with `scroll-mt-24`, so `/dashboard/settings#studio-logo` is a working deep link.

### Watermark presets
`WatermarkPreset` in `src/models/deliverables.model.js` (company-scoped: `company_id`, `image_url`, `opacity`, `position`, `size`, `is_default`), CRUD at `/deliverables/{get,create,update,delete}-watermark-preset*`, frontend `getWatermarkPresets()` in `lib/api.ts` → `{ presets: WatermarkPreset[] }`, UI in `settings/watermarks/page.tsx` + `WatermarkEditorModal.tsx`. `settings/watermarks/page.tsx` owns a `ModalState` of `{ mode: "create" } | { mode: "edit"; preset } | null`.

### Event workspace
`app/(dashboard)/dashboard/events/[booking_id]/EventWorkspace.tsx` owns the tab strip (`media` | `gallery` | `access` | `smart`) and `onTabChange`. Uploads are triggered **only** from `MediaTab.tsx`, in exactly two places:
- `handleBulkUpload()` — the empty-state CTA (`EmptyUploadCTA`), i.e. the first upload for a brand-new event.
- `handleUploadMore()` — the "Upload more" button.

Both do nothing but `setUploadIntent({ step, target, folderOnly })`; `<UploadModal open={!!uploadIntent} … />` renders off that state. `AccessSharingTab.tsx` is mounted only while `effectiveTab === "access"`.

### Upgrade / checkout flow
`app/(dashboard)/dashboard/layout.tsx` nests `ChromeProvider → SubscriptionProvider → UpgradeModalProvider`, so any dashboard page can call `useUpgradeModal().openUpgradeModal({ preset? })`. `UpgradeModalProvider` owns the plan-catalog + billing-profile fetch (**lazy — first `open`**, tracked by a local `loaded` flag that is currently only used to compute `billingComplete`) and always renders `<UpgradeModal>`, whose `Modal` returns `null` while closed. `UpgradeModal` walks `choose → billing → confirm → status` and delegates the `choose` step to `PlanChooser` with `variant="cards"`; `/checkout` uses the same component with the legacy `variant="tabs"`. Plan-catalog helpers (`eventPlanOf`, `buildStorageTiers`, `planForTier`, `yearlySavingsPercent`, `formatInr`, `formatStorage`) live in `lib/plans.ts`; `GET /billing/plans` is `getPlans` in `src/controllers/billing.controller.js`. Entry points: Settings → Plan & Billing (`openUpgradeModal()`, no preset), `WelcomeDialog` (no preset), and `dashboard/page.tsx` / `dashboard/events/page.tsx` / `AddEventModal.tsx` (all `preset: "event"`).

### Shared primitives
- `components/ui/Modal.tsx` — `{ open, onClose, title, subtitle?, size?: "sm"|"md"|"lg", dismissOnBackdrop?, headerLeading?, footer?, children }`. Every new dialog must build on this.
- `components/onboarding/WelcomeDialog.tsx` — the reference one-shot dialog (ref-guarded ack, optimistic local fallback on network failure).
- `components/ui/icons.tsx` — the canonical `Icon*` barrel (`IconPalette`, `IconImage`, `IconShieldCheck`, `IconWarningCircle`, `IconMail`, `IconCheck`, `IconGlobe`, `IconShare`, `IconSparkle`, …). **There is no droplet/watermark icon — do not invent one**; reuse `IconPalette` (watermark) and `IconShieldCheck` (branding checklist).
- `lib/useCompany.ts` → `useCompany()` for the reactive cached company; `setCompany` / `getCompany` in `lib/auth.ts`.

---

## §1 — Stop deriving the studio name from Google (backend)

**Problem.** `src/config/passport.js`, `state.type === "studio"` branch, creates the company with `name: profile.displayName || profile.name?.givenName || "New Studio"`. That writes the *person's* Google display name into `companies.name`, which then pre-fills the onboarding form and looks like a confirmed studio name. `src/controllers/auth.controller.js#emailSignup` has the same problem with its literal `"New Studio"`.

**Required:**

1. `src/models/companies.model.js` — drop `required: true` from `name`. Add a comment explaining why: auto-provisioned companies (Google SSO / email signup) have no name until the studio types one, and `verifyWhatsappOtp` is the single writer that first populates it (its validator already requires a non-empty `studio_name`, max 120 chars).
2. `src/config/passport.js` — create the company with **no `name` key at all**, only `onboarding_required: true`. Do not fall back to `profile.displayName`, `givenName`, or any literal. Leave the `User` creation (`first_name`/`last_name` from the Google profile) untouched — that's the person, and it's correct.
3. `src/controllers/auth.controller.js#emailSignup` — same: `Companies.create([{ onboarding_required: true }], { session })`. Leave the `first_name: "New", last_name: "Studio"` user placeholders alone for now (§6 gives the user a real way to fix them).
4. `registerCompany` (admin-driven) still receives and writes a real `company_details.name` — do not touch it.
5. Audit readers of `company.name` for empty-string/undefined safety. Confirmed today: `utils/deliverables.utils.js#createDeliveryLandingPageKvObject`, `deliverables.controller.js` (`company_name` projection, the `studio` query param) and the frontend gallery's `event.company_name` are all reached only for bookings, which require completed onboarding — so no fallback copy is needed. State that conclusion in a comment rather than adding speculative `|| "Studio"` fallbacks.

---

## §2 — No pre-filled names in mandatory onboarding (frontend)

### 2a. Step 1 — studio name starts empty
`components/onboarding/StudioDetailsStep.tsx`: `useState(initialStudioName)` becomes `useState("")`. Keep the `required` input and the existing `canSubmit` gate (`studioName.trim().length > 0 && validPhone`). Add a `placeholder` like `"e.g. Radiant Studios"` (match `settings/page.tsx`'s Studio name field) so the empty field reads as intentional. After §1 the prop is always `""` anyway — **delete the `initialStudioName` prop entirely** and drop it from the call site in `app/(dashboard)/onboarding/page.tsx`.

### 2b. Step 3 — Google search starts empty, Finish stays disabled until a suggestion is picked
`components/onboarding/GoogleBusinessStep.tsx`:

- `const [address, setAddress] = useState("")` — remove the "prefilled so the dropdown opens on something useful" comment and its behaviour.
- `placeholder="Search for your studio"` (a plain literal; drop `initialStudioName ||`).
- Delete the `initialStudioName` prop and its call site in `onboarding/page.tsx`. `onboarding/page.tsx` then no longer needs `studioName`/`company.name` for step 3 at all.
- **Clear a stale `placeId` on manual edits.** `AddressField` fires `onChange` per keystroke without touching `onPlaceSelect`, so today a user can pick a listing, edit the text, and still Finish against the previous place. Route the text handler through a wrapper that resets `placeId` to `""` whenever the incoming value differs from the value Google last committed (track the committed formatted address in a ref or piece of state set inside `onPlaceSelect`).
- `Finish setup` stays `disabled={!placeId || saving}` — **this is already correct; verify it and keep it.** Because the field now starts empty, the button is disabled on first paint. Add a short helper line under the field explaining what unlocks it, e.g. *"Pick your studio from the suggestions to continue."*, shown only while `!placeId`.
- The "I don't have a Google listing yet" → skip-confirm path is unchanged and remains the only way past this step without a `place_id`. It must stay reachable, especially in the `mapsKeyMissing` case.

---

## §3 — Reminder state API, and the watermark reminder before uploading media

Both reminders (§3, §5) are driven by **one server-side API** and **company-level dismissal flags**. There is no client-side `sessionStorage`, no per-tab guessing, and no duplicated checkpoint logic — the server is the single source of truth for "should this dialog show".

### §3a — Reminder state (backend, shared by §3 and §5)

**Model** — `src/models/companies.model.js`, two nullable timestamps in the same style as `welcome_dialog_seen_at`:

| Field | Type | Notes |
| --- | --- | --- |
| `watermark_reminder_dismissed_at` | `Number`, default `null` | Set when the studio hits **Skip for now** on the watermark nudge. |
| `branding_reminder_dismissed_at` | `Number`, default `null` | Set when the studio hits **Skip for now** on the branding checklist. |

Comment them as company-level (not user-level) for the same reason `welcome_dialog_seen_at` is: branding and watermarks are studio-wide concerns, so one member dismissing settles it for the studio.

**`GET /onboarding/reminder-status`** — new `getReminderStatus` in `src/controllers/onboarding.controller.js`, `protect` only (a read; no `enforceSubscriptionState`). Loads the company (`.select("-billing")`) plus `WatermarkPreset.countDocuments({ company_id })` — import `WatermarkPreset` from `../models/deliverables.model.js`. Computes every checkpoint server-side and responds `200`:

```jsonc
{
  "watermark": {
    "should_show": false,          // !complete && dismissed_at == null
    "complete": true,              // preset_count > 0
    "preset_count": 2,
    "dismissed_at": null
  },
  "branding": {
    "should_show": true,
    "complete": false,             // all four checkpoints true
    "dismissed_at": null,
    "checkpoints": {
      "google_business": true,     // !!google_place_id || gmb_skipped !== true
      "studio_logo": false,        // !!logo || !!logo_light
      "business_email": false,     // !!business_email && business_email_verified === true
      "social_links": false        // any non-empty social_links value, else legacy instagram_link/facebook_link
    }
  }
}
```

`should_show` is always `!complete && dismissed_at == null`. Put the four checkpoint predicates in one small pure helper (e.g. `brandingCheckpoints(company)`) with a comment on each, so §5's UI never re-derives them and the two can't drift.

**`POST /onboarding/dismiss-reminder`** — new `dismissReminder`, body `{ reminder: "watermark" | "branding" }`, `protect` only (deliberately **no** `enforceSubscriptionState`: dismissing a nag is not a billable write, and a suspended studio shouldn't be stuck behind a dialog). Idempotent, exactly like `markWelcomeDialogSeen`: stamp `Date.now()` only when the field is still `null`. Respond `200 { message, status }` where `status` is the **recomputed** payload above, so the client can replace its state from one response instead of re-fetching. Add a `dismissReminderValidation` (`body("reminder").isIn(["watermark", "branding"])`) in `src/validators/onboarding.validator.js` and mount both routes next to `/welcome-dialog-seen`.

**Behaviour note to confirm on review:** because dismissal is now a persisted server flag rather than a session key, **Skip for now is permanent** — the dialog will not return on the next login even if the underlying checkpoint is still incomplete. That is the intended trade-off of a server flag; state it in a comment above each field so it's a visible decision rather than a surprise. The complete-based condition (`preset_count > 0`, all four checkpoints) remains the *other* independent stop condition.

**Frontend plumbing** — `lib/types.ts`: add a `ReminderStatus` type mirroring the payload exactly (`watermark` and `branding` sub-objects, `branding.checkpoints` as a `Record` of the four booleans, or a named type). `lib/api.ts`: `getReminderStatus()` and `dismissReminder(reminder: "watermark" | "branding")` → `{ message: string; status: ReminderStatus }`, JSDoc'd like the neighbouring onboarding functions.

Fetch it **once per dashboard visit**, not per dialog: add a small client provider (e.g. `components/dashboard/RemindersProvider.tsx`, mounted in `app/(dashboard)/dashboard/layout.tsx` alongside the existing providers) exposing `{ status, loading, dismiss }`, where `dismiss` calls the endpoint and replaces `status` from the response. Both dialogs consume it. Best-effort: a failed fetch leaves `status` null and **both dialogs stay closed** — a reminder must never be the thing that breaks a dashboard.

### §3b — The watermark dialog

**Trigger.** The studio opens the upload flow on an event while `status.watermark.should_show` is true.

1. **New component** `app/(dashboard)/dashboard/events/[booking_id]/WatermarkReminderDialog.tsx`, built on `Modal` (`size="sm"`, `dismissOnBackdrop={false}`), icon `IconPalette` in a `bg-[var(--color-brand-navy-soft)]` circle (mirror `WelcomeDialog`'s hero treatment). Copy: watermarks are applied at delivery render time, so setting one up **before** the first upload means every delivered photo carries the studio's mark. Two actions:
   - **Skip for now** (secondary, bordered) → `dismiss("watermark")`, then continue straight into the upload modal.
   - **Set up watermark** (primary, navy) → `router.push("/dashboard/settings/watermarks?new=1")`. Do **not** dismiss on this path — the studio is going to complete it, and `preset_count > 0` will close it out honestly.
2. **Gate it in `MediaTab.tsx`** — the only place uploads start. Wrap both `handleBulkUpload` and `handleUploadMore`: when `status.watermark.should_show`, stash the pending `uploadIntent` and open the reminder instead of the upload modal. **Skip for now** commits the stashed intent so the studio lands in the upload modal it originally asked for — one extra click, never a dead end. Note that `getWatermarkPresets()` is *not* called here any more; `preset_count` comes from §3a.
3. **Ref-guard the dismiss POST** the way `WelcomeDialog#markSeen` does, so Escape, the X and the button racing each other only fire one request, and a network failure optimistically closes the dialog locally rather than trapping the user.
4. **Landing with the editor open.** `settings/watermarks/page.tsx` must read `useSearchParams()`; when `new` is present, initialise `modal` to `{ mode: "create" }` and immediately `router.replace("/dashboard/settings/watermarks")` so a refresh or back-navigation doesn't reopen it. Keep the `atLimit` guard authoritative — if the studio is somehow at 20 presets, don't force the modal open.

---

## §4 — OTP verification for the business email

Same shape as the WhatsApp change flow, over email, and **sent + verified entirely inside Settings → Studio Identity**.

### 4a. Model — `src/models/companies.model.js`
Add alongside the existing `business_email`, with comments matching the WhatsApp block's tone:

| Field | Type | Notes |
| --- | --- | --- |
| `business_email_verified` | `Boolean`, default `false` | Only ever true for an address that passed OTP. |
| `business_email_pending` | `String` | Holds the new address while its OTP is in flight — same reasoning as `whatsapp_pending_number`: an abandoned attempt must never leave an unverified address live in `business_email`. |
| `business_email_otp_code_hash` | `String` | |
| `business_email_otp_expires_at` | `Number` | |
| `business_email_otp_attempts` | `Number`, default `0` | |
| `business_email_otp_last_sent_at` | `Number` | |

Pre-existing companies with a `business_email` set stay `business_email_verified: false` — they have never been verified, and that's the honest state. No migration script.

### 4b. Sender — `src/utils/auth.utils.js`
Add `issueCompanyBusinessEmailOtp({ company, res, toEmail })` next to `issueCompanyWhatsappOtp`. Keep it a sibling rather than generalising the existing one (different field names, different transport) and say so in a comment. Reuse `OTP_TTL_MS` and `OTP_RESEND_COOLDOWN_MS`, `generateNumericCode(6)`, bcrypt hashing, the same 429-with-`retryAfter` contract, and the same "writes the HTTP response itself" convention. Send via `sendEmail` from `src/services/mail.service.js`. On a send failure, surface a clean 400 (`"We couldn't send a code to that address. Please check it and try again."`) rather than letting a transport error escape as a 500.

### 4c. Email template — `src/services/mail.service.js`
Add `businessEmailOtpEmail({ code, studioName })` using `renderEmail` with the existing block vocabulary — `eyebrow`, `heading`, `text`, `copyBlock` (for the code) — and a footer noting the 10-minute expiry and "ignore this if you didn't request it". Subject e.g. `"Your Vyavasth verification code"`. Set a `preheader`; every template in that file does.

### 4d. Endpoints — controller, validator, routes
In `src/controllers/onboarding.controller.js` (reuse `WHATSAPP_OTP_MAX_ATTEMPTS`, or rename it to a shared `OTP_MAX_ATTEMPTS` and update both call sites):

- `requestBusinessEmailOtp` — `POST /onboarding/business-email/request-otp`, body `{ business_email }`. Lowercase + trim, reject when it equals an already-`business_email_verified` `business_email` (`"That address is already verified."`), write `business_email_pending`, then `issueCompanyBusinessEmailOtp`.
- `resendBusinessEmailOtp` — `POST /onboarding/business-email/resend-otp`. 400 when there's no `business_email_pending` (`"No email verification in progress. Please start again."`).
- `verifyBusinessEmailOtp` — `POST /onboarding/business-email/verify-otp`, body `{ code }`. Same ladder as `verifyWhatsappChangeOtp`, in this order: no pending/no hash → expired → attempts exhausted (429) → `bcrypt.compare` mismatch (increment `business_email_otp_attempts`, save, 400 `"Invalid code"`). On success promote `business_email_pending` → `business_email`, set `business_email_verified = true`, clear all four OTP fields and the pending field, and return `200 { message, company }` from a `.select("-billing")` document — identical response shape to `verifyWhatsappChangeOtp`.

`src/validators/onboarding.validator.js` — add `requestBusinessEmailOtpValidation` (`body("business_email").trim().notEmpty().isEmail()`) and `verifyBusinessEmailOtpValidation` (copy `verifyWhatsappChangeOtpValidation` verbatim). Export both.

`src/routes/onboarding.routes.js` — mount all three with `protect` and, following the comment already in that file, **no `enforceSubscriptionState`**: a studio must always be able to act on its own account state. Put them directly under the WhatsApp change-OTP block with a matching comment.

**Close the write hole:** `updateCompanyDetails` currently accepts `business_email` from the multipart body. Remove that assignment and extend the existing "billing.* and whatsapp_number are intentionally excluded" comment to cover `business_email` — it may now only change through the OTP-gated endpoints, and anything sent here is silently ignored.

### 4e. Frontend — `lib/types.ts`, `lib/api.ts`
- `Company`: add `business_email_verified?: boolean` and `business_email_pending?: string`, documented like the WhatsApp fields.
- `CompanyUpdateInput`: **remove** `business_email` (and its `fd.append`) — it's no longer a writable field there.
- Add three functions beside the WhatsApp trio, same JSDoc style:
  - `requestBusinessEmailOtp({ businessEmail })` → `POST /onboarding/business-email/request-otp`, body `{ business_email }`
  - `resendBusinessEmailOtp()` → `POST /onboarding/business-email/resend-otp`
  - `verifyBusinessEmailOtp({ code })` → `POST /onboarding/business-email/verify-otp` → `WhatsappOtpVerifyResponse` (i.e. `{ message, company }`). If reusing that alias reads oddly, rename it to something transport-neutral like `CompanyMutationResponse` and update all existing call sites.

### 4f. Frontend — Studio Identity UI (`settings/page.tsx` + `SettingsUI.tsx`)
Verification happens **in this tab**, not on a separate route.

- Replace the plain business-email `Field` with a `VerifiedBusinessEmailField` in `SettingsUI.tsx`, modelled on `VerifiedWhatsappField`: read-only display of `company.business_email` (or a muted "Not set yet"), a green `IconCheck` **Verified** pill when `business_email_verified`, an amber/danger "Not verified" hint otherwise, and an action link — **"Add & verify"** when unset, **"Change email"** when set.
- Clicking it reveals an **inline** two-step block inside the same Business Information card (do not navigate, do not open a separate page):
  1. **Email step** — an `type="email"` input (pre-filled from `userProfile?.personal_email` when the existing "Same as personal email" checkbox is ticked; the checkbox now drives *this* input, not the saved field) + **Send code**, disabled until the value is a plausible email and differs from an already-verified `business_email`.
  2. **Code step** — reuse `OtpCodeInput` (`length={6}`, `shake` on failure, auto-submit at 6 digits), a **Verify** button, a live 30-second **Resend** countdown with the `ApiError` + `429` + `retryAfter` drift-safety from `ChangeWhatsappModal`, a **Back** affordance to correct the address, and inline error rendering in the established `role="alert"` danger-soft box.
  Reuse `ChangeWhatsappModal`'s state machine wholesale — extract the shared countdown/resend logic if it starts to duplicate meaningfully, otherwise a deliberate sibling is fine (say which you chose, and why, in a comment).
- On success: `setCompany(res.company)` (so Topbar/Sidebar caches follow) **and** `setCompanyState(res.company)` from `useSettings()` (so the tab re-renders without a refetch) — exactly what `handleWhatsappChanged` already does — then collapse the inline block and flash a transient "Business email verified." confirmation like `whatsappUpdatedFlash`.
- Drop `businessEmail` from this page's `dirty` computation and its `handleSubmit` payload. The shared `SaveBar` must not claim unsaved changes for a field it no longer owns.

---

## §5 — Branding-readiness reminder on Access & Sharing

**Trigger.** The studio opens the event's **Access & Sharing** tab while `status.branding.should_show` is true. The point: the gallery footer/lounge shows studio branding, so fix it *before* the link goes out.

### Backend
Checkpoint computation and dismissal both live in §3a — nothing new here beyond one consistency fix in `updateCompanyDetails`: when a `google_place_id` is saved, also set `company.gmb_skipped = false`. Otherwise a studio that skipped during onboarding and later added its listing in Settings stays permanently "incomplete" on this checklist. `saveGoogleBusiness` already does exactly this.

Comment the Google Business predicate where it's defined: `gmb_skipped !== true` is the stated requirement ("completed if it was not skipped during onboarding"), and the `google_place_id` disjunct plus the `gmb_skipped` reset above are what stop a later fix in Settings from being ignored.

### Frontend
1. **New component** `app/(dashboard)/dashboard/events/[booking_id]/BrandingReminderDialog.tsx` on `Modal` (`size="sm"` or `"md"`, `dismissOnBackdrop={false}`), `IconShieldCheck` hero. Body: four checklist rows — label + one-line "why it matters" + state icon (`IconCheck` in `--color-brand-success` when done, a muted hollow circle when not), reading **`status.branding.checkpoints`** from the §3a provider. Do **not** recompute any of it from `useCompany()`; the server owns these predicates.

   | Row | Backed by |
   | --- | --- |
   | Google Business Integration | `checkpoints.google_business` |
   | Studio Logo | `checkpoints.studio_logo` |
   | Business Email (Verified) | `checkpoints.business_email` |
   | Social Links | `checkpoints.social_links` |

2. **Two actions:**
   - **Skip for now** (secondary) → `dismiss("branding")`, then close.
   - **Go to settings** (primary) → close and route by priority, off the same `checkpoints` object (no dismiss — the studio is going to fix it):
     1. `google_business`, `studio_logo`, **or** `business_email` incomplete → `/dashboard/settings` (Studio Identity). Deep-link to `#studio-logo` when the logo is the only one of those three outstanding — that anchor already exists.
     2. Otherwise (only `social_links` outstanding) → `/dashboard/settings/social-links`.

   *Clarification on the brief:* Business Email lives on Studio Identity, and the stated rule doesn't say where it routes. It's folded into branch 1 above, because that's the tab where it's verified — **confirmed by the requester**. Note it in a code comment so the decision is visible on review.

3. **Mount** it inside `AccessSharingTab.tsx` (already mounted only while that tab is active) so it fires on tab entry, not on page load, and never on a deep link into another tab.

4. **Ref-guard the dismiss POST** exactly as in §3b.

5. Both new dialogs must satisfy the existing accessibility bar: `Modal` handles focus trap / Escape / `aria-labelledby`; you supply real `<button>`s, `aria-live` on the transient confirmations, and ≥44px touch targets.

---

## §6 — Real `get-user-details` / `update-user-details` endpoints

`lib/api.ts#getUserProfile` / `updateUserProfile` already call `GET /onboarding/get-user-details` and `PUT /onboarding/update-user-details`. **Those routes do not exist.** `SettingsContext` fetches the profile best-effort and swallows the 404, which is why Settings → Personal Information renders empty and silently fails to save. Build the endpoints to match the contract the frontend already expects.

### Backend
1. `src/models/user.model.js` — add two optional fields: `personal_email` (String) and `personal_contact` (String). **Do not** repurpose `email` (unique, and the login identity) or `phone` (Number, the work contact). Comment why they're separate.
2. `src/controllers/onboarding.controller.js`:
   - `getUserDetails` — `GET /onboarding/get-user-details`. Resolve `req.user.id` against `User`, `.select("first_name last_name personal_email personal_contact email")` (never `password`, `google_refresh_token`, `allowed_functionalities`, salary or any other employment field — this endpoint is for the account holder's own profile pane). 404 `{ message: "User not found" }` when missing. Respond `200 { user }`.
   - `updateUserDetails` — `PUT /onboarding/update-user-details`, JSON body. Partial-diff exactly like `updateCompanyDetails`: `if (field !== undefined) user.field = field` for `first_name`, `last_name`, `personal_email`, `personal_contact` only. **`email` is read-only here** — it's the login identity; ignore it silently and say so in a comment. Save and respond `200 { user }` with the same projection as the GET so the frontend can trust one shape.
   - Export both.
3. `src/validators/onboarding.validator.js` — `updateUserDetailsValidation`: all four fields `optional({ checkFalsy: false })`; `first_name`/`last_name` trimmed with a sane `isLength({ max: 120 })`; `personal_email` `.isEmail()` when present; `personal_contact` trimmed. Export it.
4. `src/routes/onboarding.routes.js` — `router.get("/get-user-details", protect, getUserDetails);` and `router.put("/update-user-details", protect, enforceSubscriptionState, updateUserDetailsValidation, validate, updateUserDetails);`. Mount them right after the company-details pair, whose middleware ordering they mirror.

### Frontend
- `lib/types.ts` — extend `UserProfile` with a read-only `email?: string` and **delete the "NOT YET BACKED BY A REAL ENDPOINT / confirm field names with the backend" caveat**. It's backed now.
- `lib/api.ts` — remove the matching placeholder warning block above `getUserProfile`.
- `SettingsContext.tsx` — the profile fetch may stay best-effort (a transient network failure still shouldn't take down Settings), but update the comment: it is no longer "not yet backed by a real endpoint".
- `settings/personal/page.tsx` — drop the placeholder `NOTE:`. The page's `changed()`-diff submit already matches the new partial-update contract. Surface the login `email` as a read-only row (a `CopyableIdField`-style or plain disabled display) with a one-liner that it's the sign-in address and can't be changed here — otherwise a user whose account was auto-provisioned as "New Studio" has no idea which email they're signed in as.
- `frontend/BACKEND_NOTES.md` — rewrite the "Personal Information (Your Account) — needs a backend endpoint" section to document the shipped contract (paths, method, field list, `email` read-only, partial-diff semantics) instead of an open question.

---

## §7 — The upgrade modal must open on the pricing-model picker

**Symptom.** A studio on the Free plan clicks **Upgrade plan** (Settings → Plan & Billing) and lands directly on the storage-tier slider, skipping the "Pay per event vs Storage plan" choice entirely.

**Root cause — a load race, not a `preset` problem.** Read `components/billing/UpgradeModalProvider.tsx` and `components/billing/PlanChooser.tsx` together:

1. The provider lazy-loads the catalog: `plans` starts as `[]` and is only fetched in an effect **after** `open` flips true.
2. `UpgradeModal` renders `<PlanChooser plans={plans} …>` with **no `loaded` guard**, so `PlanChooser` mounts against an empty catalog.
3. With `plans === []`, `eventPlanOf(plans)` is `null` and `buildStorageTiers(plans)` is `[]` → `eventOptionAvailable` and `hasStorage` are both false → `bothAvailable` is false.
4. `mode` and `modeConfirmed` are **`useState` initialisers**, so they freeze that first-render verdict: `modeConfirmed = (variant !== "cards" || !bothAvailable)` → `true`, and `mode` → `"storage"` (the `"event"` request is clamped away because `eventOptionAvailable` was false).
5. The catalog then arrives, `bothAvailable` becomes true — but `modeConfirmed` is already `true` and is never recomputed. `PricingModelCards` is skipped and the storage slider renders.

`tierIndex` and `interval` have the same defect (both initialise from `tiers` / `currentSnapshot`, which are empty/null on that first mount), so the tier the slider opens on is also wrong. Confirm the diagnosis before fixing: the modal briefly flashes the *"We're updating our pricing. Contact support to change your plan."* branch and logs `PlanChooser: nothing purchasable …` to the console on that first open.

**Required behaviour.** Whenever both models are genuinely available for the studio, the modal opens on `PricingModelCards` — **regardless of the `preset`**. `preset: "event"` (from `AddEventModal`, the dashboard's 402 handler and `dashboard/events/page.tsx`) may only pre-*select* the event card, never skip the screen. A studio already on a storage plan still goes straight to the slider, since `eventOptionAvailable` is legitimately false for them and there is nothing to choose.

**Fix, in this order:**

1. **Don't mount `PlanChooser` against an empty catalog.** Plumb the provider's `loaded` flag into `UpgradeModal` as a prop (it already passes `loadFailed`, `onRetryLoad` and a nullable `billingComplete`, so this matches the established shape) and render a loading state on the `choose` step until `loaded` is true — reuse `SectionSkeleton` from `settings/SettingsUI.tsx` or a centred spinner matching `onboarding/page.tsx`'s. This alone fixes the reported bug.
2. **Make the mode decision resilient anyway.** Even with the guard, `useState`-frozen derivations are a trap for the next caller. Convert `modeConfirmed` so it cannot latch on a pre-catalog verdict — either derive it (`const showModelCards = variant === "cards" && bothAvailable && !userPickedMode`, with `userPickedMode` the only piece of state) or reset it in an effect when `bothAvailable` transitions false → true and the user hasn't picked yet. Apply the same treatment to `tierIndex` / `interval` so they re-seed from `currentTierIndex` and the snapshot's interval once the catalog and snapshot are actually present. Prefer the derived form — it removes the class of bug rather than patching this instance.
3. Leave the genuine single-model paths untouched: `bothAvailable === false` must still skip straight to the one available model, and the back-to-`Pricing model` affordance must still be hidden in that case.
4. Sanity-check the catalog while you're in here. `eventPlanOf` requires `service_type === "Event-based"` **and** a numeric `event_unit_price > 0`, and `getPlans` (`src/controllers/billing.controller.js`) only returns services with `source: "DH", is_active: true`. If the live Event-based service fails any of those, pay-per-event is invisible for a real reason and no frontend change will surface it — report that instead of working around it.

---

## §8 — Rewrite the pay-per-event plan bullets

`PricingModelCards` in `components/billing/PlanChooser.tsx` hardcodes the three bullets on the **Pay per event** card (currently *"Buy exactly what you need"*, *"Credits never expire"*, *"No monthly commitment"*). The backend's `Plan.features` is fetched but never rendered, so this is a frontend-copy change only.

Replace them with these three, polished for the card's tight `text-xs` line length:

1. **Unlimited storage on every event** — no per-event size cap.
2. **Each event stays live for 3 months** — the clock starts when you create it, not when you buy.
3. **No monthly commitment** — pay only when you shoot.

Use the short form as the bullet text and keep the em-dash clause only where it fits on two lines at 360px; if it doesn't, drop the clause rather than letting the card grow. Keep the existing `<li className="flex items-center gap-1.5">` + `IconCheck size={11}` markup exactly — this is a copy edit, not a layout change. Verify the "3 months" claim against `src/services/galleryCleanup.js`, which tears media down 90 days after booking creation; if that constant ever changes, the copy is wrong.

**Fix the contradiction this creates.** *"Credits never expire"* appears in two more places and now directly conflicts with a 3-month validity window. Update all three together or the flow contradicts itself between screens:

| File | Line (approx.) | Current |
| --- | --- | --- |
| `components/billing/PlanChooser.tsx` | 388 | card bullet `Credits never expire` |
| `components/billing/UpgradeModal.tsx` | 279 | confirm-step `note="…"` → `"One-time payment — credits never expire."` |
| `app/(dashboard)/checkout/page.tsx` | 339 | the same `note` on the standalone checkout page |

Replace the two `note` strings with something consistent, e.g. *"One-time payment. Each event stays live for 3 months from the day you create it."* Grep for `never expire` before you finish and confirm zero hits remain.

---

## Constraints & acceptance

- **No new npm dependencies** in either project. In `frontend`: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test`. In `backend`: `npm test` (`node --test "src/**/*.test.js"`). All green before you finish.
- **Every new dialog is built on `components/ui/Modal.tsx`.** No bespoke overlays, no new portal code.
- **Theme tokens only** — `var(--color-brand-*)`. No hardcoded hex. Match the radii, shadows, spacing rhythm and copy voice of `WelcomeDialog` and the settings cards. Verified at 360px and ≥1024px.
- **No client-side dismissal storage for §3/§5.** Both reminders read `should_show` from `GET /onboarding/reminder-status` and dismiss through `POST /onboarding/dismiss-reminder`. No `sessionStorage`, no `localStorage`, and no duplicated checkpoint predicates on the client — §5's dialog must not recompute anything the server already returned.
- **Neither reminder may ever trap the user.** Skip always proceeds to what they originally asked for (§3 opens the upload modal it deferred; §5 closes and leaves the tab usable). A failed `reminder-status` fetch keeps both dialogs closed.
- **The upgrade modal never skips the pricing-model screen** when both models are available, on any entry point or `preset`.
- Existing flows must be untouched: WhatsApp onboarding OTP, the post-onboarding number change, `registerCompany`, `saveGoogleBusiness`'s skip path, watermark preset CRUD, and the upload engine.
- `business_email` is now **only** writable via the OTP endpoints. Grep for every remaining writer and remove it — including the `CompanyUpdateInput` field, its `FormData` append, and the Studio Identity `dirty`/payload lines.
- OTP hygiene for email matches WhatsApp exactly: 6 digits, bcrypt-hashed at rest, 10-minute TTL, 30-second resend cooldown returning `429 { message, retryAfter }`, max 5 attempts, and all OTP fields cleared on success. Never log or return the code.

### Manual test checklist

1. **Google signup, fresh studio** → inspect the new `companies` doc: **no** `name` field (or empty), `onboarding_required: true`. Onboarding step 1 shows an empty Studio name with its placeholder; Send code stays disabled until a name and 10 digits are entered.
2. **Email signup** → same: no `"New Studio"` in `companies.name`.
3. **Step 3** paints with an empty Google field and a disabled **Finish setup**. Type free text → still disabled. Pick a suggestion → enabled; the Reviews ID + preview link appear. Edit the text after picking → disabled again. "I don't have a Google listing yet" → skip-confirm → dashboard.
4. **New event, first upload** → watermark dialog appears. **Skip for now** → the upload modal opens (same destination/step as clicked), and `companies.watermark_reminder_dismissed_at` is now stamped. Click upload again, reload, and log back in → **no dialog** (server flag). On a second studio: **Set up watermark** → lands on Watermark Presets with the create modal open and a clean URL, `watermark_reminder_dismissed_at` still `null`. Save a preset → return to the event → upload → no dialog, and `GET /onboarding/reminder-status` reports `watermark.complete: true`.
5. **Studio Identity → business email**: Add & verify → code arrives at the address → wrong code shakes and shows "Invalid code" → 5 wrong codes → 429 → resend after the countdown → correct code → field shows the address with a green **Verified** pill and the confirmation flash. Reload Settings → still verified. Confirm `companies.business_email_verified: true`, `business_email_pending` cleared, all four OTP fields cleared.
6. **Business email is not writable via update-company-details**: with the Studio Identity form dirty on other fields, save, and confirm `business_email` is unchanged in Mongo.
7. **Access & Sharing** with checkpoints missing → dialog on tab entry, and the ticked/unticked rows match `GET /onboarding/reminder-status` byte for byte. **Skip for now** → gone, and still gone after a reload and a fresh login (`branding_reminder_dismissed_at` stamped). On an undismissed studio with only Social Links missing → **Go to settings** lands on `/dashboard/settings/social-links`; with only the logo missing → `/dashboard/settings#studio-logo`. Complete all four → `branding.complete: true` and the dialog never appears.
8. **Google Business checkpoint after a skip**: skip during onboarding, then add a listing in Settings → Studio Identity → save → re-fetch `reminder-status` → `checkpoints.google_business: true` (`gmb_skipped` reset).
9. **`dismiss-reminder` hygiene**: call it twice for the same reminder → second call is a no-op and does not move the timestamp. Send `{ reminder: "nonsense" }` → 400 from the validator. Call it as a suspended-subscription studio → still succeeds (no `enforceSubscriptionState`).
10. **Personal Information**: load → fields populate from `GET /onboarding/get-user-details`; the login email shows read-only. Edit one field → save → 200, values persist across a reload. Confirm the response never includes `password` or `google_refresh_token`. Confirm sending `email` in the PUT body does not change the login email.
11. **Upgrade modal, Free-plan studio, cold page load** → Settings → Plan & Billing → **Upgrade plan** on the *first* click of the session → the **pricing-model cards** render (never the storage slider, never a flash of "We're updating our pricing"). Console is clean of `PlanChooser: nothing purchasable`. Pick **Pay per event** → event quantity screen → **Pricing model** back link returns to the cards. Repeat from `AddEventModal`'s 402 and the dashboard's `preset: "event"` entry points: cards first, event card pre-selected.
12. **Storage-plan studio** → **Upgrade plan** → straight to the tier slider, no pricing-model screen, no back link, and the slider opens on their *current* tier and interval.
13. **Plan copy** → the Pay per event card shows the three new bullets; no screen in the upgrade or `/checkout` flow says "credits never expire"; the confirm-step note agrees with the card. Card checked at 360px for wrapping.
14. Every new/changed screen checked at 360px and ≥1024px, keyboard-only (Tab/Escape) through both dialogs, the pricing-model radiogroup (arrow keys), and the inline email-OTP block.

Before finishing, re-read your diff against `passport.js`, `onboarding.controller.js`, `onboarding.routes.js`, `companies.model.js`, `ChangeWhatsappModal.tsx`, `settings/page.tsx`, `MediaTab.tsx`, `AccessSharingTab.tsx`, `PlanChooser.tsx`, and `UpgradeModalProvider.tsx` to confirm you mirrored the existing OTP/dialog/billing conventions rather than forking them — and that no reminder or load state can block a studio from uploading, sharing, or paying.
