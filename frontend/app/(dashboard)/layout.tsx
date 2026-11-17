import { GoogleTagManager } from "@next/third-parties/google";
import { ConsentBanner } from "@/components/ConsentBanner";
import { ReferralCapture } from "@/components/onboarding/ReferralCapture";
import { CONSENT_BOOTSTRAP_SCRIPT, GTM_ID } from "@/lib/analytics";

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/*
        Analytics (GTM) is loaded for the studio dashboard group only. The guest
        gallery routes (app/(client), app/e) sit outside this group on purpose,
        so no tracking tag ever runs on a page a guest sees.
      */}
      {GTM_ID && (
        <>
          {/* Consent defaults must be in the dataLayer before GTM loads. */}
          <script dangerouslySetInnerHTML={{ __html: CONSENT_BOOTSTRAP_SCRIPT }} />
          <GoogleTagManager gtmId={GTM_ID} />
        </>
      )}
      <ReferralCapture />
      {children}
      <ConsentBanner />
    </div>
  );
}
