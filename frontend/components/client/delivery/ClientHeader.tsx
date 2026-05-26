"use client";

import type { KvData } from "@/lib/types";
import type { Tokens } from "./tokens";
import { ExtIcon, LensIcon } from "./icons";

type Props = {
  data: KvData;
  tokens: Tokens;
  /** Sticky mobile header gets a blurred bg; desktop left-panel use does not. */
  variant: "sticky" | "panel";
};

/**
 * LensIcon + studio name + optional "Our Work" link.
 *
 * - `sticky` variant: full sticky bar with blurred background and border.
 *   Used at the top of the mobile vertical layout.
 * - `panel` variant: transparent inline row. Used at the top of the
 *   desktop sticky left panel where the background is the hero gradient.
 */
export function ClientHeader({ data, tokens, variant }: Props) {
  const studioName = data.company_name ?? "Studio";
  const muted = variant === "panel" ? "rgba(240,232,220,0.42)" : tokens.muted;

  const inner = (
    <>
      <div className="flex items-center gap-2.5">
        <LensIcon accent={tokens.accent} />
        <span
          className="text-[13px] font-bold tracking-[-0.02em] sm:text-sm"
          style={{ color: variant === "panel" ? "#F0E8DC" : tokens.text }}
        >
          {studioName}
        </span>
      </div>
      {data.company_website && (
        <a
          href={data.company_website}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] sm:text-[11px]"
          style={{ color: muted }}
        >
          Our Work <ExtIcon s={variant === "panel" ? 10 : 11} c={muted} />
        </a>
      )}
    </>
  );

  if (variant === "panel") {
    return (
      <div className="flex items-center justify-between">{inner}</div>
    );
  }

  // Mobile sticky header
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between border-b px-6 py-3"
      style={{
        background:
          tokens.theme === "dark"
            ? "rgba(13,11,9,0.9)"
            : "rgba(245,237,224,0.9)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderColor: tokens.border,
      }}
    >
      {inner}
    </header>
  );
}
