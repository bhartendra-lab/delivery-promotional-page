# Implementation Prompt — WhatsApp OTP Login for the Client Gallery

You are working in a monorepo-style setup with two projects:

- **Backend**: `Vyavasth/backend` — Node.js (ESM), Express, Mongoose, Passport (Google OAuth), WhatsApp Cloud API. Entry auth code lives in `src/controllers/auth.controller.js`, `src/routes/auth.routes.js`, `src/config/passport.js`, `src/models/guests.model.js`, `src/utils/auth.utils.js`, `src/utils/whatsapp.utils.js`.
- **Frontend**: `delivery-promotional-page/frontend` — Next.js 16 (app router), React 19, TypeScript, Tailwind v4. The client gallery lives under `app/(client)/event/[unique_identifier]/` with screens in `components/event/screens/` and the guest auth/token layer in `lib/guest-auth.ts`, `lib/guest-api.ts`, `lib/api.ts`.

## Goal

Add **WhatsApp OTP login** to the client gallery guest flow as the **primary** login method, with **Google SSO demoted to a secondary fallback**. The backend OTP endpoints and WhatsApp service already exist — this is mostly a frontend integration plus one important backend linking change.

Read all the files named above before writing code. Match the existing conventions, comment style, and design language exactly. Do not introduce new dependencies.

---

## What already exists (do not rebuild)

### Backend — already built and working
`src/controllers/auth.controller.js` already exports these, wired in `src/routes/auth.routes.js`:

- `POST /auth/guest-otp-login` — body `{ name, phone, unique_identifier }`. Resolves the event from `unique_identifier`, finds/creates a `Guests` doc scoped by `{ phone, booking_id }`, and sends a 6-digit code via the WhatsApp `verify_otp` template. Returns `200 { message: "OTP sent via WhatsApp" }`. On resend cooldown it returns `429 { message, retryAfter }` (see `issueGuestOtp` in `src/utils/auth.utils.js`, `OTP_RESEND_COOLDOWN_MS`).
- `POST /auth/resend-otp` — body `{ phone, unique_identifier }`. Same send path; requires the guest to already exist for this phone+event.
- `POST /auth/verify-otp` — body `{ phone, unique_identifier, code }`. On success consumes the code and returns `200 { message, token, guest }`. The `token` is a guest JWT identical in shape to the Google-SSO path (`kind: "guest"`), so all downstream `protect` checks and `getGuestSession` work unchanged.

Phone normalization is handled server-side (`normalizePhoneNumber` in `src/utils/whatsapp.utils.js`): a bare 10-digit number is prefixed with country code `91`. **The frontend should send the plain 10-digit national number** for all three endpoints — the backend normalizes identically, so `guest-otp-login`, `resend-otp`, and `verify-otp` all resolve to the same guest doc.

### Frontend — already built and working
- `lib/guest-auth.ts`: `setGuestToken(uid, token)`, `getGuestToken(uid)`, `clearGuestToken(uid)`, `ensureGuestToken`, silent refresh. **Token is stored in `localStorage` keyed per event** — this is what already gives Google-SSO users persistent login across visits.
- `components/event/EventFlow.tsx`: the flow state machine. On mount it reads the stored guest token and, if present, calls `getGuestSession` and skips straight past login. **This means: once an OTP login stores its token via `setGuestToken`, returning-visit persistence works automatically — no extra work needed for state retention.**
- Silent refresh (`POST /auth/google/guest-refresh` in `lib/api.ts` → `refreshGuestToken`) verifies any `kind: "guest"` JWT ignoring expiry and re-mints it. It is **not** Google-specific, so OTP-issued tokens refresh the same way. Confirm this by reading `guestRefresh` in `auth.controller.js` — no change required there.
- `components/event/screens/LoginScreen.tsx`: the current **Google-only** screen. This is the file you will restructure. Study its markup carefully — it defines the exact design language (theme tokens, split desktop hero pane, brand halo, trust line, policy footer) you must preserve.
- Theming: `useEventTheme()` returns `{ theme: t, event, uniqueIdentifier }`. Consume colors/shape **only** from `t` (`ClientTheme` in `lib/client-theme.ts`): `t.bg, t.card, t.sunken, t.border, t.text, t.muted, t.faint, t.brand, t.brandDeep, t.onBrand, t.accentWash, t.cover, t.heroScrim, t.shadow, t.shadowSm, t.rCard, t.rTile, t.rField, t.font, t.error, t.errorSoft, t.success, t.successSoft`. Never hardcode colors.
- `usePolicy()` → `openPolicy("terms" | "privacy")` for the footer links.

---

## Frontend work

