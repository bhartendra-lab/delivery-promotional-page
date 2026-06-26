"use client";

import { useEffect } from "react";
import { setGuestToken } from "@/lib/guest-auth";
import { BrandLoader } from "@/components/event/BrandLoader";

/**
 * Captures the guest JWT from the OAuth redirect, persists it per event, and
 * sends the guest back into the flow (a full navigation so the experience
 * remounts and picks up the stored token / session).
 */
export function AuthCallbackClient({ uniqueIdentifier }: { uniqueIdentifier: string }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const target = `/event/${encodeURIComponent(uniqueIdentifier)}`;
    if (token) {
      setGuestToken(uniqueIdentifier, token);
      window.location.replace(target);
    } else {
      // No token (or an explicit error) → back to the entry with an error flag.
      window.location.replace(`${target}?error=auth_failed`);
    }
  }, [uniqueIdentifier]);

  return <BrandLoader label="Signing you in…" />;
}
