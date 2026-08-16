# Event Vocabulary Pack — guest-side de-wedding-ing

**Goal:** the guest gallery currently hardcodes wedding relationship nouns ("the couple", "family passcode", "which team / side of the celebration"). A non-wedding event — a run club's Saturday run, a startup demo day — renders copy that is wrong for it. This task introduces one small vocabulary layer so guest-facing strings resolve from the event's existing `event_type` instead of being hardcoded.

**Scope discipline:** this is a single-session, frontend-only change. It is deliberately *not* the general solution (no account-type axis, no event-kind registry, no CMS). Resist expanding it.

---

## Standing protocol

1. Read `CLAUDE.md` at the repo root before touching anything.
2. **Confirm the plan with me before writing code.** Specifically confirm the register split and the ring decision (§5) — those are judgment calls, not mechanical edits.
3. **Do not run the dev server.** I'll run it myself.
4. When done, hand back a **manual test checklist** — the exact click-path through the guest flow for both a Wedding event and a Corporate event, listing what string should appear where.

## Hard constraints

- **Zero backend changes.** No new routes, controllers, validators, or models, and no edits to existing ones. `event_type` already exists on `DeliveryLandingPageData` and already reaches the guest payload via the Cloudflare KV mirror. Everything here keys off that field.
- **No visible change to wedding galleries.** Existing live galleries must render byte-identical copy. This is the acceptance bar — if a Wedding event reads any differently after this change, it's a regression.
- No new dependencies.

---

## 1. The module

Create `frontend/lib/event-vocab.ts`.

```ts
export type EventVocab = {
  /** Lowercase, for mid-sentence use: "Ask {hostNoun} for…" */
  hostNoun: string;
  /** Name of the full-access code, lowercase: "family passcode" */
  passcodeNoun: string;
  /** Subtitle under "Enter passcode" */
  passcodeSource: string;
  /** Team-select heading */
  teamQuestion: string;
  /** Team-select subheading */
  teamSubtitle: string;
  /** Who the guest should contact when something's wrong */
  providerNoun: string;
  /** Cover kicker prefix; null => render the neutral "Event Gallery" */
  coverKicker: string | null;
  /** Studio-side label for the custom_message field */
  messageLabel: string;
  /** Whether to use the conic signature ring (see §5) */
  signatureRing: boolean;
};

export function vocabFor(eventType?: string | null): EventVocab;
```

Two registers only:

| | `social` | `neutral` |
|---|---|---|
| **Applies to** | Wedding, Engagement, Pre-wedding, Anniversary, Birthday | Corporate, and any unrecognised non-empty value |
| `hostNoun` | `the couple` | `the organisers` |
| `passcodeNoun` | `family passcode` | `private passcode` |
| `passcodeSource` | `Shared by the couple or host family` | `Shared by the event organisers` |
| `teamQuestion` | `Which team are you in?` | `Which group are you with?` |
| `teamSubtitle` | `We'll tag your photos to the right side of the celebration.` | `We'll tag your photos to the right group.` |
| `providerNoun` | `your studio` | `the organisers` |
| `coverKicker` | `The {eventType} of` | `null` |
| `messageLabel` | `Message from the Couple` (Anniversary/Birthday: `Message from the Hosts`) | `Event Briefing` for Corporate, else `Message to Guests` |
| `signatureRing` | `true` | see §5 |

**Important:** `vocabFor(undefined)` must return the **`social`** register. Legacy landing pages may have no `event_type`, and defaulting them to social guarantees the no-regression bar above. Only an explicit non-social value flips the register.

Keep the existing per-type nuance that's already in the codebase — `COPY_LABEL` in `GalleryDesignTab.tsx:36-43` already distinguishes Couple / Hosts / Briefing. Fold that table into this module rather than duplicating it, and have `GalleryDesignTab` import from here.

---

## 2. Guest-side call sites (the actual bleed)

