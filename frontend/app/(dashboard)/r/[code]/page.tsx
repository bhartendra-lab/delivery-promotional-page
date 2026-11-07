"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { storeReferral } from "@/lib/referral";

/**
 * The short referral link, /r/PIXL7K2Q: keeps the code (first touch wins, see
 * lib/referral.ts) and goes on to sign-in, where "Invited by ..." is shown.
 */
export default function ReferralShortLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();

  useEffect(() => {
    storeReferral(decodeURIComponent(code));
    router.replace("/login");
  }, [code, router]);

  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--color-brand-ink)]">
      <p className="text-sm text-white/60">Loading…</p>
    </main>
  );
}
