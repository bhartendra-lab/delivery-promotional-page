"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  requestStudioOtp,
  verifyStudioOtp,
  requestStudioWhatsappOtp,
  verifyStudioWhatsappOtp,
  apiErrorCode,
  resolveReferral,
  getCompanyDetails,
  ApiError,
} from "@/lib/api";
import { getPublicCoupons } from "@/lib/billing";
import type { PublicCoupon } from "@/lib/billing";
import { formatOfferDate } from "@/lib/plans";
import { exclusiveValidity } from "@/lib/offer-urgency";
import { captureReferralFromUrl, getStoredReferral } from "@/lib/referral-storage";
import { trackEvent } from "@/lib/analytics";
import {
  setToken,
  setCompany,
  sanitizeRedirectPath,
  needsOnboarding,
  isAuthenticated,
  rememberPostLoginRedirect,
} from "@/lib/auth";
import {
  IconMail,
  IconWarningCircle,
  IconArrowRight,
  IconGoogle,
  IconArrowLeft,
  IconCopy,
  IconCheck,
  IconPause,
  IconPlay,
  IconWhatsApp,
  IconCaretDown,
} from "@/components/ui/icons";
import { OtpCodeStep } from "@/app/(dashboard)/dashboard/settings/OtpCodeStep";
import { SpaceBackdrop } from "./SpaceBackdrop";
import { markSignup, sendPendingSignup } from "@/lib/signup-attribution";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginShell />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--color-brand-ink)]">
      <p className="text-sm text-white/60">Loading…</p>
    </main>
  );
}

/**
 * A studio that is already signed in on this browser must not be asked to sign
 * in again. Opening the app's root goes straight to /dashboard, which restores
 * the session from the cookie; arriving here from the marketing site's "Log in"
 * link used to skip that and always show the form.
 *
 * The cookie alone is not trusted: it is checked against the API first, so an
 * expired or revoked token falls through to the form (the API helper clears it
 * on a 401) instead of dropping the studio into a dashboard that cannot load.
 * Any other failure (offline, 5xx) also shows the form: signing in is never
 * blocked by this check. Returns true while the check is in flight.
 *
 * `skip` is for a failed Google sign-in (?error=auth_failed): that message
 * must be seen, not redirected away.
 */
