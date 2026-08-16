# Studio Dashboard — Bug Fix Plan (navbar_gap · guest_theme · review_delete)

Scope: three bugs only. `fix_logo` and any other highlights in the screenshots are explicitly **out of scope** for this session.

> Line references verified against branch `abhishek`.

---

## Standing protocol

1. Read `CLAUDE.md` at the repo root (and `Vyavasth/CLAUDE.md` for the backend) before touching anything.
2. **Confirm this plan with me before writing code.** The judgment calls are flagged inline — don't resolve them silently.
3. **Do not run the dev server.** I'll run it myself.
4. When done, hand back the **manual test checklist** at the bottom of this doc, filled in with anything you changed.
5. Backend rule holds: extend existing endpoints / validators / models. No new routes, controllers, or models.

---

# 1. `navbar_gap` — tab strip drifts on scroll

**Decision taken:** fixed, but *visually separated* from the topbar. The tab strip never scrolls; a deliberate seam keeps it reading as a second chrome layer, not a merged bar.

## Root cause (verified)

`app/(dashboard)/dashboard/layout.tsx:88-92` → `DashboardShell`:

```tsx
<Topbar breadcrumb={breadcrumb} />
<main ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
  <div className="px-4 pt-4 sm:px-6">
    <SubscriptionBanner snapshot={snapshot} scope="app" />
  </div>
  {children}
</main>
```

Two separate defects compound here:

1. **The phantom gap.** `SubscriptionBanner` returns `null` when there's no app-scope banner (`components/billing/SubscriptionBanner.tsx`, `if (!content) return null`), but the wrapper `<div>` still renders — contributing `pt-4` (16px) unconditionally. That's the visible gap above the tab strip.
2. **The drift.** `EventWorkspace`'s root is `h-full`, sized to `<main>`. The phantom 16px pushes total content past `main`'s height, so `main` becomes scrollable by exactly that much — and because the tab strip lives *inside* `main`, it moves. The workspace's own chrome is already correctly `shrink-0` and non-scrolling; it's the outer container that's leaking.

Note the second-order case: even after fixing (1), a **real** subscription banner (`past_due`, `suspended`, `cancelled`, `expired`) reintroduces the drift — and an account-suspension warning is precisely the thing that shouldn't scroll away.

## Fix

**a. Move the app-scope banner into the locked chrome.** Render it in `DashboardShell` *between* `<Topbar>` and `<main>`, outside the scroll region:

```tsx
<Topbar breadcrumb={breadcrumb} />
<SubscriptionBanner snapshot={snapshot} scope="app" />   {/* owns its own padding */}
<main ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
  {children}
</main>
```

**b. Give `SubscriptionBanner` its own padding** so there is no wrapper to render when it bails. Move `px-4 pt-4 sm:px-6` inside the component's returned JSX (it already early-returns `null`, so the padding disappears with it). Check `app/(dashboard)/dashboard/settings/billing/page.tsx` for the `scope="settings"` render site and confirm the moved padding doesn't double up there — if it does, take a `className` prop rather than hardcoding.

**c. Add the deliberate seam.** Inside `EventWorkspace`'s shrink-0 chrome, above `<EventTabStrip>`, add a short band in the page background so the strip reads as its own layer:

```tsx
<div className="h-2.5 shrink-0 bg-[var(--color-brand-bg)]" aria-hidden />
<EventTabStrip ... />
```

and give the tab strip a top border to close the seam (`border-t border-[var(--color-brand-border)]` alongside its existing `border-b`). Keep it `shrink-0` — it already is.

**d. Verify no scroll leak.** After (a)–(c), `main`'s content on the event route should be exactly `h-full`, so `main` never scrolls; only `MediaTab` / `SmartSelectsTab` / `GalleryDesignTab`'s own regions do. Confirm `useScrollCollapsed` on the Dashboard and Events *list* pages still works — it reads `mainRef.current.scrollTop`, and those pages do legitimately scroll `main`. Nothing here changes that; just don't accidentally set `overflow-hidden` on `main`.

**Do not** reach for `position: sticky` on the tab strip. The layout is a fixed-height flex column with a single scroll container — sticky would be solving a problem this shell doesn't have, and would fight the seam.

---

# 2. `guest_theme` — themes grouped by Season, which is meaningless for Corporate

