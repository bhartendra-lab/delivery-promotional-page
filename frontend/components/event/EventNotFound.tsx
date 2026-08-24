"use client";

import { PLATFORM_SKIN } from "@/lib/client-theme";
import { AmbientBackdrop } from "./AmbientBackdrop";

/** Shown when a shared `/event/<unique_identifier>` slug doesn't resolve. */
export function EventNotFound() {
  const t = PLATFORM_SKIN;
  return (
    <div
      className="relative isolate flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: t.bg, fontFamily: t.font }}
    >
      <AmbientBackdrop a={t.cover[0]} b={t.cover[1]} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vyavasth-icon.svg" alt="Vyavasth" className="fx-float mb-2 h-12 w-12 opacity-90" />
      <h1 className="text-[22px] font-extrabold tracking-tight" style={{ color: t.text }}>
        Gallery not found
      </h1>
      <p className="max-w-[360px] text-[14px] leading-relaxed" style={{ color: t.muted }}>
        This link doesn’t match any event. Double-check the link you were sent, or ask for it again.
      </p>
    </div>
  );
}
