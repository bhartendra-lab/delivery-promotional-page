"use client";

import { useEffect } from "react";
import { setIntent } from "@/lib/friend-finder/storage";
import { BrandLoader } from "@/components/event/BrandLoader";

/**
 * Remembers WHY the guest is here, then hands over to the gallery.
 *
 * A deep link straight to the requests section. All it does is leave a note in
 * `sessionStorage` and send the guest to the ordinary gallery entry, which is
 * the point: the approval screen is not a separate destination with its own
 * auth, its own gates and its own copy of the lounge. It is the people screen,
 * opened at the right section, after every existing gate has been satisfied
 * exactly as it would be on any other visit.
 *
 * NOTHING GENERATES THIS LINK any more. It was built for the "Review request"
 * button in a WhatsApp message; requests now reach a guest only as a badge in
 * their own gallery, so this route survives purely as a shareable way in. It is
 * kept because it costs nothing, is covered by the host gate's tests, and is
 * the obvious destination if a link is ever wanted again — not because anything
 * depends on it.
 *
 * `sessionStorage` rather than a query parameter, so the note survives the
 * Google sign-in round trip without ever riding in a URL — and it survives it
 * because the backend redirects a guest back to the SAME origin they started
 * on, their studio's custom domain included (`galleryBaseUrlFor`).
 *
 * A full navigation rather than `router.replace`, matching the OAuth callback
 * next door: the guest is arriving cold from another app, there is no client
 * cache worth preserving, and a hard load is the behaviour that has proved
 * itself on every in-app browser this gallery has met.
 */
export function FriendsIntentClient({ uniqueIdentifier }: { uniqueIdentifier: string }) {
  useEffect(() => {
    // Best effort by design — `setIntent` swallows a blocked sessionStorage.
    // The cost of failure is that the guest lands on the lounge instead of the
    // people screen, with the card right there to tap. That is a far better
    // outcome than a dead end.
    setIntent("requests");
    window.location.replace(`/event/${encodeURIComponent(uniqueIdentifier)}`);
  }, [uniqueIdentifier]);

  return <BrandLoader />;
}
