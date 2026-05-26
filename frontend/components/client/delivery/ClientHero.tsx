"use client";

import { useEffect, useState } from "react";
import type { KvData } from "@/lib/types";
import type { Tokens } from "./tokens";
import { formatEventDate } from "../templates/shared";

type Props = {
  data: KvData;
  tokens: Tokens;
  /**
   * `mobile` = full-width hero filling viewport, used in the stacked mobile
   * layout. `panel` = inset rendering inside DesktopLeftPanel — the panel
   * already paints the background, so this just renders the text block.
   */
  variant: "mobile" | "panel";
};

/**
 * Film-title-card hero. Names (light weight, clamp size) + `date` eyebrow
 * in accent color. Nothing else. No stats, no subtitles, no scroll cues.
 */
export function ClientHero({ data, tokens, variant }: Props) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), 60);
    return () => clearTimeout(id);
  }, []);

  const formattedDate = formatEventDate(data.event_date);

  const textBlock = (
    <div
      className="transition-[opacity,transform] duration-[1000ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "translateY(0)" : "translateY(14px)",
      }}
    >
      {formattedDate && (
        <div
          className="mb-4 text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: tokens.accent }}
        >
          {formattedDate}
        </div>
      )}
      <h1
        className="font-light"
        style={{
          color: "#F0E8DC",
          fontSize:
            variant === "mobile"
              ? "clamp(42px, 12vw, 64px)"
              : "clamp(34px, 3.2vw, 50px)",
          lineHeight: variant === "mobile" ? 1.04 : 1.06,
          letterSpacing: "-0.025em",
        }}
      >
        {data.client_name}
      </h1>
    </div>
  );

  if (variant === "panel") {
    // Just the text — the DesktopLeftPanel paints the background.
    return textBlock;
  }

  // Mobile: full-bleed hero with its own gradient + image (if any) + overlay.
  return (
    <section className="relative">
      <div
        className="relative overflow-hidden"
        style={{
          height: "calc(100vh - 52px)",
          minHeight: 480,
          maxHeight: 700,
        }}
      >
        <HeroBackground data={data} tokens={tokens} />
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-10">
          {textBlock}
        </div>
      </div>
    </section>
  );
}

/**
 * The reference HTML's gradient hero. If the studio provided a
 * background_image we use it as the base layer instead of the solid gradient,
 * but keep the accent/highlight radial glows and the bottom heroOverlay so
 * the text remains legible.
 */
function HeroBackground({ data, tokens }: { data: KvData; tokens: Tokens }) {
  const hg = tokens.heroGradient;
  return (
    <>
      {data.background_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.background_image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: hg.base }}
          aria-hidden
        />
      )}
      <div
        className="absolute"
        style={{
          top: "-5%",
          left: "-15%",
          width: "80%",
          height: "60%",
          background: `radial-gradient(ellipse, ${hg.glow} 0%, transparent 65%)`,
          borderRadius: "50%",
        }}
        aria-hidden
      />
      <div
        className="absolute"
        style={{
          top: "0%",
          right: "-20%",
          width: "60%",
          height: "50%",
          background: `radial-gradient(ellipse, ${hg.highlight} 0%, transparent 70%)`,
          borderRadius: "50%",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(0,0,0,0.5) 100%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{ background: tokens.heroOverlay }}
        aria-hidden
      />
    </>
  );
}
