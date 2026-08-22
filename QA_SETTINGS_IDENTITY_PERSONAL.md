# QA Report — Studio Identity & Personal Information

Scope: `app/(dashboard)/dashboard/settings/page.tsx`, `settings/personal/page.tsx`,
`SettingsUI.tsx`, `SettingsContext.tsx`, `BusinessEmailVerifyBlock.tsx`,
`ChangeWhatsappModal.tsx`, plus the backing endpoints in the Vyavasth backend.

26 issues. Every item is grounded in a specific file/line, not just the screenshots.

---

## P0 — data loss / functionally broken

### 1. Personal Info can silently wipe first name, last name, email and phone

`personal/page.tsx:17-20` seeds `useState` from `userProfile`. But
`SettingsContext.tsx:62-85` fires `getCompanyDetails()` and `getUserProfile()` in
**parallel**, and only the *company* gates render (`load.status !== "ready"`).

Repro: hard-refresh directly on `/dashboard/settings/personal`. If the company
response lands first, the page mounts with `userProfile === null`, all four fields
initialise to `""`, and there is no sync effect to rehydrate them when the profile
arrives.

Consequences, in order of severity:

- `dirty` computes `changed("", "Bhartendra") === true`, so the **save bar appears
  already dirty on page load** with Save enabled.
- One click writes `first_name: ""`, `last_name: ""`, … over the saved values.
- Identical outcome when `getUserProfile()` *fails* — `.catch(() => {})`
  (`SettingsContext.tsx:81`) swallows it, so the user gets a blank form with no error
  and no way to tell it isn't real data.

Fix: give the profile its own load state and gate the page on it, or re-sync local
state when the profile resolves (`key`ed remount is simplest). Never compute `dirty`
against a null profile.

### 2. You cannot clear your personal email

Frontend sends `personal_email: ""` when the field is emptied
(`personal/page.tsx:33`). Backend rejects it: `onboarding.validator.js:94` is
`.optional({ checkFalsy: false }).trim().isEmail()` — `""` reaches `isEmail()` and
fails → 400.

Fix: `checkFalsy: true`, or `.if(body("personal_email").notEmpty()).isEmail()`.

### 3. Every validation failure renders as "Request failed: 400"

`validate.middleware.js` returns `{ success: false, errors: [{ field, message }] }` —
**no `message` key**. `lib/api.ts:78-84` only reads `body.message` and falls back to
`` `Request failed: ${status}` ``.

So issue #2, a >120-char name (`onboarding.validator.js:86`), and any address the
browser accepts but `validator.isEmail` rejects (`me@localhost`) all surface in the
save bar as a meaningless string, with no field highlighted. App-wide bug; this pane
is where it bites first.

Fix: map `errors[]` to per-field messages in `request()`, or have the middleware also
emit a human-readable `message`.

---

## P1 — logic and correctness

### 4. Non-Indian and short WhatsApp numbers are mangled or hidden

`SettingsUI.tsx:242-243`: `digits.slice(-10)` then hardcoded `+91`.

- `+1 415 555 2671` → displayed as **`+91 41555 52671`**. The studio is shown a number
  that isn't theirs.
- Anything under 10 digits → `formatted` is `null` → renders **"Not set yet"** even
  though a value is stored. Silent data hiding.

Fix: store and display E.164; don't reformat by truncation.

### 5. "Change number" offered when there is no number

Visible in the screenshot: `— Not set yet` next to **Change number**. The business
email field directly above gets this right (`Add & verify` vs `Change email`,
`SettingsUI.tsx:308`). WhatsApp also gets no chip at all when unset, while email shows
a "Not verified" warning chip — two adjacent fields signalling the same state
differently.

### 6. Helper text asserts a present-tense fact about a field that's empty

"Delivery notifications, OTPs and client replies all go to this number." — there is no
number (`SettingsUI.tsx:275-277`). Should become an actionable empty state: *"Add a
number so delivery notifications and client replies reach you."*

### 7. Personal Info promises a feature that doesn't exist

`personal/page.tsx:73-76`: *"…reuse them for your business email **and contact** on
Studio Identity with the same as personal checkbox."*

- There is **no** same-as-personal for phone. WhatsApp is OTP-gated and read-only
  (`page.tsx:144`).
- The email checkbox only exists *inside* `BusinessEmailVerifyBlock`, which is hidden
  until you click "Change email" — so the promised checkbox isn't discoverable from
  Studio Identity at all.

### 8. `SameAsPersonalCheckbox.disabled` is dead code that contradicts its own doc

`SettingsUI.tsx:160-162` documents "Shown, not hidden, when the shortcut's source data
isn't available — a visibly disabled control with an explanation tells the user why."
The only call site does the opposite: `{personalEmail && <SameAsPersonalCheckbox …>}`
(`BusinessEmailVerifyBlock.tsx:182`). A studio with no personal email gets silence
instead of the explanation the component was built to give.

### 9. No unsaved-changes guard anywhere in Settings

Section state is local `useState`; clicking another `SettingsNav` item unmounts the
form and drops edits with no confirm and no `beforeunload`. The codebase already has
this pattern for uploads (`useUploadEngine.ts:187`). Worst on Studio Identity, where a
queued logo `File` is also lost.

### 10. Whitespace-only studio name → dead-end save bar

Type `"   "`: `required` passes browser validation, `canSave = !!name.trim() && dirty`
is `false`, `dirty` is `true`. Result: the bar stays visible with a permanently
disabled Save button and no message explaining why. `handleSubmit` also early-returns
silently (`page.tsx:91`).

