"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getCompany, setCompany, needsOnboarding } from "@/lib/auth";
import { getCompanyDetails } from "@/lib/api";
import type { Company } from "@/lib/types";
import { StudioDetailsStep } from "@/components/onboarding/StudioDetailsStep";
import { WhatsappOtpStep } from "@/components/onboarding/WhatsappOtpStep";
import { GoogleBusinessStep } from "@/components/onboarding/GoogleBusinessStep";

type Step = "details" | "otp" | "google";
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

const STEP_INDEX: Record<Step, number> = { details: 1, otp: 2, google: 3 };

function OnboardingProgress({ step }: { step: Step }) {
  const current = STEP_INDEX[step];
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs text-[var(--color-brand-muted)]">Step {current} of 3</p>
      <div
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={3}
        aria-label="Studio setup progress"
        className="flex gap-1.5"
      >
        {[1, 2, 3].map((n) => (
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
  const [studioName, setStudioName] = useState("");

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
      setStep(c.whatsapp_verified ? "google" : "details");
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
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-brand-bg)] px-6 py-12">
      <div className="w-full max-w-md dash-rise">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/vyavasth-full-logo.svg" alt="Vyavasth" height={80} />
        </div>

        <OnboardingProgress step={step} />

        <div className="rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-7 shadow-[0_4px_12px_rgba(42,34,24,0.08)] sm:p-9">
          {step === "details" ? (
            <StudioDetailsStep
              onSent={(name, phone) => {
                setStudioName(name);
                setWhatsappNumber(phone);
                setStep("otp");
              }}
            />
          ) : step === "otp" ? (
            <WhatsappOtpStep
              whatsappNumber={whatsappNumber}
              studioName={studioName}
              onBack={() => setStep("details")}
              onVerified={(updatedCompany) => {
                setCompany(updatedCompany);
                setCompanyState(updatedCompany);
                setStep("google");
              }}
            />
          ) : (
            <GoogleBusinessStep
              onDone={(updatedCompany) => {
                setCompany(updatedCompany);
                router.replace("/dashboard");
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}
