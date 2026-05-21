"use client";

import type { EventTemplate } from "@/lib/event-templates";
import type { KvData } from "@/lib/types";

export function formatEventDate(unix?: number): string {
  if (!unix) return "";
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Difference in whole years from a unix timestamp to today (clamped to 0). */
export function yearsSince(unix?: number): number {
  if (!unix) return 0;
  const past = new Date(unix * 1000);
  const now = new Date();
  let years = now.getFullYear() - past.getFullYear();
  const beforeAnniversaryThisYear =
    now.getMonth() < past.getMonth() ||
    (now.getMonth() === past.getMonth() && now.getDate() < past.getDate());
  if (beforeAnniversaryThisYear) years -= 1;
  return Math.max(0, years);
}

export function CustomMessage({
  data,
  className,
}: {
  data: KvData;
  className?: string;
}) {
  if (!data.custom_message) return null;
  return (
    <p
      className={`whitespace-pre-line text-base leading-relaxed text-current/85 ${className ?? ""}`}
    >
      {data.custom_message}
    </p>
  );
}

export function DeliverySectionHeading({
  template,
  eyebrow = "And finally",
  title = "Your gallery",
  align = "center",
}: {
  template: EventTemplate;
  eyebrow?: string;
  title?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.35em]"
        style={{ color: template.accentColor }}
      >
        {eyebrow}
      </p>
      <h2
        className="mt-3 text-3xl leading-tight sm:text-4xl"
        style={{ fontFamily: template.headingFont, color: template.inkColor }}
      >
        {title}
      </h2>
    </div>
  );
}

export function ScrollCue({ className }: { className?: string }) {
  return (
    <div
      className={`flex h-10 w-6 items-start justify-center rounded-full border border-current/50 p-1 ${className ?? ""}`}
      aria-hidden
    >
      <span className="client-anim-scroll-cue block h-2 w-1 rounded-full bg-current/70" />
    </div>
  );
}
