"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { checkResetLink, resetPassword } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { Logo } from "@/components/ui/Logo";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PageFallback />}>
      <PageShell />
    </Suspense>
  );
}

function PageFallback() {
  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--color-brand-bg)]">
      <p className="text-sm text-[var(--color-brand-muted)]">Loading…</p>
    </main>
  );
}

type LinkStatus = "checking" | "valid" | "used" | "deactivated" | "invalid";

function PageShell() {
  const params = useSearchParams();
  const userId = params.get("user_id");
  const [linkStatus, setLinkStatus] = useState<LinkStatus>(
    userId ? "checking" : "invalid"
  );

  useEffect(() => {
    if (!userId) return;
    checkResetLink(userId)
      .then(() => setLinkStatus("valid"))
      .catch((err) => {
        const msg: string = err instanceof Error ? err.message : "";
        if (msg.includes("already been used")) setLinkStatus("used");
        else if (msg.includes("deactivated")) setLinkStatus("deactivated");
        else setLinkStatus("invalid");
      });
  }, [userId]);

  const rightPanel = () => {
    switch (linkStatus) {
      case "checking":
        return <LinkCheckingView />;
      case "valid":
        return <SetPasswordForm userId={userId!} />;
      case "used":
        return <InvalidLinkView reason="used" />;
      case "deactivated":
        return <InvalidLinkView reason="deactivated" />;
      default:
        return <InvalidLinkView reason="no-id" />;
    }
  };

  return (
    <main className="grid min-h-screen flex-1 grid-cols-1 lg:grid-cols-5">
      <BrandPanel />
      {rightPanel()}
    </main>
  );
}

/* ─── Brand Panel ──────────────────────────────────────────────────── */

function BrandPanel() {
  return (
    <aside className="brand-aurora relative hidden overflow-hidden lg:col-span-2 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-12">
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

      <div className="relative dash-rise">
        <Logo size={48} withWordmark onDark />
      </div>

      <div className="relative space-y-6 text-white">
        <p
          className="text-xs font-medium uppercase tracking-[0.4em] text-[#d4af63] dash-rise"
          style={{ animationDelay: "0.1s" }}
        >
          Welcome aboard
        </p>
        <h1
          className="text-4xl font-light leading-[1.1] dash-rise lg:text-5xl"
          style={{ animationDelay: "0.18s", fontFamily: "var(--font-cormorant)" }}
        >
          Your studio account
          <br />
          is <em className="text-[#d4af63]">ready</em>.
        </h1>
        <p
          className="max-w-md text-base leading-relaxed text-white/85 dash-rise"
          style={{ animationDelay: "0.26s" }}
        >
          Set a secure password to activate your account and start delivering
          beautiful, trackable photo links to your clients.
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

      <p
        className="relative text-xs text-white/60 dash-rise"
        style={{ animationDelay: "0.42s" }}
      >
        © {new Date().getFullYear()} Vyavasth · Crafted for studios
      </p>
    </aside>
  );
}

/* ─── Link Checking View ───────────────────────────────────────────── */

function LinkCheckingView() {
  return (
    <section className="col-span-1 flex items-center justify-center bg-[var(--color-brand-bg)] px-6 py-12 sm:px-12 lg:col-span-3">
      <div className="flex flex-col items-center gap-4 dash-rise">
        <Spinner className="h-6 w-6 text-[var(--color-brand-navy)]" />
        <p className="text-sm text-[var(--color-brand-muted)]">Verifying your link…</p>
      </div>
    </section>
  );
}

/* ─── Set Password Form ────────────────────────────────────────────── */

type PageState = "form" | "submitting" | "success" | "link_used" | "deactivated";

function SetPasswordForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [state, setState] = useState<PageState>("form");
  const [error, setError] = useState<string | null>(null);

  const strength = getStrength(password);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError(null);
    setState("submitting");
    try {
      const res = await resetPassword(userId, password);
      setToken(res.token);
      setState("success");
      setTimeout(() => router.replace("/dashboard"), 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      if (message.includes("already been used") || message.includes("409")) {
        setState("link_used");
      } else if (message.includes("deactivated") || message.includes("403")) {
        setState("deactivated");
      } else {
        setState("form");
        setError(message);
      }
    }
  }

  if (state === "success") return <SuccessView />;
  if (state === "link_used") return <InvalidLinkView reason="used" />;
  if (state === "deactivated") return <InvalidLinkView reason="deactivated" />;

  return (
    <section className="relative col-span-1 flex items-center justify-center bg-[var(--color-brand-bg)] px-6 py-12 sm:px-12 lg:col-span-3">
      <div className="w-full max-w-md dash-rise">
        {/* Mobile-only brand */}
        <div className="mb-10 flex flex-col items-center gap-3 lg:hidden">
          <Logo size={48} withWordmark />
        </div>

        <div className="rounded-2xl border border-[var(--color-brand-border)] bg-white p-8 shadow-[0_24px_60px_-30px_rgba(15,45,92,0.25)] sm:p-10">
          <div className="space-y-2 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-brand-navy)]/8">
              <KeyIcon className="h-6 w-6 text-[var(--color-brand-navy)]" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-brand-gold)]">
              Account setup
            </p>
            <h2
              className="text-3xl font-semibold tracking-tight text-[var(--color-brand-ink)]"
              style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
            >
              Set your password
            </h2>
            <p className="text-sm text-[var(--color-brand-muted)]">
              Choose a strong password to activate your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Password field */}
            <div>
              <PasswordField
                label="New password"
                value={password}
                onChange={setPassword}
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                autoComplete="new-password"
              />
              {/* Strength bar */}
              {password.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{
                          backgroundColor:
                            i <= strength.score
                              ? strength.color
                              : "var(--color-brand-border)",
                        }}
                      />
                    ))}
                  </div>
                  <p
                    className="text-right text-[11px] font-medium transition-colors"
                    style={{ color: strength.color }}
                  >
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm field */}
            <div>
              <PasswordField
                label="Confirm password"
                value={confirm}
                onChange={setConfirm}
                show={showConfirm}
                onToggleShow={() => setShowConfirm((v) => !v)}
                autoComplete="new-password"
                hasError={mismatch}
              />
              {mismatch && (
                <p className="mt-1.5 text-xs text-[var(--color-brand-danger)]">
                  Passwords do not match.
                </p>
              )}
            </div>

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
              disabled={state === "submitting" || mismatch || password.length < 6}
              className="brand-focus group relative mt-2 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-[var(--color-brand-navy)] text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(15,45,92,0.5)] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/15 transition-transform duration-700 group-hover:translate-x-[400%]"
              />
              {state === "submitting" ? (
                <>
                  <Spinner />
                  Setting password…
                </>
              ) : (
                <>
                  Activate my account
                  <ArrowRight />
                </>
              )}
            </button>

            <p className="pt-1 text-center text-xs text-[var(--color-brand-muted)]">
              Already have a password?{" "}
              <a
                href="/login"
                className="font-medium text-[var(--color-brand-navy)] underline-offset-2 hover:underline"
              >
                Sign in
              </a>
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

/* ─── Success View ─────────────────────────────────────────────────── */

function SuccessView() {
  return (
    <section className="col-span-1 flex items-center justify-center bg-[var(--color-brand-bg)] px-6 py-12 sm:px-12 lg:col-span-3">
      <div className="w-full max-w-md dash-rise">
        <div className="rounded-2xl border border-[var(--color-brand-border)] bg-white p-10 text-center shadow-[0_24px_60px_-30px_rgba(15,45,92,0.25)]">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#38a169]/10">
            <CheckIcon className="h-8 w-8 text-[#38a169]" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-brand-gold)]">
            All set
          </p>
          <h2
            className="mt-2 text-3xl font-semibold text-[var(--color-brand-ink)]"
            style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
          >
            Password created
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-brand-muted)]">
            Your account is now active. Taking you to your dashboard…
          </p>
          <div className="mt-6 flex justify-center">
            <Spinner className="text-[var(--color-brand-navy)]" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Invalid / Used Link View ─────────────────────────────────────── */

