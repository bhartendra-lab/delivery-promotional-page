import type { Metadata } from "next";
import { ValidityExperience } from "@/components/validity/ValidityExperience";

/**
 * Deliberately says nothing about the event: this page's address carries a
 * Client's private link, the tab title is all a link preview or a shared
 * screen would show, and no crawler has any business here.
 */
export const metadata: Metadata = {
  title: "Your gallery",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  // Chrome must not offer to translate this page: see app/(client)/layout.tsx.
  other: { google: "notranslate" },
};

/**
 * A Client's validity extension page — `/validity/<token>`.
 *
 * Opened from the WhatsApp reminder a Client is sent a week before their pay
 * per event gallery closes. Always on the Vyavasth domain, never a studio's
 * custom one: it is not on the host gate's allow list (lib/host-gate.ts), so a
 * custom hostname answers 404 for it.
 *
 * Everything is fetched in the browser (ValidityExperience), so the brand
 * loader can run while it resolves and so nothing about the event is ever in
 * server-rendered HTML that a cache or a crawler could keep.
 */
export default async function ValidityPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // No font is loaded here: the page uses the gallery's own type, which the
  // root layout already provides (see components/validity/lane/lane.module.css).
  return <ValidityExperience token={decodeURIComponent(token)} />;
}
