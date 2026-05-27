"use client";

import type { KvData } from "@/lib/types";
import type { Tokens } from "./tokens";
import { ClientHeader } from "./ClientHeader";
import { ClientHero } from "./ClientHero";

type Props = {
  data: KvData;
  tokens: Tokens;
};

/**
 * Warm rectangle tints used in the watermark grid behind the hero. Ported
 * verbatim from `ai-tasks/Delivery Page minimal.html` line 77.
 */
const TINTS: Array<[string, string]> = [
  ["#3D2B20", "#5C3D2E"],
  ["#2B2018", "#47321F"],
  ["#351E15", "#5A3122"],
  ["#2E2212", "#4D381A"],
  ["#3A2518", "#604228"],
  ["#251A12", "#3E2B18"],
];

const GRID_TINT_ORDER = [1, 3, 5, 2, 4, 0, 3, 1, 4];

/**
 * Sticky 32vw left panel for desktop. Renders the multi-layer hero
 * background + studio identity at top + names/date at bottom. Reference
 * HTML lines 322–431.
 */
export function DesktopLeftPanel({ data, tokens }: Props) {
  const hg = tokens.heroGradient;
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{
        // Wider than the reference HTML's `clamp(420px, 32vw, 480px)` so
        // the hero photo gets more breathing room on wide desktop monitors.
        width: "clamp(460px, 42vw, 640px)",
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      {/* Base + image (if any) */}
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

      {/* Accent glow (top-left) */}
      <div
        className="absolute"
        style={{
          top: "-5%",
          left: "-15%",
          width: "85%",
          height: "60%",
          background: `radial-gradient(ellipse, ${hg.glow} 0%, transparent 65%)`,
          borderRadius: "50%",
        }}
        aria-hidden
      />
      {/* Secondary highlight (top-right) */}
      <div
        className="absolute"
        style={{
          top: "0%",
          right: "-20%",
          width: "65%",
          height: "50%",
          background: `radial-gradient(ellipse, ${hg.highlight} 0%, transparent 70%)`,
          borderRadius: "50%",
        }}
        aria-hidden
      />
      {/* Accent wash (centre-low) */}
      <div
        className="absolute"
        style={{
          top: "35%",
          left: "10%",
          width: "80%",
          height: "40%",
          background: `radial-gradient(ellipse, ${tokens.accent}18 0%, transparent 70%)`,
        }}
        aria-hidden
      />

      {/* Watermark grid (only when no background image — keeps the tinted
          decorative texture visible against the gradient) */}
      {!data.background_image && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 gap-[3px]"
          style={{
            opacity: 0.12,
            transform: "rotate(-6deg) scale(1.3)",
            transformOrigin: "center",
          }}
        >
          {GRID_TINT_ORDER.map((tintIndex, i) => {
            const [a, b] = TINTS[tintIndex % TINTS.length];
            return (
              <div
                key={i}
                style={{
                  background: `linear-gradient(150deg, ${a} 0%, ${b} 100%)`,
                  borderRadius: 3,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, transparent 20%, rgba(0,0,0,0.55) 100%)",
        }}
        aria-hidden
      />
      {/* Bottom fade to deepen the dark zone where text sits */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(15,8,3,0.05) 0%, rgba(8,4,2,0.75) 65%, rgba(6,3,1,0.97) 100%)",
        }}
        aria-hidden
      />

      <div className="absolute inset-0 flex flex-col justify-between px-8 pb-9 pt-7">
        <ClientHeader data={data} tokens={tokens} variant="panel" />
        <ClientHero data={data} tokens={tokens} variant="panel" />
      </div>
    </div>
  );
}
