# Icon & Component Migration — Handoff for Claude Code

**Repo:** `delivery-promotional-page` · **Frontend root:** `frontend/` · **Stack:** Next 16, React 19, Tailwind v4 (CSS-first, no `tailwind.config`; tokens live in `app/globals.css`), deployed on Cloudflare (opennextjs).

**Reference:** `Vyavasth Design System.md` (repo root) — §9 Components & Component Library, §10 Iconography, §3 The Wedding Guest Side. Read those three sections before starting.

**Goal:** Replace hand-drawn/inline SVG icons with a real icon library behind our existing `Icon*` wrapper API, then (Phase B) move re-implemented UI onto one shared themed component substrate. Each milestone ends in a state the user can *see* in their own browser.

---

## Ground rules (read first — non-negotiable)

1. **Do NOT run the dev server.** Never run `npm run dev` / `next dev` / `preview`. The user runs and watches the dev server themselves.
2. **Do NOT install packages yourself.** When a milestone needs a dependency, **stop and print the exact terminal command** for the user to run, then wait for confirmation before continuing. All installs are listed per-phase below.
3. **Self-verify without the browser** using: `npx tsc --noEmit` and `npm run lint` (run from `frontend/`). Do not rely on `next build` for routine checks (slow on the CF adapter) — use it only if a milestone specifically needs it.
4. **Preserve the `Icon*` wrapper API.** Keep every existing icon name (`IconTrash`, `IconX`, `IconStar`, `IconWhatsApp`, …) and its props (`size`, `className`, `style`). Add an optional `weight` prop; keep the existing `filled` boolean working. **No call-site renames** — `<IconTrash size={15} />` must keep working everywhere.
5. **Keep `stroke="currentColor"` / color-inheritance.** Icons must keep inheriting text color so existing Tailwind `text-*` classes still tint them (design system §10 color rule).
6. **One milestone per branch + commit. STOP at each milestone boundary** and hand back to the user for visual review before starting the next. Do not chain milestones.
7. **Match Phosphor weights to the design system:** `regular` default, `fill` for active/primary states (this is what the current `filled` boolean maps to). Guest side may use `bold` / `duotone` (§3, §10).
8. Work area-by-area within a milestone; keep each diff reviewable. Add any missing glyph to the shared barrel, never re-inline an SVG.

---

## Current state (already surveyed — don't re-discover)

- Existing barrel: `app/(dashboard)/dashboard/events/[booking_id]/icons.tsx` — 35 hand-drawn `Icon*` fns, props `{ size, className, style }`, comment says "Phosphor-style 1.5 stroke, hand-drawn to avoid a dependency."
- **16 files import that barrel** (the event workspace + `QrCard`).
- **~150 one-off inline icons** across ~48 files still define their own `function XIcon()` / inline `<svg>`.
- `filled` prop is used in ~12 files (toggle/active states) — these must map to Phosphor `weight="fill"`.
- Brand marks (WhatsApp / Instagram / Google) appear in ~15 files — these have **no** Phosphor/lucide equivalent; use `react-icons` (simple-icons set).
- No icon library currently installed (`package.json` has none).

---

# PHASE A — Icons

### 🔧 Install (USER runs this in terminal before Milestone A1)

```bash
cd frontend
npm install @phosphor-icons/react lucide-react react-icons
```

> Install the latest versions (they support React 19). **If npm prints peer-dependency warnings about React 19, stop and tell me** — do not force with `--legacy-peer-deps` without checking.

---

### Milestone A1 — Swap the shared barrel to Phosphor (instant win)

**Goal:** Rewrite the barrel to wrap `@phosphor-icons/react` instead of hand-drawn SVGs, keeping all names/props. The 16 importing files change appearance with zero call-site edits.