| File | Line | Current | Use |
|---|---|---|---|
| `components/event/screens/LoungeGallery.tsx` | ~1120 | `"No highlighted photos yet. Ask the couple for the family passcode to see everything."` | `hostNoun` + `passcodeNoun` |
| `components/event/screens/lounge/PasscodeSheet.tsx` | 78 | `Shared by the couple or host family` | `passcodeSource` |
| `components/event/screens/TeamSelectScreen.tsx` | 50 | `Which team are you in?` | `teamQuestion` |
| `components/event/screens/TeamSelectScreen.tsx` | 53 | `We'll tag your photos to the right side of the celebration.` | `teamSubtitle` |
| `components/event/EventNotFound.tsx` | 21 | `…the link your studio shared…` | `providerNoun` |
| `components/event/GalleryUnavailable.tsx` | 13, 18 | `paused by {studio}` / `contact {studio}` | already takes a `studio` arg — pass the resolved noun in |

For `EventNotFound` / `GalleryUnavailable`, reuse the pattern already in `PolicyOverlay.tsx:43-44`: prefer `event.company_name` when `include_company_branding` is on, and fall back to `providerNoun` otherwise. Don't invent a second convention.

Access the vocab via `useEventTheme()` — it already carries `event`, so add a `vocab` field to `EventThemeValue` computed once in the provider rather than calling `vocabFor` in six components.

## 3. One guest-side string that isn't vocab

`components/event/screens/LoginScreen.tsx:44`:

```tsx
{event.event_type ? `${event.event_type} gallery` : "Event gallery"}
```

This renders **"Corporate gallery"** as the first thing a guest sees. `HeroSubtitle.tsx:32` already solves the same problem correctly — `custom_message` takes full priority over the type label. Give `LoginScreen` the same precedence: `custom_message` → else the existing `{event_type} gallery` label.

Note this block sits inside the `lg:block` desktop hero pane, so it's desktop-only. Fix it anyway; it's three lines.

## 4. Studio-side (same session, low risk)

- `GalleryDesignTab.tsx:36-43` — delete the local `COPY_LABEL` map, import `messageLabel` from the vocab module.
- `GalleryDesignTab.tsx:401` — replace `eventType === "Corporate" ? "Event Gallery" : \`The ${eventType} of\`` with the `coverKicker` field. This removes the hardcoded escape hatch that would need extending for every future event type.

Leave `AccessSharingTab.tsx:422`, `LikedFilters.tsx:110`, and the "e.g. Bride Team" placeholders at `GalleryDesignTab.tsx:188-199` alone for now — studio-side, seen by the operator only, not worth the diff in this pass.

---

## 5. The one judgment call — the signature ring

`client-theme.ts:30` defines `ring: "conic-gradient(#FF6B6B, #FFC727, #12B5A5, #7C5CFF, #FF6B6B)"`, marked in the file's header comment as a locked, never-themed signal. It's used in six places:

- `LoginScreen.tsx:60` — blurred halo behind the Vyavasth logo (decorative brand flourish)
- `ScanFlow.tsx:217, 378` — ring around the selfie capture / result
- `TeamSelectScreen.tsx:75` — ring around each team option's avatar
- `TopBar.tsx:102`, `MobileTopBar.tsx:114` — ring around the guest's own avatar

**My read:** the avatar rings (ScanFlow, TopBar, MobileTopBar, TeamSelect) are an Instagram-story idiom, not a wedding idiom — they're fine on a run club gallery and I'd leave them. The `LoginScreen` halo is the only purely decorative-celebratory one.

**So:** wire `signatureRing` through, but scope it to the `LoginScreen` halo only — neutral register uses a solid `t.brand` at the same opacity/blur instead of the conic gradient. Leave the four avatar rings conic in both registers.

**Do not implement this until I've confirmed it** — I want to eyeball the neutral login screen before we commit to it. Propose it, show me the diff, wait.

---

## Out of scope — do not start these

- `account_type` (vendor vs host) on the company, and anything branching on it
- An event-kind registry replacing the `event_type` enum
- Any backend change, including adding new values to the `event_type` enum
- The ReviewNudge / Google-review growth loop (it already self-suppresses when no Google listing is connected — leave it)
- Theme variants, folder-chip suggestions, onboarding copy
- A lint rule or CI guard for banned nouns — worth doing later, not now

## Definition of done

1. `frontend/lib/event-vocab.ts` exists, is the single source for every string in the tables above, and is imported (not duplicated) by both guest and studio call sites.
2. A Wedding event renders **identical** copy to `main` — verify by diffing the rendered strings, not by eye.
3. A Corporate event renders no instance of "couple", "family", "celebration", or "studio" anywhere in the guest flow.
4. `npm run lint` clean, typecheck clean.
5. Manual test checklist handed back per the protocol above.
