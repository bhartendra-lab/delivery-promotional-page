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
 * A Client's memory lane page — `/memory-lane/<token>`.
 *
 * Opened from the WhatsApp message every event's Clients are sent: a week
 * before a pay per event gallery closes, or, for a storage plan event, the day
 * it is archived or two months after it was created. The first ends by asking
 * the Client to extend and is always on the Vyavasth domain; the second is the
 * Studio's own page and is on the Studio's domain when it has one. The host
 * gate lets the path through on both (lib/host-gate.ts) and the API decides
 * which link a hostname may show.
 *
 * It used to be `/validity/<token>`, which now redirects here (next.config.ts).
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
