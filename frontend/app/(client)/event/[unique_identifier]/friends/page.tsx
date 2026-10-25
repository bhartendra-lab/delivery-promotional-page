import type { Metadata } from "next";
import { redirect } from "next/navigation";

/**
 * A redirect, so it must never be indexed and never produce a link preview of
 * its own.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Your gallery",
};

/**
 * `/event/<unique_identifier>/friends` — once a deep link into "Find my
 * people"'s requests, from the "Review request" button of old WhatsApp
 * messages. My People is retired, so the link now opens the gallery itself.
 *
 * A temporary (307) redirect rather than a permanent one, so a browser does
 * not cache it for good if the feature comes back. `FriendsIntentClient.tsx`
 * stays beside this page, unused, for that day.
 *
 * Relative to the host the link was opened on, so a studio's custom domain
 * stays on that domain (the Worker's Host gate allows `/event/` as a prefix,
 * see lib/host-gate.ts). Any query string the old link carried is dropped.
 */
export default async function FriendsLinkRedirect({
  params,
}: {
  params: Promise<{ unique_identifier: string }>;
}) {
  const { unique_identifier } = await params;
  redirect(`/event/${encodeURIComponent(decodeURIComponent(unique_identifier))}`);
}