**Decision taken:** occasion-scoped collections keyed off `event_type`, with a "Show all themes" escape hatch.

## Current state (verified)

- `GalleryDesignTab.tsx:22-33` hardcodes `SEASONS = ["Spring","Summer","Autumn","Winter"]` and `SEASON_VARIANTS`, a local dict with no relationship to the event.
- `eventType` is *already* passed into the tab (`eventType={ctx.meta.type}` in `EventWorkspace.tsx`) and is already used for one thing — the `COPY_LABEL` dict at line 36 that renames "Message from the Couple" → "Message from the Hosts".
- Event types (`lib/types.ts` `EVENT_TYPES`, matching `backend/src/models/events.model.js` and `createBookingValidation`): Wedding, Birthday, Anniversary, Pre-wedding, Engagement, Corporate.
- **Blocking backend bug found:** `frontend/lib/types.ts` ships 10 `STYLE_VARIANTS`, but `backend/src/validators/bookings.validator.js:82` and `backend/src/models/delivery-landing-page.model.js:17` both only allow **8**. `"Sage Sanctuary"` and `"Indigo Dusk"` will 422 on save today. They're currently reachable in the UI (Spring and Winter respectively). This must be fixed as part of this work or the new collections will hand studios themes that can't be saved.

## Design

**No data model change.** `style_variant` keeps the exact same 10 string values. Collections are a pure presentation layer over them — existing bookings keep whatever they have, they just get re-labelled in the picker. This is what makes the change safe to ship against live galleries.

Create `frontend/lib/event-occasion.ts` as the single source of truth (this also absorbs `COPY_LABEL`, which shouldn't stay as a second parallel dict):

```ts
export type Occasion = "wedding" | "celebration" | "corporate" | "neutral";

export function occasionFor(eventType?: string | null): Occasion;

export type ThemeCollection = { id: string; label: string; variants: StyleVariant[] };

/** Ordered collections for an occasion. Every one of the 10 variants appears
 *  in exactly one collection per occasion — only the grouping and the label
 *  differ, never the underlying value. */
export function collectionsFor(occasion: Occasion): ThemeCollection[];

/** Studio-side label for the custom_message field (absorbs COPY_LABEL). */
export function messageLabelFor(eventType?: string | null): string;
```

### Occasion mapping

| Occasion | Event types |
|---|---|
| `wedding` | Wedding, Pre-wedding, Engagement |
| `celebration` | Birthday, Anniversary |
| `corporate` | Corporate |
| `neutral` | empty, `"Event"` (the `normalizeMeta` fallback), or any unrecognised value |

### Collections

**Wedding** — *Ceremony · Festivity · Heirloom*

| Collection | Variants |
|---|---|
| Ceremony | Ivory & Rose, Blush Minimal, Fine-Art Warm |
| Festivity | Marigold Bright, Festive Bloom, Maroon Velvet |
| Heirloom | Emerald Royal, Indigo Dusk, Sage Sanctuary, Charcoal Editorial |

**Celebration** — *Warm · Bright · Evening*

| Collection | Variants |
|---|---|
| Warm | Ivory & Rose, Blush Minimal, Fine-Art Warm |
| Bright | Marigold Bright, Festive Bloom, Sage Sanctuary |
| Evening | Maroon Velvet, Emerald Royal, Indigo Dusk, Charcoal Editorial |

**Corporate** — *Boardroom · Launch · Offsite*

| Collection | Variants |
|---|---|
| Boardroom | Charcoal Editorial, Indigo Dusk, Fine-Art Warm |
| Launch | Marigold Bright, Festive Bloom, Maroon Velvet |
| Offsite | Sage Sanctuary, Emerald Royal, Ivory & Rose, Blush Minimal |

*(The Photographer Premier League cricket gallery in the screenshot is an Offsite, currently sitting on Charcoal Editorial — "Winter". After this change it reads "Boardroom", which is at least coherent, and Offsite is one click away.)*

**Neutral** — *Light · Bright · Deep*

| Collection | Variants |
|---|---|
| Light | Ivory & Rose, Blush Minimal, Fine-Art Warm |
| Bright | Marigold Bright, Festive Bloom, Sage Sanctuary |
| Deep | Maroon Velvet, Emerald Royal, Indigo Dusk, Charcoal Editorial |

### UI changes in `GalleryDesignTab.tsx`

- Delete `SEASONS`, `SEASON_VARIANTS`, `seasonOf`, `COPY_LABEL`. Import from `event-occasion.ts`.
- Section overline: `"Season — Theme Skin"` → `"Theme"`. Field label: `"Season"` → `"Collection"`. Keep the tooltip pattern, reword: *"A theme sets the colour palette of the guest-facing gallery. Collections are grouped for {occasion label} events — pick one, then a variant to preview it live."*
- The `Segmented` control (line 139) now renders `collectionsFor(occasion)` labels; the `Select` (line 150) renders that collection's variants. Same two-level shape, so the component work is a data swap, not a rewrite.
- **Initial state:** derive the starting collection from the saved `style_variant` by finding which collection contains it *for this occasion* (replacing `seasonOf`). If the saved variant isn't found (shouldn't happen, but be defensive), fall back to the first collection and leave the variant as-is — never silently change a live gallery's saved variant on mount.
- **Escape hatch:** a `Show all themes` toggle beneath the Segmented control. When on, the Select lists all 10 `STYLE_VARIANTS` and the collection segmented control is hidden. Turning it off snaps back to the collection containing the current variant. This is the release valve for a studio whose Corporate cricket league genuinely wants Festive Bloom.
- `dirty` / `save()` are untouched — they only ever read `variant`, which is still a `StyleVariant`.

