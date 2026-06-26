"use client";

import { PLATFORM_SKIN } from "@/lib/client-theme";
import { AmbientBackdrop } from "./AmbientBackdrop";

/**
 * First-paint brand loader — the animated Vyavasth icon (rotating shell +
 * breathing pulse) inside a spinning progress ring, on the Vyavasth platform
 * skin. Echoes the dashboard upload loader (`brand-spin` + `brand-pulse`).
 */
export function BrandLoader({ label }: { label?: string }) {
  const t = PLATFORM_SKIN;
  return (
    <div
      className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6"
      style={{ background: t.bg, fontFamily: t.font }}
    >
      <AmbientBackdrop a={t.cover[0]} b={t.cover[1]} />
      <div className="relative flex h-28 w-28 items-center justify-center">
        {/* soft glow behind the mark */}
        <span
          className="fx-glow-pulse absolute -inset-4 rounded-full"
          style={{ background: t.accentWash, filter: "blur(16px)" }}
        />
        {/* spinning progress ring */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            border: `3px solid ${t.accentWash}`,
            borderTopColor: t.brand,
            animation: "brand-spin 1s linear infinite",
          }}
        />
        {/* slow-rotating icon shell with a breathing pulse */}
        <span className="brand-spin flex h-16 w-16 items-center justify-center">
          <span className="brand-pulse flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/vyavasth-icon.svg" alt="Vyavasth" className="h-12 w-12" />
          </span>
        </span>
      </div>
      <p className="text-[13.5px] font-semibold tracking-wide" style={{ color: t.muted }}>
        {label ?? "Setting up your gallery…"}
      </p>
    </div>
  );
}
