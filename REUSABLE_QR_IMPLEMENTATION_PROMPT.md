# Reusable QR — implementation brief

Implement a **Reusable QR** feature so studios can print one QR per stand and re-point it at whichever event is currently live, instead of reprinting for every booking. This touches two repos:

- **Frontend (delivery dashboard):** `delivery-promotional-page/frontend/`
  - New: `app/(dashboard)/dashboard/reusable-qr/page.tsx` (+ new components under `components/dashboard/reusable-qr/`)
  - New: `app/(client)/error/qr-not-found/page.tsx`, `app/(client)/error/qr-not-assigned/page.tsx` (+ shared component)
  - Edit: `components/dashboard/Sidebar.tsx`, `lib/api.ts`, `lib/types.ts`
  - Edit: `app/(dashboard)/dashboard/events/[booking_id]/AccessSharingTab.tsx`, `EventContext.tsx`, `EventWorkspace.tsx`
  - Reuse as-is: `lib/media-actions.ts` (`downloadImage`), `components/dashboard/AddEventModal.tsx` (modal chrome reference), `.../TypeConfirmModal.tsx` (delete confirm), `.../icons.tsx`
- **Backend:** `Vyavasth/backend/src/`
  - Edit: `controllers/deliverables.controller.js` (`getAllQRCodes`, `assignQR`, `deleteQR`, `redirectQR`)
  - No model or route changes needed — `models/deliverables.model.js`'s `QR` schema and `routes/deliverables.routes.js` already cover everything.

Read those files first. Do not restructure anything outside this feature — in particular, leave `MediaTab`, `SmartSelectsTab`, `GalleryDesignTab` and the guest-facing gallery flow untouched.

---

## Background you must know before coding

