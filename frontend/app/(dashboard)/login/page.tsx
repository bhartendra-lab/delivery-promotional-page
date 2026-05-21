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
    <aside className="brand-aurora relative hidden overflow-hidden lg:col-span-2 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
      {/* Decorative concentric arcs */}
      <div className="pointer-events-none absolute inset-0 opacity-25">
        <svg
          viewBox="0 0 600 600"
          className="absolute -right-40 top-1/2 h-[900px] w-[900px] -translate-y-1/2"
        >
          <g fill="none" stroke="#d4af63" strokeWidth="1">
            {[120, 180, 240, 300, 360, 420, 480].map((r) => (
              <circle key={r} cx="300" cy="300" r={r} opacity="0.5" />
            ))}
          </g>
        </svg>
      </div>

      {/* Top: brand mark */}
      <div className="relative dash-rise">
        <Logo size={48} withWordmark onDark />
      </div>

      {/* Middle: tagline */}
      <div className="relative space-y-6 text-white">
        <p
          className="text-xs font-medium uppercase tracking-[0.4em] text-[#d4af63] dash-rise"
          style={{ animationDelay: "0.1s" }}
        >
          For Photography Studios
        </p>
        <h1
          className="text-4xl font-light leading-[1.1] dash-rise lg:text-5xl"
          style={{ animationDelay: "0.18s", fontFamily: "var(--font-cormorant)" }}
        >
          Deliver photographs
          <br />
          your clients <em className="text-[#d4af63]">remember</em>.
        </h1>
        <p
          className="max-w-md text-base leading-relaxed text-white/85 dash-rise"
          style={{ animationDelay: "0.26s" }}
        >
          Branded delivery pages, deeply trackable. Send one link — see every
          visit, every click, every review.
        </p>

        <div
          className="grid grid-cols-3 gap-4 pt-6 dash-rise"
          style={{ animationDelay: "0.34s" }}
        >
          {[
            { label: "Delivery links", value: "1-click" },
            { label: "Tracking", value: "Real-time" },
            { label: "Branding", value: "Per studio" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-sm"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/65">
                {s.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#d4af63]">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: small caption */}
      <p
        className="relative text-xs text-white/60 dash-rise"
        style={{ animationDelay: "0.42s" }}
      >
        © {new Date().getFullYear()} Vyavasth · Crafted for studios
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
          <Logo size={48} withWordmark />
        </div>

        <div className="rounded-2xl border border-[var(--color-brand-border)] bg-white p-8 shadow-[0_24px_60px_-30px_rgba(15,45,92,0.25)] sm:p-10">
          <div className="space-y-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-brand-gold)]">
              Welcome back
            </p>
            <h2
              className="text-3xl font-semibold tracking-tight text-[var(--color-brand-ink)]"
              style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
            >
              Sign in to your studio
            </h2>
            <p className="text-sm text-[var(--color-brand-muted)]">
              Manage delivery pages, track engagement, and ship beautiful links.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
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
              className="brand-focus group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--color-brand-navy)] text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(15,45,92,0.5)] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/15 transition-transform duration-700 group-hover:translate-x-[400%]"
              />
              {submitting ? (
                <>
                  <Spinner />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight />
                </>
              )}
            </button>

            <p className="pt-2 text-center text-xs text-[var(--color-brand-muted)]">
              Trouble signing in? Reach out to your account manager.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  type,
  autoComplete,
  required,
  value,
  onChange,
  icon,
}: {
  label: string;
  type: string;
  autoComplete: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {label}
      </span>
      <div className="group relative flex h-12 items-center rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] focus-within:border-[var(--color-brand-navy)] focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(15,45,92,0.1)]">
        <span className="pointer-events-none flex h-full w-11 items-center justify-center text-[var(--color-brand-muted)] transition-colors group-focus-within:text-[var(--color-brand-navy)]">
          {icon}
        </span>
        <input
          type={type}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full flex-1 bg-transparent pr-3 text-base text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
        />
      </div>
    </label>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M4 7l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect
        x="4"
        y="10"
        width="16"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 10V7a4 4 0 118 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 8v5M12 16.5v.01"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 00-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
