# Smart Selects enhancement — implementation brief

Implement the following changes to the **Smart Selects** feature. This touches two repos:

- **Frontend (delivery dashboard):** `delivery-promotional-page/frontend/`
  - `app/(dashboard)/dashboard/events/[booking_id]/SmartSelectsTab.tsx`
  - `.../MediaGrid.tsx`, `.../LikedFilters.tsx`, `.../LocateOriginals.tsx`, `.../EventContext.tsx`, `.../Lightbox.tsx`
  - `lib/types.ts`, `lib/api.ts`
- **Backend:** `Vyavasth/backend/src/`
  - `controllers/deliverables.controller.js`, `routes/deliverables.routes.js`, `models/deliverables.model.js`, `validators/deliverables.validator.js`

Read those files first. Do not restructure anything outside this feature. Preserve the existing client-side locate/download architecture (File System Access on Chromium; `client-zip` fallback elsewhere) — none of the file-scanning/matching logic changes.

---

## Background you must know before coding

- A Smart Selects photo has two studio flags on the `Media` doc: `shortlisted` and `identified` (located). `identified` is currently cumulative (false→true only).
- **Awaiting original** = `shortlisted: true` AND `identified: false`. This is derivable; no storage needed.
- Locate + matching + download all run client-side; the server only learns results via `update-media-identified`. Matching is unchanged by this work (see Non-goals).

---

## Scope overview

1. Restructure the Smart Selects header into three stacked sections: **title bar**, **progress strip**, **filter bar**.
2. Progress strip shows **Liked → Shortlisted → Located** only. **Drop "Exported"** entirely — do not add download tracking.
3. Filter bar: quick pills (**All liked / Host picks / Shortlisted / Awaiting original**) plus **Liked by**, **Team**, and **Sort** controls.
4. Declutter the photo tile to **two persistent signals** (like + status), fold "located" into the status star, keep select/download as hover-only.
5. Fill the heart when a **host** liked the photo (`host_liked`).
6. **Revert `identified` when a photo is un-shortlisted**, behind a confirmation modal that surfaces how many located photos will be affected.
7. Use info-tips for long explanatory copy in the Locate modal.

---

## Backend changes

### B1. Clear `identified` on un-shortlist (`updateMediaShortlist`)

In `POST /update-media-shortlist`, when `shortlisted` is `false`, also reset `identified`:

```js
const update = Boolean(shortlisted)
  ? { $set: { shortlisted: true } }
  : { $set: { shortlisted: false, identified: false } };
const result = await Media.updateMany({ _id: { $in: ids } }, update);
```

No new endpoint, no new collection. Physical files/manifest on disk are intentionally untouched.

### B2. `host_liked` on `get-media` (dashboard only)

In the Smart Selects `get-media` aggregation, return a per-photo boolean `host_liked` = "at least one host liked this photo". It **must be independent of the active who-filter** (the heart reflects reality even when "Liked by: Guests" is selected).

- Before the pipeline, fetch host guest ids once: `Guests.find({ booking_id, guest_type: "host" }).distinct("_id")`.
- Add a dedicated `$lookup` (`host_likes`) that joins `likes` by `media_id` where `guest_id ∈ hostIds` (all likes, not the filtered subset), then project `host_liked: { $gt: [ { $size: "$host_likes" }, 0 ] }`.
- Only compute this on the dashboard (`isDashboard`) path; skip it for guest-facing loads.

### B3. Awaiting-original filter on `get-media`

Add a query param `awaiting_original=true` that adds to the base `$match`: `shortlisted: true` and `identified: { $ne: true }`. It rides the same base match as `shortlisted_only` so `total` stays correct.

---

## Frontend changes

### F1. Header restructure — `SmartSelectsTab.tsx`

Replace the current single header block with three stacked sections:

**1. Title bar (horizontal):**
- Left: star icon + "Smart Selects" heading + one-line subheading.
- Right: **Locate Originals** button with a count **pill = awaiting-original count** (shortlisted − located), disabled when awaiting count is 0.

