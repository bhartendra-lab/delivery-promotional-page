"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/api";
import { setToken, setCompany } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";

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
    <aside className="relative hidden overflow-hidden lg:col-span-2 lg:flex lg:flex-col lg:justify-between lg:px-10 lg:py-12 bg-[#FDF7ED]">
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
        <Logo size={36} />
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
              className="rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-3 py-3"
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

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const redirectTo = search.get("redirect") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await login(email, password);
      setToken(res.token);
      setCompany(res.company);
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="relative col-span-1 flex items-center justify-center bg-[var(--color-brand-bg)] px-6 py-12 sm:px-12 lg:col-span-3">
      <div className="w-full max-w-md dash-rise">
        {/* Mobile-only brand block */}
        <div className="mb-10 flex flex-col items-center gap-3 lg:hidden">
          <Logo size={36} />
        </div>

        <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-7 shadow-[0_4px_12px_rgba(42,34,24,0.08)] sm:p-9">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-brand-muted)]">
              Welcome back
            </p>
            <h2 className="text-2xl font-bold text-[var(--color-brand-ink)]">
              Sign in to your studio
            </h2>
            <p className="text-sm text-[var(--color-brand-muted)]">
              Manage delivery pages and track client engagement.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={setEmail}
              icon={<MailIcon />}
            />
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={setPassword}
              icon={<LockIcon />}
            />

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]"
              >
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="brand-focus flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <><Spinner />Signing in…</>
              ) : (
                <>Sign in<ArrowRight /></>
              )}
            </button>

            <p className="pt-1 text-center text-xs text-[var(--color-brand-muted)]">
              Trouble signing in? Reach out to your account manager.
            </p>
          </form>
        </div>
      </div>
    </section>
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

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10V7a4 4 0 118 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 8v5M12 16.5v.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