### Backend (required, existing files only)

- `backend/src/validators/bookings.validator.js:82` — add `"Sage Sanctuary"` and `"Indigo Dusk"` to the `isIn([...])` list.
- `backend/src/models/delivery-landing-page.model.js:17` — add both to the `enum`.
- No migration: `style_variant` has a `default`, existing docs are unaffected by widening an enum.
- Check whether `createBookingValidation` also constrains `style_variant` (it doesn't today, but confirm before shipping) and keep the lists identical.
- **Judgment call to confirm with me:** whether to also mirror the 10-value list into a shared constant so this can't drift a fourth time, or leave the literal lists as-is. I lean toward leaving it — a shared constant across repo boundaries is more coupling than this earns.

---

# 3. `review_delete` — stale and un-removable Google place ID

**Decision taken:** fix both defects — the stale-ID guard *and* the unlink control.

## Where the place ID is consumed

`google_place_id` → `company_google_place_id` in the KV render payload (`backend/src/utils/deliverables.utils.js:27`, `deliverables.controller.js:1741`) → `LoungeGallery.tsx:68` builds

```ts
const reviewUrl = event.company_google_place_id
  ? `https://search.google.com/local/writereview?placeid=${event.company_google_place_id}` : null;
```

and that single value feeds **five** guest surfaces: `TopBar`, `MobileTopBar`, `StudioCard`, `ReviewNudge` (both the timed nudge and the inline variant), and the gallery-end CTA. Every one of them is already null-guarded (`{reviewUrl && ...}`), so clearing the ID degrades cleanly — the CTAs simply disappear. Good: no guest-side work needed.

## Defect (a) — stale ID after editing the address

`components/onboarding/GoogleBusinessStep.tsx` has the guard:

```tsx
const committedAddressRef = useRef<string>("");
function handleAddressChange(value: string) {
  setAddress(value);
  if (value !== committedAddressRef.current) setPlaceId("");
}
```

`app/(dashboard)/dashboard/settings/page.tsx:216` does **not**:

```tsx
<AddressField value={address} onChange={setAddress}
  onPlaceSelect={({ placeId }) => setGooglePlaceId(placeId)} />
```

So in Settings a studio can pick "Kamal Productions", hand-edit the text to something else, save, and keep pointing every guest review CTA at the old listing.

**Fix:** port the guard. Initialise `committedAddressRef` from `company.address ?? ""` (not `""`) so a freshly-loaded page with an already-saved address doesn't clear the ID on the first keystroke of an unrelated edit. Set it in `onPlaceSelect` alongside the address. Reset it in `handleDiscard`.

## Defect (b) — no way to unlink

Once `googlePlaceId` is set there is no path back to empty:
- Clearing the address input doesn't touch `googlePlaceId`.
- The payload only sends the field when `changed(googlePlaceId, company.google_place_id)` is true (line 134), so an unchanged stale ID is never transmitted.

The backend already supports clearing — `onboarding.validator.js` uses `.optional({ checkFalsy: true })` (an empty string skips validation but stays on the body) and `onboarding.controller.js:207` does `if (google_place_id !== undefined) company.google_place_id = google_place_id;`. So sending `""` clears it. **No backend change needed for this bug.**

**Fix:** add a `Remove listing` control inside the Google Business card, in the block already gated on `googlePlaceId` (line 224) — next to "See your Google Reviews page". On click:

- `setGooglePlaceId("")` and `setAddress("")`, reset `committedAddressRef.current = ""`.
- Leave it to the existing shared `SaveBar` — don't fire its own request. `changed("", "ChIJ...")` is true, so `payload.google_place_id = ""` is appended by the existing branch at line 134. Verify `.trim()` on an empty string still appends (it does — `fd.append("google_place_id", "")`).
- Guard with a small confirm, since this silently removes the review CTA from every live gallery. Copy: *"Remove this listing? Guests will no longer see a Leave a review button on any of your galleries."*

**Also check:** `app/(dashboard)/dashboard/page.tsx:136` shows a GMB nudge when `gmb_skipped === true && !google_place_id`. After an unlink, `gmb_skipped` is still `false` (the controller only ever sets it `false`, on a truthy ID) — so the studio gets no nudge back. Decide whether that's acceptable (I think it is — an unlink is deliberate, and re-nudging a studio that just removed its listing is obnoxious) or whether the controller should clear it. **Flagging as a judgment call; my recommendation is to leave it and change nothing on the backend.**

---

# Manual test checklist

Fill this in and hand it back. Do not run the dev server — I will.

### navbar_gap

1. `/dashboard/events/<id>` on a **healthy** subscription → no gap above the tab strip beyond the intentional ~10px seam; the strip has a hairline border top and bottom.
2. Scroll the media grid to the bottom → tab strip, topbar, and LivePill all stay put. Nothing drifts.
3. Same event on a **suspended/past_due** account → the banner sits pinned under the topbar, above the seam, and does **not** scroll away. Tab strip still fixed.
4. `/dashboard` and `/dashboard/events` (list) → collapsing header on scroll still works (`useScrollCollapsed`).
5. Mobile width → the mobile-only LivePill row still sits directly under the tab strip, no double seam.
6. Archived event → terminal overlay still covers the blurred workspace, breadcrumb still clickable.

### guest_theme

7. Wedding event → Gallery Design shows collections **Ceremony / Festivity / Heirloom**; message label reads "Message from the Couple".
8. Corporate event (the cricket league) → collections **Boardroom / Launch / Offsite**; saved `Charcoal Editorial` preselects **Boardroom**; message label reads "Message from the Hosts".
9. Birthday event → **Warm / Bright / Evening**.
10. Event with no/unknown `event_type` → **Light / Bright / Deep**, no crash.
11. Pick `Sage Sanctuary` → Save → **200, not 422**. Reload, it persists. Repeat for `Indigo Dusk`.
12. Toggle `Show all themes` → all 10 listed; pick one outside the current collection; toggle off → snaps to the collection containing it, variant unchanged.
13. Open Gallery Design on an existing live gallery and save nothing → `style_variant` in the DB is byte-identical. **The acceptance bar: no live gallery's palette changes as a side effect of this refactor.**
14. Preview pane palette swatches track the selected variant (they read `resolveTheme`, unchanged).

### review_delete

15. Settings → Studio Identity → pick a listing from autocomplete → ID appears, Save → persists.
16. Pick a listing, then hand-edit the address text → the Google Reviews ID block **disappears** (stale ID cleared). Save → `google_place_id` is empty.
17. Load Settings with a saved address+ID, type into an *unrelated* field, then return and blur the address without editing it → ID is **still there** (the `committedAddressRef` init from `company.address` is doing its job).
18. With an ID saved, click `Remove listing` → confirm dialog → ID block gone, SaveBar goes dirty → Save → `google_place_id` is `""` in the company record.
19. Open a guest gallery for that studio → no "Review us" in the top bar, no review nudge, no gallery-end review CTA. Everything else renders normally.
20. Re-link a listing → all five guest review surfaces come back.
21. Discard (not Save) after a Remove → address and ID both revert to the saved values.
