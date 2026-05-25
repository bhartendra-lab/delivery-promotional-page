# Vyavasth Design System

> 🔒 **This is the single source of truth for all Vyavasth design decisions.** Read this before creating any asset — landing page, app UI, deck, email, social post, contract, or WhatsApp template. Update only when both founders agree the brand is evolving deliberately. Last updated: 23 May 2026.
> 

---

# How to use this document

This document moves from highest-level to most concrete. Read top-to-bottom if you're new. Jump to a section if you have a specific question.

**Before any design work** → Read Design Language + Color System. 2 minutes.

**Before any copywriting** → Read Voice and Tone. 1 minute.

**Before shipping anything** → Run the 5-Second Trust Test.

**When briefing a designer or engineer** → Share this link. Nothing else needed.

**When this document feels wrong** → Talk to your cofounder before changing it. Brand consistency is a 3-year compound interest play.

---

# 1. The Position

**Vyavasth is the only software built for Indian wedding studios and production houses.**

Not the best. Not the most beautiful. The *only* one that gets this world. Every design decision — color, type, component, copy — should make a studio owner in Indore, Nagpur, or Jaipur feel: *this was made specifically for me.*

---

# 2. The Design Language

**Vyavasth's design language is built specifically for this world, built to last.**

It draws from three references, each contributing one thing:

- **Zerodha** — restraint and consistency. The bootstrapped Indian giant who never chased trends and won. Trust earned through familiarity over time, not through visual impressiveness.
- **Mailchimp** — warmth and personality. The bootstrapped SaaS giant who built a globally loved brand with a small consistent system and a distinctive voice. Friendly without being childish.
- **Samaro + Fotoowl** — industry fluency. The visual references that signal "we understand the creative world you live in" without copying what already exists.

**The principle that holds these together:** radical consistency over time. Small number of decisions, made deliberately, applied everywhere, never broken for trends. The brand Vyavasth looks like in year 5 is recognizably the same brand as year 1 — just more trusted.

## The three contexts

Vyavasth shows up in three different places. The balance between references shifts by context, but colors, typography, and component vocabulary stay constant.

**Operational interfaces** (Leads, Bookings, Accounting, Employees, Dashboard)

Zerodha dominates. Maximum restraint. High information density, near-zero decoration. The interface disappears and lets the work happen. A studio owner finds a booking detail in two seconds without their eye wandering.

**Asset-facing interfaces** (Delivery Hub, client galleries, photo browsers)

Photographs are the hero. UI recedes entirely. Dark mode often preferred — photos read better against dark surfaces. Generous spacing around images, minimal chrome.

**Marketing surfaces** (Landing page, decks, social media, contracts, emails)

Samaro/Mailchimp direction. Editorial polish. Generous whitespace. Confident restraint. This is where Vyavasth makes a first impression.

---

# 3. The Non-Negotiables

Four rules. These do not change without a deliberate brand evolution discussion between both founders.

1. **One accent color: terracotta `#C25A3A`.** Every button, link, icon, active state, and accent uses this. No navy, no gold, no purple, no blue. One color.
2. **Cream backgrounds, always.** No white, no gray, no gradients as backgrounds. Cream is the canvas everywhere — app, landing page, decks, invoices.
3. **Editorial restraint.** More whitespace than feels comfortable. Fewer elements than feel necessary. Confidence comes from what we leave out.
4. **Cultural specificity in content.** Indian city names in examples, ₹ symbol always, WhatsApp-friendly phrasing, Hindi/Sanskrit words where natural.

---

# 4. Color System

## Primary accent — Terracotta

One hex. Used everywhere terracotta appears. Buttons, links, active nav items, icons, logo mark, status accents.

| Token | Hex | Used for |
| --- | --- | --- |
| `primary` | `#C25A3A` | All interactive elements, CTAs, logo |
| `primaryPressed` | `#A8442A` | Button pressed/active state only |
| `primarySubtle` | `#F7E8E3` | Selected row backgrounds, focus ring fill |

