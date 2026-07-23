"use client";

import type { DeliveryLandingPageData } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { HeroSubtitle } from "./HeroSubtitle";
import { IconArrowRight, IconCaretDown } from "@/components/ui/icons";

/**
 * DESKTOP-ONLY full-screen editorial cover. Mobile keeps `CoverMasthead`
 * (separate Home tab, its own action cards) — the two shells are mounted
 * exclusively, so this component never renders below `lg`.
 *
 * Height is `100dvh - 4rem`: the cover lives INSIDE the desktop scroll
 * container, which already starts under the 64px (h-16) top bar, so this fills
 * the visible viewport exactly and keeps the scroll cue on the bottom edge.
 *
 * The only overlaid content is the editorial title block, the frosted welcome
 * band, and the scroll cue. Browse-all lives in the All-Photos switcher and
 * Download-all in the sticky control row, so neither is duplicated here. The
 * welcome band is identical for locked and unlocked guests — unlocking is
 * reachable only via the All-Photos switcher once you scroll to the grid.
 */
export function DesktopCover({
  t,
  event,
  branding,
  matchCount,
  guestName,
  onSeeMine,
  onScrollToGrid,
  date,
}: {
  t: ClientTheme;
  event: DeliveryLandingPageData;
  branding: boolean;
  matchCount: number;
  guestName?: string;
  onSeeMine: () => void;
  onScrollToGrid: () => void;
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
    <div className="relative flex h-[calc(100dvh-4rem)] flex-col justify-end overflow-hidden">
      <div className={`absolute inset-0 ${event.background_image ? "hero-kenburns" : ""}`} style={heroBg} />
      <div className="absolute inset-0" style={{ background: t.heroScrim }} />
      {/* Extra bottom scrim — the themed heroScrim alone can leave a bright
          cover washing out the cluster; this guarantees legibility. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%]"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.66) 0%, rgba(0,0,0,0.38) 32%, rgba(0,0,0,0) 100%)",
        }}
      />

      {/* bottom-LEFT cluster: title block + frosted welcome band */}
      <div className="hero-text relative max-w-[660px] px-12 pb-24">
        {branding && event.company_name && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
            Gallery by {event.company_name}
          </span>
        )}
        <h1
          className="mt-2 text-white"
          style={{
            fontFamily: "var(--font-playfair), Georgia, serif",
            fontStyle: "italic",
            fontSize: "clamp(40px, 4.6vw, 60px)",
            fontWeight: 700,
            lineHeight: 1.08,
          }}
        >
          {event.event_name}
        </h1>
        <HeroSubtitle event={event} date={date} size="desktop" />

        {/* frosted welcome band — Apple-style translucent glass. Light surface
            (over the darkened bottom scrim) so the brand accent stays readable
            on every theme, including the deep/saturated ones. */}
        <button
          type="button"
          onClick={onSeeMine}
          className="lounge-rise group mt-7 flex cursor-pointer items-center gap-4 rounded-2xl py-4 pl-5 pr-4 text-left transition-transform active:scale-[0.995]"
          style={{
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
            animationDelay: "0.12s",
          }}
        >
          <span className="text-[15px] font-semibold" style={{ color: t.text }}>
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
          <span
            className="transition-transform duration-300 group-hover:translate-x-1"
            style={{ color: t.brand }}
          >
            <IconArrowRight size={19} weight="bold" />
          </span>
        </button>
      </div>

      {/* scroll cue — bottom CENTER, clear of the bottom-left cluster */}
      <button
        type="button"
        onClick={onScrollToGrid}
        aria-label="Scroll to gallery"
        className="scroll-cue absolute bottom-6 left-1/2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-white/80"
        style={{ background: "rgba(255,255,255,0.16)" }}
      >
        <IconCaretDown size={17} weight="bold" />
      </button>
    </div>
  );
}