### 1. API layer (unauthenticated calls)
Add three functions for the OTP endpoints. They run **before** a guest token exists, so use a plain `fetch` against `API_BASE` (mirror the `auth: false` style of `refreshGuestToken` in `lib/api.ts`) — **do not** use `guestFetch` from `lib/guest-api.ts`. Put them where they read most naturally (`lib/api.ts` or a small addition to `lib/guest-api.ts`), returning parsed JSON and throwing `ApiError` on non-2xx so the UI can surface `message` (and `retryAfter` on 429):

- `requestGuestOtp({ uniqueIdentifier, name, phone })` → `POST /auth/guest-otp-login`
- `resendGuestOtp({ uniqueIdentifier, phone })` → `POST /auth/resend-otp`
- `verifyGuestOtp({ uniqueIdentifier, phone, code })` → `POST /auth/verify-otp` → `{ token, guest, message }`

Send `phone` as the 10-digit national number (no `+91`, no spaces).

### 2. Screen 1 — Phone entry (primary, OTP only, NO Google)
Restructure so the first thing a guest sees is the OTP entry form. Reuse the existing `LoginScreen` shell (brand halo, headline, desktop hero pane, trust line, policy footer). Replace the single "Continue with Google" button with:

- A **name** text input (label e.g. "Your name").
- A **WhatsApp number** input with a **fixed, non-editable `+91` prefix** shown inside/adjacent to the field (visually part of the input, disabled, since India-only for now). Accept exactly 10 digits, digits-only (strip non-numeric on input), numeric/tel keyboard on mobile (`inputMode="numeric"`, `type="tel"`, `maxLength={10}`).
- A primary submit button ("Send OTP" / "Send code") styled with `t.brand`/`t.onBrand`.
- Inline validation: name required; phone must be 10 digits. Disable submit until valid. Show a loading state while the request is in flight and surface the server `message` on error (e.g. invalid event link, WhatsApp send failure).
- **Do NOT show Google SSO on this screen** — SSO is secondary.

On success, advance to Screen 2, carrying `{ name, phone }`.

### 3. Screen 2 — OTP verification (with Google fallback at the bottom)
- Show the masked destination ("Code sent to +91 98••• ••210" or similar) and a **6-digit OTP input** (either a single field or a 6-box segmented input — match the polish of the rest of the app; digits-only, `inputMode="numeric"`, auto-advance/auto-submit when 6 digits are entered is a nice touch but optional).
- A **verify** button; on success call `verifyGuestOtp`, then `setGuestToken(uniqueIdentifier, token)` and enter the flow (see §4).
- A **30-second resend timer**: the "Resend OTP" action is disabled and shows a live countdown ("Resend in 0:27") for 30s, then becomes enabled. On resend, call `resendGuestOtp`, reset the timer, and clear the OTP input. **Backend alignment (required):** change `OTP_RESEND_COOLDOWN_MS` in `src/utils/auth.utils.js` from 60s to **30s (`30 * 1000`)** so the server cooldown matches this 30-second UI countdown and the guest never hits a surprise `429`. As a safety net, if `resend-otp` still returns `429 { retryAfter }`, drive the countdown from `retryAfter` instead of failing.
- A **"Change number"** / back affordance to return to Screen 1.
- Handle verify errors inline: invalid code, expired code, too many attempts (429) — surface the server `message`.
- **At the bottom of this screen only**, show a subtle secondary **"Didn't get the code? Continue with Google"** option using the existing `GoogleG` icon/button treatment, visually de-emphasized relative to the primary verify button. This is the fallback described below.

### 4. Post-login: enter the flow + state retention
On successful OTP verify: `setGuestToken(uniqueIdentifier, token)`, then re-enter the flow exactly like the Google callback does. Mirror `AuthCallbackClient` — either `window.location.replace('/event/<uid>')` to remount and let `EventFlow` restore the session, or lift an `onAuthed` callback into `EventFlow` that re-runs its session-restore path. Prefer the remount approach for consistency with the existing Google flow. No new persistence code is needed — `localStorage` token storage already gives cross-visit login retention for OTP users, identical to Google.

### 5. Structure & design
- Keep everything themed via `t` tokens; support the desktop split layout (`lg:grid-cols-2` hero pane) and the mobile single-column layout already in `LoginScreen`. Both screens must be fully responsive (test at 360px mobile and ≥1024px laptop). Reuse the ambient backdrop, brand halo, spacing rhythm, and typography scale of the current screen.
- Suggested structure: keep `LoginScreen.tsx` as a container that manages a local sub-step (`"phone" | "otp"`) plus `{ name, phone }` state, rendering a `PhoneStep` and `OtpStep` (either inline or as sibling components in `components/event/screens/`). Keep the shared shell (hero pane, brand zone, footer) DRY.
- Accessibility: proper `<label>`s, `aria-live` for the countdown and error messages, visible focus states, 44px+ touch targets.

