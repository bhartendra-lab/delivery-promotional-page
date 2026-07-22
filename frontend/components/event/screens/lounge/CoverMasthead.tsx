"use client";

import type { DeliveryLandingPageData } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { HeroSubtitle } from "./HeroSubtitle";

/**
 * MOBILE-ONLY full-screen Home cover (desktop uses `DesktopCover`; the two
 * shells mount exclusively, so this never renders at `lg`).
 *
 * The ONLY thing overlaid on the photo is the editorial title block and the
 * personalized welcome band — matching the desktop cover's restraint. The
 * studio card, Browse-all and Download-all that used to live here are gone on
 * purpose: browsing everything is the All switcher in the gallery, downloading
 * everything is the gallery control row, and contact/review/socials are now
 * consolidated into the top bar's menu + review icon and the gallery outro.
 *
 * Height is `100dvh - 3.5rem` so it fills the visible viewport beneath the
 * condensed top bar (h-14), and the band carries enough bottom padding to
 * clear the fixed bottom nav.
 */
export function CoverMasthead({
  t,
  event,
  branding,
  matchCount,
  guestName,
  onSeeMine,
  date,
}: {
  t: ClientTheme;
  event: DeliveryLandingPageData;
  branding: boolean;
  matchCount: number;
  guestName?: string;
  /** Routes to the Gallery tab. */
  onSeeMine: () => void;
  date: string | null;
}) {
  const heroBg = event.background_image
    ? {
        backgroundImage: `url(${event.background_image})`,
        backgroundSize: "cover",
        backgroundPosition: event.background_position || "center",
      }
    : { backgroundImage: `linear-gradient(150deg, ${t.cover[0]}, ${t.cover[1]})` };

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] flex-col justify-end overflow-hidden">
      <div className={`absolute inset-0 ${event.background_image ? "hero-kenburns" : ""}`} style={heroBg} />
      <div className="absolute inset-0" style={{ background: t.heroScrim }} />
      {/* Bottom scrim — guarantees the cluster stays legible over a bright cover. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%]"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.40) 32%, rgba(0,0,0,0) 100%)",
        }}
      />

      {/* title + welcome band, clearing the fixed bottom nav */}
      <div className="hero-text relative px-6 pb-28">
        {branding && event.company_name && (
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/85">
            Gallery by {event.company_name}
          </span>
        )}
        <h1
          className="mt-2 text-white"
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(30px, 8vw, 44px)",
            fontWeight: 700,
            lineHeight: 1.1,
          }}
        >
          {event.event_name}
        </h1>

        <HeroSubtitle event={event} date={date} size="mobile" />

        {/* frosted welcome band — same Apple-style glass as desktop */}
        <button
          type="button"
          onClick={onSeeMine}
          className="lounge-rise mt-6 flex w-full cursor-pointer items-center gap-3 rounded-2xl py-3.5 pl-4 pr-3 text-left transition-transform active:scale-[0.99]"
          style={{
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
            animationDelay: "0.12s",
          }}
        >
          <span className="min-w-0 flex-1 text-[14px] font-semibold" style={{ color: t.text }}>
            {matchCount > 0 ? (
              <>
                Welcome back{guestName ? `, ${guestName}` : ""} — you&rsquo;re in{" "}
                <span style={{ color: t.brand }}>
                  {matchCount.toLocaleString("en-IN")} photo{matchCount === 1 ? "" : "s"}
                </span>
              </>
            ) : (
              <>Welcome{guestName ? `, ${guestName}` : ""} — no matches yet</>
            )}
          </span>
          <span className="shrink-0" style={{ color: t.brand }}>
            <ArrowRightIcon size={18} />
          </span>
        </button>
      </div>
    </div>
  );
}

function ArrowRightIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}