## Light Mode

| Token | Hex | Used for |
| --- | --- | --- |
| `surface` | `#F5EDE0` | Default background everywhere |
| `surfaceRaised` | `#EDE3D3` | Cards, sidebars, elevated surfaces |
| `surfaceSunken` | `#FAF6EF` | Input fields, search bars |
| `textPrimary` | `#2A2218` | Headings, body text |
| `textSecondary` | `#7A6F63` | Captions, metadata, placeholder text |
| `textDisabled` | `#B5ADA4` | Disabled states only |
| `textInverse` | `#FFFFFF` | Text on terracotta buttons |
| `border` | `#DDD4C4` | Card borders, dividers, input borders |
| `borderStrong` | `#C4B9A8` | Focused inputs, active borders |

## Dark Mode

| Token | Hex | Used for |
| --- | --- | --- |
| `primary` | `#D4694A` | Same jobs — slightly brighter for dark surfaces |
| `primaryPressed` | `#C25A3A` | Pressed state |
| `primarySubtle` | `#3D1F16` | Selected states on dark |
| `surface` | `#1C1714` | Default background — warm dark, not cold black |
| `surfaceRaised` | `#252018` | Cards, sidebars |
| `surfaceSunken` | `#141210` | Input fields |
| `textPrimary` | `#F0E8DC` | Headings, body — warm off-white, never pure white |
| `textSecondary` | `#9E9187` | Captions, metadata |
| `textDisabled` | `#5A5249` | Disabled states |
| `textInverse` | `#1C1714` | Text on terracotta in dark mode |
| `border` | `#3A322A` | Dividers, borders |
| `borderStrong` | `#4E4438` | Focused inputs |

## Functional / Status Colors

Used only to communicate state. Never decorative. Never in the logo or marketing surfaces.

| Token | Hex | Used for |
| --- | --- | --- |
| `success` | `#2E7D52` | Paid, delivered, confirmed, active |
| `successSubtle` | `#E8F5EE` | Success row backgrounds |
| `warning` | `#B45309` | Follow-up due, pending, overdue |
| `warningSubtle` | `#FEF3E2` | Warning row backgrounds |
| `error` | `#C0392B` | Failed, lost, error states |
| `errorSubtle` | `#FDECEA` | Error row backgrounds |
| `info` | `#2563EB` | Informational, in-progress |
| `infoSubtle` | `#EEF3FF` | Info row backgrounds |

**Color rule:** if something needs to stand out and terracotta isn't working, the layout is wrong — not the color system. Never introduce a fifth accent.

---

# 5. Typography

**One typeface: Plus Jakarta Sans.** All weights, all surfaces. Headlines, body, UI, wordmark. No serif. Weight and size create hierarchy, not typeface switching.

Google Fonts: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)

React Native: `@expo-google-fonts/plus-jakarta-sans`

## Type Scale

| Token | Size | Weight | Line height | Used for |
| --- | --- | --- | --- | --- |
| `display` | 40px | 700 Bold | 1.2 | Landing page hero headline only |
| `h1` | 32px | 700 Bold | 1.2 | Page titles, section heroes |
| `h2` | 24px | 600 SemiBold | 1.2 | Section headings, card titles |
| `h3` | 18px | 600 SemiBold | 1.3 | Sub-section headings, modal titles |
| `bodyLarge` | 16px | 400 Regular | 1.5 | Lead body text, descriptions |
| `body` | 14px | 400 Regular | 1.5 | Default UI text, list items, labels |
| `bodyMedium` | 14px | 500 Medium | 1.5 | Emphasized body, stat values, names |
| `caption` | 12px | 400 Regular | 1.5 | Metadata, timestamps, secondary labels |
| `captionStrong` | 12px | 600 SemiBold | 1.5 | Badge text, tags, small labels |
| `button` | 14px | 600 SemiBold | 1 | All button labels |
| `overline` | 11px | 600 SemiBold | 1 | Section labels — ALL CAPS, +0.08em tracking |