function useResumeSession(skip: boolean, redirectTo: string): boolean {
  const router = useRouter();
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (skip || !isAuthenticated()) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cookie is only readable on the client; flips once
    setResuming(true);
    getCompanyDetails()
      .then(({ company }) => {
        if (cancelled) return;
        setCompany(company);
        // Same gate the dashboard applies, so there is no extra hop.
        router.replace(needsOnboarding(company) ? "/onboarding" : redirectTo);
      })
      .catch(() => {
        if (!cancelled) setResuming(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skip, redirectTo, router]);

  return resuming;
}

function LoginShell() {
  const offers = useLoginOffers();
  const search = useSearchParams();
  const resuming = useResumeSession(
    search.get("error") === "auth_failed",
    sanitizeRedirectPath(search.get("next") ?? search.get("redirect")),
  );
  if (resuming) {
    return (
      <main className="flex min-h-dvh flex-1 items-center justify-center bg-[#4A2618]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
          <p className="text-sm text-white/70">Signing you in…</p>
        </div>
      </main>
    );
  }
  return (
    <main className="relative flex min-h-dvh w-full items-start justify-center overflow-hidden bg-[#4A2618] px-3 py-4 sm:items-center sm:px-6 sm:py-8 lg:px-10 lg:py-12">
      <SpaceBackdrop />
      <div className="dash-rise relative z-10 grid w-full max-w-[960px] grid-cols-1 overflow-hidden rounded-2xl shadow-[0_40px_100px_-24px_rgba(0,0,0,0.7)] ring-1 ring-white/10 lg:min-h-[540px] lg:grid-cols-2">
        <OfferPanel offers={offers} />
        {/* On a phone the form comes first: the offer is one slim strip above it. */}
        <MobileOfferStrip offers={offers} />
        <LoginForm />
      </div>
    </main>
  );
}

function Grain({ className = "" }: { className?: string }) {
  return (
    <svg className={`absolute inset-0 h-full w-full mix-blend-overlay ${className}`} aria-hidden="true">
      <filter id="login-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#login-grain)" />
    </svg>
  );
}

/* ── Live offers ────────────────────────────────────────────────────────
 * Entirely from GET /billing/coupons/public: the coupons Vyavasth showcases,
 * in the order it chose, each with its own headline, subline and code. No
 * code, figure or headline lives here: a hard-coded fallback could name a
 * code that no longer exists. With nothing showcased, or the call failing,
 * the panel shows one brand slide with no code (BRAND_SLIDE). */

type LoginOffers = { coupons: PublicCoupon[] };

function useLoginOffers(): LoginOffers {
  const [coupons, setCoupons] = useState<PublicCoupon[]>([]);

  useEffect(() => {
    let cancelled = false;
    getPublicCoupons()
      .then((res) => {
        // An older API also lists coupons that are not showcased, with no
        // headline: those are never shown.
        if (!cancelled) setCoupons((res.coupons ?? []).filter((c) => c.headline));
      })
      .catch(() => {
        /* The brand slide stays. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { coupons };
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Server snapshot is "reduced", so SSR markup never starts the timer. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

/* ── Offer panel ────────────────────────────────────────────────────────
 * One card per showcased coupon: its headline large, its subline small, a
 * tap-to-copy code and its end date. They switch every 3s (the progress bar's
 * CSS animation is the timer, so hover/focus/pause just pause the animation).
 * Arrows step manually; the pause button stops rotation. Slides share one
 * grid cell so the panel never changes height. */

type OfferSlide = {
  id: string;
  headline: string;
  subline: string | null;
  code: string | null;
  until: string | null;
  /** The exclusive offer: first, dressed apart, and held on screen longer. */
  exclusive: { urgency: string; ends: string } | null;
};

/** Shown when nothing is showcased or the offers could not load: no code, nothing to go stale. */
const BRAND_SLIDE: OfferSlide = {
  id: "brand",
  headline: "Your wedding galleries, delivered",
  subline: "Every guest finds their photos.",
  code: null,
  until: null,
  exclusive: null,
};

/**
 * The phone version of the offer: one strip, the first offer (the exclusive
 * one when it is on), its code and how long it lasts. The coupon is applied
 * by itself at checkout, so nothing here needs a tap.
 */
function MobileOfferStrip({ offers }: { offers: LoginOffers }) {
  const [now] = useState(() => Date.now());
  const coupon = offers.coupons.find((c) => c.exclusive) ?? offers.coupons[0];
  if (!coupon) return null;
  const validity = coupon.exclusive ? exclusiveValidity(coupon.valid_until, now) : null;
  return (
    <div className="relative overflow-hidden bg-[linear-gradient(110deg,#2b140d_0%,#5a2416_45%,#9b482e_100%)] px-5 py-3.5 text-white lg:hidden">
      <div className="flex items-center gap-2">
        {coupon.exclusive && (
          <span className="shrink-0 rounded-full bg-[linear-gradient(180deg,#ffe3a3,#f6c66a_55%,#d99a2b)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#2b140d]">
            Exclusive
          </span>
        )}
        <p className="min-w-0 truncate text-sm font-bold">{coupon.headline}</p>
      </div>
      <p className="mt-1 text-xs text-white/75">
        Code <span className="font-extrabold tracking-wide text-[#f6c66a]">{coupon.code}</span>
        {validity?.urgency ? <> · {validity.urgency}</> : coupon.valid_until != null ? <> · till {formatOfferDate(coupon.valid_until)}</> : null}
        <span className="text-white/60"> · applied for you</span>
      </p>
    </div>
  );
}

function OfferPanel({ offers }: { offers: LoginOffers }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now] = useState(() => Date.now());
  const reducedMotion = usePrefersReducedMotion();

  // The API already puts the exclusive offer first; kept first here too.
  const ordered = [...offers.coupons.filter((c) => c.exclusive), ...offers.coupons.filter((c) => !c.exclusive)];
  const slides: OfferSlide[] = ordered.length
    ? ordered.map((coupon) => ({
      id: coupon.code,
      headline: coupon.headline ?? "",
      subline: coupon.subline,
      code: coupon.code,
      until: coupon.valid_until != null ? formatOfferDate(coupon.valid_until) : null,
      exclusive: coupon.exclusive
        ? (exclusiveValidity(coupon.valid_until, now) ?? { urgency: "Limited time", ends: "" })
        : null,
    }))
    : [BRAND_SLIDE];
  const exclusiveActive = Boolean(slides[Math.min(index, slides.length - 1)]?.exclusive);
  const autoplay = !reducedMotion && slides.length > 1;
  const current = Math.min(index, slides.length - 1);

  const go = (step: number) => setIndex((i) => (Math.min(i, slides.length - 1) + step + slides.length) % slides.length);

  return (
    <aside className="group relative hidden flex-col overflow-clip bg-[linear-gradient(150deg,#CF6646_0%,var(--color-brand-navy)_45%,var(--color-brand-navy-deep)_100%)] px-5 py-5 text-white sm:px-10 sm:py-9 lg:flex">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(255,236,224,0.35),transparent)]" />
        {/* A warm gold light while the exclusive offer is on screen. */}
        <div
          className={`absolute -left-32 bottom-[-30%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,rgba(246,198,106,0.42),transparent)] transition-opacity duration-700 ${exclusiveActive ? "opacity-100" : "opacity-0"}`}
        />
        <Grain className="opacity-[0.12]" />
      </div>

      <div className="relative flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vyavasth-icon.svg" alt="" className="h-6 w-6 [filter:brightness(0)_invert(1)]" />
        <span className="text-lg font-bold tracking-tight">vyavasth</span>
      </div>

      <div
        className="relative grid flex-1 items-center py-4 sm:py-8 lg:py-0"
        aria-roledescription="carousel"
        aria-label="Offers"
        aria-live={paused || !autoplay ? "polite" : "off"}
      >
        {slides.map((slide, i) => {
          const active = i === current;
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
              aria-hidden={!active}
              inert={!active}
              className={`[grid-area:1/1] transition-[opacity,transform] duration-500 ease-out ${active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
                }`}
            >
              {slide.exclusive ? (
                <ExclusiveSlide slide={slide} validity={slide.exclusive} />
              ) : (
              <>
              <p className="text-[28px] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[50px] lg:text-[54px]">
                {slide.headline}
              </p>
              {slide.subline && (
                <p className="mt-2 text-sm font-medium leading-snug text-white/80 sm:text-lg">{slide.subline}</p>
              )}
              {(slide.code || slide.until) && (
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {slide.code && <CopyCode code={slide.code} />}
                  {slide.until && <span className="text-xs text-white/65">Valid till {slide.until}</span>}
                </div>
              )}
              </>
              )}
            </div>
          );
        })}
      </div>

      {slides.length > 1 && (
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex gap-2" role="tablist" aria-label="Choose offer">
            {slides.map((slide, i) => {
              const active = i === current;
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Offer ${i + 1} of ${slides.length}`}
                  onClick={() => setIndex(i)}
                  className="brand-focus relative h-1 w-10 overflow-hidden rounded-full bg-white/25"
                >
                  {active && (
                    <span
                      key={current}
                      className={`absolute inset-0 rounded-full ${slide.exclusive ? "bg-[#F6C66A]" : "bg-white"} ${autoplay ? (slide.exclusive ? "offer-progress offer-progress-long" : "offer-progress") : ""}`}
                      style={autoplay && paused ? { animationPlayState: "paused" } : undefined}
                      onAnimationEnd={autoplay ? () => go(1) : undefined}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <ControlButton label="Previous offer" onClick={() => go(-1)}>
              <IconArrowLeft size={14} />
            </ControlButton>
            {autoplay && (
              <ControlButton
                label={paused ? "Play offers" : "Pause offers"}
                pressed={paused}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? <IconPlay size={13} weight="fill" /> : <IconPause size={13} weight="fill" />}
              </ControlButton>
            )}
            <ControlButton label="Next offer" onClick={() => go(1)}>
              <IconArrowRight size={14} />
            </ControlButton>
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * The exclusive offer's slide: a gold "Exclusive offer" seal, its headline,
 * a gold code, and how long is left, so it reads as rare, not as one more
 * coupon. Every word but the seal and the countdown comes from the API.
 */
function ExclusiveSlide({ slide, validity }: { slide: OfferSlide; validity: { urgency: string; ends: string } }) {
  return (
    <>
      <span className="exclusive-seal inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#2B140D] sm:text-xs">
        <span aria-hidden className="exclusive-twinkle">✦</span>
        Exclusive offer
      </span>
      <p className="mt-3 bg-[linear-gradient(180deg,#FFFFFF_30%,#FFE3A3_100%)] bg-clip-text text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] text-transparent sm:text-[54px] lg:text-[60px]">
        {slide.headline}
      </p>
      {slide.subline && (
        <p className="mt-2 text-sm font-medium leading-snug text-white/85 sm:text-lg">{slide.subline}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {slide.code && <CopyCode code={slide.code} gold />}
        <span className="inline-flex items-center gap-2 rounded-full bg-black/20 px-3 py-1.5 text-xs font-bold text-[#FFE3A3] ring-1 ring-[#F6C66A]/40">
          <span aria-hidden className="exclusive-pulse h-1.5 w-1.5 rounded-full bg-[#F6C66A]" />
          {validity.urgency}
          {validity.ends && <span className="font-semibold text-white/70">· {validity.ends}</span>}
        </span>
      </div>
    </>
  );
}

function ControlButton({ label, pressed, onClick, children }: {
  label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="brand-focus flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 transition-colors hover:bg-white/25"
    >
      {children}
    </button>
  );
}

/** White code pill: tap anywhere on it to copy. */
function CopyCode({ code, gold = false }: { code: string; gold?: boolean }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => { });
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `Copied ${code}` : `Copy code ${code}`}
      className={`brand-focus inline-flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[var(--color-brand-navy-deep)] transition-transform hover:-translate-y-px active:translate-y-0 ${gold
        ? "bg-[linear-gradient(180deg,#FFF3D6,#F6C66A)] shadow-[0_8px_24px_-6px_rgba(246,198,106,0.7)] ring-1 ring-white/60"
        : "bg-white shadow-[0_6px_16px_-6px_rgba(0,0,0,0.35)]"
        }`}
    >
      <span className="font-mono text-[13px] font-bold tracking-[0.12em]">{code}</span>
      <span className="h-3.5 w-px bg-[var(--color-brand-navy)]/25" />
      <span className="flex items-center gap-1 text-xs font-semibold" aria-live="polite">
        {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

/**
 * "phone": the WhatsApp number (the main way in), with email and Google
 * folded away below it. "phone-code" / "email-code": the code steps.
 */
type Step = "phone" | "phone-code" | "email-code";

/** A 10-digit Indian mobile number from whatever was typed or pasted (+91, spaces, a leading 0). */
function tenDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

/** "+91 98273 88808", for the code step. */
function displayNumber(ten: string): string {
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

/** Errors after which the email way in is the useful next step: opened for the Studio. */
const OPEN_EMAIL_FOR = new Set(["WHATSAPP_UNDELIVERABLE", "WHATSAPP_SEND_FAILED", "WHATSAPP_NUMBER_AMBIGUOUS"]);

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const redirectTo = sanitizeRedirectPath(search.get("next") ?? search.get("redirect"));
  const oauthFailed = search.get("error") === "auth_failed";

  const invitedBy = useInvitedBy();
  const [step, setStep] = useState<Step>("phone");
  // ?phone= from onboarding's "Sign in with this WhatsApp number instead".
  const [phone, setPhone] = useState(() => tenDigits(search.get("phone") ?? ""));
  const [email, setEmail] = useState("");
  // A failed Google round trip comes back here: its way in stays open.
  const [emailOpen, setEmailOpen] = useState(oauthFailed);
  const [submitting, setSubmitting] = useState<"phone" | "email" | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const googleHref = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/auth/google/studio-login`;
  const phoneReady = phone.length === 10;

  /** The server's own resend cooldown means a code went out seconds ago: go and enter it. */
  const isCooldown = (err: unknown) =>
    err instanceof ApiError && err.status === 429 && !!err.body && typeof err.body === "object" && "retryAfter" in err.body;

  async function handleSendPhoneCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!phoneReady || submitting) return;
    setSubmitting("phone");
    setPhoneError(null);
    try {
      await requestStudioWhatsappOtp(phone);
      setStep("phone-code");
    } catch (err) {
      if (isCooldown(err)) {
        setStep("phone-code");
      } else {
        setPhoneError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
        if (OPEN_EMAIL_FOR.has(apiErrorCode(err) ?? "")) setEmailOpen(true);
      }
    } finally {
      setSubmitting(null);
    }
  }

  async function handleSendEmailCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || submitting) return;
    setSubmitting("email");
    setEmailError(null);
    try {
      await requestStudioOtp(trimmed);
      setEmail(trimmed);
      setStep("email-code");
    } catch (err) {
      if (isCooldown(err)) {
        setEmail(trimmed);
        setStep("email-code");
      } else {
        setEmailError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(null);
    }
  }

  async function signedIn(res: Awaited<ReturnType<typeof verifyStudioOtp>>, method: "whatsapp_otp" | "email_otp") {
    await setToken(res.token);
    setCompany(res.company);
    // A studio that still owes onboarding has just created its account.
    const isNewStudio = needsOnboarding(res.company);
    trackEvent(isNewStudio ? "sign_up" : "login", { method });
    // Which campaign message brought them goes to our own CRM, never to Google. Not awaited: sign in does not wait for it.
    if (isNewStudio) {
      markSignup();
      void sendPendingSignup();
    }
    router.replace(redirectTo);
  }

  /** From a code step back to the first screen; `withEmail` opens the email way in there. */
  function backToStart(withEmail = false) {
    setStep("phone");
    setPhoneError(null);
    setEmailError(null);
    if (withEmail) setEmailOpen(true);
  }

  return (
    <section className="relative flex items-start justify-center bg-[var(--color-brand-surface-raised)] px-5 py-7 sm:items-center sm:px-10 sm:py-10 lg:py-12">
      <div className="w-full min-w-0 max-w-sm">
        {step === "phone" && (
          <>
            {invitedBy && (
              <p className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full bg-[var(--color-brand-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--color-brand-ink)] ring-1 ring-[var(--color-brand-border)]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-navy)]" aria-hidden="true" />
                <span className="truncate">Invited by {invitedBy}</span>
              </p>
            )}
            <div className="space-y-2">
              <h2 className="text-2xl font-bold leading-tight text-[var(--color-brand-ink)] sm:text-[26px]">
                Sign in to your studio
              </h2>
              <p className="text-sm leading-relaxed text-[var(--color-brand-muted)]">
                Enter your WhatsApp number. We&apos;ll send a 6-digit code on WhatsApp. New here? The same code sets up your studio.
              </p>
            </div>

            {oauthFailed && (
              <p className="mt-4">
                <ErrorBanner message="Sign-in didn't complete. Please try again." />
              </p>
            )}

            <form onSubmit={handleSendPhoneCode} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
                  WhatsApp number
                </span>
                <div className="flex h-12 items-center overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] focus-within:border-[var(--color-brand-outline)]">
                  <span className="flex h-full items-center gap-1.5 border-r border-[var(--color-brand-border)] px-3 text-sm font-semibold text-[var(--color-brand-ink)]">
                    <IconWhatsApp size={16} />
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    autoFocus
                    placeholder="98765 43210"
                    aria-label="WhatsApp number"
                    value={phone}
                    onChange={(e) => setPhone(tenDigits(e.target.value))}
                    className="h-full min-w-0 flex-1 bg-transparent px-3 text-base tracking-wide text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/60"
                  />
                </div>
              </label>

              {phoneError && <ErrorBanner message={phoneError} />}

              <button
                type="submit"
                disabled={!phoneReady || submitting !== null}
                className="brand-focus flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting === "phone" ? (
                  <><Spinner />Sending code…</>
                ) : (
                  <>Send code on WhatsApp<IconArrowRight size={15} /></>
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-[var(--color-brand-border)] pt-4">
              <button
                type="button"
                aria-expanded={emailOpen}
                onClick={() => setEmailOpen((open) => !open)}
                className="brand-focus flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-sm font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
              >
                <IconMail size={15} />
                Sign in with email instead
                <IconCaretDown size={13} className={`transition-transform ${emailOpen ? "rotate-180" : ""}`} />
              </button>

              {emailOpen && (
                <div className="dash-rise mt-4 space-y-4">
                  <form onSubmit={handleSendEmailCode} className="space-y-3">
                    <Field
                      label="Email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={setEmail}
                      icon={<IconMail size={16} />}
                    />
                    {emailError && <ErrorBanner message={emailError} />}
                    <button
                      type="submit"
                      disabled={submitting !== null || !email.trim()}
                      className="brand-focus flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-brand-navy)] text-sm font-semibold text-[var(--color-brand-navy)] transition-colors hover:bg-[var(--color-brand-navy-soft)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting === "email" ? <><Spinner />Sending code…</> : <>Email me a code</>}
                    </button>
                  </form>
                  <a
                    href={googleHref}
                    // Google's round trip drops ?next=; park it for /auth/callback.
                    onClick={() => rememberPostLoginRedirect(redirectTo)}
                    className="brand-focus flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-white text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)]"
                  >
                    <IconGoogle size={16} />
                    Continue with Google
                  </a>
                  <p className="text-center text-xs text-[var(--color-brand-muted)]">
                    New here with email? We&apos;ll ask for your WhatsApp number next.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {step === "phone-code" && (
          <>
            <div className="mb-5 space-y-2">
              <h2 className="text-[26px] font-bold leading-tight text-[var(--color-brand-ink)]">Enter the code</h2>
              <p className="text-sm text-[var(--color-brand-muted)]">We sent it on WhatsApp. You&apos;ll stay signed in on this device.</p>
            </div>
            <OtpCodeStep
              destination={displayNumber(phone)}
              onBack={() => backToStart()}
              onVerify={async (code) => signedIn(await verifyStudioWhatsappOtp(phone, code), "whatsapp_otp")}
              onResend={() => requestStudioWhatsappOtp(phone)}
            />
            <p className="pt-4 text-center text-xs text-[var(--color-brand-muted)]">
              Didn&apos;t get it?{" "}
              <button
                type="button"
                onClick={() => backToStart(true)}
                className="brand-focus rounded font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
              >
                Sign in with email instead
              </button>
            </p>
          </>
        )}

        {step === "email-code" && (
          <>
            <div className="mb-5 space-y-2">
              <h2 className="text-[26px] font-bold leading-tight text-[var(--color-brand-ink)]">Enter your code</h2>
              <p className="text-sm text-[var(--color-brand-muted)]">You&apos;ll stay signed in on this device.</p>
            </div>
            <OtpCodeStep
              destination={email}
              onBack={() => backToStart(true)}
              onVerify={async (code) => signedIn(await verifyStudioOtp(email, code), "email_otp")}
              onResend={() => requestStudioOtp(email)}
            />
            <p className="pt-4 text-center text-xs text-[var(--color-brand-muted)]">
              Can&apos;t find it? Check your spam folder, or sign in with WhatsApp instead.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The name of the studio whose Referral link brought this visitor, or null.
 * The code was kept by ReferralCapture (lib/referral.ts); it is captured here
 * too in case this effect runs first. An unknown code shows nothing.
 */
function useInvitedBy(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    captureReferralFromUrl();
    const stored = getStoredReferral();
    if (!stored) return;
    let cancelled = false;
    resolveReferral(stored.code)
      .then((res) => {
        if (!cancelled && res.valid && res.studio_name) setName(res.studio_name);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []);
  return name;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]"
    >
      <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function Field({ label, type, autoComplete, required, value, onChange, icon }: {
  label: string; type: string; autoComplete: string; required?: boolean; value: string; onChange: (v: string) => void; icon: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {label}
      </span>
      <div className="group relative flex h-11 items-center rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] focus-within:border-[var(--color-brand-outline)]">
        <span className="pointer-events-none flex h-full w-10 items-center justify-center text-[var(--color-brand-muted)]">
          {icon}
        </span>
        <input
          type={type}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full flex-1 bg-transparent pr-3 text-sm text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
        />
      </div>
    </label>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
