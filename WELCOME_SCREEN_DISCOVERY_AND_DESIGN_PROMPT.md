# Guest Welcome Screen — Codebase Discovery + Claude Design Prompt

Scope: what exists in the codebase today, as of this pass. No prior brand docs, design notes, or past decisions consulted.

---

## 1. Where the screen lives

| Concern | Path |
|---|---|
| The screen itself | `frontend/components/event/screens/WelcomeScreen.tsx` (85 lines) |
| Rendered by | `frontend/components/event/EventFlow.tsx` → `if (step === "welcome") return <WelcomeScreen onContinue={() => setStep("login")} />` |
| Route | `frontend/app/(client)/event/[unique_identifier]/page.tsx` → `EventExperience.tsx` → `EventFlow` |
| Theme/data source | `EventThemeContext.tsx` (`useEventTheme()` → `{ theme, event, uniqueIdentifier }`) |
| Theme tokens | `frontend/lib/client-theme.ts` |
| Data shape | `DeliveryLandingPageData` in `frontend/lib/types.ts` (L535–575) |
| Motion classes | `frontend/app/globals.css` (L295–430) |
| Fonts registered | `frontend/app/layout.tsx` |

**There is only one implementation.** `WelcomeScreen.tsx` contains **zero** `sm:` / `md:` / `lg:` breakpoints and no desktop-only sibling. Grep across `components/event/screens/*.tsx` shows breakpoints only in `LoginScreen`, `LoungeGallery`, `ScanFlow` — not here. So desktop renders the mobile layout stretched to viewport width, with a `max-w-[460px]` centered column below the hero. (For contrast, the *post-auth* lounge does have a real desktop shell: `lounge/DesktopCover.tsx`, mounted exclusively above `lg`, with a full-height cover, editorial Playfair italic title at `clamp(40px, 4.6vw, 60px)`, and a frosted glass welcome band. The welcome screen has no equivalent.)

Lifecycle: shown only to a guest with no valid stored token. Once signed in, never shown again (`EventFlow.decideStep`). Prior screen is `BrandLoader` (min 700 ms), next screen is `LoginScreen` (WhatsApp OTP primary, Google SSO demoted).

---

## 2. Layout structure (single component, mobile-first, unbranched)

Root: `div.relative.isolate.flex.min-h-[100dvh].flex-col`, inline `background: t.bg`, `fontFamily: t.font`.

Section order, top to bottom:

1. **`<AmbientBackdrop a={t.cover[0]} b={t.brand} />`** — `absolute inset-0 -z-10 overflow-hidden`, two blurred blobs: `60vh` square at `left:-18% / top:-12%`, `blur(100px)`, `opacity .42`; `65vh` square at `right:-15% / bottom:-15%`, `blur(110px)`, `opacity .32`. Drifts via `.fx-aurora-1` (22 s) / `.fx-aurora-2` (26 s), alternate infinite.
2. **Cover block** — `relative h-[42vh] min-h-[260px] shrink-0 overflow-hidden`
   - image layer: `absolute inset-0`, `.hero-kenburns` when `background_image` present (scale 1 → 1.09, 16 s alternate); `backgroundSize: cover`, `backgroundPosition: event.background_position || "center"`. Fallback with no image: `linear-gradient(150deg, t.cover[0], t.cover[1])`.
   - scrim layer: `absolute inset-0`, `background: t.heroScrim` = `linear-gradient(160deg, rgba(brandDeep,.30) 0%, rgba(0,0,0,.30) 42%, rgba(0,0,0,.62) 100%)`.
   - text block: `.fx-blur-in absolute inset-x-0 bottom-0 p-7` (28 px pad) — studio eyebrow, `h1`, `HeroSubtitle`.
3. **Content column** — `relative mx-auto flex w-full max-w-[460px] flex-1 flex-col px-7 pb-8 pt-6`
   - photo count line (`.fx-rise`, centered) — rendered only when `photoCount > 0`
   - sample strip (`.fx-rise mt-4 flex gap-2 overflow-x-auto pb-1`, `scrollbarWidth: none`) — rendered only when `sampleUrls.length > 0`; tiles `h-24 w-24 flex-none rounded-xl`, `background: t.sunken`, `img … object-cover`, `alt=""`
   - **`<div className="flex-1" />`** — the spacer that pushes everything below to the bottom
   - reassurance paragraph — `mb-4 text-center text-[12.5px] font-semibold leading-[1.5]`, `color: t.faint`
   - CTA button — `.cta-shine w-full rounded-full py-4 text-[15px] font-extrabold`, `flex items-center justify-center gap-2`, `hover:-translate-y-0.5 active:scale-[0.99]`, inline `background: t.brand`, `color: t.onBrand`, `boxShadow: t.shadowSm`; contains `<IconImages size={18} />` + label.