**Steps:**
- Create a canonical shared barrel at `components/ui/icons.tsx`. Export every `Icon*` name currently in the old barrel, each wrapping the matching Phosphor glyph. Signature: `{ size = <existing default>, weight, className, style, filled }`. Map `filled === true` → `weight="fill"`; otherwise `weight ?? "regular"`. Pass `size` and `className`/`style` through.
- For brand marks (`IconWhatsApp`, and any Google/Instagram used by the barrel): wrap `react-icons` (e.g. `SiWhatsapp` from `react-icons/si`). Keep the same `Icon*` name.
- Replace the old `app/(dashboard)/dashboard/events/[booking_id]/icons.tsx` body with a re-export from `components/ui/icons.tsx` (so the 16 files need no import change yet).
- If a glyph has no Phosphor match, use lucide (`lucide-react`) and leave a `// lucide fallback: <reason>` comment.

**Self-check:** `npx tsc --noEmit` && `npm run lint`.

**👁 Visual checkpoint (user):** Event workspace — open an event → Media tab, Folders sidebar, Cover banner, tab strip, and the reusable-QR card. Icons should read as real Phosphor (slightly different stroke/corners), colors unchanged, nothing missing.

**Commit:** `feat(icons): wrap Phosphor behind shared Icon barrel (A1)`

---

### Milestone A2 — Dashboard chrome one-offs

**Goal:** Delete local icon defs in the dashboard shell; import from the barrel.

**Files:** `components/dashboard/Sidebar.tsx`, `Topbar.tsx`, `AccountMenu.tsx`, `EventCard.tsx`, `FoldersSidebar.tsx`, plus icons inline in `app/(dashboard)/dashboard/page.tsx` and `app/(dashboard)/dashboard/events/page.tsx`.

**Steps:** For each, delete the local `function XIcon()` / inline `<svg>`, import the equivalent from `components/ui/icons.tsx`, adding the glyph to the barrel if absent. Preserve `filled`/active states via `weight="fill"`.

**Self-check:** `tsc --noEmit` && `lint`.

**👁 Visual checkpoint:** Dashboard home, left sidebar, top bar + account menu, event cards list, folders sidebar.

**Commit:** `refactor(icons): dashboard chrome onto shared barrel (A2)`

---

### Milestone A3 — Event media & upload

**Files:** `app/(dashboard)/dashboard/events/[booking_id]/`: `MediaTab.tsx`, `MediaGrid.tsx`, `UploadModal.tsx`, `UploadProgress.tsx`, `Lightbox.tsx`, `LocateOriginals.tsx`, `LikedFilters.tsx`, `SmartSelectsTab.tsx`, `GalleryDesignTab.tsx`, `CoverBanner.tsx`, `AccessSharingTab.tsx`; plus `components/dashboard/ActiveUploadsIndicator.tsx`.

**Note:** several of these already import the barrel but still keep local defs and `filled` toggles — consolidate both.

**👁 Visual checkpoint:** Event → Media tab (grid + like/star toggles), Upload modal + progress, Lightbox, Gallery Design tab, Access & Sharing tab.

**Commit:** `refactor(icons): media & upload onto shared barrel (A3)`

---

### Milestone A4 — Settings & auth

**Files:** `app/(dashboard)/dashboard/settings/SettingsUI.tsx`, `settings/watermarks/*`, `settings/social-links/page.tsx`, `app/(dashboard)/login/page.tsx`, `app/(dashboard)/reset-password/page.tsx`.

**👁 Visual checkpoint:** Settings, Watermark editor modal, Social links, Login, Reset-password.

**Commit:** `refactor(icons): settings & auth onto shared barrel (A4)`

---

### Milestone A5 — Guest side (client-facing gallery)

**Goal:** Migrate the consumer/guest surfaces. Per design system §3/§10, this side may use **heavier Phosphor weights** (`bold`/`fill`/`duotone`) and larger sizes — apply tastefully where it already reads expressive.