---

## Backend work — Google-SSO fallback must merge into the OTP guest doc

This is the one substantive backend change. **Problem:** the OTP flow creates/updates the guest doc scoped by `{ phone, booking_id }` (no email). But the Google strategy in `src/config/passport.js` (the `state.type === "guest"` branch) finds/creates the guest by `{ email, booking_id }`. So if a guest starts with OTP (phone-only doc), fails to receive the code, and falls back to Google, the strategy won't find the phone doc → it **creates a duplicate guest and the WhatsApp number is lost**.

**Requirement:** when the guest reaches Google SSO *from the OTP screen*, Google must update the **existing** phone-created guest doc — attaching `google_id`, `google_refresh_token`, `email`, and (if empty) `name` — **while retaining the existing `phone`**. Do not create a second doc.

Implement by plumbing the entered phone through the OAuth `state`:

1. **Frontend**: the Google fallback button on Screen 2 must include the entered phone, e.g.
   `window.location.href = \`${API_BASE}/auth/google/guest-login?unique_identifier=${enc(uid)}&phone=${enc(phone10)}\``
   (Screen 1's flow never triggers Google, so no phone param needed there.)

2. **`guestLogin` controller** (`auth.controller.js`): read the optional `req.query.phone`, normalize it (`normalizePhoneNumber`), and include it in the JSON `state` passed to `passport.authenticate` (alongside `type: "guest"` and `unique_identifier`).

3. **Passport strategy** (`src/config/passport.js`, `state.type === "guest"` branch): if `state.phone` is present, resolve the guest with this precedence, retaining the phone throughout:
   - First try `Guests.findOne({ phone: normalizedPhone, booking_id })` (the OTP-created doc). If found, `Object.assign` the Google fields (`google_id`, `google_refresh_token`, `email`, and `name` only if currently the default/empty) and save — **keep `phone` intact**.
   - Handle the edge case where an email-scoped doc *also* already exists for this booking (a prior Google login): avoid leaving two docs for the same person. Prefer merging onto the phone doc; if a separate email doc exists, consolidate sensibly (e.g. copy any missing fields onto the surviving doc) and avoid duplicate-key issues. Keep it defensive and well-commented.
   - If no phone param / no phone doc found, fall back to the **current** behavior exactly (`{ email, booking_id }` find-or-create).

   Keep the returned shape (`{ ...guest.toObject(), userType: "guest" }`) and the `googleCallback` token minting unchanged — the emitted JWT already carries `phone: user?.phone`, so a merged doc will correctly include the WhatsApp number in the token.

Add concise comments in the same voice as the surrounding code explaining *why* the phone-first lookup exists (OTP-then-Google fallback must not fork the guest).

Set `OTP_RESEND_COOLDOWN_MS` to `30 * 1000` (30s) in `src/utils/auth.utils.js` to match the UI resend timer (§3).

---

## Constraints & acceptance

- No new npm dependencies in either project. TypeScript must compile; run the frontend lint/build and fix issues.
- Preserve existing behavior for guests who already logged in (stored token → skip login) for **both** OTP and Google.
- Google SSO must never appear on Screen 1; it appears only as a de-emphasized fallback at the bottom of Screen 2.
- `+91` is fixed, prefilled, and non-editable; input is 10 digits, India-only.
- Fully responsive and theme-driven on both mobile and laptop; match the existing gallery's design language pixel-for-pixel in spirit (tokens, radii, shadows, motion).
- After OTP verify, the guest lands in the same next step (`team` / `scan` / `lounge`) that Google guests reach, via the shared `EventFlow` bootstrap.

### Manual test checklist
1. New guest, valid name + 10-digit number → OTP received on WhatsApp → verify → lands in flow. Reload page → still logged in (no re-login).
2. Resend disabled with a live 30s countdown, then enabled; resend delivers a fresh code; UI and backend cooldown agree (no surprise 429).
3. Wrong code, expired code, and >max attempts each show the correct inline message.
4. From Screen 2, tap "Continue with Google" → completes OAuth → returns signed in, and the guest doc in `guests` retains the original WhatsApp `phone` **and** now has `google_id`/`email` (verify no duplicate guest doc was created for that booking).
5. Layouts verified at 360px and ≥1024px.

Before finishing, re-read your diff against `LoginScreen.tsx`, `EventFlow.tsx`, `passport.js`, and `auth.controller.js` to confirm you preserved existing conventions and didn't fork the guest doc.
