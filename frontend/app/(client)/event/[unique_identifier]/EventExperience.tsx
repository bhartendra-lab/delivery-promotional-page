"use client";

import { useEffect, useState } from "react";
import { ApiError, getDeliveryLandingPageByUniqueIdentifier } from "@/lib/api";
import { resolveTheme } from "@/lib/client-theme";
import type { DeliveryLandingPageData } from "@/lib/types";
import { BrandLoader } from "@/components/event/BrandLoader";
import { EventNotFound } from "@/components/event/EventNotFound";
import { GalleryUnavailable } from "@/components/event/GalleryUnavailable";
import { EventThemeProvider } from "@/components/event/EventThemeContext";
import { EventFlow } from "@/components/event/EventFlow";
import { PolicyProvider } from "@/components/event/policy/PolicyContext";
import { PolicyOverlay } from "@/components/event/policy/PolicyOverlay";

type Status = "loading" | "ready" | "notfound" | "error";

/**
 * Top-level controller for the guest gallery. Resolves the event by its shared
 * slug, animates the brand loader while it loads, then hands off to the flow.
 */
export function EventExperience({ uniqueIdentifier }: { uniqueIdentifier: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [event, setEvent] = useState<DeliveryLandingPageData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Keep the loader up for a brief minimum so it doesn't flash on fast loads.
    const started = Date.now();
    (async () => {
      try {
        const res = await getDeliveryLandingPageByUniqueIdentifier(uniqueIdentifier);
        const elapsed = Date.now() - started;
        if (elapsed < 700) await new Promise((r) => setTimeout(r, 700 - elapsed));
        if (cancelled) return;
        setEvent(res.deliveryLandingPage);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        // 400 from the by-unique-identifier endpoint = slug doesn't resolve.
        setStatus(err instanceof ApiError && err.status === 400 ? "notfound" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqueIdentifier, reloadKey]);

  const retry = () => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  };

  if (status === "loading") return <BrandLoader />;
  if (status === "notfound") return <EventNotFound />;
  if (status === "error" || !event) return <LoadError onRetry={retry} />;
  if (event.is_active === false) return <GalleryUnavailable event={event} reason="deactivated" />;
  if (event.gallery_publish_status === "expired") return <GalleryUnavailable event={event} reason="expired" />;

  const theme = resolveTheme(event.style_variant);
  return (
    <EventThemeProvider value={{ theme, event, uniqueIdentifier }}>
      <PolicyProvider>
        <EventFlow />
        <PolicyOverlay />
      </PolicyProvider>
    </EventThemeProvider>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#FAFAF8] px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vyavasth-icon.svg" alt="Vyavasth" className="mb-1 h-11 w-11 opacity-90" />
      <h1 className="text-[20px] font-extrabold tracking-tight text-[#2A2218]">Something went wrong</h1>
      <p className="max-w-[340px] text-[14px] leading-relaxed text-[#7A6F63]">
        We couldn’t load this gallery. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex h-11 items-center rounded-full bg-[#C25A3A] px-6 text-[14px] font-bold text-white hover:bg-[#A8442A]"
      >
        Try again
      </button>
    </div>
  );
}
