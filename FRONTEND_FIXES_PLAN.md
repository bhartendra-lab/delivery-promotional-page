# Delivery Hub — Studio Dashboard Frontend Fixes

Implementation plan for Claude Code. Source: `vyavasth-work/Vyavasth- frontend fixes.md` (observations from 17 Jul 2026) plus a code walkthrough. All decisions below are locked unless a section is explicitly marked **OPEN**.

Repo: `delivery-promotional-page` (Next.js 16, Tailwind 4). All paths are relative to `frontend/` unless noted. Backend references are in the separate `Vyavasth` repo (`backend/src/...`).

## Locked decisions

| # | Area | Decision |
|---|------|----------|
| A1 | Card face-count caption | **Remove** the mono `slug · Nf` caption entirely (frontend-only). `total_faces` is not unique — see note. |
| B2 | Events page header | Replace decorative hero with a short title + a **live usage/summary line**. Keep "Show archived" **inline** (not sidebar) as a toggle. |
| C2 | Card metric labels | **Views · WhatsApp · Google reviews** + one shared info tooltip. |
| D2 | Card CTAs | Single primary **Share** button → menu (Copy link, WhatsApp). Replaces the two big buttons. |
| E2 | Header scroll behavior | **Drop the collapse animation.** Hero scrolls away normally; only a slim search/filter bar stays sticky. |
| F1 | Cover "Change" | Change opens the file picker **directly** (no dropdown; kills the dead "pick from grid" tip). |
| — | Cover controls (#5/#6) | Hidden until hover; four actions **Change / Reposition / Download / Fullscreen**; reposition uses Notion layout (actions top-right, hint centered). |
| — | Focus box (#7) | Ring shows on **keyboard focus only**, never on mouse click, in every browser. |
| — | Folder edit icon (#4) | Reveal on **row hover** (currently only shows when active). |
| — | Date bug (#3) | Fix `formatEventDate` to handle both seconds and millisecond timestamps. |

### Important context: `total_faces` is NOT a unique-people count
The `3658f` on cards is `total_faces` = **total face detections across all photos** (every face in every image), not unique guests. The unique count would be the number of face *clusters*: the face-recognition worker computes it and sends `cluster_ids` to `POST /deliverables/update-gallery-status`, but the backend **discards it** (`deliverables.controller.js:1148` destructures `cluster_ids` and never stores it). Surfacing "how many guests came" would require a backend change (persist `cluster_ids.length`). Per decision **A1** we are only removing the caption now; the unique-guest feature is deferred, not done here.

---

## 1. Date bug — wrong year on cards (#3)

**Symptom:** an event whose real date is 5 May 2026 renders as "10 Jan 58310".

**Root cause:** `components/dashboard/shared.ts` → `formatEventDate(unix)` does `new Date(unix * 1000)`, assuming seconds. The type comment claims `event_date` is unix **seconds** (`lib/types.ts`, `bookings.controller.js:107`), and the date-input path (`fromDateInputValue`) does store seconds — but the affected rows hold **milliseconds** (`1.78e12`), so `× 1000` overshoots into year ~58000. The data is mixed-unit, so the fix must be unit-agnostic rather than "just remove `× 1000`".

**Fix — `components/dashboard/shared.ts`:** add a normalizer and use it in both `formatEventDate` and `toDateInputValue`.

```ts
// Event dates are stored inconsistently: some rows in unix seconds (~1.7e9),
// some in ms (~1.7e12). Normalize to ms by magnitude. Any plausible event date
// in seconds is < 1e12; anything larger is already ms.
function toMillis(v: number): number {
  return v < 1e12 ? v * 1000 : v;
}
```
- `formatEventDate`: `const date = new Date(toMillis(unix));`
- `toDateInputValue`: `const date = new Date(toMillis(unix));`
- Leave `fromDateInputValue` as-is (it keeps writing seconds; that's the canonical unit going forward).

**Optional backend follow-up (OPEN, not required):** a one-time migration to normalize `events.start_date` to a single unit. Higher risk; do only if the mixed data causes other bugs. The frontend normalizer fixes display for all existing rows without it.

**Verify:** the three seed cards (Sonali & Rajeev, etc.) show 2026 dates; a newly created event (via the date input) still shows the correct date.

---

## 2. Event card cleanup — caption + labels + CTAs (#3)

File: `components/dashboard/EventCard.tsx`.

### 2a. Remove the mono caption (A1)
- Delete the `facesPart` / `captionParts` / `caption` block (currently ~lines 88–92).
- Delete the `{caption && (<span …>{caption}</span>)}` overlay inside the cover (currently ~lines 134–138).
- Keep `<StatusPill>` and the gradient overlay. The cover now shows only the Live/Draft/etc. pill and (on non-archived rows) the archive control.

### 2b. Metric labels + shared tooltip (C2)
Current row (~lines 154–158):
```tsx
<Metric label="Visits"   value={row.trackings?.visit ?? 0} />
<Metric label="Contacts" value={row.trackings?.contact ?? 0} />
<Metric label="Reviews"  value={row.trackings?.review ?? 0} />
```
Change labels to **Views**, **WhatsApp**, **Google reviews** (keep the same data bindings). "Google reviews" is wider than the column — allow it to wrap to two lines (`leading-tight`), don't truncate.

Add **one** info affordance for all three (not three tooltips). Place a small `(i)` icon button at the end of the metrics row header or inline after the grid. On hover **and** keyboard focus it shows a single popover:

> **Views** — guests who opened the gallery · **WhatsApp** — clicks on your "Contact us" button (opens WhatsApp) · **Google reviews** — clicks on the "Leave a review" button

Implementation notes:
- No tooltip primitive exists in `components/ui/`. Add a tiny inline one in this file (or `components/ui/Tooltip.tsx` if you prefer reuse): a `<button type="button">` with an absolutely-positioned panel shown via a `group`/`peer` hover + `focus-within`. Match the dark-ink tooltip style already used in `EventTabStrip.tsx` (~line 88: `bg-[var(--color-brand-ink)]`, white text, small arrow).
- The icon button must `stopPropagation` on click so it never triggers the card's open-button, and must sit outside the big `<button>` wrapper (like the archive control does) — or use a non-button element to avoid nested-button HTML. Simplest: render the metrics row + info icon **outside** the card-open `<button>`, or convert the card-open target to an overlay link. Keep it accessible (`aria-label="What these numbers mean"`).

### 2c. CTAs → single Share menu (D2)
Replace the non-archived footer (the Copy link + Send two-button block, ~lines 236–263) with a **single primary "Share" button** that opens a small menu. Keep the archived footer (Restore / Clear data, ~lines 203–235) unchanged.

Menu items (reuse existing handlers):
- **Copy link** → existing `copy()` (keep the "Copied" ✓ feedback; can show it inline on the item).
- **WhatsApp** → existing `send()`.
- (Email is deferred — do not add now.)

Pattern: mirror the dropdown in `CoverBanner.tsx` (button toggles `menuOpen`, outside-click closes via a `mousedown` listener + a `wrapRef`). The Share button is the filled primary (`bg-[var(--color-brand-navy)]`, full width or left-aligned). Each menu item `stopPropagation` so it doesn't open the event. Preserve `disabled={locked}`.

Update `CardGridSkeleton` (~lines 351–354) so the footer skeleton matches the new single-button footer (one button, not `w-24` + `flex-1`).

**Verify:** Copy link copies the share URL and shows ✓; WhatsApp opens `wa.me` with the prefilled message; menu closes on outside click and on Escape; nothing opens the event by accident.

---

## 3. Events page header + scroll behavior (#1, #2)

File: `app/(dashboard)/dashboard/events/page.tsx`. CSS: `app/globals.css`. Hook: `components/dashboard/ChromeContext.tsx`.

### 3a. Drop the collapse animation (E2)
- Remove `useScrollCollapsed` usage and the `collapsed` variable from this page (keep the hook exported — the dashboard-home may still use it; do **not** delete `useScrollCollapsed` from `ChromeContext.tsx`).
- Hero `<section>` (~lines 109–136): remove `scroll-fade` / `is-collapsed` classes. It becomes a normal block that scrolls off-screen.
- Search/filter `<section>` (~lines 141–218): keep `sticky top-0 z-10`. Remove the `collapsed ? … : …` conditional border/shadow — use a **static** subtle bottom border (`border-b border-[var(--color-brand-border)]`). Optionally keep an on-scroll shadow, but only if it reads as smooth; the static border is the safe default.
- Remove the `{collapsed && ( … folded Pagination + Add event … )}` cluster (~lines 200–216). Pagination stays at the bottom only (~lines 265–267); "Add event" stays in the hero.
- `.scroll-fade` / `.scroll-fade.is-collapsed` in `globals.css` (~lines 158–165) can stay (harmless) unless nothing else uses them — grep before deleting.

### 3b. Make the header informative (B2) — DECIDED: extend existing endpoint, live + archived
Replace the decorative hero (kicker "Events · All clients" + "Your events, in one place." + the "Create a page per booking…" subhead) with a short title and a **live summary line** reading e.g. **"6 live · 2 archived"**.

**Backend — extend the EXISTING endpoint. Do NOT create a new route/controller/validator/model.**
File: `Vyavasth` repo → `backend/src/controllers/bookings.controller.js` → `getAllBookings` (the function already runs the aggregation and returns a bare `{ bookings }`).
- Inside the same function, add **one** lightweight aggregation over this company's DH bookings grouped by `gallery_publish_status`, e.g. count `published` (→ `live`) and `archived` + `expired` (→ `archived`). Scope it the same way the list is scoped: company's leads → bookings with `creation_source === service`. Do **not** apply the page's `status`/pagination filter to this count (it must reflect all statuses, not the current view).
- Return it on the **same** response object: `res.status(200).json({ bookings, summary: { live, archived } })`.
- **No new route** (`bookings.routes.js` unchanged), **no new validator**, **no new controller**, **no new model**. One function edited; a few lines added.
- **Photos total is intentionally excluded** — there is no stored photo count; a global total would require counting the large `Media` collection. Not worth the cost/risk here.

**Frontend:**
- `lib/types.ts` → `BookingsListResponse`: add optional `summary?: { live: number; archived: number }` (keep optional so older backends still type-check).
- `app/(dashboard)/dashboard/events/page.tsx`: render the title + summary line from `data.summary` (e.g. `${summary.live} live · ${summary.archived} archived`). Fall back gracefully (hide the summary) when `summary` is absent.

Keep "Add event" where it is (hero top-right). Keep the empty/skeleton states.

### 3c. "Show archived" stays inline
Keep the toggle in the filter bar (do **not** move to the sidebar — the sidebar is for folders inside an event; archived-vs-active is a filter on this list). Style it as a clearer two-state control. Current pill (~lines 172–188) is fine functionally; optionally make it a segmented **"Active | Archived"** control for clarity. Keep `aria-pressed` / accessibility.

**Verify:** scroll up/down is jitter-free; the sticky bar stays put with a clean border; header summary reflects real usage; archived toggle still filters.

---

## 4. Cover banner — hover controls, Change/Reposition/Download/Fullscreen, Notion reposition (#5, #6)

File: `app/(dashboard)/dashboard/events/[booking_id]/CoverBanner.tsx`. Helpers: `coverPosition.ts`, `@/lib/media-actions` (`downloadImage`), icons in `./icons`.

### 4a. Hide controls until hover; direct actions (F1)
- Wrap the banner as a `group`. When `filled`, controls are hidden at rest and appear on `group-hover` / `focus-within` (opacity transition). When **not** filled (no cover yet), keep an always-visible "Add cover photo" button (nothing to hover over).
- **Remove the dropdown menu entirely** (`menuOpen` state, the menu block ~lines 142–169, the "Tip: open any photo…" text, and the "pick from grid" affordance). Replace with a top-right cluster of direct actions:
  - **Change** → `fileRef.current?.click()` directly (F1). Keep the hidden `<input type="file">` and its RAW-file guard.
  - **Reposition** → `startReposition()` (existing).
  - **Download** → download the current cover. Reuse `downloadImage` from `@/lib/media-actions` (used by `Lightbox`); pass `coverUrl`. If it needs a filename, derive from the URL or use `"cover"`.
  - **Fullscreen** → open a full-screen preview of `coverUrl`.
- Keep the busy spinner state on Change while `busy`.
- Preserve `disabled` / `busy` guards on all actions.

Cluster styling: match the current pill button (`bg-white/90`, `backdrop-blur-sm`, `border`), as an icon row or small labeled buttons, top-right with padding (`right-4 top-4 sm:right-6`).

### 4b. Fullscreen preview
Two options — pick the lighter one:
- **Recommended:** a minimal fixed overlay (dark warm scrim `rgba(42,34,24,.…)`, centered `<img src={coverUrl}>`, an `IconX` close top-right, Escape-to-close, click-scrim-to-close). ~30 lines, no coupling.
- **Reuse `Lightbox`:** it expects `MediaItem[]` + index and carries delete/zoom/nav. Reusable by passing a single synthetic item and omitting `onDelete`/`onToggleShortlist`, but it drags in the `MediaItem` shape. Prefer the minimal overlay unless you want zoom/pan on the cover.

### 4c. Reposition — Notion layout (#6)
Currently the reposition bar sits at the **bottom** (`inset-x-0 bottom-0`), hint text left + Cancel/Save right (~lines 97–125). Change to Notion's arrangement:
- **Action buttons (Cancel / Save position) top-right**, with padding — same corner the hover cluster uses.
- **Hint text ("Drag the photo to choose what guests see") centered** over the image (horizontally centered; vertically center or lower-third, your call — keep it readable with a subtle scrim behind the text only, not a full bottom bar).
- Keep the drag mechanics unchanged (`onPointerDown/Move/Up`, `clamp`, `parsePosNums`, `dragPos`, `onSavePosition`). Keep the `stopPropagation` guard on the controls so pointer-down there doesn't start a drag.

**Verify:** at rest a filled cover shows no chrome; hover reveals the four actions; Change opens the picker immediately; Download saves the image; Fullscreen opens and Escape closes; Reposition shows centered hint + top-right Save/Cancel and drag still repositions; empty (no cover) still shows "Add cover photo".

---

## 5. Focus outline appears on click in Chrome (#7)

File: `app/globals.css` (~lines 191–198).

**Root cause:** the ring is defined for both `:focus-visible` **and** plain `:focus`:
```css
.brand-focus:focus-visible,
.brand-focus:focus { … terracotta ring … }
```
`:focus` matches on mouse click too, so clicking a tab/section leaves the ring (Chrome retains focus-ring on click for these; Safari's heuristics differ, which is why it looked browser-specific). The `EventTabStrip` tabs use `brand-focus` (confirmed), so this is the exact source of the box in the screenshot.

**Fix:** drop the plain `:focus` selector; keep **only** `:focus-visible`:
```css
.brand-focus:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px rgba(194, 90, 58, 0.18),
    0 0 0 1px #C25A3A inset;
}
```
This makes the ring keyboard-only and consistent across browsers.

**Verify:** clicking tabs/buttons shows **no** ring in Chrome and Safari; Tab-key navigation still shows the ring for accessibility.

---

## 6. Folder edit icon on hover (#4)

File: `components/dashboard/FoldersSidebar.tsx` → `FolderRowComponent` (~lines 148–197).

Currently the rename (edit) button renders only when `isActive` (`{isActive && !isRenaming && !folder.system && …}`, ~lines 182–195).

**Change:** reveal it on **row hover** as well as when active.
- Add `group` to the row's outer `<div>` (~line 149).
- Change the render condition to `!isRenaming && !folder.system` and make the button itself hidden by default, shown on `group-hover` / active / `focus-visible`:
  ```
  className="… opacity-0 group-hover:opacity-100 focus-visible:opacity-100 …"
  ```
  and keep it visible when `isActive` (e.g. add `isActive && "opacity-100"`). Keep `stopPropagation`, `title="Rename folder"`, and the `disabled` guard.

Position (**OPEN, minor**): current placement (after the count) is acceptable. If you want it tidier, place the edit icon so it **replaces the count on hover** (count hides, edit shows in its slot) to avoid the row getting wider. Default: keep current position, just reveal on hover.

**Verify:** hovering any non-system folder row reveals the edit icon; it still works when the row is active; keyboard focus reveals it; clicking it renames without selecting/deselecting oddly.

---

## Global verification checklist

- [ ] `npm run lint` passes (`frontend/`).
- [ ] `npx tsc --noEmit` (or the build) type-checks.
- [ ] Cards: no mono caption; dates correct (2026, not 58xxx); labels read Views / WhatsApp / Google reviews; single info tooltip works on hover + keyboard; Share menu (Copy link ✓ / WhatsApp) works and closes on outside-click/Escape.
- [ ] Events list: scrolling up/down is jitter-free; sticky filter bar clean; header shows a real usage summary; archived toggle filters.
- [ ] Cover: controls hidden at rest, revealed on hover; Change opens picker directly; Download works; Fullscreen opens/closes (Escape); Reposition = centered hint + top-right actions, drag works; empty state shows "Add cover photo".
- [ ] Focus ring: keyboard-only in Chrome **and** Safari; no ring on mouse click anywhere.
- [ ] Folder rows: edit icon reveals on hover + focus, still works when active.
- [ ] Manual pass in **both Chrome and Safari** (the focus + sticky issues were browser-specific).

## Files touched (summary)
- `components/dashboard/shared.ts` — date normalizer (#1).
- `components/dashboard/EventCard.tsx` — caption removal, labels+tooltip, Share menu, skeleton (#2, #3).
- `app/(dashboard)/dashboard/events/page.tsx` — drop collapse, informative header, inline archived toggle (#3a–c).
- `app/globals.css` — focus-visible-only ring (#5); maybe prune `.scroll-fade` if unused.
- `app/(dashboard)/dashboard/events/[booking_id]/CoverBanner.tsx` — hover controls, four actions, Notion reposition, fullscreen (#4).
- `components/dashboard/FoldersSidebar.tsx` — edit icon on hover (#6).
- (Optional) `components/ui/Tooltip.tsx` — if you extract the metrics tooltip.
- `lib/types.ts` — add optional `summary` to `BookingsListResponse` (#3b).
- **Backend (`Vyavasth` repo):** `backend/src/controllers/bookings.controller.js` → `getAllBookings` ONLY — add a status `$group` and return `summary:{live,archived}` on the existing response. **No new routes/controllers/validators/models.**
