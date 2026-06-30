# One-shot prompt — Vyavasth policy update + Guest-facing SPA policy routes

> Paste everything below the line into Claude Code. It is self-contained.
> Decisions already locked by the product owner: (a) the children element is an **accuracy disclaimer, not an age gate**; (b) deletion/retention language is **softened to match current system capability**; (c) contact email is **support@vyavasth.in**.

---

You are updating legal/policy content across Vyavasth's surfaces. **Do not write or modify any file until you have completed the discovery steps below and I have approved your plan.**

## Step 0 — Identify the repo and confirm scope

There are three Guest-relevant surfaces, in (likely) three separate repos/stacks:

1. **Marketing site** — `vyavasth.in` — where `/terms` and `/privacy` already exist. Must stay statically renderable (no client-only routes).
2. **Public gallery renderer** — the Guest-facing SPA where face search, the selfie-capture/consent step, and these new policy routes actually live.
3. **Delivery Hub dashboard** — `deliver.vyavasth.in` (Studio/Member side). **Not in scope.** If you are here, stop.

Look for a `CONTEXT.md` or `CLAUDE.md` at the repo root and read it. If neither is present, do **not** abort — instead state which repo you appear to be in (from package name, routes, framework) and confirm with me before proceeding. There is no shared backend change in this task; if you are in the backend repo, stop and tell me.

**Begin by reporting: which repo am I in, and which Parts below apply here.** Parts 1–3 apply only in the marketing site. Part 4 applies only in the public gallery renderer.

## Step 1 — Audit before you assert (mandatory, no guessing)

Before writing any cookie content, **audit what is actually set**. Do not copy cookie names from any other product. Specifically:

- Vyavasth's backend is Node/Express with JWT bearer-token auth (token held client-side, not a server session cookie). So `sessionid` / `csrftoken` (Django defaults) almost certainly **do not exist** — verify, don't assume they do.
- PostHog (`ph_*`) analytics is **deferred / may not be shipped**. Do not list it as currently set. If it is not live, either omit it or mark it explicitly as "set only when product analytics is enabled."
- Check what Cloudflare injects at the edge (e.g. `__cf_bm`) and what Google sets during OAuth sign-in.

Produce the cookie tables **from this audit**, not from a template. List only cookies you have evidence are actually set.

## Locked vocabulary (enforce in every user-facing string)

