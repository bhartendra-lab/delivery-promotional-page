# Gallery Toolbar Revamp — Handoff

Session ran out of budget mid-way through an 8-item request covering the guest gallery toolbar, theming, and the dashboard's Gallery Design preview. This doc is the continuation brief. Read this fully before touching code — it records real design decisions made under user Q&A, not just a TODO list.

Repo layout reminder: guest-facing lounge lives at `frontend/app/(client)/event/...` → `frontend/components/event/screens/LoungeGallery.tsx`; studio dashboard lives at `frontend/app/(dashboard)/dashboard/...`. Both are in *this* repo (confirmed by reading the code — don't trust any note elsewhere claiming the dashboard is a separate repo). Per this repo's `CLAUDE.md`: read `graphify-out/GRAPH_REPORT.md` (or `frontend/graphify-out/GRAPH_REPORT.md`, the real one) before architecture questions, and run `graphify update .` after code changes — not yet run this session; run it once everything below is finished.

There is no test suite in this repo. Verification = `npx tsc --noEmit` (or whatever's in `frontend/package.json` scripts) plus careful manual re-reading of diffs.

## Original request (8 items)

1. "All" pill has no count on desktop, has one on mobile — fix the inconsistency.
2. Fix themes: text washes out on light backgrounds — use stronger contrast. Also explore better/more themes for studios.
3. Sync the dashboard's "Gallery Design" tab preview mockup with the real, now-settled gallery design.
4. No change to gutter gaps, but add padding between the sticky bar and the photo grid, and adjust target row height.
5. Folder pills: squarish (Google Photos style) not circular. Reorganize toolbar: My/All switcher left; Liked, Download, Select, Private on the right as icon+title (mobile: icons only), with an underline (not a pill) marking the selected state for Liked/Select.
6. Sticky toolbar (and mobile bottom bar) should auto-hide on scroll-down, reappear on scroll-up, smoothly.
7. On photo hover: heart + download icons together at bottom-right; select circle stays top-left. Mobile selects only via the toolbar's Select toggle.
8. New "Highlights" folders should be visible to all guests without the passcode. In My Photos, folder visibility doesn't matter. In All Photos, only Highlights folders show pre-passcode. The lock icon moves out of the switcher into the new "Private" control from #5.

### Clarifying answers already collected (don't re-ask)

- Theme scope: user chose "fix contrast, add new / replace the existing variants" — not just a contrast patch.
- Spacing: user explicitly chose **"Gap only, no row-height change"** — the row-height targets in `justifyRows.ts` (`120/150/200/240`) must stay untouched. Only the gap between sticky bar and grid should grow.

## Done this session (items 1, 2, 3, 5, 8)

**1 — Desktop All-pill count.** `components/event/screens/gallery/StickyControlRow.tsx` and `GalleryControls.tsx` (`FolderPillsRow`) gained an `allCount` prop; `LoungeGallery.tsx` now passes `allCount={allCount ?? undefined}` into desktop's `StickyControlRow`, the same state mobile already used. Trivial, verify by eyeballing the desktop All pill.

**2 — Theme contrast + catalog.** `lib/client-theme.ts`: replaced the old fixed-ratio blend (`mix(text, bg, 0.38)` for muted, `0.55` for faint) with `contrastRatio()` (WCAG luminance-ratio formula) + `tintTowardBg()` (binary search for the lightest blend that still clears a target contrast). Targets: muted ≥ 4.5:1 (WCAG AA normal text), faint ≥ 3:1 (AA large-text/UI floor). I verified with a throwaway Python script that **every one of the original 8 variants' "muted" measured 3.8–4.4:1 (below 4.5) and every "faint" measured 2.5–2.7:1 (below even 3:1)** — the washout complaint was objectively real, not taste. New computation guarantees the floor for any variant, present or future.

Also retuned `Marigold Bright`'s accent hex (`#DC842A → #B5651D`) — its accent-against-background contrast was 2.76:1, the only one of the 8 failing even the relaxed 3:1 bar. Kept the variant *name* unchanged so no studio's already-saved `style_variant` breaks. Added two new variants — `Sage Sanctuary` (muted sage green, filed under Spring) and `Indigo Dusk` (moody indigo, filed under Winter) — both hand-picked and contrast-verified (~4.4–6.8:1 accent contrast). Updated `lib/types.ts`'s `StyleVariant` union/`STYLE_VARIANTS` array (10 variants now) and `GalleryDesignTab.tsx`'s `SEASON_VARIANTS` buckets to include them.

**Flag for the user:** the two new palettes' exact hex values are my proposal, not a studio/designer sign-off — worth a visual eyeball before calling this fully done.

**3 — Gallery Design tab preview sync.** `app/(dashboard)/dashboard/events/[booking_id]/GalleryDesignTab.tsx`: deleted the old `VARIANT_THEME` dict, which was a **hand-copied duplicate** of `client-theme.ts`'s palette (confirmed drift-risk during recon — it's exactly the kind of "is the code coherent here?" issue the user flagged). Now calls `resolveTheme(variant)` from `@/lib/client-theme` directly, so the preview can't drift from the real gallery again.

Rebuilt the gallery-scope mockup as a new `GalleryScopePreview` sub-component that **imports and renders the real toolbar chrome** — `UnlockAwareSwitcher`, `FolderPillsRow`, `ActionsCluster` from `@/components/event/screens/gallery/GalleryControls` — fed with local mock state (fake folders/counts, a `previewUnlocked` toggle that demonstrates the real Private→Download reveal behavior). Deliberately did **NOT** wire in the real `GalleryGrid`/`PhotoTile` — those expect live images and real selection/like state; embedding them in a static preview risked exactly the "shared-component blast radius" problem flagged in this repo's own `gallery-preview-ux-plan.md`. Tiles stayed as lightweight decorative gradient placeholders, restyled to hint at the new hover affordances (small always-on select/heart/download dots, since a static mockup has no real hover state).

**5 — Folder pills + toolbar redesign.** All in `components/event/screens/gallery/GalleryControls.tsx` (the shared file both mobile and desktop import from):
- `FolderPillsRow`: `rounded-full` → `rounded-md` (squarish). Dropped the trailing "Liked" pill (moved to the new action cluster). Render guard simplified to `folders.length === 0 → null`.
- `UnlockAwareSwitcher`: dropped `unlocked`/`onUnlock` entirely — both segments are now always plain tappable tabs. (This is what makes #8 possible — see below.)
- Replaced `SelectDownloadCluster` with a new exported `ActionsCluster`: Liked, Download, Select, Private, built on a new local `ActionItem` helper (icon + optional label, underline-active for Liked/Select per spec) and a new `SelectIcon` svg. Download hides during select mode or when `!canDownloadAll`. Private hides once `unlocked` (nothing left to unlock, no re-lock flow — a judgment call, not explicitly spec'd). `iconOnly` prop drops labels for mobile.
- `StickyControlRow.tsx` (desktop): now two stacked rows — switcher+actions, then folder pills. Prop `onUnlock` renamed `onOpenPrivate`.
- `LoungeGallery.tsx`: both call sites (desktop `StickyControlRow`, and the internal `MobileGalleryView`'s control row) updated to the new APIs. Mobile's `ActionsCluster` also got a real `onSelectLiked` wired in (mobile previously had no way to filter to Liked except the bottom-nav tab) — mirrors desktop's `desktopSelectLiked`.

**Flag for the user:** mobile's action cluster now shows a "Liked" icon even though `BottomNav` already has a separate Liked tab — slightly redundant, but matches the literal spec (all 4 actions live in one cluster on both platforms). Worth confirming this doesn't feel cluttered in practice.

**8 — Highlights/Private wiring.** **No backend changes were made or needed** — I read `Vyavasth/backend/src/controllers/deliverables.controller.js` (lines ~775–830 and ~1025–1105) and confirmed the "Highlights (B2)" feature is *already fully shipped server-side*: a non-host guest's plain "all" request (no `mine` flag) is auto-scoped to `visibility: "public"` folders (`restrictToPublicFolders`), and both `customFolders`/`folderCounts` in the response are correctly pre-scoped to match. The only gap was frontend.

`LoungeGallery.tsx`: `effTab` used to be `unlocked ? tab : "mine"`, which meant a locked guest could never actually issue an "all" request — the switcher didn't even let them try. Changed to `const effTab: "mine" | "all" = tab;` — always respect the tab the guest picked. This is safe because the backend's real host/guest check comes from the authenticated session, not from anything the client sends — verified by reading the controller, not assumed. **Before calling this done, worth a real API sanity check** (e.g. hit `get-media` as a locked/non-host guest session with `mine=false` and confirm it returns only public-folder-scoped media, never the full gallery).

The lock icon that used to live inside the switcher's "All Photos" segment now lives in the new "Private" action (see #5). Added a better empty-state message in `LoungeGallery.tsx`'s `EmptyState` for "locked guest, All Photos, no Highlights yet": *"No highlighted photos yet. Ask the couple for the family passcode to see everything."* (new `unlocked` prop added to `EmptyState`, used at both call sites).

## Not started — what's left (items 4, 6, 7, 9)

**4 — Sticky-bar-to-grid gap (no gutter/row-height change).** Two spots, both in `LoungeGallery.tsx`:
- Desktop: the grid section wrapper `<div ref={gridSectionRef} className="mx-auto w-full max-w-[1440px] px-8 pb-16 pt-6" ...>` — bump `pt-6` (24px) up, e.g. to `pt-10` (40px). Leave `px-8` and everything in `justifyRows.ts` (`JUSTIFY_GAP = 8`, `targetRowHeightFor()`) untouched per the user's explicit answer.
- Mobile (inside `MobileGalleryView`): the scrollable grid container `<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-[130px] pt-3" ...>` — bump `pt-3` (12px) up, e.g. to `pt-6` (24px).
- Note: `StickyControlRow` is now two rows tall (from item 5's rework) instead of one — its height is measured live via `ResizeObserver` into `controlRowH` and fed to `scrollMarginTop`, so that part self-adjusts; just double check the `scrollIntoView` landing spot still looks right after the gap change.
- Exact pixel amounts above are a suggestion, not a hard requirement — it's a one-line Tailwind class value either way.

**6 — Auto-hide sticky bar + bottom nav on scroll.** Nothing like this exists yet anywhere in the guest gallery (confirmed by grep during recon) — build from scratch. Needs:
- A scroll-direction tracker (ref-based `lastScrollTop`, compare on each scroll event, small threshold so jitter doesn't flicker it) hooked into the *existing* scroll handlers: `onDesktopScroll` in `LoungeGallery.tsx` (currently only drives infinite-scroll pagination) and the mobile `onScroll` inside `MobileGalleryView` (same dual purpose).
- Build the hide/show logic **once** and apply it to both `StickyControlRow` (desktop) and `BottomNav` (mobile) rather than writing it twice — consistent with how this session kept `GalleryControls.tsx` as the single shared home for toolbar pieces used by both surfaces.
- Animate via `transform: translateY(...)` + a CSS transition (250–300ms), not conditional unmount/`display:none` — the user asked for this to be smooth. `StickyControlRow` is `position: sticky`; transforming a sticky element works fine.
- Force it visible again near the very top of the scroll (small threshold) so it isn't hidden right after load, and whenever a filter changes (tab/folder/liked) since those already call a scroll-to-top helper — don't leave the chrome hidden right after an explicit filter change.

**7 — Per-photo hover download icon.** File: `components/event/screens/gallery/GalleryGrid.tsx`, the `PhotoTile` component. Today: select circle top-left (leave as-is), heart+like-count bottom-**left** alone. Spec wants heart **and** a new download icon together at bottom-**right** — so the heart needs to move sides, paired with a new download button, same hover-reveal behavior (`revealCls`, always-visible on mobile) as today.
- Needs a new `onDownload` callback prop threaded from `LoungeGallery.tsx` → `GalleryGrid` → `PhotoTile` (doesn't exist yet), wired at both call sites (desktop's inline `<GalleryGrid>` and mobile's inside `MobileGalleryView`) to something like the existing single-photo path already used in `downloadSelected()`: `downloadMany([item.url])` (from `lib/media-actions.ts`, already imported in `LoungeGallery.tsx`), plus the same toast/`triggerNudge("download")` pattern that function already uses.
- Reuse existing icon path data rather than inventing a new shape — there's already a download-arrow SVG in `GalleryControls.tsx`'s local `DownloadIcon` and in the dashboard's `icons.tsx` `IconDownload`; copy that same `<path>` for visual consistency instead of drawing a new one.

**9 — Verify + graphify update.** Once 4/6/7 land: run `npx tsc --noEmit` (check `frontend/package.json` for the exact script name) from `frontend/`, and manually re-read the files touched this session end-to-end:
`lib/client-theme.ts`, `lib/types.ts`, `components/event/screens/gallery/GalleryControls.tsx`, `components/event/screens/gallery/StickyControlRow.tsx`, `components/event/screens/LoungeGallery.tsx`, `app/(dashboard)/dashboard/events/[booking_id]/GalleryDesignTab.tsx` — plus whatever items 4/6/7 touch (`justifyRows.ts` untouched by design, `GalleryGrid.tsx`).
Then run `graphify update .` from the repo root per this repo's `CLAUDE.md` (AST-only, no API cost) — not run yet this session since nothing was finished.

## Reuse conventions to keep following

This session deliberately kept `components/event/screens/gallery/GalleryControls.tsx` as the *single* shared home for toolbar pieces (`UnlockAwareSwitcher`, `FolderPillsRow`, `ActionsCluster`) consumed by three different call sites — desktop `StickyControlRow`, mobile's `MobileGalleryView`, and now the dashboard's `GalleryScopePreview` — rather than forking copies per surface. Same instinct for the remaining items: build the item-6 scroll-hide behavior once and apply it in two places, not twice; reuse the existing download icon/utility for item 7 rather than inventing new ones. Avoid re-introducing the kind of hand-duplicated dict that item 3 just removed.