- **The backend is further along than it looks.** `QR` already exists (`company_id`, `qr_image_url`, `unique_id`, `color_code`, optional `delivery_landing_page_id` = unassigned when empty). `generate-qr`, `get-all-qr-codes`, `assign-qr`, `redirect-qr/:unique_id` (public, no auth — this is the URL baked into the printed QR) and `delete-qr/:unique_id` all exist and are wired in `deliverables.routes.js`. `deliverables.utils.js`'s `generateAndUploadQR`/`generateQRImage` already renders a styled, gradient, logo-overlaid PNG and uploads it to **public** R2 — `qr_image_url` is a plain public URL. Don't build a download proxy; call `downloadImage(qr.qr_image_url, filename)` from `lib/media-actions.ts` exactly like every photo download already does.
- **`getBookingById` (`bookings.controller.js`) already joins the assigned QR.** Its aggregation `$lookup`s `qrs` by `delivery_landing_page_id` and the flattened response already includes `qr_unique_id` / `qr_image_url` (null when unassigned). The Access & Sharing QR panel needs **no new endpoint** — just thread those two fields through the frontend types/props.
- **"Live event"** = `gallery_publish_status: "published"` (not archived/expired) — the same definition the Events list page's default view uses via `getAllBookings({ status: "published" })`. Reuse that endpoint for the Assign-Event modal; no new listing endpoint needed. A `published` event with `is_active: false` (temporarily deactivated) still counts as "live" here — badge it, don't exclude it (scanning a QR pointed at a deactivated gallery already correctly lands the guest on the existing "temporarily unavailable" screen).
- **Company scoping.** Every studio-scoped query filters by `req.user.company_id` (see `getAllQRCodes`, `generateQRCode`). Two existing QR endpoints are missing this check — see B2, it's the most important fix in this brief.
- **Design system** (`Vyavasth Design System.md` + `app/globals.css`): one accent color everywhere (`--color-brand-navy` *is* terracotta `#C25A3A` — the CSS variable name is legacy, don't be misled by it), cream/white surfaces, `radiusLarge`(12px) cards, flat shadows, ≤250ms motion, mobile-first with **no hover-only interactions** (48px min touch target). The QR swatches themselves are the one deliberate exception to "one accent color" — they're literally a color picker.
- Operational dashboard lists normally use rows, not cards — but `EventCard.tsx` already breaks that rule for cover-photo-fronted entities. A QR is a visual/physical asset like a photo, so cards are the right call here too, consistent with that precedent.

---

## Scope overview

1. New **Reusable QR** dashboard tab: generate a QR with a paint-style color picker, view all QRs as full-width cards, assign/reassign each to a live event (with confirm-on-reassign), delete with a confirm modal.
2. Restructure the event page's **Access & Sharing** tab: compact the sharing-message actions into logo buttons, add a 3/4-width (message) + 1/4-width (QR) row.
3. New guest-facing **QR scan error pages** (`qr-not-found`, `qr-not-assigned`) with a "Contact studio" CTA, mirroring `EventNotFound`/`GalleryUnavailable`.
4. Backend hardening: enrich `getAllQRCodes`, fix a cross-tenant security hole in `assignQR`/`deleteQR`, clean up orphaned R2 objects on delete, carry studio contact info into the not-assigned redirect.

---

## Backend changes (`Vyavasth/backend/src/`)

### B1. `getAllQRCodes` — return assigned-event details, not just a raw booking id

Today it does `QR.find({company_id}).populate({ path: "delivery_landing_page_id", populate: { path: "booking_id" } })`. `Booking` has no name/cover/type — those live on `Leads`/`Events`/the DLP itself — so the frontend has nothing to render on a QR card beyond a raw id. Rewrite as an aggregation (mirrors the join already used in `getDeliveryLandingPageByUniqueIdentifier`):

```js
const getAllQRCodes = async (req, res, next) => {
  try {
    const { company_id } = req.user;
    const cid = new mongoose.Types.ObjectId(company_id);
    const pipeline = [
      { $match: { company_id: cid } },
      { $sort: { createdAt: -1 } },
      { $lookup: { from: "delivery-landing-pages", localField: "delivery_landing_page_id", foreignField: "_id", as: "dlp" } },
      { $unwind: { path: "$dlp", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "bookings", localField: "dlp.booking_id", foreignField: "_id", as: "booking" } },
      { $unwind: { path: "$booking", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "leads", localField: "booking.lead_id", foreignField: "_id", as: "lead" } },
      { $unwind: { path: "$lead", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "events", localField: "booking.lead_id", foreignField: "lead_id", as: "events" } },
      {
        $project: {
          unique_id: 1, qr_image_url: 1, color_code: 1, createdAt: 1,
          assigned_event: {
            $cond: [
              { $eq: ["$dlp", null] },
              null,
              {
                booking_id: "$booking._id",
                delivery_landing_page_id: "$dlp._id",
                name: "$lead.name",
                event_type: { $arrayElemAt: ["$events.event_type", 0] },
                background_image: "$dlp.background_image",
                unique_identifier: "$dlp.unique_identifier",
                gallery_publish_status: "$booking.gallery_publish_status",
                is_active: "$booking.is_active",
              },
            ],
          },
        },
      },
    ];
    const qrs = await QR.aggregate(pipeline);

    // Bundled in since it's nearly free here: lets the frontend show "X of Y QR
    // codes used" without a second round trip (same lookup generateQRCode does).
    const subscription = await Subscription.findOne({ company_id: cid }).populate("service_id");
    const qr_limit = subscription?.service_id?.qr_limit ?? null;

    return res.status(200).json({ qrs, qr_limit });
  } catch (err) {
    return next(err);
  }
};
```

Collection names (`bookings`, `leads`, `events`, `delivery-landing-pages`) are confirmed against existing `$lookup`s elsewhere in this file — don't guess new ones.

### B2. Fix missing company scoping on `assignQR` and `deleteQR` — cross-tenant security hole

Neither handler currently checks that the QR (or the target event) belongs to the requesting studio:

```js
// current assignQR — no company_id check anywhere
const [qr, dlp] = await Promise.all([
  QR.findOne({unique_id: qr_unique_id}),
  DeliveryLandingPage.findOne({booking_id: new mongoose.Types.ObjectId(booking_id)})
]);
```

```js
// current deleteQR — no company_id check
await QR.findOneAndDelete({unique_id: unique_id});
```

As written, any authenticated dashboard user from **any** studio can assign or delete **any other studio's** QR just by knowing/guessing a `unique_id` or `booking_id` — `protect` only checks the JWT is valid, not that the target rows belong to that company. Fix both:

```js
const assignQR = async (req, res, next) => {
  try {
    const { qr_unique_id, booking_id } = req.body;
    const { company_id } = req.user;
    const [qr, dlp] = await Promise.all([
      QR.findOne({ unique_id: qr_unique_id }),
      DeliveryLandingPage.findOne({ booking_id: new mongoose.Types.ObjectId(booking_id) }),
    ]);
    if (!qr || String(qr.company_id) !== String(company_id)) {
      return res.status(404).json({ message: "QR not found" });
    }
    if (!dlp || String(dlp.company_id) !== String(company_id)) {
      return res.status(404).json({ message: "Event not found" });
    }
    qr.delivery_landing_page_id = new mongoose.Types.ObjectId(dlp._id);
    await qr.save();
    return res.status(200).json({ qr });
  } catch (err) {
    return next(err);
  }
};
```

```js
const deleteQR = async (req, res, next) => {
  try {
    const { unique_id } = req.params;
    const { company_id } = req.user;
    const qr = await QR.findOneAndDelete({ unique_id, company_id: new mongoose.Types.ObjectId(company_id) });
    if (!qr) {
      return res.status(404).json({ message: "QR not found" });
    }
    // B3 cleanup goes here — see below.
    return res.status(200).json({ message: "QR deleted successfully" });
  } catch (err) {
    return next(err);
  }
};
```

### B3. `deleteQR` — clean up the orphaned R2 object

Deleting the `QR` doc today leaves its PNG sitting in R2 forever. Mirror the exact pattern `deleteWatermarkPreset` already uses — best-effort, non-fatal:

```js
if (qr.qr_image_url) {
  try {
    await deleteMediaFromR2(qr.qr_image_url);
  } catch (e) {
    console.error("Failed to delete QR image from R2:", e.message);
  }
}
```

Insert this right after the `findOneAndDelete` succeeds, before the 200 response.

### B4. `redirectQR` — carry studio contact info into the "not assigned" redirect

Requested addition: when the QR is scanned, the two failure redirects need somewhere to land (see F3) and the "not assigned" one needs enough context to show a "Contact studio" button. Today neither redirect carries any query params:

```js
const redirectQR = async (req, res, next) => {
  try {
    const { unique_id } = req.params;
    const qr = await QR.findOne({ unique_id }).populate("delivery_landing_page_id");
    if (!qr) {
      // No company to attribute this to — the QR doesn't exist at all.
      return res.redirect(`${process.env.FRONTEND_URL_DELIVERY_DASHBOARD}/error/qr-not-found`);
    }
    if (!qr.delivery_landing_page_id) {
      const company = await Companies.findById(qr.company_id);
      const params = new URLSearchParams();
      if (company?.name) params.set("studio", company.name);
      if (company?.contact_number) params.set("phone", company.contact_number.replace(/\D/g, ""));
      const qs = params.toString();
      return res.redirect(`${process.env.FRONTEND_URL_DELIVERY_DASHBOARD}/error/qr-not-assigned${qs ? `?${qs}` : ""}`);
    }
    const redirectUrl = `${process.env.FRONTEND_URL_DELIVERY_DASHBOARD}/event/${qr.delivery_landing_page_id?.unique_identifier}`;
    return res.redirect(redirectUrl);
  } catch (err) {
    return next(err);
  }
};
```

`Companies` is already imported in this file. `qr-not-found` intentionally gets no query params — there's no studio to attribute a nonexistent/deleted QR to.

### B5. Verify — `qr_limit` falsy check in `generateQRCode`

```js
const qrLimit = subscription?.service_id?.qr_limit;
if (qrsCount >= qrLimit) { ... }
```

If a company's active `Service.qr_limit` is ever `null`/`undefined`, `qrsCount >= undefined` evaluates to `false` in JS — the cap silently never triggers (unlimited generation). Confirm whether that's the intended fallback (unlimited on legacy/custom plans) or a bug. If unlimited-by-default is *not* intended, change to `if (qrLimit == null || qrsCount >= qrLimit)` with a clear message. This is a one-line, product-call fix — don't guess, flag it if the intent is unclear.

---

## Frontend changes (`delivery-promotional-page/frontend/`)

### F1. New "Reusable QR" dashboard tab

**`lib/types.ts`** — add:

```ts
export type AssignedEventSummary = {
  booking_id: string;
  delivery_landing_page_id: string;
  name: string;
  event_type?: string;
  background_image?: string;
  unique_identifier?: string;
  gallery_publish_status?: GalleryPublishStatus;
  is_active?: boolean;
};

export type QrCode = {
  _id: string;
  unique_id: string;
  qr_image_url: string;
  color_code: string;
  createdAt: string;
  assigned_event: AssignedEventSummary | null;
};
```

Also extend `BookingDetail` with `qr_unique_id?: string;` and `qr_image_url?: string;` (B-side already sends these; the type just doesn't declare them yet).

**`lib/api.ts`** — add, following the existing `request<T>` conventions exactly:

```ts
export function generateQrCode(colorCode: string) {
  return request<{ qr: QrCode }>("/deliverables/generate-qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ color_code: colorCode }),
  });
}

export function getAllQrCodes() {
  return request<{ qrs: QrCode[]; qr_limit: number | null }>("/deliverables/get-all-qr-codes");
}

export function assignQr(qrUniqueId: string, bookingId: string) {
  return request<{ qr: QrCode }>("/deliverables/assign-qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qr_unique_id: qrUniqueId, booking_id: bookingId }),
  });
}

export function deleteQr(uniqueId: string) {
  return request<{ message: string }>(`/deliverables/delete-qr/${encodeURIComponent(uniqueId)}`, {
    method: "DELETE",
  });
}
```

The Assign-Event modal reuses `getAllBookings({ status: "published", search, page, limit })` — already exported, no new function needed.

**`components/dashboard/Sidebar.tsx`** — add a third `NAV_ITEM` between "Events" and the footer:

```ts
{ id: "reusable-qr", label: "Reusable QR", href: "/dashboard/reusable-qr", Icon: IconQrCode },
```

Add a local `IconQrCode` function next to `IconHome`/`IconCalendar` in the same file (same phosphor-regular-stroke style, `viewBox="0 0 24 24"`, three corner-square outlines + a couple of small filled dots — matches how a QR glyph reads at 17–22px).

**New route:** `app/(dashboard)/dashboard/reusable-qr/page.tsx`. Suggested (flexible) split under `components/dashboard/reusable-qr/`:

- `QrColorPicker.tsx` — the generate panel (F1a)
- `QrCard.tsx` — one card in the grid (F1b)
- `AssignEventModal.tsx` — F1c
- `QrCardSkeleton.tsx` — loading state, mirrors `CardGridSkeleton` in `events/page.tsx`

Follow the `EventsListPage` shell conventions: hero + toolbar, `dash-rise`/`dash-stagger` entrance classes, a local toast (copy the `notify`/`toastNode` pattern from `useBookingLifecycle.tsx` rather than inventing a new one), empty state when the studio has zero QRs yet.

#### F1a. Generate panel — "paint style" color picker

This is the one place in the app that's allowed more than one color on screen — it's a color picker. Keep all *chrome* (buttons, borders, the panel itself) on the existing terracotta/cream tokens; only the swatches carry arbitrary hues.

- A large circular "current pick" preview (radiusFull, ~72–96px), empty/dashed ring until a color is chosen.
- A curated preset palette rendered as `radiusFull` circular swatches (~36–40px) with `shadowSubtle`, scaling up + a ring in the swatch's own color on hover/selection (`durationFast`, `easingStandard` — nothing past 250ms per the motion scale). Suggested starter set — all dark/saturated enough to keep the QR scannable, leaning into the brand's "rich jewel tones for Indian wedding studios" direction rather than generic corporate colors: terracotta `#C25A3A` (brand default), maroon `#8C2F3A`, emerald `#2E6B52`, ink navy `#1F2A44`, charcoal `#2A2218`, deep gold `#B8860B`, royal purple `#5B3A8C`, forest `#2F4F2F`, wine `#6B1F3A`, teal `#1F5E5E`, deep rose `#A8425A`, bronze `#8A5A2E`. Adjust freely — this is a starting point, not a locked spec.
- A "Custom" swatch that opens a native `<input type="color">` paired with a hex text field, validated client-side against the same pattern the backend's `isHexColor()` expects, before enabling Generate.
- **"Colors you've already used"** row underneath: `Array.from(new Set(qrs.map(q => q.color_code)))` from the already-fetched list — satisfies "see the old picked colors for already generated QRs" with zero extra backend calls. Clicking one selects it.
- Primary **Generate** button (solid terracotta, `radiusMedium`, per the Buttons spec), disabled until a color is picked, spinner + "Generating…" while in flight (server composites a real image — this can take a couple of seconds).
- Contrast guard: reject or warn on a custom hex whose perceived luminance is too high to scan reliably (reuse the `luminance()` math already in `lib/client-theme.ts` as a reference implementation — same problem, same fix). A near-white QR won't scan against its background.
- If `qr_limit` (from `getAllQrCodes`) is a number, show "`{qrs.length}` of `{qr_limit}` used" and disable Generate at the cap with a link/hint to reassign or delete an existing one instead of waiting for the 400. Always still handle the 400 gracefully (message comes straight from the backend) since this is a soft, best-effort UI guard, not the source of truth.
- No logo uploaded yet (`Company.logo` unset): generation still succeeds (backend's `downloadObject` returns `null` gracefully, logo overlay is just skipped) — no special-casing needed, but consider a one-line hint linking to `dashboard/settings/logo` ("Add your studio logo to have it appear on new QR codes").

#### F1b. QR card grid

"Full width for each card" — this is not the 3-up `EventCard` grid. Use `grid-cols-1 2xl:grid-cols-2` (mostly a single wide column; two-up only on very large monitors), each card laid out as a horizontal row on tablet/desktop (QR thumbnail on the left, details + actions filling the rest) and stacked vertically on mobile. Per card:

- QR image thumbnail (the actual `qr_image_url`, not a re-rendered preview), on a subtle background tinted from `color_code` at low opacity.
- Color swatch dot + hex.
- **Download** — `downloadImage(qr.qr_image_url, <slugified-filename>.png)` from `lib/media-actions.ts`. No proxy, no new backend route — same pattern as every other media download in this app.
- Assigned-event mini-summary: cover thumbnail + name + a small live/deactivated badge (reuse `EventCard`'s `StatusPill` color logic), or an empty "Not assigned yet" state.
- **Assign event** / **Change event** button → opens F1c.
- **Delete** button — always visible (not hover-only; the design system explicitly bans hover-dependent actions on touch), opens the confirm modal (F1d).

#### F1c. Assign Event modal

Grid of live-event cards (name + cover photo), matching the requirement almost verbatim. Build on `getAllBookings({ status: "published", search, page })` and the `AddEventModal.tsx` chrome pattern (header/body/footer, overlay, Esc-to-close gated on `!submitting`). Focus areas — this is the part of the brief the requirements explicitly called out as needing edge-case care:

- **Search** at the top — studios can have dozens of live events; don't try to load them all unpaginated.
- **Loading**, **empty** ("No live events yet"), and **error + retry** states.
- The event currently assigned to this QR (if any) is visually marked (ring/badge) in the grid; clicking it again is a no-op (close, don't re-POST).
- Clicking a **different** event when one is already assigned triggers the required confirm step: *"Reassign this QR to '<New Event>'? It will be removed from '<Old Event>'."* Confirm/Cancel, loading state on Confirm, modal stays open with an inline error on failure (don't optimistically close before the API call succeeds).
- Clicking any event when **nothing** is currently assigned assigns directly — no confirm needed (nothing is being removed).
- `is_active: false` events remain selectable but carry a "Deactivated" badge so the studio makes an informed choice, per the Background note above.
- Missing `background_image` → reuse `EventCard`'s diagonal-stripe placeholder, don't leave a blank box. Long names → `truncate`.
- Races: the target event could get archived, or the QR itself deleted/reassigned elsewhere, between opening the modal and confirming — surface the backend's 404 as an inline error rather than a silent failure or a crash.
- Double-submit guard on Confirm.
- Mobile: full-height sheet, not a small centered box; 1 column on narrow phones, 2 on larger phones/tablets.
- On success: close, toast, update the QR card in place (refetch or optimistic patch) — don't force a full page reload.

#### F1d. Delete confirmation

Reuse the existing `TypeConfirmModal` component as-is (`requireTyping: true` — this is a hard-to-undo, physical-world-consequence action, same tier as "Clear this event's data"). Copy must state the printed-QR consequence regardless of assignment state, per the requirement:

- Unassigned QR: *"If you've already printed this QR, it will stop working once deleted."*
- Assigned QR: combine both warnings — *"This QR is currently assigned to '<Event>'. If you've already printed it, it will stop working once deleted."*

Deleting a QR must **not** touch the event/DLP it was pointed at — only the `QR` doc (+ its R2 image, via B3) is removed. On success: remove the card from the grid (optimistic, matching `EventCard`'s `runConfirmed` pattern) + toast; on failure, keep the modal open for retry.

### F2. Access & Sharing tab restructure (`AccessSharingTab.tsx`)

**Threading the data through:**
- `EventContext.tsx` → add `qrUniqueId?: string` and `qrImageUrl?: string` to `EventMeta`.
- `EventWorkspace.tsx` → extend `normalizeMeta` to carry `b.qr_unique_id` / `b.qr_image_url` through (same pattern as every other field there), and pass them into the `<AccessSharingTab>` render call (search this file for where it's mounted).
- `AccessSharingTab.tsx` → accept `qrUniqueId`/`qrImageUrl` props.

**Layout change**, scoped to the "Guest gallery link" card's message section — turn the current full-width `Dispatch` block into a row: **3/4 width** = the (now more compact) message section, **1/4 width** = the QR panel. Stack to full-width on mobile (message first, QR panel second — keeps the reading/action flow message-first).

- **Message section (3/4):** replace the current large "WhatsApp" / "Email" buttons with icon-only logo buttons (WhatsApp glyph, mail glyph) that reveal a text label on hover (`title`/`aria-label` set regardless, so touch/screen-reader users aren't dependent on hover — **tapping fires the action immediately**, the hover label is a desktop-only nicety, not a required step, per the design system's no-hover-dependency rule). Keep the persistent Copy button next to them. Textarea + Reset stay as-is.
- **QR panel (1/4):**
  - **Assigned** (`qrImageUrl` set): show the QR thumbnail + a single **Download** button (`downloadImage(qrImageUrl, ...)`, same as F1b — no proxy). **Do not** add a reassign/change control here — reassignment lives exclusively on the Reusable QR tab's card, per "no multiple CTAs to do the same thing except this one."
  - **Unassigned**: empty state + exactly **one** "Assign QR" button → `router.push("/dashboard/reusable-qr")`. Plain navigation, matching the requirement literally — don't build a smart deep-link/pre-fill flow into this pass (see Non-goals).

### F3. QR scan error pages (new)

Triggered by `redirectQR` (B4) when a scanned/printed QR is invalid or not yet pointed at an event.

- `app/(client)/error/qr-not-found/page.tsx`
- `app/(client)/error/qr-not-assigned/page.tsx`
- Shared presentational component, e.g. `components/event/QrScanError.tsx`, mirroring `EventNotFound.tsx` / `GalleryUnavailable.tsx` exactly: `PLATFORM_SKIN` theme (not a per-event theme — this is the Vyavasth trust layer, not the studio's branded gallery), `AmbientBackdrop`, centered icon + heading + body copy, same typography/spacing.

```tsx
type Props = { variant: "not-found" | "not-assigned"; studioName?: string | null; phone?: string | null };
```

- `qr-not-assigned`: read `studio`/`phone` from the page's `searchParams` (Next App Router passes this to `page.tsx`), pass down, and render a **"Contact studio on WhatsApp"** button when `phone` is present — identical CTA construction to `GalleryUnavailable.tsx` (`https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`). No `phone` → omit the button, just show the message.
- `qr-not-found`: generic copy only ("This QR code isn't valid," roughly), **no contact button** — there's no studio to attribute a nonexistent QR to (see B4).
- `app/(client)/layout.tsx` is a trivial wrapper (`<div className="flex min-h-screen flex-col">`) — nesting these under `(client)/error/...` is safe, no special data requirements to satisfy.

---

## Edge cases to handle

- **Generate:** limit reached (soft pre-check + hard backend 400, B5 ambiguity flagged not guessed), no color picked yet (button disabled), low-contrast custom hex (guard/warn), no studio logo yet (still works), network/server failure mid-generation (retry without losing the picked color).
- **Assign/reassign:** empty live-events list, search + pagination for large lists, no-op on re-selecting the current event, confirm naming both old and new events, concurrent deletion/reassignment races surfaced as inline errors (not crashes), deactivated events selectable-but-badged, archived/expired events excluded entirely, missing cover photo placeholder, long event name truncation, double-submit guard.
- **Delete:** combined warning copy when currently assigned, typed confirmation, deleting doesn't touch the assigned event/DLP, optimistic list removal with retry-on-failure.
- **Access & Sharing panel:** no reassign control here (single-CTA rule), plain navigation to the Reusable QR tab when unassigned, graceful when `qrImageUrl`/`qrUniqueId` are both absent (brand-new event, never touched this feature).
- **QR scan:** `qr-not-found` vs `qr-not-assigned` render distinct copy; `qr-not-assigned` contact button only appears when the backend resolved a phone number; scanning a QR assigned to a deactivated/expired/archived event is **not** a new case to build — it already flows into the existing `GalleryUnavailable`/expired handling on `/event/[unique_identifier]`.
- **Cross-tenant security (B2):** verify after the fix that a QR/event from Company A genuinely 404s when a Company B token is used — this is the one item in this brief worth a manual multi-tenant test, not just a code read.
- **Responsiveness:** QR card grid, Assign-Event modal, and the Access & Sharing 3/4–1/4 row all need explicit mobile layouts (stacked, full-height sheet modal, single-column grid) — verify at a phone width and a laptop width, not just desktop.

---

## Non-goals (explicitly out of scope)

- No standalone "unassign without reassigning" action — reassigning to a different event already covers the retire-and-repurpose flow; don't add a bare unassign endpoint/button unless product asks.
- No editing an existing QR's color — generate a new one instead (matches the requirement: "Generate a new QR," not "recolor").
- No server-side/proxy download route for QR images — `qr_image_url` is a public R2 URL, fetched client-side exactly like every other media download in this app.
- No smart deep-link from the Access & Sharing "Assign QR" button into a pre-filled assign flow on the Reusable QR tab. The requirement asks for a plain navigation; an optional `?assign_to_booking=` query param + a dismissible banner on the Reusable QR page is a reasonable future enhancement but is **not required** for this pass — don't block on it.
- No changes to `MediaTab`, `SmartSelectsTab`, `GalleryDesignTab`, or the guest-facing gallery/lounge flow beyond the two new error pages.

---

## Acceptance criteria

- [ ] Studio can generate a QR by picking a color (curated palette, custom hex, or a previously-used color) in a paint-style picker; the new QR appears in the grid immediately.
- [ ] Every QR card shows its image (downloadable directly via the public `qr_image_url`, no proxy), color, and assigned-event summary (or "not assigned").
- [ ] Assign Event modal lists only live (`published`) events as cards with name + cover photo, supports search, handles an empty/loading/error state, and requires a named confirm ("removed from X") only when replacing an existing assignment.
- [ ] Deleting a QR shows a typed confirm whose copy always mentions the printed-QR consequence, and additionally names the event when one is assigned; deletion never touches the event itself.
- [ ] `assignQR` and `deleteQR` both 404 when the QR or event belongs to a different company (manually verified, not just read).
- [ ] `deleteQR` removes the R2 object, not just the DB row.
- [ ] Access & Sharing tab shows the 3/4 (compact logo-button message section) / 1/4 (QR visibility + download, or a single Assign QR CTA) row, stacking correctly on mobile, with no duplicate "assign" affordance anywhere on this tab.
- [ ] Scanning an unknown QR lands on `/error/qr-not-found` (generic, no contact button); scanning an unassigned QR lands on `/error/qr-not-assigned` with a working "Contact studio on WhatsApp" button when the studio has a phone number on file.
- [ ] Scanning a QR assigned to a deactivated/archived/expired event still resolves via the existing `/event/[unique_identifier]` unavailable/expired handling — confirm no regression, don't rebuild it.
- [ ] Full flow re-tested at a phone width and a laptop width: color picker, QR card grid, Assign Event modal, Access & Sharing row.
