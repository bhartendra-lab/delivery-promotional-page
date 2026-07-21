# Gallery Preview UX — Plan

Scope: the four surfaces audited earlier — Studio Dashboard Media tab, Studio Dashboard Smart Selects tab, and the delivered guest gallery's grid + full-screen viewer.

## 1. First principles

These are two different products wearing the same component names, and they should be judged against different standards.

**Studio Dashboard (Media / Smart Selects tabs)** is a *production tool*. The job-to-be-done is: cull, organize, and curate hundreds to thousands of images per event as fast as possible, with zero risk of an accidental destructive action. The right reference class isn't consumer photo apps — it's culling software (Lightroom, Photo Mechanic, Aftershoot): keyboard-first, bulk-first, undo-safe.

**Delivered Gallery (guest-facing)** is a *brand and conversion surface*. It's the one artifact from the whole booking that a bride's extended family, out-of-town guests, and the couple themselves will open repeatedly, screenshot, and share — it's doing marketing for the studio whether or not that's the intent. The right reference class is Pixieset / Pic-Time / CloudSpot, because that's literally what studios compare Vyavasth's Delivery Hub against when deciding whether to switch.

Judging both surfaces by the same bar is a mistake in either direction: adding consumer flourish (slideshow, big transitions) to the studio dashboard would slow down culling; holding the guest gallery to a "just get the data on screen" bar undersells what the studio is paying for.

## 2. Current state — what's already strong

Verified by reading the actual components (`MediaGrid.tsx`, `Lightbox.tsx`, `SmartSelectsTab.tsx`, `GalleryGrid.tsx`, `PhotoViewer.tsx`, `LoungeGallery.tsx`):

- **Face-matched "My Photos"** on the guest side is the single feature Pic-Time markets hardest as its AI differentiator — Vyavasth already has it (via the AWS Batch + Qdrant face-embedding pipeline), and it's wired into the gallery viewer, not just a separate page.
- **In-browser ZIP downloads** (client-zip, streamed to disk via the File System Access API) on both dashboard and guest sides avoid the server-side zip cost/latency most competitors pay, and sidestep a whole class of "download failed, gallery too large" support tickets.
- **Smart Selects** (guest-liked → studio shortlist → Locate Originals) is a genuinely differentiated workflow bridge between guest engagement and the studio's actual editing pipeline — none of the four competitors researched tie guest likes directly into an originals-location tool.
- Pinch/scroll zoom + drag-pan is implemented on both the studio Lightbox and the guest PhotoViewer, including double-tap-to-zoom — this matches baseline expectations.

## 3. Gaps vs. 2026 industry baseline

Two sources fed this: reading the actual code (so these are verified, not assumed), and current market research on client-gallery UX standards (Pixieset/Pic-Time/ShootProof/CloudSpot comparisons, mobile-gallery UX writeups — see Sources).

### 3a. Video items render broken — confirmed in code, not a UX opinion

`MediaItem` and `GuestMediaItem` both carry `type: "image" | "video"`, and the Media model on the backend stores a single `url` per item with **no poster/thumbnail field**. But every rendering path — `GridImage` in the studio grid, `PhotoTile` in the guest grid, `Lightbox.tsx`, and `PhotoViewer.tsx` — unconditionally does `<img src={item.url}>`. The *only* place `type` is even checked is one `m.type === "image"` guard in `MediaGrid.tsx`, and that's just to hide the "Set as cover photo" option for videos.

Concretely: the moment a studio uploads a video (increasingly common for wedding cinemagraphs/highlight clips), it shows as a broken-image icon in both the studio grid and the guest gallery, and clicking it in the lightbox/viewer shows nothing playable. This isn't a missing nicety, it's a correctness bug already live in production wherever a studio has uploaded video media.

### 3b. No swipe-to-navigate on mobile

Search results across three separate 2026 client-gallery comparisons converge on the same point: swipe-to-navigate, pinch-to-zoom, tap-for-fullscreen is now the *expected* baseline gesture set, not a differentiator — and mobile is 73%+ of gallery views, with smooth mobile experiences reportedly getting shared 4x more. `PhotoViewer.tsx` has pinch-zoom and drag-to-pan-when-zoomed, but navigating between photos is button-tap or keyboard-arrow only — there's no horizontal swipe gesture to go next/prev when the image isn't zoomed. For a majority-mobile audience, that's the single most-used gesture missing.

### 3c. No slideshow / autoplay mode

CloudSpot markets slideshow as a named feature. It's a lower-stakes gap than 3a/3b — nice for the "family reunion, phone passed around the table" use case, not core to daily usage.

### 3d. Studio dashboard has no keyboard-driven culling

Once inside the Lightbox, arrow keys navigate and +/- zoom — but there's no keyboard shortcut to shortlist, delete, or advance-and-shortlist in one keystroke while culling. Every professional culling tool treats single-key rating as the primary interaction; right now every shortlist/delete action requires a mouse click on a small icon. For a studio working through a 2,000-photo Smart Selects queue, this is a real time cost, not a polish item.

## 4. Goal