Same class: `changed()` (`SettingsUI.tsx:99`) compares `next.trim() !== (prev ?? "")`,
so a stored value with stray whitespace can never be made clean — the form is
permanently dirty.

### 11. Website is unnormalised on the client and unvalidated on the server

- `type="url"` rejects `royalorchidbanquet.com` with a **native browser bubble
  anchored to an input below the sticky save bar** the user just clicked — the message
  can be off-screen. No scheme auto-prefix, no trailing-slash normalisation.
- `/update-company-details` has **no validator middleware at all**
  (`onboarding.routes.js:13`): no URL check, no length caps, and no server-side
  enforcement of the studio name the UI marks required. Exactly inverted from Personal
  Info, which is over-validated (#2).

### 12. "Change email" is a toggle whose label never changes

`page.tsx:126` — `setEmailVerifyOpen((open) => !open)`. While the block is open the
button still reads "Change email", so a second click looks like a broken no-op. No
`aria-expanded` / `aria-controls`.

### 13. The verify block opens with its primary action already disabled

`BusinessEmailVerifyBlock.tsx:49,60-61`: it pre-fills with `currentEmail`, so
`alreadyVerified` is true, "Send code" is disabled, and "That address is already
verified" shows — on a panel the user opened *to change* the address. They must clear
the field before anything works. Open empty, or pre-fill with select-all focus.

### 14. `personal_contact` accepts literally anything

No client validation (`type="tel"` validates nothing), no server format check
(`onboarding.validator.js:99` is trim-only). The placeholder `+91 98765 43210` implies
a format that is neither enforced nor normalised — and this is the value the
same-as-personal shortcut (#7) would feed into an OTP flow that demands exactly 10
digits (`ChangeWhatsappModal.tsx:45`).

### 15. Flash timers leak

`flashTimer` / `emailFlashTimer` (`page.tsx:53,68`) are never cleared on unmount —
unlike `useSaveState` (`SettingsContext.tsx:129-134`) and `CopyableIdField`
(`SettingsUI.tsx:50-55`), which both do. Navigate away within 3 s → setState on an
unmounted component.

### 16. Logo copy overstates what's enforced

"PNG, JPG or WEBP, up to 5 MB" (`page.tsx:223-227`). `ImageUpload` uses
`accept="image/*"`, its drop handler accepts any `image/*`, and there is **no size
check client-side**. Drop a 40 MB HEIC and you find out from the server. The backend's
sharp middleware also permits gif and svg, which the copy doesn't mention.

### 17. OTP resend doesn't know what it's resending to

`resendBusinessEmailOtp()` / `resendWhatsappChangeOtp()` take no arguments and rely on
server-side pending state. Two tabs open, or back → different address → resend, and
the code goes to whichever target the server recorded last. `backToEmail()`
(`BusinessEmailVerifyBlock.tsx:136`) also leaves `secondsLeft` counting down from the
previous send.

### 18. Countdown is a drifting timeout chain

`BusinessEmailVerifyBlock.tsx:63-67` and `ChangeWhatsappModal.tsx:48-52` both put
`secondsLeft` in the deps of a `setInterval` effect, so the interval is destroyed and
rebuilt every tick. Drifts, and keeps "ticking" against throttled background-tab
timers. Use a deadline timestamp and derive the remaining seconds.

---

## P2 — UI, hierarchy, accessibility

### 19. The escape hatch out-shouts the field it modifies

"Change email" / "Change number" are `text-sm font-semibold` in the brand accent,
against a `text-xs uppercase` muted label. In both screenshots the loudest element
inside each card is the *change* link, not the content — and the rust/orange reads as
destructive. Demote to `text-xs`, or move it into the field row as a trailing button.

### 20. Tab order puts the action before the value

In both read-only fields the button precedes the value in the DOM
(`SettingsUI.tsx:247-258`, `299-310`), so keyboard and screen-reader users reach
"Change email" before they know what the email is.

### 21. Read-only `Field` is focusable and announced as editable

Login email (`personal/page.tsx:48-55`) uses `readOnly` + `onChange={() => {}}` with no
`aria-readonly` and no `tabIndex={-1}`. The hint "it can't be changed here" is also a
dead end — no link to where it *can* be.

### 22. `aria-live` applied inconsistently

Email flash has it (`page.tsx:139`), WhatsApp flash doesn't (`page.tsx:150`), and the
save bar's "Changes saved" / error paragraph has neither (`SettingsUI.tsx:433-445`) —
so the primary success confirmation is silent to screen readers.

### 23. Heading redundancy

Section `<h1>` "Personal Information" immediately followed by card `<h2>` "Personal
information" — same words, inconsistent casing, second one earns nothing. Studio
Identity avoids this by naming its cards distinctly.

### 24. Required signalling is asymmetric

Studio name gets a `*`. Business email and WhatsApp — the fields that actually gate
delivery, and the only ones with verification chips — get nothing.

### 25. Two different "email" fields, two clicks apart, with no cross-reference

Screenshots show Business email `abhiagrawal2012@gmail.com` and Login email
`tech@vyavasth.in`. Login email explains itself; business email has no hint at all,
and neither mentions the other exists.

### 26. Minor

- `WatermarkIcon` (`SettingsUI.tsx:526`) is dead code, self-documented as such.
- `submit(payload)` (`personal/page.tsx:35`) is a floating promise; Studio Identity
  awaits and uses the result (`page.tsx:99`).

---

## Suggested fix order

1. #1, #2, #3 — data loss and unreadable errors. Ship first.
2. #9, #10, #11 — save-flow dead ends and the missing server-side validation.
3. #4, #5, #6, #7, #8 — the WhatsApp/email state and copy inconsistencies.
4. Everything else.
