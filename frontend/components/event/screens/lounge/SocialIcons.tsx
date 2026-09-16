"use client";

import { useState } from "react";
import { SOCIAL_PLATFORM_BY_KEY, type SocialPlatformKey } from "@/lib/social-platforms";

/**
 * One platform's chip, drawn from the registry in lib/social-platforms.ts. Every
 * chip is the same circle at the same size, whatever is inside it — a row of
 * circles with one rectangle in it reads as a bug.
 *
 *  - "knockout": the real react-icons/simple-icons brand mark, rendered white on
 *    the platform's colour (this app's own composite — no library carries a
 *    "brand mark in a coloured circle" treatment).
 *  - "plate": a portal's official PNG on a white chip. Raster, so it is drawn at
 *    an explicit size with `object-fit: contain` — never cover, never stretched.
 *  - monogram: a plate platform whose asset is not in yet (`hasAsset: false`),
 *    or whose file failed to load. Deliberate, not broken: brand fill, white
 *    letters, identical geometry and hover.
 */
export function SocialChip({ platform, size = 32 }: { platform: SocialPlatformKey; size?: number }) {
  const spec = SOCIAL_PLATFORM_BY_KEY[platform];
  // Second line of defence behind `hasAsset`: a missing or malformed file flips
  // just this chip to its monogram instead of showing a broken-image icon.
  const [assetFailed, setAssetFailed] = useState(false);
  const innerW = Math.round(size * (1 - (2 * spec.markInset.x) / 100));
  const innerH = Math.round(size * (1 - (2 * spec.markInset.y) / 100));
  const className = "social-chip flex shrink-0 items-center justify-center overflow-hidden rounded-full";

  if (spec.treatment === "knockout" && spec.glyph) {
    const Glyph = spec.glyph;
    return (
      <span aria-hidden className={className} style={{ width: size, height: size, background: spec.chip }}>
        <Glyph size={Math.min(innerW, innerH)} style={{ color: "#fff" }} />
      </span>
    );
  }

  if (spec.treatment === "plate" && spec.hasAsset && spec.assetSrc && !assetFailed) {
    return (
      <span
        aria-hidden
        className={className}
        style={{ width: size, height: size, background: "#fff", boxShadow: "inset 0 0 0 1px rgba(31,26,14,0.12)" }}
      >
        {/* A plain <img>, not next/image: three decorative chips are no reason to
            start depending on the image optimiser on Cloudflare Workers. The
            explicit box keeps a slow asset from shifting the row as it lands. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={spec.assetSrc}
          alt=""
          width={innerW}
          height={innerH}
          decoding="async"
          loading="lazy"
          draggable={false}
          onError={() => setAssetFailed(true)}
          style={{ width: innerW, height: innerH, objectFit: "contain" }}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={className}
      style={{ width: size, height: size, background: spec.brand, color: "#fff" }}
    >
      <span style={{ fontSize: Math.round(size * 0.44), fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>
        {spec.monogram}
      </span>
    </span>
  );
}