function InvalidLinkView({
  reason,
}: {
  reason: "no-id" | "used" | "deactivated";
}) {
  const content = {
    "no-id": {
      icon: <LinkBrokenIcon className="h-8 w-8 text-[var(--color-brand-danger)]" />,
      iconBg: "bg-[var(--color-brand-danger)]/10",
      badge: "Invalid link",
      heading: "This link isn't valid",
      body: "The password setup link appears to be malformed or incomplete. Please use the link from your invitation email, or contact your account manager.",
    },
    used: {
      icon: <ShieldCheckIcon className="h-8 w-8 text-[var(--color-brand-gold)]" />,
      iconBg: "bg-[var(--color-brand-gold)]/10",
      badge: "Link expired",
      heading: "Password already set",
      body: "This setup link has already been used. Your account is active — sign in with your existing password.",
    },
    deactivated: {
      icon: <LinkBrokenIcon className="h-8 w-8 text-[var(--color-brand-danger)]" />,
      iconBg: "bg-[var(--color-brand-danger)]/10",
      badge: "Account inactive",
      heading: "Account deactivated",
      body: "Your account has been deactivated. Please contact your administrator.",
    },
  }[reason];

  return (
    <section className="col-span-1 flex items-center justify-center bg-[var(--color-brand-bg)] px-6 py-12 sm:px-12 lg:col-span-3">
      <div className="w-full max-w-md dash-rise">
        <div className="rounded-2xl border border-[var(--color-brand-border)] bg-white p-10 text-center shadow-[0_24px_60px_-30px_rgba(15,45,92,0.25)]">
          <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl ${content.iconBg}`}>
            {content.icon}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-brand-muted)]">
            {content.badge}
          </p>
          <h2
            className="mt-2 text-3xl font-semibold text-[var(--color-brand-ink)]"
            style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
          >
            {content.heading}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-brand-muted)]">
            {content.body}
          </p>
          <a
            href="/login"
            className="brand-focus mt-8 inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-navy)] px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(15,45,92,0.5)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            Go to sign in
            <ArrowRight />
          </a>
          <p className="mt-4 text-xs text-[var(--color-brand-muted)]">
            Need help? Reach out to your account manager.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Password Field ───────────────────────────────────────────────── */

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  hasError = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoComplete?: string;
  hasError?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand-muted)]">
        {label}
      </span>
      <div
        className={`group relative flex h-12 items-center rounded-xl border bg-[var(--color-brand-bg)] transition-shadow focus-within:bg-white focus-within:shadow-[0_0_0_3px_rgba(15,45,92,0.1)] ${
          hasError
            ? "border-[var(--color-brand-danger)] focus-within:border-[var(--color-brand-danger)]"
            : "border-[var(--color-brand-border)] focus-within:border-[var(--color-brand-navy)]"
        }`}
      >
        <span className="pointer-events-none flex h-full w-11 items-center justify-center text-[var(--color-brand-muted)] transition-colors group-focus-within:text-[var(--color-brand-navy)]">
          <LockIcon />
        </span>
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full flex-1 bg-transparent text-base text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]/70"
        />
        <button
          type="button"
          onClick={onToggleShow}
          tabIndex={-1}
          className="flex h-full w-11 shrink-0 items-center justify-center text-[var(--color-brand-muted)] transition-colors hover:text-[var(--color-brand-navy)]"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  );
}

/* ─── Password strength ────────────────────────────────────────────── */

type StrengthResult = { score: 0 | 1 | 2 | 3; label: string; color: string };

function getStrength(p: string): StrengthResult {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
  const score = Math.min(s, 3) as 0 | 1 | 2 | 3;
  const map: [string, string][] = [
    ["Weak", "#e53e3e"],
    ["Fair", "#dd6b20"],
    ["Good", "#d4af63"],
    ["Strong", "#38a169"],
  ];
  return { score, label: map[score][0], color: map[score][1] };
}

/* ─── Icons ────────────────────────────────────────────────────────── */

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10V7a4 4 0 118 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 11l8-8M18 6l2 2M15 9l2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-11-7-11-7a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 7 11 7a18.5 18.5 0 01-2.16 3.19M3 3l18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.73 10.73a3 3 0 004.24 4.24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkBrokenIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9 15l6-6M11 6H7a5 5 0 000 10h1M13 18h4a5 5 0 000-10h-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.38C16.5 22.15 20 17.25 20 12V6l-8-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin ${className ?? ""}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
