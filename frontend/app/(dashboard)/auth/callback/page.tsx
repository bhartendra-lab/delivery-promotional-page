"use client";

import { useEffect } from "react";
import { setToken, setCompany, needsOnboarding } from "@/lib/auth";
import { getCompanyDetails } from "@/lib/api";

/**
 * Studio-side Google SSO landing target — the backend redirects here as
 * `/auth/callback?token=<JWT>` after Google sign-in completes (see
 * googleCallback in the backend's auth.controller.js). Distinct from the
 * guest-facing client-gallery callback under app/(client)/, which uses a
 * different token store (localStorage vs. this cookie-based one).
 */
export default function StudioAuthCallbackPage() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      window.location.replace("/login?error=auth_failed");
      return;
    }
    setToken(token);
    getCompanyDetails()
      .then(({ company }) => {
        setCompany(company);
        const dest = needsOnboarding(company) ? "/onboarding" : "/dashboard";
        window.location.replace(dest);
      })
      .catch(() => {
        window.location.replace("/login?error=auth_failed");
      });
  }, []);

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-brand-bg)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
        <p className="text-sm text-[var(--color-brand-muted)]">Signing you in…</p>
      </div>
    </main>
  );
}
