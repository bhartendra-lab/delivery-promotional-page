"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestStudioOtp, verifyStudioOtp, resolveReferral, ApiError } from "@/lib/api";
import { getPublicCoupons } from "@/lib/billing";
import type { PublicCoupon } from "@/lib/billing";
import { formatOfferDate } from "@/lib/plans";
import { captureReferralFromUrl, getStoredReferral } from "@/lib/referral";
import { setToken, setCompany, sanitizeRedirectPath } from "@/lib/auth";
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
} from "@/components/ui/icons";
import { OtpCodeStep } from "@/app/(dashboard)/dashboard/settings/OtpCodeStep";
import { SpaceBackdrop } from "./SpaceBackdrop";

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

function LoginShell() {
  const offers = useLoginOffers();
  return (
    <main className="relative flex min-h-dvh w-full items-start justify-center overflow-hidden bg-[#4A2618] px-3 py-4 sm:items-center sm:px-6 sm:py-8 lg:px-10 lg:py-12">
      <SpaceBackdrop />
      <div className="dash-rise relative z-10 grid w-full max-w-[960px] grid-cols-1 overflow-hidden rounded-2xl shadow-[0_40px_100px_-24px_rgba(0,0,0,0.7)] ring-1 ring-white/10 lg:min-h-[540px] lg:grid-cols-2">
        <OfferPanel offers={offers} />
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
};

/** Shown when nothing is showcased or the offers could not load: no code, nothing to go stale. */
const BRAND_SLIDE: OfferSlide = {
  id: "brand",
  headline: "Your wedding galleries, delivered",
  subline: "Every guest finds their photos.",
  code: null,
  until: null,
};

function OfferPanel({ offers }: { offers: LoginOffers }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const slides: OfferSlide[] = offers.coupons.length
    ? offers.coupons.map((coupon) => ({
        id: coupon.code,
        headline: coupon.headline ?? "",
        subline: coupon.subline,
        code: coupon.code,
        until: coupon.valid_until != null ? formatOfferDate(coupon.valid_until) : null,
      }))
    : [BRAND_SLIDE];
  const autoplay = !reducedMotion && slides.length > 1;
  const current = Math.min(index, slides.length - 1);

  const go = (step: number) => setIndex((i) => (Math.min(i, slides.length - 1) + step + slides.length) % slides.length);

  return (
    <aside className="group relative flex flex-col overflow-clip bg-[linear-gradient(150deg,#CF6646_0%,var(--color-brand-navy)_45%,var(--color-brand-navy-deep)_100%)] px-5 py-5 text-white sm:px-10 sm:py-9">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(255,236,224,0.35),transparent)]" />
        <Grain className="opacity-[0.12]" />
      </div>

      <div className="relative flex items-center gap-2">
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
              className={`[grid-area:1/1] transition-[opacity,transform] duration-500 ease-out ${
                active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
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
                      className={`absolute inset-0 rounded-full bg-white ${autoplay ? "offer-progress" : ""}`}
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
function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `Copied ${code}` : `Copy code ${code}`}
      className="brand-focus inline-flex items-center gap-2.5 rounded-full bg-white px-3.5 py-2 text-[var(--color-brand-navy-deep)] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-px active:translate-y-0"
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

type Step = "email" | "code";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const redirectTo = sanitizeRedirectPath(search.get("next") ?? search.get("redirect"));
  const oauthFailed = search.get("error") === "auth_failed";

  const invitedBy = useInvitedBy();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleHref = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/auth/google/studio-login`;

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestStudioOtp(trimmed);
      setEmail(trimmed);
      setStep("code");
    } catch (err) {
      // The server's resend cooldown (it carries `retryAfter`; the IP rate
      // limiter's 429 doesn't) means a code went to this address seconds ago —
      // typically "Back" then "Send code" again. That code is still good, so
      // go and enter it.
      if (err instanceof ApiError && err.status === 429 && err.body && typeof err.body === "object" && "retryAfter" in err.body) {
        setEmail(trimmed);
        setStep("code");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(code: string) {
    // Throws on a bad code; OtpCodeStep shows the message and clears the boxes.
    const res = await verifyStudioOtp(email, code);
    await setToken(res.token);
    setCompany(res.company);
    router.replace(redirectTo);
  }

  function backToEmail() {
    setStep("email");
    setError(null);
  }

  return (
    <section className="relative flex items-center justify-center bg-[var(--color-brand-surface-raised)] px-5 py-8 sm:px-10 sm:py-10 lg:py-12">
      <div className="w-full min-w-0 max-w-sm">
        {step === "email" && (
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
                We&apos;ll email you a 6-digit code. New here? The same code sets up your studio.
              </p>
            </div>

            {oauthFailed && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]"
              >
                <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Sign-in didn&apos;t complete. Please try again.</span>
              </p>
            )}

            <form onSubmit={handleSendCode} className="mt-7 space-y-4">
              <Field
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={setEmail}
                icon={<IconMail size={16} />}
              />

              {error && <ErrorBanner message={error} />}

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="brand-focus flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <><Spinner />Sending code…</>
                ) : (
                  <>Send code<IconArrowRight size={15} /></>
                )}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--color-brand-border)]" />
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-brand-muted)]">or</span>
              <span className="h-px flex-1 bg-[var(--color-brand-border)]" />
            </div>

            <a
              href={googleHref}
              className="brand-focus flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--color-brand-border)] bg-white text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)]"
            >
              <IconGoogle size={16} />
              Continue with Google
            </a>

            <p className="pt-5 text-center text-xs text-[var(--color-brand-muted)]">
              Trouble signing in? Reach out to your account manager.
            </p>
          </>
        )}

        {step === "code" && (
          <>
            <div className="mb-5 space-y-2">
              <h2 className="text-[26px] font-bold leading-tight text-[var(--color-brand-ink)]">
                Enter your code
              </h2>
              <p className="text-sm text-[var(--color-brand-muted)]">
                You&apos;ll stay signed in on this device.
              </p>
            </div>

            <OtpCodeStep
              destination={email}
              onBack={backToEmail}
              onVerify={handleVerify}
              onResend={() => requestStudioOtp(email)}
            />

            <p className="pt-4 text-center text-xs text-[var(--color-brand-muted)]">
              Can&apos;t find it? Check your spam folder, or reach out to your account manager.
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
      .catch(() => {});
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
