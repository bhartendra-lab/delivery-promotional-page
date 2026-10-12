"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getValidityLink } from "@/lib/api";
import { PLATFORM_SKIN, resolveTheme } from "@/lib/client-theme";
import { formatValidityDate, type ValidityLinkView } from "@/lib/event-validity";
import { isVyavasthHost } from "@/lib/host-gate";
import { laneModeOf } from "@/lib/memory-lane";
import { AmbientBackdrop } from "@/components/event/AmbientBackdrop";
import { BrandLoader } from "@/components/event/BrandLoader";
import { eventTitleStyle } from "@/components/event/screens/lounge/eventTitleStyle";
import { MemoryLane } from "./lane/MemoryLane";

type Status = "loading" | "ready" | "invalid" | "error";

/**
 * A Client's memory lane page: `/memory-lane/<token>`.
 *
 * This file is only the way in: it reads the link, and shows the loader, the
 * "not valid" and "try again" notices, and the closed page. A live link is
 * handed to MemoryLane (components/validity/lane), which is the page itself:
 * a walk back through the day, and then one quiet note. What the note asks
 * depends on the event's plan: more time, paid for (a renewal), or a review
 * and a referral for the Studio (a keepsake).
 *
 * PUBLIC, and reached only from a link sent to one Client. There is no
 * sign-in: the token in the URL is the whole of their authority, the API
 * answers one and the same 404 for any token it does not accept, and nothing
 * here ever shows a gallery photo's own address.
 *
 * When there is no reel yet (it is built off the request path, normally before
 * the Client is messaged) the walk falls back to the gallery's welcome strip
 * for its photos, then to the studio's cover, then to no photo at all, and
 * still asks its question.
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
          {/* The event's name as their gallery sets it. */}
          <p className="text-balance" style={{ ...eventTitleStyle("mobile"), color: theme.text }}>
            {eventName}
          </p>
          <h1 className="mt-6 text-[24px] font-extrabold tracking-tight" style={{ color: theme.text }}>
            This gallery has closed.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: theme.muted }}>
            {view.ends_at ? `It was live till ${formatValidityDate(view.ends_at)}. ` : ""}
            {/* Only a renewal was ever something a Client could extend. */}
            {laneModeOf(view) === "keepsake"
              ? "Its photos have been deleted. Any photos you saved are yours to keep."
              : "Its photos are being deleted and it can no longer be extended. Any photos you saved are yours to keep."}
          </p>
        </div>
      </main>
    );
  }

  return <MemoryLane token={token} view={view} onRefresh={load} />;
}

/** A full-screen message on the Vyavasth platform skin: a bad link, or a page
 *  that would not load. The same trust-layer look as the gallery's own
 *  not-found screen. On a Studio's own domain it carries no Vyavasth mark: a
 *  page there is the Studio's, and at this point nothing is known about which. */
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
  // Read after mount: the server renders this for every host alike.
  const [ourHost, setOurHost] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the hostname only exists in the browser
    setOurHost(isVyavasthHost(window.location.host));
  }, []);
  return (
    <main
      className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: t.bg, fontFamily: t.font }}
    >
      <AmbientBackdrop a={t.cover[0]} b={t.cover[1]} />
      {/* The slot keeps its height either way, so the words never jump. */}
      <div className="mb-2 h-12 w-12">
        {ourHost && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/vyavasth-icon.svg" alt="Vyavasth" className="h-12 w-12 opacity-90" />
        )}
      </div>
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