**Files:** `components/event/**` — `LoungeGallery.tsx`, `ScanFlow.tsx`, `screens/gallery/*` (`GalleryControls.tsx`, `GalleryGrid.tsx`), `screens/lounge/*` (`PhotoViewer.tsx`, `StudioMenu.tsx`, `TopBar.tsx`, `MobileTopBar.tsx`, `ProfileSheet.tsx`, `ReviewNudge.tsx`, `PasscodeSheet.tsx`, `CoverMasthead.tsx`, `DesktopCover.tsx`, `SocialIcons.tsx`), `screens/LoginScreen.tsx`, `screens/TeamSelectScreen.tsx`, `GalleryUnavailable.tsx`, `QrScanError.tsx`, `policy/PolicyOverlay.tsx`; plus `app/(client)/event/[unique_identifier]/page.tsx` and `app/(client)/error/*`.

**Brand marks:** `SocialIcons.tsx`, `StudioMenu.tsx`, `StudioCard.tsx` use WhatsApp/Instagram/etc. → `react-icons` (simple-icons), wrapped behind barrel names. These are the strongest `filled`/`GalleryControls` usage — verify toggles.

**👁 Visual checkpoint:** Open a public event URL — guest lounge, gallery grid + photo viewer, login/passcode, scan flow, social links, an error page.

**Commit:** `refactor(icons): guest side onto shared barrel (A5)`

---

### Milestone A6 — Sweep & lock

**Goal:** Prove no stray hand-drawn icons remain; tidy.

**Steps:**
- `grep -rn "function.*Icon\|<svg" frontend/app frontend/components` — anything left should be intentional (decorative art / logo mark), documented with a comment. Remove dead code.
- Confirm the old `[booking_id]/icons.tsx` is now just a re-export (or update the 16 imports to the canonical path and delete it — user's call; propose, don't force).
- `tsc --noEmit` && `lint` clean.

**👁 Visual checkpoint:** Quick pass over every screen touched in A1–A5.

**Commit:** `chore(icons): remove hand-drawn icons, finalize barrel (A6)`

> **End of Phase A. Hand back to the user.** Phase B can be handed off as a separate session.

---

# PHASE B — Component library (do after Phase A lands)

Higher-level outline — Claude Code should do its own discovery pass at the start of B1, since exact button/badge/input/modal call sites weren't enumerated here. Strategy is fixed by the design system §9: **one shared headless substrate (Radix via shadcn/ui), themed per side (Studio restraint / Guest editorial), custom-write only as last resort.**

### 🔧 Install (USER runs, before B1)

```bash
cd frontend
npx shadcn@latest init
```

> This is interactive and edits config — the user should run it and confirm the Tailwind v4 / React 19 answers. **Claude Code: do not run this.** After init, tell the user the exact `npx shadcn@latest add <component>` commands per milestone; they run them.

- **B1 — Two-side theme tokens.** Extend `app/globals.css`: keep the Studio tokens, add a Guest theme token set (class- or `data-theme`-scoped). No component changes. 👁 Checkpoint: existing screens unchanged; Guest routes still render.
- **B2 — Button primitive (Studio).** Add shadcn Button, theme it to the §8 Button spec (Primary/Secondary/Ghost/Destructive), migrate one screen's inline `<button>`s (there are ~247 total). 👁 Checkpoint: that screen's buttons.
- **B3 — Badge / Input / Modal primitives (Studio).** Migrate area-by-area (dashboard → media → settings). 👁 Checkpoint per area.
- **B4 — Guest-theme variants.** Same primitives, Guest tokens, on the client gallery. 👁 Checkpoint: guest screens.
- **B5 — Sweep remaining inline buttons/inputs.** Grep for leftover `<button`/`<input`; migrate or document. 👁 Full pass.

Each B milestone: `tsc --noEmit` && `lint`, one commit, **stop for visual review.**

---

## Handoff checklist for the user

- [ ] Run the Phase A install command above.
- [ ] Keep your dev server running yourself; review at each 👁 checkpoint.
- [ ] Approve each milestone before Claude Code continues to the next.
- [ ] Run the shadcn install/add commands when Phase B starts.