| Term | Refers to | Do NOT write |
|---|---|---|
| Studio | The photography studio (Vyavasth's paying customer) | "client" |
| Host | The couple/family who hired the Studio | "client", "user" |
| Guest | Anyone attending the event who uses the gallery | "user" |
| Member | A logged-in person on the Studio side | "user" |

Ban only **"client"** and **"user"** in user-facing copy. **"company" / "companies" is allowed** — it is a real collection name and brand term; do not mangle legitimate references to it.

## Cross-cutting content rules

- **"Update Section X" = append within that section.** Do not delete or rewrite existing clauses. Do not change governing law, jurisdiction, liability caps, or payment terms.
- **Retention/deletion — describe only what the system does today.** There is currently no hard-unpublish (only soft "Hide from Host") and no embedding-deletion endpoint. So:
  - Say embeddings are "retained for the lifetime of the published gallery."
  - Frame deletion as: "A Guest may request deletion of their face embedding by emailing support@vyavasth.in; requests are handled manually and the relevant Studio is notified." Do **not** promise an automatic "deleted on unpublish" behavior and do **not** promise a fixed "within 30 days" SLA unless I tell you that process exists. Use one consistent phrasing everywhere.
- **Scope the face-data promise narrowly.** You may promise face embeddings are never used for **profiling, advertising, retargeting, or cross-event/cross-platform identification**. Do **not** make a blanket "never used for model training" promise — Vyavasth has a possible future intent around media metadata. Stay silent on training rather than over-committing.
- **DPDPA wording is aspirational, not a hard compliance claim.** Write "in accordance with applicable Indian law, including the Digital Personal Data Protection Act, 2023 (DPDPA)" — never a bare "we comply with DPDPA."
- **Children = accuracy note, NOT an age gate.** Do not add any 18+ or 13+ consent gate to the selfie step. Where the children element appears, render it as an informational tooltip: face recognition is trained predominantly on adult faces and is therefore less reliable at identifying children. (See Part 4 + the Open Items at the end.)
- Contact email everywhere: **support@vyavasth.in**. No `[placeholder]` may ship literally.
- No third-party consent SDKs — plain prose only.

---

## Part 1 — `vyavasth.in/terms` (marketing site)

Append, do not rewrite:

**1a. Expand "Description of Services":** the platform includes a Delivery Hub that lets Studios host event media, publish face-searchable galleries, and deliver them to Hosts. Face search processes uploaded photos via automated image recognition to produce numerical face embeddings; a Guest may optionally submit a selfie to locate their own photos within a published gallery.

**1b. New section — "Face Recognition and Face Embeddings":**
- When a Studio publishes a gallery, an automated pipeline processes uploaded photos to extract face embeddings (numerical representations of facial geometry). Original photos are not sent to any third party in original form for this purpose; only the derived embedding is stored.
- Embeddings are stored for the lifetime of the published gallery.
- When a Guest uses face search, the submitted selfie is converted to an embedding in-session, matched, then discarded. The selfie is not stored.
- Embeddings are never used for profiling, advertising, retargeting, or cross-event/cross-platform identification.
- Vyavasth does not set advertising or retargeting cookies on gallery pages; a Guest's presence in a gallery is never used for ad targeting.

**1c. New section — "Studio Responsibilities for Uploaded Content":**
- The Studio warrants it holds the rights to all media it uploads and that relevant Hosts/Guests have been informed the media is hosted on a platform that includes face recognition functionality.
- The Studio is the data controller for uploaded media and the personal data of identifiable individuals within it; Vyavasth acts as data processor on the Studio's instruction. Obtaining Guest consent rests with the Studio.

**1d. Append to Governing Law (do not change it):** one sentence noting that, for individuals located in India, data processing is also carried out in accordance with applicable Indian law including the DPDPA 2023, as described in the Privacy Policy.

## Part 2 — `vyavasth.in/privacy-policy` (marketing site)

**2a. "Information We Collect" — add "Event media and derived data":** Studios upload photos/videos (stored on Cloudflare R2) that may contain identifiable individuals; automated processing generates face embeddings; a Guest's face-search selfie is processed in-session and not stored.

**2b. New prominent section — "Biometric and Facial Data":** treated as sensitive personal data; purpose strictly limited to letting a Guest find their own photos in a specific gallery; never used for cross-event ID, profiling, or advertising; legal basis is consent (recorded when a Guest accepts the Terms and submits a selfie); selfies discarded post-match, embeddings retained for the gallery's lifetime; sub-processors disclosed.

**2c. New section — "Guest Data":** Guests are not registered Members; they access galleries via share links; images of Guests may appear in Studio-uploaded media; face search produces a temporary embedding only; Guests who don't use face search have no embedding stored against them; deletion-request route via support@vyavasth.in (manual handling, Studio notified).

**2d. "Sharing with Third Parties" — name the Delivery Hub sub-processors:** AWS (Batch) — face embedding computation; Qdrant — embedding storage; Cloudflare (R2 + KV) — media storage and gallery delivery.

**2e.** Add the DPDPA paragraph using the aspirational wording above.

## Part 3 — Create `vyavasth.in/cookie-policy` (new, statically renderable)

Add it to the footer next to Privacy Policy and Terms. Sections: what cookies are; **cookies on the Studio dashboard** (table built from your Step 1 audit — Name / Purpose / Type / Duration; include the JWT/auth and Google OAuth reality you actually find, and PostHog only if live); **cookies on Guest gallery pages** (table from audit); **what Vyavasth does not use cookies for** (state plainly: no advertising, retargeting, or cross-site tracking cookies on any surface — no Facebook Pixel, no Google Ads cookies — including gallery pages); **other tracking tech** (Cloudflare edge identifiers like `__cf_bm` for security/performance, not used by Vyavasth for analytics/ads); **controlling cookies**; **updates + contact (support@vyavasth.in)**.

---

## Part 4 — Guest-facing gallery SPA policy routes (public gallery renderer only)

Add three client-side routes rendered inside the SPA (Guests never leave the gallery): `/terms`, `/privacy`, `/cookies`.

**Named party pattern:** mirror the white-label approach — the named party in these documents is the **Studio** (pull the Studio name from gallery context; fall back to "the Studio" if unavailable), with **Vyavasth disclosed as the platform operator**.

**`/terms`** (short, Guest-specific): these Terms govern access to the gallery published by [Studio name], operated via Vyavasth; the gallery hosts event photos, browsable without an account; **face search consent** — by submitting a selfie you consent to in-session processing into a one-time embedding for matching, the selfie is discarded after matching, the embedding is retained for this gallery's lifetime and used solely to return your photos, and you are not required to use face search to access the gallery; [Studio name] is responsible for gallery content; governing law India; link to full Terms at `vyavasth.in/terms`. **No age gate.**

**`/privacy`** (short): what is collected if you use face search (a temporary embedding; selfie not stored); what is collected if you sign in with Google (name + email, to identify you as the Host); what is never collected (advertising identifiers, cross-event tracking, phone/location); sub-processors (AWS Batch, Qdrant); deletion requests via support@vyavasth.in (handled manually, Studio notified — no fixed SLA promised); DPDPA aspirational wording; link to full Privacy Policy.

**`/cookies`** (short, from audit): what this gallery actually sets; **no advertising cookies on this gallery — no Facebook Pixel, no Google Ads, presence not used for ad targeting**; Cloudflare `__cf_bm` for infrastructure security; how to control cookies; link to full Cookie Policy.

**Styling:** use the gallery's own theme-aware design system (not the main Vyavasth brand) so the pages feel native to the gallery.

**Entry points / the elements you specifically asked to change:**
- The selfie-capture/consent step's checkbox currently links three policies (Terms of Service, Privacy Policy, Cookie Settings). Rewire those three links to the SPA routes `/terms`, `/privacy`, `/cookies` respectively. This is the consent moment — keep all three inline and underlined as today.
- The children info-tooltip (Samaro's "Under 13?") becomes an **accuracy disclaimer**, not an age question. Copy: facial recognition is trained predominantly on adult faces and is therefore less reliable at identifying children. No age input, no gate, no blocking.
- Add gallery footer links to all three routes.

---

## Deliverable

1. Repo identification + which Parts apply.
2. Step 1 cookie-audit findings.
3. A file-by-file plan of every page/route/string you will add or append.

**Stop after the plan and wait for my approval before editing anything.**

## Open items to surface (do NOT silently resolve)

- **Minors' biometric data under DPDPA.** A wedding gallery contains minors in photos, so embeddings for minors are created at publish time regardless of who submits a selfie. The accuracy tooltip does not address this. Flag it as needing a product + legal decision (verifiable parental consent obligations). Do not invent a solution.
- **Deletion mechanism gap.** There is no hard-unpublish and no embedding-deletion endpoint. The softened copy reflects current reality; flag that a real deletion capability is still an open build item.
- **Legal review.** I am not a lawyer; the biometric and children's-data clauses carry real DPDPA exposure because you are processing sensitive data of third parties who never signed your terms. Recommend these sections get proper legal review before going live.
