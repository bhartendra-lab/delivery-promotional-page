"use client";

import type { DeliveryLandingPageData } from "@/lib/types";

/**
 * The line under the couple/event name on the hero cover, shared by the mobile
 * (`CoverMasthead`) and desktop (`DesktopCover`) covers so both read the same.
 *
 * When the studio wrote a `custom_message` it takes over: rendered as PROSE in
 * the serif voice (no uppercase/tracking treatment — it's a sentence, not a
 * label) and clamped to two lines, since the field is free-text and can run
 * long. With no message it falls back to the original "[event_type] gallery"
 * label. The date always shows.
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
  const message = event.custom_message?.trim();
  const proseSize = size === "desktop" ? "text-[16px]" : "text-[14px]";
  const labelSize = size === "desktop" ? "text-[10.5px]" : "text-[10px]";
  const dateSize = size === "desktop" ? "text-[13px]" : "text-[12.5px]";

  if (message) {
    return (
      <div className={size === "desktop" ? "mt-3" : "mt-2.5"}>
        <p
          className={`line-clamp-2 max-w-[46ch] font-medium italic text-white/85 ${proseSize}`}
          style={{ fontFamily: "var(--font-playfair), Georgia, serif", lineHeight: 1.45 }}
        >
          {message}
        </p>
        {date && (
          <div className={`mt-1.5 font-medium text-white/80 ${dateSize}`}>{date}</div>
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
