"use client";

import type { DeliveryUrl, Provider } from "@/lib/types";

type Props = {
  link: DeliveryUrl;
  style: "minimal" | "elevated" | "bordered";
  onClick: (provider: string) => void;
};

const STYLE_CLASSES: Record<Props["style"], string> = {
  minimal:
    "border border-current/10 bg-white/60 backdrop-blur-sm hover:border-current/30",
  elevated:
    "bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)]",
  bordered:
    "border-2 bg-white hover:bg-white/95",
};

export function DeliveryLinkCard({ link, style, onClick }: Props) {
  const accent = "var(--color-accent)";
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      onClick={() => onClick(link.provider)}
      className={`group flex items-center gap-4 rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 sm:p-5 ${STYLE_CLASSES[style]}`}
      style={style === "bordered" ? { borderColor: accent } : undefined}
    >
      <ProviderBadge provider={link.provider} accent={accent} />

      <div className="min-w-0 flex-1">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: accent }}
        >
          {link.content_type}
        </p>
        <p className="mt-0.5 truncate text-lg font-semibold text-zinc-900">
          {link.provider}
        </p>
        <p className="mt-1 truncate text-xs text-zinc-500">
          {prettyUrl(link.url)}
        </p>
      </div>

      <span
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-transform group-hover:translate-x-1"
        style={{ background: accent }}
        aria-hidden
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12h14M13 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </a>
  );
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ProviderBadge({
  provider,
  accent,
}: {
  provider: Provider;
  accent: string;
}) {
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
      style={{ background: `${accent}1a`, color: accent }}
    >
      <ProviderIcon provider={provider} className="h-7 w-7" />
    </div>
  );
}

function ProviderIcon({
  provider,
  className,
}: {
  provider: Provider;
  className?: string;
}) {
  switch (provider) {
    case "Kwikpic":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <rect
            x="3"
            y="6"
            width="18"
            height="14"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M8 6l2-3h4l2 3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "Google Drive":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M7.7 3l-5.2 9 2.5 4.3L10.2 7.3 7.7 3z" opacity="0.85" />
          <path d="M16.3 3H7.7l5.4 9.5h8.4L16.3 3z" opacity="0.6" />
          <path d="M21.5 12.5h-8.4l-2.6 4.5L13.1 21h2.5l5.9-8.5z" opacity="0.95" />
        </svg>
      );
    case "WeTransfer":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <path
            d="M3 8l3 9 3-6 3 6 3-9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="19" cy="9" r="2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case "Samaro":
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <path
            d="M16 7c-1.5-1.5-3.5-2-5.5-2C7 5 5 7 5 9.5S7 13 10 14s5 1.5 5 4-2 3.5-4.5 3.5-4.5-1-6-2.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case "Other":
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className}>
          <path
            d="M10 14l-3 3a3.5 3.5 0 11-5-5l3-3M14 10l3-3a3.5 3.5 0 115 5l-3 3M9 15l6-6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}
