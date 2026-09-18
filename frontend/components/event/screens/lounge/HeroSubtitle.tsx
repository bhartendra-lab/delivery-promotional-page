"use client";

import { useCallback, useRef, useState } from "react";
import type { DeliveryLandingPageData } from "@/lib/types";
import { toCompactMessage } from "@/lib/guest-message";
import { MessageSheet } from "./MessageSheet";
import { useIsTruncated } from "./useIsTruncated";

/**
 * The line under the host/event name on the hero cover, shared by the mobile
 * (`CoverMasthead`) and desktop (`DesktopCover`) covers and by the pre-sign-in
 * `WelcomeScreen`, so all three read the same.
 *
 * When the studio wrote a `custom_message` it takes over: rendered as PROSE in
 * the serif voice (no uppercase/tracking treatment — it's a sentence, not a
 * label), with the studio's own line breaks kept (`pre-line` over the compact
 * form from `lib/guest-message`) and clamped to three lines. With no message it
 * falls back to the original "[event_type] gallery" label. The date always
 * shows.
 *
 * Past three lines the cover offers "Read more", which opens the whole message
 * in `MessageSheet`. The button appears only when the text is genuinely cut off,
 * MEASURED in the browser — a character count cannot tell a five-word poem from
 * a 200-character paragraph on a wide desktop, and the same message overflows
 * at one width and fits at another. The cover itself never changes size: the
 * full message is a card over the page, not an expansion in place.
 *
 * Opacities sit at 80–85% rather than the old 55–60%: white-on-photo needs
 * more weight than white-on-solid to stay readable over a bright cover.
 */
export function HeroSubtitle({
  event,
  date,
  size = "desktop",
}: {
  event: DeliveryLandingPageData;
  date: string | null;
  size?: "desktop" | "mobile";
}) {
  const message = toCompactMessage(event.custom_message);
  const [open, setOpen] = useState(false);
  const prose = useRef<HTMLParagraphElement>(null);
  const readMore = useRef<HTMLButtonElement>(null);
  const truncated = useIsTruncated(prose, [message]);

  const closeSheet = useCallback(() => {
    setOpen(false);
    // Hand focus back to the control that opened the sheet, so a keyboard guest
    // lands where they left the cover rather than at the top of the document.
    readMore.current?.focus();
  }, []);

  const proseSize = size === "desktop" ? "text-[16px]" : "text-[14px]";
  const labelSize = size === "desktop" ? "text-[10.5px]" : "text-[10px]";
  const dateSize = size === "desktop" ? "text-[13px]" : "text-[12.5px]";

  if (message) {
    return (
      <div className={size === "desktop" ? "mt-3" : "mt-2.5"}>
        <p
          ref={prose}
          // `break-words` so a pasted URL wraps instead of widening the cover.
          className={`line-clamp-3 max-w-[46ch] font-medium italic whitespace-pre-line break-words text-white/85 ${proseSize}`}
          style={{ fontFamily: "var(--font-playfair), Georgia, serif", lineHeight: 1.45 }}
        >
          {message}
        </p>
        {truncated && (
          <button
            ref={readMore}
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="block cursor-pointer py-[14px] text-[13px] font-semibold leading-[16px] text-white underline underline-offset-2"
            // 44px of tap target (14 + 16 + 14) bought without spending 44px of
            // a cover that is already tight on a short phone: the padding is
            // cancelled by matching negative margins, leaving a 4px gap above
            // and letting the date's own margin govern the gap below.
            style={{ marginTop: -10, marginBottom: -14 }}
          >
            Read more
          </button>
        )}
        {date && (
          <div className={`mt-1.5 font-medium text-white/80 ${dateSize}`}>{date}</div>
        )}
        {open && (
          <MessageSheet
            // Same fallback the Welcome screen's own title uses — the sheet's
            // heading is also what names the dialog to a screen reader, so it
            // can never be blank.
            eventName={event.event_name || "This event"}
            eventType={event.event_type}
            message={event.custom_message}
            onClose={closeSheet}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${size === "desktop" ? "mt-3" : "mt-2.5"}`}>
      <span className={`font-semibold uppercase tracking-[0.14em] text-white/85 ${labelSize}`}>
        {event.event_type ? `${event.event_type} gallery` : "Gallery"}
      </span>
      {date && (
        <>
          <span className="h-[3px] w-[3px] rounded-full bg-white/60" />
          <span className={`font-medium text-white/80 ${dateSize}`}>{date}</span>
        </>
      )}
    </div>
  );
}
