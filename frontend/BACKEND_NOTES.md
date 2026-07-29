# Backend notes

Discrepancies, assumptions, and follow-ups encountered while building the frontend.

## Auth

- Token is set via `setToken()` (lib/auth.ts) into a `dlp_token` cookie with `SameSite=Lax`, `Path=/`, `Max-Age=1 week`. It is **not** `httpOnly` — the dashboard reads it from JS to attach `Authorization: Bearer …` headers. A full `httpOnly` flow would require a server proxy for every authenticated call (or for the backend to accept cookie auth directly); we chose the lighter option for now.
- Auth guard runs on the client (`(dashboard)/dashboard/layout.tsx`). Unauthenticated users are redirected to `/login?redirect=…`. The login page also accepts a `redirect` query param.

## Tracking endpoint

- Per the brief, `POST /deliverables/create-delivery-landing-page-tracking/:id` is **currently auth-protected** on the backend (bug). The client view is unauthenticated, so we deliberately do **not** send an `Authorization` header. Failures are silently swallowed — analytics calls must never break the user-facing flow.
- Once the backend bug is fixed, no frontend change is needed; the request shape is already correct.

## KV proxy

- `lib/kv.ts` is marked `import "server-only"` so it cannot leak into the client bundle. It is consumed by two places that are both server-only: the route handler at `app/api/kv/[id]/route.ts` and the server component at `app/(client)/c/[delivery_landing_page_id]/page.tsx`.
- The brief explicitly required `/api/kv/[id]` as a route handler. The server component bypasses that and calls `readKvData` directly to avoid an extra network hop during SSR. Public clients can still call `/api/kv/[id]` if needed (e.g., for client-side refresh).

## API response shapes — `totalPages` field

- The list endpoint returns a field called `totalPages` that is actually the **total record count**, not the page count. The frontend computes the real page count as `Math.ceil(totalPages / limit)` in `(dashboard)/dashboard/page.tsx`. This is worth renaming to `totalCount` on the backend in a future cleanup.

## `delivery_urls` payload format

- Sent as `JSON.stringify(array)` in a `delivery_urls` field of a `multipart/form-data` body, per the brief. The backend validator handles parsing. Confirmed via `buildFormData` in `lib/api.ts`.

## `event_date` format

- API uses a unix timestamp (seconds). The form uses a `<input type="date">` and converts in both directions via `toDateInputValue` / `fromDateInputValue` (`components/dashboard/shared.ts`).

## Studio brand colours

- The KV payload does not yet include studio-level brand colours. `resolveStudioTheme(kv)` falls back to a deterministic palette derived from `company_name`. If the backend later adds a `brand_colors` field to the KV value, `resolveStudioTheme` already prefers it — no other code needs to change.

## Image hosts

- `next.config.ts` allows `media.vyavasth.in` and `*.vyavasth.in` under `images.remotePatterns`. Background images and logos in the client view use a plain `<img>` tag (commented to silence the eslint rule) because they are commonly external/unknown size and we want to avoid `next/image` layout surprises in the templates. Switch to `next/image` if/when we standardize dimensions.

## Env vars

- Public: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- Server-only: `CF_ACCOUNT_ID`, `CF_KV_NAMESPACE_ID`, `CF_KV_AUTH_TOKEN`. The `CF_KV_AUTH_TOKEN` value should be copied from the backend `.env` `CF_R2_KV_AUTH_TOKEN`; it is intentionally blank in `.env.local` and must be filled in locally.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`: browser key (HTTP referrer restricted) for the Places JS library, used only by the Address field on Settings → Online Presence (`AddressField` in `settings/SettingsUI.tsx`) to resolve a `place_id` from an address/business-name search — this is what drives the Google reviews link on delivery pages. The field falls back to a plain text input if the key is unset.

## Personal Information (Your Account) — needs a backend endpoint

- The Settings → Your Account → Personal Information page (`(dashboard)/dashboard/settings/personal/page.tsx`) and the "same as personal" business email/phone checkboxes on Studio Identity are wired to `getUserProfile`/`updateUserProfile` in `lib/api.ts`, calling `GET/PUT /onboarding/get-user-details` and `/onboarding/update-user-details`.
- **These are placeholders, not confirmed backend routes.** Picked to mirror the existing `get-company-details`/`update-company-details` pair on the same controller, per the preference to extend an existing controller rather than stand up a new one — but this needs the backend engineer to confirm the real path and, ideally, add it to `onboarding.controller.js` (or wherever the User model already lives, since `POST /auth/login` already returns an untyped `user` object today).
- Expected shape: `{ user: { first_name?, last_name?, personal_email?, personal_contact? } }` on GET, same on PUT (partial update, same partial-diff pattern as company details).
- The frontend degrades gracefully if this 404s: `SettingsContext` fetches it best-effort alongside the company and just leaves `userProfile` null on failure, so Studio Identity and the rest of Settings keep working. The Personal Information page itself will show empty fields and fail to save until the endpoint exists.

## Next.js 16 specifics

- `params` is awaited as a Promise in both the page (`app/(client)/c/[delivery_landing_page_id]/page.tsx`) and the route handler (`app/api/kv/[id]/route.ts`), per the v16 async-request-API contract.
