import type { Metadata } from "next";
import { FriendsIntentClient } from "./FriendsIntentClient";

/**
 * A redirect stub, so it must never be indexed and never produce a link
 * preview of its own — the guest who follows it already has the context, and a
 * crawler following it would land on a page whose only job is to bounce.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Your friends group",
};

/**
 * `/event/<unique_identifier>/friends` — a deep link into the requests section
 * of the people screen.
 *
 * Built for the "Review request" button in a friend-request message. Those
 * messages no longer exist — a request reaches a guest as a badge in their own
 * gallery — so nothing generates this URL today. See FriendsIntentClient for
 * why it is kept rather than deleted.
 *
 * A static segment under the existing dynamic one. It cannot collide with any
 * gallery slug — `/event/friends` is still a gallery called "friends" — and no
 * catch-all lives under `[unique_identifier]`, so no existing `/event/...` URL
 * resolves differently because this exists. The Worker's Host gate already
 * allows it on a studio custom domain: `/event/` is an allowed PREFIX, not an
 * exact path (see lib/host-gate.ts, and the test that pins this).
 */
export default async function FriendsApprovalPage({
  params,
}: {
  params: Promise<{ unique_identifier: string }>;
}) {
  let { unique_identifier } = await params;
  unique_identifier = decodeURIComponent(unique_identifier);
  return <FriendsIntentClient uniqueIdentifier={unique_identifier} />;
}
