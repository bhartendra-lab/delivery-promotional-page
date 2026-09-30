"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestStudioOtp, verifyStudioOtp, ApiError } from "@/lib/api";
import { setToken, setCompany, sanitizeRedirectPath } from "@/lib/auth";
import { IconMail, IconWarningCircle, IconArrowRight, IconGoogle } from "@/components/ui/icons";
import { OtpCodeStep } from "@/app/(dashboard)/dashboard/settings/OtpCodeStep";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginShell />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--color-brand-bg)]">
      <p className="text-sm text-[var(--color-brand-muted)]">Loading…</p>
    </main>
  );
}

function LoginShell() {
  return (
    <main className="grid min-h-screen flex-1 grid-cols-1 lg:grid-cols-5">
      <BrandPanel />
      <LoginForm />
    </main>
  );
}

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden lg:col-span-2 lg:flex lg:flex-col lg:justify-between lg:px-10 lg:py-12 bg-[#FAFAF8]">
      {/* Subtle terracotta arc decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg viewBox="0 0 500 700" className="absolute -right-20 top-0 h-full opacity-[0.06]" fill="none">
          {[80, 140, 200, 260, 320].map((r) => (
            <circle key={r} cx="500" cy="350" r={r} stroke="#C25A3A" strokeWidth="1.5" />
          ))}
        </svg>
      </div>

      {/* Top: logo */}
      <div className="relative">
        <img src="/vyavasth-full-logo.svg" alt="Vyavasth" height={100} />
      </div>

      {/* Middle: tagline */}
      <div className="relative space-y-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[var(--color-brand-navy)]">
          For Photography Studios
        </p>
        <h1 className="text-4xl font-bold leading-[1.15] text-[var(--color-brand-ink)] lg:text-5xl">
          Deliver photographs<br />
          your clients <span className="text-[var(--color-brand-navy)]">remember.</span>
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-[var(--color-brand-muted)]">
          Branded delivery pages, deeply trackable. Send one link — see every visit, every click, every review.
        </p>

        <div className="grid grid-cols-3 gap-3 pt-4">
          {[
            { label: "Delivery links", value: "1-click" },
            { label: "Tracking", value: "Real-time" },
            { label: "Branding", value: "Per studio" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3 py-3"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-brand-muted)]">
                {s.label}
              </p>
              <p className="mt-1 text-sm font-bold text-[var(--color-brand-navy)]">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: caption */}
      <p className="relative text-xs text-[var(--color-brand-muted)]">
        © {new Date().getFullYear()} Vyavasth · Made for studios
      </p>
    </aside>
  );
}

type Step = "email" | "code";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const redirectTo = sanitizeRedirectPath(search.get("next") ?? search.get("redirect"));
  const oauthFailed = search.get("error") === "auth_failed";

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
    <section className="relative col-span-1 flex items-center justify-center bg-[var(--color-brand-bg)] px-6 py-12 sm:px-12 lg:col-span-3">
      <div className="w-full max-w-md dash-rise">
        {/* Mobile-only brand block */}
        <div className="mb-10 flex flex-col items-center gap-3 lg:hidden">
          <img src="/vyavasth-full-logo.svg" alt="Vyavasth" height={100} />
        </div>

        <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-7 shadow-[0_4px_12px_rgba(42,34,24,0.08)] sm:p-9">
          {step === "email" && (
            <>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-brand-muted)]">
                  Get started
                </p>
                <h2 className="text-2xl font-bold text-[var(--color-brand-ink)]">
                  Sign in to your studio
                </h2>
                <p className="text-sm text-[var(--color-brand-muted)]">
                  Enter your email and we&apos;ll send you a 6-digit code. New here? The same code sets up your studio.
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

              <p className="pt-4 text-center text-xs text-[var(--color-brand-muted)]">
                Trouble signing in? Reach out to your account manager.
              </p>
            </>
          )}

          {step === "code" && (
            <>
              <div className="mb-5 space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-brand-muted)]">
                  Check your inbox
                </p>
                <h2 className="text-2xl font-bold text-[var(--color-brand-ink)]">
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
      </div>
    </section>
  );
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
