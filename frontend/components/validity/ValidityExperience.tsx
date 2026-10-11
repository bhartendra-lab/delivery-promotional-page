"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getValidityLink } from "@/lib/api";
import { PLATFORM_SKIN, resolveTheme } from "@/lib/client-theme";
import { formatValidityDate, type ValidityLinkView } from "@/lib/event-validity";
import { AmbientBackdrop } from "@/components/event/AmbientBackdrop";
import { BrandLoader } from "@/components/event/BrandLoader";
import { eventTitleStyle } from "@/components/event/screens/lounge/eventTitleStyle";
import { ValidityFavourite, ValidityNumbers, ValidityOpening, ValidityStrip, type OpeningPhoto } from "./ValidityMemory";
import { ValidityQuestion } from "./ValidityQuestion";

type Status = "loading" | "ready" | "invalid" | "error";

/**
 * The Client's validity extension page: `/validity/<token>`.
 *
 * "The day, once more." Before it asks for anything, the page gives the Client
 * a minute of their own day back: their photos, in the order they happened,
 * with a few small true details. Then it asks one quiet question. Whatever
 * warmth it has comes from specifics that are real (the time of the last
 * photo, the hearts on the favourite), never from decoration, and never from
 * making anyone feel guilty: the deletion is stated once, plainly, where the
 * question is.
 *
 * PUBLIC, and reached only from a link sent to one Client. There is no
 * sign-in: the token in the URL is the whole of their authority, the API
 * answers one and the same 404 for any token it does not accept, and nothing
 * here ever shows a gallery photo's own address.
 *
 * The memory sections wear the event's own gallery theme; the details and the
 * payment switch to the Vyavasth platform skin (see ValidityQuestion).
 *
 * When there is no reel yet (it is built off the request path, normally before
 * the Client is messaged) the page falls back to the gallery's welcome strip
 * for its opening photo, then to the studio's cover, then to no photo at all,
 * and still asks its question.
 */
export function ValidityExperience({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [view, setView] = useState<ValidityLinkView | null>(null);

  const load = useCallback(async () => {
    try {
      const fresh = await getValidityLink(token);
      setView(fresh);
      setStatus("ready");
    } catch (err) {
      // One 404 for every way a link can be wrong; anything else is ours or
      // the network's, and worth offering to try again.
      setStatus(err instanceof ApiError && err.status === 404 ? "invalid" : "error");
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read of the link, on mount; its state lands after the request
    void load();
  }, [load]);

  const theme = useMemo(() => resolveTheme(view?.theme), [view?.theme]);

  if (status === "loading") return <BrandLoader label="One moment" />;
  if (status === "invalid") {
    return <ValidityNotice heading="This link is not valid." body="Ask your photographer for a new one." />;
  }
  if (status === "error" || !view) {
    return (
      <ValidityNotice
        heading="Something went wrong"
        body="We could not open this page. Check your connection and try again."
        action={{
          label: "Try again",
          onClick: () => {
            setStatus("loading");
            void load();
          },
        }}
      />
    );
  }

  const eventName = view.event_name?.trim() || "Your gallery";

  // Closed: no photos (they are being deleted), no options, no button.
  if (view.status === "expired") {
    return (
      <main
        className="relative isolate flex min-h-[100dvh] flex-col justify-center px-6 py-16"
        style={{ background: theme.bg, fontFamily: theme.font, overflowX: "clip" }}
      >
        <AmbientBackdrop a={theme.cover[0]} b={theme.cover[1]} />
        <div className="mx-auto w-full max-w-[560px]">
          {/* The event's name as their gallery set it (see ValidityMemory). */}
          <p className="text-balance" style={{ ...eventTitleStyle("mobile"), color: theme.text }}>
            {eventName}
          </p>
          <h1 className="mt-6 text-[24px] font-extrabold tracking-tight" style={{ color: theme.text }}>
            This gallery has closed.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: theme.muted }}>
            {view.ends_at ? `It was live till ${formatValidityDate(view.ends_at)}. ` : ""}
            Its photos are being deleted and it can no longer be extended. Any photos you saved are yours to keep.
          </p>
        </div>
      </main>
    );
  }

  const reel = view.reel;
  // The favourite opens the page; failing that the first photo of the day,
  // then the welcome strip's first copy, then the studio's cover.
  const opening: OpeningPhoto =
    reel?.favourite ??
    reel?.items[0] ??
    (view.fallback_photos?.[0] ? { url: view.fallback_photos[0], width: null, height: null } : null) ??
    (view.cover ? { url: view.cover, width: null, height: null } : null);
  // The favourite also gets a section of its own further down, large, with
  // its hearts and its caption: up here it is only the way in.
  const favourite = reel?.favourite ?? null;

  return (
    // `clip`, not `hidden`: nothing may scroll the page sideways at 360px, and
    // `hidden` would turn this into a scroll container and break the pay
    // bar's sticking to the bottom of the screen.
    <main style={{ background: theme.bg, fontFamily: theme.font, color: theme.text, overflowX: "clip" }}>
      <ValidityOpening
        t={theme}
        photo={opening}
        firstName={view.client_first_name}
        eventName={eventName}
        eventDate={view.event_date}
      />
      {reel && reel.items.length > 0 && <ValidityStrip t={theme} reel={reel} eventName={eventName} />}
      {reel && <ValidityNumbers t={theme} reel={reel} />}
      {favourite && <ValidityFavourite t={theme} favourite={favourite} eventName={eventName} />}
      <ValidityQuestion t={theme} token={token} view={view} eventName={eventName} onRefresh={load} />
    </main>
  );
}

/** A full-screen message on the Vyavasth platform skin: a bad link, or a page
 *  that would not load. The same trust-layer look as the gallery's own
 *  not-found screen. */
function ValidityNotice({
  heading,
  body,
  action,
}: {
  heading: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  const t = PLATFORM_SKIN;
  return (
    <main
      className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: t.bg, fontFamily: t.font }}
    >
      <AmbientBackdrop a={t.cover[0]} b={t.cover[1]} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vyavasth-icon.svg" alt="Vyavasth" className="mb-2 h-12 w-12 opacity-90" />
      <h1 className="text-[22px] font-extrabold tracking-tight" style={{ color: t.text }}>
        {heading}
      </h1>
      <p className="max-w-[360px] text-[14.5px] leading-relaxed" style={{ color: t.muted }}>
        {body}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 inline-flex h-12 items-center rounded-full px-6 text-[15px] font-bold"
          style={{ background: t.brand, color: t.onBrand }}
        >
          {action.label}
        </button>
      )}
    </main>
  );
}
