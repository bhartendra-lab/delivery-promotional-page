"use client";

import { useEffect } from "react";
import { useEventTheme } from "../EventThemeContext";
import { usePolicy, type PolicyView } from "./PolicyContext";

const FULL_DOC: Record<PolicyView, { title: string; href: string; label: string }> = {
  terms: { title: "Terms", href: "https://vyavasth.in/terms", label: "full Terms" },
  privacy: { title: "Privacy", href: "https://vyavasth.in/privacy-policy", label: "full Privacy Policy" },
  cookies: { title: "Cookies", href: "https://vyavasth.in/cookie-policy", label: "full Cookie Policy" },
};

const SUPPORT_EMAIL = "support@vyavasth.in";

/**
 * Theme-aware, in-SPA policy sheet. Shows the Guest-specific Terms / Privacy /
 * Cookies for the current gallery without the Guest ever leaving it. The named
 * party is the Studio (from gallery context), with Vyavasth disclosed as the
 * platform operator.
 */
export function PolicyOverlay() {
  const { theme: t, event } = useEventTheme();
  const { view, openPolicy, close } = usePolicy();

  // Escape closes the sheet; lock body scroll while open.
  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [view, close]);

  if (!view) return null;

  const studio =
    event.include_company_branding && event.company_name ? event.company_name : "the Studio";
  const doc = FULL_DOC[view];
  const link = { color: t.brand, textDecoration: "underline", textUnderlineOffset: 2 } as const;

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      style={{ background: t.bg, fontFamily: t.font }}
      role="dialog"
      aria-modal="true"
      aria-label={`${doc.title} — gallery policies`}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-5 py-4"
        style={{ background: t.bg, borderBottom: `1px solid ${t.border}` }}
      >
        <div className="flex items-center gap-1.5">
          {(["terms", "privacy", "cookies"] as PolicyView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => openPolicy(v)}
              className="rounded-full px-3 py-1.5 text-[12.5px] font-extrabold transition-colors"
              style={
                v === view
                  ? { background: t.brand, color: t.onBrand }
                  : { background: "transparent", color: t.muted }
              }
            >
              {FULL_DOC[v].title}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          style={{ background: t.card, border: `1px solid ${t.border}`, color: t.text }}
        >
          <CloseIcon size={16} />
        </button>
      </div>

      {/* Body */}
      <article className="mx-auto w-full max-w-[640px] px-6 py-8">
        {view === "terms" && <TermsDoc studio={studio} link={link} muted={t.muted} text={t.text} />}
        {view === "privacy" && <PrivacyDoc studio={studio} link={link} muted={t.muted} text={t.text} />}
        {view === "cookies" && <CookiesDoc link={link} muted={t.muted} text={t.text} />}

        <p className="mt-8 text-[13px] font-semibold" style={{ color: t.faint }}>
          This is a short, gallery-specific summary. Read the{" "}
          <a href={doc.href} target="_blank" rel="noopener noreferrer" style={link}>
            {doc.label}
          </a>{" "}
          at vyavasth.in.
        </p>
      </article>
    </div>
  );
}

/* ── documents ──────────────────────────────────────────────────────────── */

type DocProps = { studio: string; link: React.CSSProperties; muted: string; text: string };

function H({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <h2 className="mb-2 mt-6 text-[18px] font-extrabold tracking-[-0.01em] first:mt-0" style={{ color }}>
      {children}
    </h2>
  );
}

function P({ children, color }: { children: React.ReactNode; color: string }) {
  return <p className="mb-3 text-[14px] font-semibold leading-[1.6]" style={{ color }}>{children}</p>;
}

function TermsDoc({ studio, link, muted, text }: DocProps) {
  return (
    <>
      <H color={text}>Gallery Terms</H>
      <P color={muted}>
        These Terms govern your access to the gallery published by{" "}
        <strong style={{ color: text }}>{studio}</strong>, operated via Vyavasth as the platform
        operator. The gallery hosts event photos and is browsable without an account.
      </P>
      <H color={text}>Face search consent</H>
      <P color={muted}>
        By submitting a selfie, you consent to it being processed in-session into a one-time
        embedding used to match you to photos. The selfie is discarded after matching. The embedding
        is retained for this gallery&rsquo;s lifetime and used solely to return your photos. You are
        not required to use face search to access the gallery.
      </P>
      <H color={text}>Content &amp; law</H>
      <P color={muted}>
        {studio} is responsible for the content of this gallery. These Terms are governed by the laws
        of India. For full details, see the{" "}
        <a href="https://vyavasth.in/terms" target="_blank" rel="noopener noreferrer" style={link}>
          full Terms
        </a>
        .
      </P>
    </>
  );
}

function PrivacyDoc({ studio, link, muted, text }: DocProps) {
  return (
    <>
      <H color={text}>Gallery Privacy</H>
      <P color={muted}>
        <strong style={{ color: text }}>If you use face search:</strong> a temporary embedding is
        created to match you to photos. Your selfie is not stored.
      </P>
      <P color={muted}>
        <strong style={{ color: text }}>If you sign in with Google:</strong> we collect your name and
        email to identify you as the Host.
      </P>
      <P color={muted}>
        <strong style={{ color: text }}>Never collected:</strong> advertising identifiers, cross-event
        tracking, your phone number, or your location.
      </P>
      <H color={text}>Sub-processors</H>
      <P color={muted}>
        Face matching uses AWS Batch (embedding computation) and Qdrant (embedding storage).
      </P>
      <H color={text}>Deletion &amp; your rights</H>
      <P color={muted}>
        You can request deletion of your face embedding by emailing{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={link}>
          {SUPPORT_EMAIL}
        </a>
        . Requests are handled manually and {studio} is notified. For individuals located in India,
        processing is carried out in accordance with applicable Indian law, including the Digital
        Personal Data Protection Act, 2023 (DPDPA). See the{" "}
        <a href="https://vyavasth.in/privacy-policy" target="_blank" rel="noopener noreferrer" style={link}>
          full Privacy Policy
        </a>
        .
      </P>
    </>
  );
}

function CookiesDoc({ link, muted, text }: Omit<DocProps, "studio">) {
  return (
    <>
      <H color={text}>Gallery Cookies</H>
      <P color={muted}>
        <strong style={{ color: text }}>No advertising cookies on this gallery</strong> — no Facebook
        Pixel, no Google Ads. Your presence in this gallery is never used for ad targeting.
      </P>
      <P color={muted}>
        Vyavasth sets no first-party cookie here; your guest session is kept in your browser&rsquo;s
        local storage, not a cookie.
      </P>
      <P color={muted}>
        Cloudflare may set an edge identifier such as <code>__cf_bm</code> for infrastructure
        security. It is Cloudflare-controlled and not used by Vyavasth for analytics or advertising.
      </P>
      <H color={text}>Controlling cookies</H>
      <P color={muted}>
        You can view, block, or delete cookies and clear local storage from your browser settings.
        See the{" "}
        <a href="https://vyavasth.in/cookie-policy" target="_blank" rel="noopener noreferrer" style={link}>
          full Cookie Policy
        </a>
        .
      </P>
    </>
  );
}

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