Close the gap between what the guest gallery *is* (a genuinely differentiated product on face-match + Smart Selects) and what it currently *looks like it can't do* (play a video, swipe on a phone) — without over-building speculative features the studios haven't asked for.

Stated plainly: **don't let a correctness bug and a table-stakes mobile gesture undercut a product that's already ahead on its actual differentiators.**

## 5. Why now

- The video bug is not cosmetic — it's already live wherever a studio has uploaded a video, and every day it goes unfixed is a day a couple opens their gallery to a broken tile in front of family. This has no "later" — it should be treated as a bug-fix priority independent of any broader roadmap discussion.
- This session's other work (Online Presence address/reviews linking, social links) has been about tightening the guest-facing brand surface. Swipe navigation is the same category of investment — it's the difference competitors' galleries are explicitly winning on right now, and it's cheap relative to its impact given the pointer-gesture plumbing (`ZoomImage`) already exists in `PhotoViewer.tsx`; it's an extension of code that's already there, not new infrastructure.
- Everything else in section 3 (slideshow, dashboard hotkeys) is real but not urgent — sequencing them after the two items above avoids spreading effort across four initiatives when two of them are materially higher-stakes.

## 6. Proposed sequencing

**Now — fix, not feature:**
1. Video handling across all four surfaces. Scope note: a real fix needs either a `<video>` element with a poster frame, or a generated thumbnail. Since the Media model has no poster/thumbnail field today, the cheapest correct fix is a `<video preload="metadata">` element (browsers auto-show the first frame) in place of `<img>` wherever `item.type === "video"`, with real `<video controls>` in the Lightbox/PhotoViewer — no backend/model change required for a first pass. A server-generated poster thumbnail (cheaper to render at scale in a masonry grid full of videos) is a legitimate follow-up but is a backend pipeline change, not a frontend fix — don't bundle it into this pass.
2. Swipe-to-navigate in `PhotoViewer.tsx`, guest side only (this is the majority-mobile surface; the studio Lightbox is a desktop tool by its own nature — culling thousands of photos on a phone isn't a realistic workflow, so this gap matters far less there).

**Next:**
3. Keyboard shortlist/delete in the studio Lightbox (culling speed).
4. Slideshow/autoplay in the guest viewer.

**Not now (explicitly deferred, not rejected):**
- EXIF/metadata panel, "download original quality" messaging, server-generated video posters — real ideas, but none are validated by a studio ask yet, and building them now would be speculative investment ahead of demand. Revisit if studios request them.

## 7. Risks

- **Shared-component blast radius.** `MediaGrid`/`Lightbox` back both the Media tab and Smart Selects tab; `GalleryGrid`/`PhotoViewer` back Home, Gallery, and Liked views in the guest lounge. A change made for one caller (e.g. video handling) must be manually verified against every caller — there's no automated test suite in this repo (confirmed in the project's own CLAUDE.md), so every regression risk here is caught by hand-testing or not at all.
- **Gesture conflict.** Adding swipe-to-navigate to `PhotoViewer.tsx` means teaching the existing pointer-handling in `ZoomImage` to disambiguate "swipe to change photo" from "drag to pan a zoomed photo" from "pinch to zoom." Getting this wrong either breaks pan/zoom (regression on a feature that already works) or makes swipe feel laggy/wrong (the exact "awkward navigation" the research flags as the thing that turns a good delivery into a bad one). This needs real device testing, not just desktop browser dev tools.
- **Video-in-grid performance.** A `<video preload="metadata">` tile is heavier than an `<img>` tile — more decode cost, more network setup per item. In a masonry grid that can hold hundreds of items with lazy-loading, doing this carelessly (e.g. not gating `preload` until the tile is near-viewport) risks breaking the "loads in under 2 seconds" bar that's now table stakes, i.e. fixing one gap by accidentally causing another.
- **Scope creep into a "gallery redesign."** The temptation once inside this code is to also add EXIF panels, slideshows, and rating hotkeys in the same pass. Recommend resisting that — ship the video fix and swipe nav as two small, independently verifiable changes rather than one large one, given the no-test-suite constraint above makes large diffs disproportionately risky to review.
- **Poster-thumbnail follow-up is a bigger ask than it looks.** If item 1's `<video preload="metadata">` approach proves too heavy in practice, the real fix (server-generated poster images) touches the backend Media model and likely the upload/processing pipeline — that's a scoped backend project, not a quick extension, and should be raised as its own decision rather than assumed.

## Sources

- [Best Photography Client Gallery Software (2026 Guide)](https://unscriptedphotographers.com/blog/photography-client-gallery-software)
- [Pixieset vs ShootProof vs Pic-Time: Which Wins in 2026?](https://findme.photo/blog/pixieset-vs-shootproof-vs-pic-time)
- [ShootProof vs Pic-Time: Compare Pricing & Features in 2026](https://picflow.com/compare/shootproof-vs-pic-time)
- [Mobile Optimization That Actually Matters in 2025](https://sendphoto.io/features/mobile-optimization)
- [10 Best Photo Gallery Software for Photographers in 2026](https://sendphoto.io/blog/best-photo-gallery-software)