Breakpoints: **none.** Desktop = the same DOM; only `max-w-[460px]` and `42vh` respond, and only to viewport size, not to layout intent.

---

## 3. Copy, exactly as written

| Element | Source | String |
|---|---|---|
| Studio eyebrow | `WelcomeScreen.tsx:40` | `Gallery by {event.company_name}` — rendered only when `include_company_branding === true` **and** `company_name` truthy. Uppercased via CSS. |
| Title | `:44` | `{event.event_name}`, fallback literal `"this event"` |
| Subtitle (no custom message) | `HeroSubtitle.tsx:51` | `` `${event.event_type} gallery` `` (uppercased via CSS), fallback literal `"Gallery"`; then a 3 px dot separator; then the formatted date |
| Subtitle (custom message set) | `HeroSubtitle.tsx:32–45` | `{event.custom_message}` as italic serif prose, `line-clamp-2`, `max-w-[46ch]`; date on its own line below |
| Date format | `LoungeGallery.formatDate` | `toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })` → e.g. `14 August 2026`. Hidden when `event_date` null. |
| Photo count | `:53` | `{photoCount.toLocaleString("en-IN")} photo{s} waiting for you` — plural suffix `""` when count is 1 |
| Reassurance | `:71` | `You’ll sign in with WhatsApp and take a quick selfie — allow camera access when your browser asks.` (curly apostrophe, em dash) |
| CTA | `:80` | `Find my photos` |
| Link-preview description (not on-screen) | `page.tsx:10` | `Upload your selfie and our AI will find all your photos from this event.` |

The reassurance line and the CTA are hard-coded literals. Everything else is event data.

---

## 4. Content / props / data

`WelcomeScreen` takes exactly one prop: `onContinue: () => void`. Everything else comes from `useEventTheme()`.

Fields read off `event` (`DeliveryLandingPageData`):

- `event_name?: string` → title
- `event_type?: string` → subtitle label
- `event_date?: number | null` → epoch ms
- `custom_message?: string` → subtitle prose (takes over the label)
- `background_image?: string` → cover (R2 URL)
- `background_position?: string` → CSS object-position focal point, e.g. `"50% 35%"`
- `include_company_branding?: boolean` + `company_name?: string` → eyebrow
- `style_variant?: string` → resolves the theme upstream in `EventExperience`
- `photo_count?: number` → *total media for the booking, not folder-scoped*
- `sample_media_urls?: string[]` → "≤6, public-folder-scoped, images-only preview … deliberately not the full gallery — served unauthenticated" (per the type comment)

Company logo (`company_logo`, `company_logo_light`) exists on the payload and is used in OG metadata, but **is not rendered on this screen** — the studio appears as text only.

---

## 5. Styling tokens in use

Themes are built in `client-theme.ts` from 10 named palettes (`Ivory & Rose` default, plus `Blush Minimal`, `Sage Sanctuary`, `Marigold Bright`, `Festive Bloom`, `Maroon Velvet`, `Fine-Art Warm`, `Emerald Royal`, `Charcoal Editorial`, `Indigo Dusk`). Each starts from four base values (`bg`, `accent`, `text`, `cover[2]`) and derives the rest by colour maths. `muted` / `faint` are binary-searched to guarantee ≥4.5:1 and ≥3:1 contrast against `bg`. `onBrand` flips to dark text when accent luminance > 0.62.

Tokens this screen actually consumes: `t.bg`, `t.font`, `t.text`, `t.faint`, `t.sunken`, `t.brand`, `t.onBrand`, `t.cover[0]`, `t.cover[1]`, `t.heroScrim`, `t.shadowSm`.

Radii tokens exist (`rCard: 24`, `rTile: 18`, `rField: 18`) but this screen **does not use them** — it hardcodes `rounded-xl` on sample tiles and `rounded-full` on the CTA.

Type: `t.font` = `'Nunito', 'Plus Jakarta Sans', sans-serif`, applied at root. Serif escape hatch `var(--font-playfair), Georgia, serif` is used only inside `HeroSubtitle`'s custom-message branch. Registered but unused here: Cormorant Garamond, Lora, DM Sans, Geist Mono.