**Typography rules:**

- Lowercase for the wordmark always: `vyavasth`. Never `Vyavasth` or `VYAVASTH` in logo form.
- Generous tracking on `overline` (+0.08em). Normal tracking on everything else.
- Line height 1.7 for long-form editorial paragraphs on landing page only.

---

# 6. Spacing, Radii, Shadows, Motion

## Spacing Scale

Base unit: 4px. Everything is a multiple of 4. No magic numbers.

| Token | Value | Used for |
| --- | --- | --- |
| `space1` | 4px | Tight internal padding, icon gaps |
| `space2` | 8px | Small gaps, inline spacing |
| `space3` | 12px | Input padding, tight card padding |
| `space4` | 16px | Default padding, list item spacing |
| `space5` | 24px | Card padding, section gaps |
| `space6` | 32px | Large section spacing |
| `space7` | 48px | Page section gaps |
| `space8` | 64px | Hero section padding |
| `space9` | 96px | Landing page macro spacing |

## Border Radius Scale

| Token | Value | Used for |
| --- | --- | --- |
| `radiusNone` | 0px | Dividers, full-bleed elements |
| `radiusSmall` | 4px | Badges, chips, status tags |
| `radiusMedium` | 8px | Inputs, buttons, small cards |
| `radiusLarge` | 12px | Cards, modals, bottom sheets |
| `radiusXL` | 16px | Feature cards on landing page only |
| `radiusFull` | 999px | Avatar circles, pill buttons (sparingly) |

## Shadow Scale

Flat-leaning. Shadows communicate elevation, never decoration. Shadow color is warm charcoal at low opacity — never cold gray or black.

| Token | Value | Used for |
| --- | --- | --- |
| `shadowNone` | none | Default — most surfaces |
| `shadowSubtle` | `0 1px 3px rgba(42,34,24,0.08)` | Cards on cream, slight lift |
| `shadowRaised` | `0 4px 12px rgba(42,34,24,0.10)` | Dropdowns, floating cards |
| `shadowFloating` | `0 8px 24px rgba(42,34,24,0.14)` | Modals, bottom sheets, popovers |

## Motion Scale

Fast and quiet. Animation orients the user, never entertains them.

| Token | Value | Used for |
| --- | --- | --- |
| `durationInstant` | 0ms | State changes with no transition |
| `durationFast` | 150ms | Button presses, badge changes |
| `durationMedium` | 250ms | Dropdown open/close, modal appear |
| `durationSlow` | 400ms | Bottom sheets, page transitions |
| `easingStandard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Most transitions |
| `easingDecelerate` | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering |
| `easingAccelerate` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving |

**Motion rule:** nothing in operational UI takes longer than 250ms. Studios don't wait.

---

# 7. Logo Usage

The logo is a horizontal lockup: terracotta shutter mark + wordmark `vyavasth` in Plus Jakarta Sans lowercase terracotta.

## Three configurations

- **Full lockup** — shutter mark + wordmark. Default everywhere possible.
- **Mark only** — shutter mark alone. App icon, favicon, WhatsApp profile, social avatar, loading screens.
- **Wordmark only** — text alone. Long horizontal contexts: email signature footer, document headers, legal footers.

## Size rules

| Context | Configuration | Minimum |
| --- | --- | --- |
| App header / sidebar | Full lockup | 120px wide |
| Landing page header | Full lockup | 140px wide |
| App icon (iOS/Android) | Mark only | 1024px source |
| Favicon | Mark only | 32px |
| WhatsApp / social avatar | Mark only | 200px |
| Email signature | Full lockup or wordmark | 120px wide |
| Printed invoice | Full lockup | 30mm wide |

## Color configurations

| Background | Logo color |
| --- | --- |
| Cream `#F5EDE0` | Terracotta `#C25A3A` — default |
| White | Terracotta `#C25A3A` — acceptable |
| Terracotta `#C25A3A` | White `#FFFFFF` — inverse |
| Dark `#1C1714` | Terracotta `#C25A3A` — dark mode |

