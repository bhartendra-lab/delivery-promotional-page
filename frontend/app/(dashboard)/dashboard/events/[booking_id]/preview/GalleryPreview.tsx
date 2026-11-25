"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getDeliveryLandingPageByUniqueIdentifier } from "@/lib/api";
import { resolveTheme } from "@/lib/client-theme";
import { enterPreviewMode, leavePreviewMode } from "@/lib/preview-mode";
import {
  applyDraft,
  PREVIEW_MESSAGE_SOURCE,
  previewGuestSession,
  readPreviewMessage,
  type PreviewDraft,
} from "@/lib/preview-data";
import type { DeliveryLandingPageData, GuestSession } from "@/lib/types";
import { EventThemeProvider } from "@/components/event/EventThemeContext";
import { PolicyProvider } from "@/components/event/policy/PolicyContext";
import { WelcomeScreen } from "@/components/event/screens/WelcomeScreen";
import { LoungeGallery } from "@/components/event/screens/LoungeGallery";

/**
 * The actual guest screens (WelcomeScreen, LoungeGallery and everything under
 * them), for the studio, with the unsaved Gallery Design draft laid over the
 * real guest payload as it arrives by postMessage from the tab around it.
 *
 * It records nothing: preview mode (lib/preview-mode.ts) answers every guest
 * API call locally, reads the studio's own photos with the studio's own
 * sign-in, and the guest analytics beacon is not mounted here (it lives in the
 * guest route group's layout, not the dashboard's). It needs no guest sign-in:
 * it shows the gallery as a Host, a guest with full access.
 *
 * Only the dashboard's own origin may talk to it, and only about the draft.
 */
export function GalleryPreview({ bookingId }: { bookingId: string }) {
  return (
    <Suspense fallback={<PreviewMessage text="Loading the preview…" />}>
      <GalleryPreviewInner bookingId={bookingId} />
    </Suspense>
  );
}

function GalleryPreviewInner({ bookingId }: { bookingId: string }) {
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const view = params.get("view") === "gallery" ? "gallery" : "landing";

  const [event, setEvent] = useState<DeliveryLandingPageData | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<PreviewDraft | null>(null);
  // Local changes to the preview guest (none in practice); the base follows the event's teams.
  const [sessionPatch, setSessionPatch] = useState<Partial<GuestSession>>({});

  // Preview mode is on for as long as this page is: every guest call is answered locally.
  useEffect(() => {
    enterPreviewMode({ bookingId });
    return () => leavePreviewMode();
  }, [bookingId]);

  // The real guest payload for this event (the same one a guest gets), read once.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDeliveryLandingPageByUniqueIdentifier(uid)
      .then((res) => {
        if (!cancelled) setEvent(res.deliveryLandingPage);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // The draft from the Gallery Design tab around this page. Same origin only,
  // and only from the page that framed us.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const msg = readPreviewMessage(e, window.location.origin);
      if (msg?.type === "draft") setDraft(msg.draft);
    };
    window.addEventListener("message", onMessage);
    // Tell the tab we can take a draft now.
    window.parent?.postMessage({ source: PREVIEW_MESSAGE_SOURCE, type: "ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const shown = useMemo(() => (event ? applyDraft(event, draft) : null), [event, draft]);
  const session = useMemo<GuestSession>(() => ({ ...previewGuestSession(event?.guest_types ?? []), ...sessionPatch }), [event?.guest_types, sessionPatch]);
  const theme = useMemo(() => resolveTheme(shown?.style_variant), [shown?.style_variant]);

  if (!uid) return <PreviewMessage text="This preview needs the event's link." />;
  if (failed) return <PreviewMessage text="We couldn't load the preview. Close it and open it again." />;
  if (!shown) return <PreviewMessage text="Loading the preview…" />;

  return (
    <div className="notranslate" translate="no">
      <EventThemeProvider value={{ theme, event: shown, uniqueIdentifier: uid }}>
        <PolicyProvider>
          {view === "landing" ? (
            // Continue does nothing: this is a look at the page, not a way in.
            <WelcomeScreen onContinue={() => {}} />
          ) : (
            <LoungeGallery
              session={session}
              onSessionChange={(patch) => setSessionPatch((s) => ({ ...s, ...patch }))}
              friendFinder={null}
              onFriendFinderChange={() => {}}
              collections={null}
              onCollectionsChange={() => {}}
              onReauth={() => {}}
              onRescan={() => {}}
              onSignOut={() => {}}
            />
          )}
        </PolicyProvider>
      </EventThemeProvider>
    </div>
  );
}

function PreviewMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-brand-bg)] px-6 text-center text-[14px] text-[var(--color-brand-muted)]">
      {text}
    </div>
  );
}