**2. Progress strip:** three connected stats — **Liked**, **Shortlisted**, **Located** — with counts and a subtle progress visualization (mirror the mock's stat-card row with connectors). No "Exported". Treat it as live (counts move as likes arrive / photos are shortlisted).

**3. Filter bar:** see F3.

Keep the existing empty states (no likes at all vs. filter matched nothing).

### F2. Photo tile redesign — `MediaGrid.tsx`

Reduce to **exactly two persistent signals**; everything else is hover/select-mode only.

- **Bottom-left (persistent): like indicator** — heart + count. Heart is **outline** when liked only by guests; **filled (brand color)** when `host_liked` is true. Show only when `likes_count > 0`.
- **Top-right (persistent): status star** — single element, color-encodes state:
  - Not shortlisted → no persistent star; an **outline star appears on hover** to shortlist.
  - Shortlisted, not located → **amber filled star**.
  - Shortlisted **and** located → **green filled star**.
  - Provide `title`/`aria-label` for each state ("Shortlisted", "Shortlisted · original located").
- **Remove the separate "located" indicator concept** (no red dot). Located is now the green star.
- **Hover-only, unchanged:** select checkbox (top-left; persistent only when selected / in select mode) and per-photo download (bottom-right).

Apply the same status-star logic in `Lightbox.tsx`.

### F3. Filters — `LikedFilters.tsx` + `EventContext.tsx`

Re-present existing capability in the mock's layout; most of this already exists.

- **Quick pills (left):** `All liked`, `Host picks`, `Shortlisted`, `Awaiting original`. Map to existing/new filter state:
  - All liked → clear scope.
  - Host picks → `audience: "host"`.
  - Shortlisted → `shortlistedOnly: true`.
  - Awaiting original → `shortlistedOnly: true` + new `awaitingOnly: true` (drives `awaiting_original=true`).
  - Show a count on each pill where cheap (shortlisted, awaiting).
- **Right-side controls:** `Liked by` (Everyone/Host/Guests + specific guests — existing), `Team` dropdown (existing `guest_sub_type`, event-named via `guest_types`; hide when the event has no teams), `Sort` (`Most liked` via existing `sort=likes`, plus `Newest`).
- Keep AND-combine semantics and the "Clear" affordance. Ensure pills and the `Liked by`/refinement state stay in sync (a pill just sets the underlying filter fields).

Add `awaitingOnly: boolean` to `LikedFilters` type + `EMPTY_LIKED_FILTERS` + `hasActiveLikedFilters`, and thread it into the `get-media` request in `EventWorkspace`.

### F4. Un-shortlist confirmation — `MediaGrid.tsx` (+ context)

When un-shortlisting via the star, the selection-bar "Remove from shortlist", or the lightbox, if **any** target is currently `identified`, show a confirmation modal first:

- Copy: "Remove N photo(s) from the shortlist? M of them already have their original located — locating will need to be redone for those." Show M (the located count) computed client-side from the items' `identified` flags. No confirm needed when M = 0.
- On confirm, call the existing shortlist toggle (now clearing `identified` server-side per B1). Optimistically flip both `shortlisted` and `identified` to false locally.
- Works identically for single and multi-select.

### F5. Locate modal info-tips — `LocateOriginals.tsx`

- Move long explanatory paragraphs in the modal (e.g. the "probable match = same name & size, different modified date" note, the per-folder routing note) into **info-tips** next to their section headings. Keep actionable text and the "X of Y ready" footer inline.
- If no reusable tooltip/info-tip component exists, add a small accessible one (hover + focus, `IconInfo` trigger).

### F6. Types + API — `lib/types.ts`, `lib/api.ts`

- `MediaItem`: add `host_liked?: boolean`.
- `LikedFilters`: add `awaitingOnly`.
- Extend the `get-media` request params with `awaiting_original`.

---

## Edge cases to handle (from the scenario review)

- **Orphan resolved:** un-shortlisting a located photo now clears `identified` (B1 + F4). Re-shortlisting later re-locates cleanly (manifest dedup skips the physical copy but the flag re-sets).
- **Shortlisted photo loses all likes:** it can drop out of the liked view while still `shortlisted`. Ensure the Shortlisted/Awaiting pills still surface it (they filter on `shortlisted`, not on likes) and counts stay consistent.
- **Awaiting count = 0:** Locate button disabled; pill hidden or shows 0.
- **Locate ran but `update-media-identified` failed:** keep the existing warn-and-refresh toast.
- **Counts consistency:** the Locate button's awaiting pill and the Awaiting-original filter pill must show the same number; the progress strip's Located ≤ Shortlisted ≤ Liked at all times.
- **Optimistic (unpersisted) items:** remain non-selectable / non-shortlistable.

---

## Non-goals (explicitly out of scope)

- **No "Exported"/download tracking** anywhere.
- **Do not modify the locate matching/scanning logic** or the RAW-vs-original semantics; keep the "RAW"/"originals" wording as-is. (Guardrail only — no work here.)
- **No new collections.**
- Locate-run history / "last located" timestamp and cross-device sharing of located files are out of scope for now.

---

## Acceptance criteria

- [ ] Un-shortlisting a located photo clears `identified` (verified in DB) and prompts a confirmation showing the located count; single and multi-select both work.
- [ ] Hearts render filled only when a host liked the photo, correct even under a "Guests"/team filter.
- [ ] Tile shows at most two persistent marks (like + status star); no red dot; select/download appear on hover only; located = green star.
- [ ] Progress strip shows Liked/Shortlisted/Located with live counts and no Exported.
- [ ] Pills (All liked / Host picks / Shortlisted / Awaiting original) filter correctly and stay in sync with the Liked-by/Team/Sort controls; awaiting pill = Locate button pill.
- [ ] Locate modal long-copy is behind info-tips; actionable copy stays inline.
- [ ] No regressions to the client-side locate/download flow (FSA + zip fallback), infinite scroll, or lightbox.