## Clear space

Equal to the height of the shutter mark on all four sides. Nothing comes closer.

## Not allowed

1. Recoloring in any color not in the table above
2. Stretching or squishing
3. Drop shadows, glows, or outlines added to the logo
4. Placing on busy backgrounds, photos, or gradients
5. Rotating
6. Recreating the wordmark in a different typeface

---

# 8. Components

## Mobile-first principle

Every component is designed for thumb first, then adapted for desktop. Minimum touch target: 48px. No hover-dependent interactions — everything works on touch.

## Mobile navigation

**Bottom tab bar.** Four tabs, always visible, pinned to bottom.

| Tab | Label |
| --- | --- |
| 1 | Dashboard |
| 2 | Leads |
| 3 | Bookings |
| 4 | Accounting |

Active tab: terracotta icon + terracotta label. Inactive: gray icon + gray label. Employees lives inside Settings — it's admin, not daily-use.

## List screens — Row pattern

No cards for operational list data. Each item is a row.

- Rows separated by 1px divider in `border` (`#DDD4C4`)
- Row height: 72–80px — generous enough for thumb tap
- Row background: `surface` by default
- Today rows: `primarySubtle` background (`#F7E8E3`)
- Overdue rows: `warningSubtle` background (`#FEF3E2`)
- Entire row is tappable — opens bottom sheet
- No action buttons inside rows

**Grouping:** Lists grouped by urgency — Overdue first, Today second, Upcoming third. Section headers in `overline` style on `surfaceRaised` background band.

## Bottom sheet

Slides up on row tap. Covers ~70% of screen. Pill handle at top.

Five sections:

1. **Identity** — name, location, date added, current status badge
2. **Details grid** — 2×2: phone, follow-up date, assigned person, event
3. **Notes** — free text, editable on tap
4. **Status update** — pill options (No Reply / In Discussion / Confirmed / Follow-up / Lost). Tap to update instantly, no save button.
5. **Actions** — Call (primary terracotta), WhatsApp (secondary), Edit (secondary)

## Buttons

| Variant | Style |
| --- | --- |
| Primary | Solid `#C25A3A`, white text, 8px radius, 14px semibold, padding 9px 16px |
| Secondary | `surfaceRaised` background, `textPrimary` color, same radius and padding |
| Ghost | No background, no border, `primary` color text, same padding |
| Destructive | Solid `error` color, white text |

## Status badges

4px radius. Colored text on subtle matching background.

| Status | Text color | Background |
| --- | --- | --- |
| No Reply | `textSecondary` | `surfaceRaised` |
| In Discussion | `primary` | `primarySubtle` |
| Confirmed | `success` | `successSubtle` |
| Follow-up | `warning` | `warningSubtle` |
| Overdue | `warning` | `warningSubtle`  • `warning` border |
| Lost | `error` | `errorSubtle` |

## Page header

Title (`h1`, bold, `textPrimary`) + subtitle (`caption`, `textSecondary`) on left. Primary CTA button on right. Consistent across all pages.

## Stat pills

Three equal-width pills in a row. 8px radius. Active: `primarySubtle` background, `primary` text. Inactive: `surfaceRaised` background, `textSecondary` text. No borders.

## Empty states

Centered vertically between filter row and bottom nav. Simple geometric illustration (flat, terracotta, consistent with brand). Bold headline (`h2`). One-line description (`body`, `textSecondary`, centered). One primary CTA button, centered.

---

# 9. Iconography

**Library: Phosphor Icons** (`phosphor-react-native`)

**Style:**

