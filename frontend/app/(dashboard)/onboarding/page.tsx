"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { isAuthenticated, getCompany, setCompany, needsOnboarding } from "@/lib/auth";
import { getCompanyDetails } from "@/lib/api";
import type { Company } from "@/lib/types";
import { StudioDetailsStep } from "@/components/onboarding/StudioDetailsStep";
import { WhatsappOtpStep } from "@/components/onboarding/WhatsappOtpStep";
import type { StudioDetailsInput } from "@/lib/api";

type Step = "details" | "otp";
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

/**
 * Onboarding is one step since WhatsApp sign-in (2026-11): studio name and
 * city (how they heard and a Referral code optional). A Studio that signed up
 * by email or Google also verifies its WhatsApp number, a second step. The
 * Google Business step is gone (Settings still has it). Paying is not a step
 * either: the dashboard offers the free first event next.
 */
function OnboardingProgress({ step, total }: { step: Step; total: number }) {
  const current = step === "otp" ? 2 : 1;
  if (total < 2) return null;
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs text-[var(--color-brand-muted)]">Step {current} of {total}</p>
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Studio setup progress"
        className="flex gap-1.5"
      >
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <span
            key={n}
            className={`h-1 flex-1 rounded-full ${
              n <= current ? "bg-[var(--color-brand-navy)]" : "bg-[var(--color-brand-border)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [company, setCompanyState] = useState<Company | null>(null);
  const [step, setStep] = useState<Step>("details");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [details, setDetails] = useState<StudioDetailsInput | null>(null);
  // Signed up by WhatsApp: the number is already the Studio's, verified.
  const [needsNumber, setNeedsNumber] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login?next=/onboarding");
      return;
    }

    // Resume logic — this is what makes a mid-flow refresh land back on the
    // right step instead of restarting at "details" or bouncing to /dashboard.
    function proceed(c: Company) {
      if (!needsOnboarding(c)) {
        router.replace("/dashboard");
        return;
      }
      setNeedsNumber(!c.whatsapp_verified);
      setStep("details");
      setCompanyState(c);
      setLoad({ status: "ready" });
    }

    const cached = getCompany();
    if (cached) {
      proceed(cached);
    } else {
      getCompanyDetails()
        .then((res) => {
          setCompany(res.company);
          proceed(res.company);
        })
        .catch((err) => {
          setLoad({
            status: "error",
            message: err instanceof Error ? err.message : "Couldn't load your studio details.",
          });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish(updatedCompany: Company) {
    setCompany(updatedCompany);
    setCompanyState(updatedCompany);
    // The existing event for the end of onboarding; not duplicated under a second name.
    trackEvent("onboarding_complete");
    // Straight to the dashboard, which opens on the free first event.
    router.replace("/dashboard");
  }

  if (load.status === "loading" || !company) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-brand-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          <p className="text-sm text-[var(--color-brand-muted)]">Loading your studio…</p>
        </div>
      </main>
    );
  }

  if (load.status === "error") {
    return (
      <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-3 bg-[var(--color-brand-bg)] px-6 text-center">
        <p className="text-sm text-[var(--color-brand-danger)]">{load.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="brand-focus inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)]"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-1 items-start justify-center bg-[var(--color-brand-bg)] px-4 py-6 sm:items-center sm:px-6 sm:py-12">
      <div className="w-full max-w-md dash-rise">
        <div className="mb-5 flex flex-col items-center gap-3 sm:mb-8">
          <img src="/vyavasth-full-logo.svg" alt="Vyavasth" className="h-12 w-auto sm:h-20" />
        </div>

        <OnboardingProgress step={step} total={needsNumber ? 2 : 1} />

        <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-6 shadow-[0_4px_12px_rgba(42,34,24,0.08)] sm:p-9">
          {step === "details" || !details ? (
            <StudioDetailsStep
              needsNumber={needsNumber}
              initial={details ? { details, phone: whatsappNumber } : null}
              onSent={(answers, phone) => {
                trackEvent("onboarding_step_completed", { step: "studio_details" });
                setDetails(answers);
                setWhatsappNumber(phone);
                setStep("otp");
              }}
              onSaved={(updatedCompany) => {
                trackEvent("onboarding_step_completed", { step: "studio_details" });
                finish(updatedCompany);
              }}
            />
          ) : (
            <WhatsappOtpStep
              whatsappNumber={whatsappNumber}
              details={details}
              onBack={() => setStep("details")}
              onVerified={(updatedCompany) => {
                trackEvent("onboarding_step_completed", { step: "whatsapp_verified" });
                finish(updatedCompany);
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