Type scale as written (all fixed px, no fluid sizing): eyebrow `10.5px / 600 / uppercase / tracking .16em / white 85%`; `h1` `32px / 800 / leading 1.1 / tracking -0.02em / white`; subtitle label `10px / 600 / uppercase / tracking .14em`, date `12.5px / 500`; count `14.5px / 700`; reassurance `12.5px / 600 / leading 1.5`; CTA `15px / 800`.

Motion: `.fx-blur-in` (0.75 s, blur 8→0 + 10 px rise) on the hero text; `.fx-rise` (0.6 s, 18 px rise) on the count and the sample strip; `.hero-kenburns`; `.cta-shine` (hover-only sheen sweep, 0.85 s); ambient aurora drift. Easing is consistently `cubic-bezier(0.2, 0.7, 0.3, 1)`.

Icon: `IconImages` = Phosphor `Images` via `wrapPhosphor`, rendered at 18.

---

## 6. Structural / responsiveness observations (as-is, no fixes)

1. **No desktop layout exists.** The mobile composition is what a 2560 px browser gets. The hero spans full bleed while all content below is trapped in a 460 px centered column, so the two halves of the screen don't relate to each other at width.
2. **The `flex-1` spacer creates an unbounded void.** With the sample strip absent (empty `sample_media_urls`) the column holds only a one-line count, a spacer, a two-line paragraph, and a button. On a tall desktop viewport that spacer is ~600–800 px of empty background — visible in the current screenshot as a full page-height gap between "4 photos waiting for you" and the CTA.
3. **`h-[42vh]` is viewport-relative, so the hero shrinks exactly where it should grow.** On a short landscape/laptop window the cover collapses toward its `260px` floor; on a tall phone it's generous. The crop is governed only by `background_position`, so wide desktop crops of a portrait-ish cover lose the subjects.
4. **Fixed px type at every level.** A 32 px `h1` reads as a title on a phone and as a caption on a 27" display; nothing scales (contrast: `DesktopCover` uses `clamp(40px, 4.6vw, 60px)`).
5. **CTA is `w-full` inside the 460 px column** — on desktop it's a 460 px pill floating mid-page with nothing anchoring it. It's also not sticky/fixed on mobile, so on a short viewport with a long event name the count and reassurance can compete for the fold.
6. **Two independently conditional blocks in the same slot.** `photoCount > 0` and `sampleUrls.length > 0` render independently, giving four possible mid-section states — including fully empty, where `pt-6` + `flex-1` leaves the column with nothing but whitespace above the CTA.
7. **Long-content behaviour is untested by the markup.** `h1` has no clamp or truncation — a long event name wraps freely at `32px/1.1` and can push the subtitle out of the `p-7` bottom band. The eyebrow (`Gallery by …`) has no truncation either, unlike `LoginScreen`/`MobileTopBar` which cap studio names at 18 chars.
8. **No studio logo anywhere on the guest's first screen**, despite `company_logo` / `company_logo_light` being on the payload — studio identity is a 10.5 px uppercase text line over a photo.
9. **Sample tiles are decorative-only** (`alt=""`, non-interactive, fixed `96×96`) — they read as an affordance but do nothing on tap, and horizontally scroll with a hidden scrollbar and no scroll affordance.
10. **The photo count may overstate what the guest gets.** Per the type comment it's the booking's total media, not the guest's matches and not folder-scoped, while the CTA promises "*my* photos."
11. **Ambient aurora blobs are sized in `vh` but positioned in `%` of width** — on wide desktop they hug the left/right edges as large soft circles rather than reading as an ambient wash.
12. **No visible Vyavasth attribution on this screen** (`PoweredBy` appears on `LoginScreen` and `ScanFlow`, not here).

---

## 7. Claude Design prompt — ready to hand off