- Default everywhere: `regular` weight
- Active tab bar item: `fill` weight in `primary` (terracotta)
- Primary button icon: `fill` weight in white
- Everything else: `regular`

**Size scale:**

- 16px — inline with text, form field icons
- 20px — list row icons, badge icons
- 24px — tab bar, button icons, page header
- 32px — empty state icons, large feature icons

**Color rule:** icons inherit the color of their context. Never use a different color for an icon than the text it sits next to.

---

# 10. Voice and Tone

*(Full section coming in next session — framework below is locked)*

## The four traits

1. **Short.** Cut every sentence by 30% before shipping. Studios are busy.
2. **Calm.** No exclamation marks. No urgency theater. No "🚀 Unlock your potential!" Confidence doesn't need volume.
3. **Specific.** "Sharma Films, Indore" not "Acme Studio." "₹85,000 booking" not "a transaction." "WhatsApp the client" not "reach out."
4. **Familiar.** Hindi/Sanskrit words where natural. Indian city names in examples. ₹ always, never $. "Studio" not "business." "Booking" not "deal."

## Forbidden phrases

Revolutionary, game-changing, unlock, empower, seamless, world-class, AI-powered (as a brag), trusted by thousands (until true), leverage, synergy.

---

# 11. The 5-Second Trust Test

Before shipping any asset, run this:

> *Would a studio owner in Indore, Nagpur, or Jaipur look at this and think: "This is real, professional software made for me"?*
> 

**Yes** → ship it.

**Hesitate** → something is missing. Usually: cultural specificity in copy, restraint in design, or the wrong color creeping in. Fix that one thing.

---

# 12. Anti-Patterns

## Color

- Adding a second accent "just for this one screen" — it never stays for one screen
- Navy + gold for "premium" — the most overused palette in the Indian wedding industry; we'd blend in with our customers
- Lavender-to-peach gradients — the strongest "AI-generated landing page" tell
- Cold corporate blues or grays — they fight our warmth
- White backgrounds — they fight our cream

## Typography

- Ultra-bold condensed display fonts — shouts instead of speaks
- Mixing more than one typeface
- Tight letter-spacing on headlines
- `Vyavasth` or `VYAVASTH` for the wordmark — lowercase only

## Components

- Buttons inside list rows — the row itself is tappable
- Cards for operational list data — use rows
- Multiple CTAs per section
- Rounded corners larger than 12px in operational UI
- Drop shadows on cards (we are flat)
- 3D floating dashboard illustration as hero

## Content

- Stock illustrations of diverse cartoon people pointing at laptops
- Generic placeholder names (Acme Studio, John Doe)
- $ instead of ₹
- Email-only contact (we are WhatsApp-first)
- Western examples in copy

---

# 13. On the Navy + Gold Question

Decided and closed on 23 May 2026. Recorded here so it doesn't re-open as a question.

Navy + gold was considered and rejected because:

1. The landing page system is terracotta-cream. Changing the logo to navy+gold rebuilds the system around colors that fight our editorial direction.
2. Every wedding vendor, banquet hall, and "premium" Indian service uses navy+gold. We'd match our customers' aesthetic, not stand apart from it.
3. Terracotta is rarer and more ownable. Vyavasth in terracotta stands apart.
4. Premium is consistency, not a color. Zerodha looks premium because every touchpoint looks like Zerodha — not because of its color.
5. Gold doesn't reproduce flat. It needs foil or gradients to read as gold. On screen it reads as mustard yellow.
6. Navy is cold. It fights the warmth of the shutter mark.

If this comes up again, return to this section before re-opening the discussion.

---

# 14. What's Still Being Decided

*(These sections will be completed and moved up in the next session)*

- **Imagery and illustration** — photography style, illustration approach, what's allowed on marketing surfaces
- **Three-context rules in full detail** — exact density and decoration rules per context
- **Voice and tone — full section** — examples, before/after copy, error messages, onboarding language