> Design the **first screen a wedding/event guest sees when they open their photo-gallery link**. Produce **5 meaningfully different visual directions** — distinct design languages, not five spacing variants of one layout. Each direction must be delivered at **both a mobile and a desktop viewport**.
>
> **Who's looking at this, and when**
> The guest is a wedding/event attendee in India. A few days after the event, the studio (or the couple) sends them a link over WhatsApp or SMS. They tap it, usually inside the WhatsApp in-app browser, usually one-handed, often standing up, often on mid-range Android over patchy data. They did not seek this out and they have no account. Their entire question is *"are my photos in here?"* — they want to get to their own face fast, and they need just enough reassurance to be willing to hand over a phone number and a selfie to a studio they met once. A smaller share open the same link later on a laptop, where they expect something that looks like a proper gallery, not a phone screen stretched wide. This screen is shown exactly once per guest; after they sign in they never see it again. The screen that follows is a WhatsApp OTP sign-in, then a selfie capture.
>
> **Content that must appear (real strings and data from the product)**
> - **Studio eyebrow** — `Gallery by {studio name}`, e.g. `Gallery by Kamal Productions`. Optional: the studio can disable branding, so design for both present and absent. Studio names run long; some are ~30 characters.
> - **Event name** — the primary title, e.g. `Ananya & Rohan`. Author-entered and unpredictable in length: from 4 characters to a full sentence. Show a short and a long example.
> - **Event descriptor line** — either an uppercase label `Wedding gallery` / `Reception gallery` / `Haldi gallery` (fallback: `Gallery`), **or**, when the studio wrote one, a free-text message clamped to two lines, e.g. `Thank you for celebrating with us — here are the memories.` Design both cases.
> - **Event date** — formatted Indian style, `14 August 2026`. May be absent.
> - **Cover photograph** — a real event photo supplied by the studio, with a studio-set focal point. Must also work when there is **no** photo (fall back to something generated from the palette).
> - **Photo count** — `1,240 photos waiting for you` (Indian digit grouping; singular `1 photo waiting for you`). Note this is the *event's* total, not the guest's matches. May be zero/absent — design that state.
> - **Optional teaser strip** — up to 6 preview thumbnails from the event's public photos. Frequently empty. The layout must not fall apart when it's missing.
> - **Reassurance line** — `You'll sign in with WhatsApp and take a quick selfie — allow camera access when your browser asks.` This does real work: it's the moment the guest decides whether to trust the flow. Treat its placement and weight as a design decision, not boilerplate.
> - **Primary CTA** — `Find my photos`. Single action. There is no secondary action on this screen.
>
> **Functional requirements every direction must satisfy**
> 1. The guest can tell within a second **whose event this is** and **which studio delivered it**.
> 2. The photo-count indicator is present and readable as a *promise of volume*, not fine print.
> 3. The WhatsApp + selfie reassurance is visible **before** the guest commits to the CTA — not below the fold, not hidden behind a disclosure.
> 4. One unambiguous primary action, thumb-reachable on mobile, and clearly primary on desktop.
> 5. Every element must degrade gracefully when data is missing: no cover image, no studio branding, no date, no teaser thumbnails, no photo count. Show at least one direction rendered in a sparse-data state.
> 6. Nothing may be gated behind hover — a large share of traffic is touch-only in a webview.
>
> **Viewport requirements**
> - **Mobile: 390 × 844.** Assume an in-app browser chrome eating ~110 px, so treat the true safe area as shorter than the nominal height. Everything decision-critical (identity, count, reassurance, CTA) should be resolvable without scrolling; if a direction chooses to scroll, the CTA's presence must still be obvious at first paint.
> - **Desktop: 1440 × 900** (and state how each direction behaves toward 1920). Desktop must be a **genuinely different composition**, not the mobile column centered with margins. Explicitly solve for: how the cover photograph earns the extra width, how the title scales, and how the CTA and reassurance stay anchored — the current build leaves several hundred pixels of empty background between the count and the button, which is the single biggest problem to design out.
>
> **Completely open — explore freely, impose nothing**
> Colour palette, typography (families, scale, pairing), imagery treatment, photographic crop and framing, grid, texture, ornament, motion, illustration, and overall mood are all yours. Do **not** default to a single "wedding" register: the five directions should feel like they came from five different studios. Vary the fundamental structure between them — where the photograph sits and how much of the frame it owns, whether type sits on the image or beside it, whether the composition is full-bleed / split / framed / card / editorial-margin, whether the mood is quiet or celebratory, whether the count is a headline or a whisper. Type-led, image-led, and chrome-minimal approaches are all fair game.
>
> One constraint on colour only: the design will be re-skinned per studio across roughly ten palettes (warm neutrals, blush, sage, marigold, terracotta, maroon, emerald, charcoal, indigo). Note for each direction which parts are palette-driven and which are fixed, so it survives a re-skin — but pick whatever palette you want for the actual comps.
>
> **Deliverable per direction**
> Mobile comp + desktop comp, a one-line statement of the idea, and a note on what happens at the sparse-data extreme and with a very long event name.
</content>
</invoke>
