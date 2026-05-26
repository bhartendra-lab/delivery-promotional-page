"use client";

import { useState } from "react";
import type { DeliveryUrl, KvData } from "@/lib/types";
import type { Tokens } from "./tokens";
import {
  ArrowRight,
  BookIcon,
  CamIcon,
  FilmIcon,
  ShareIcon,
} from "./icons";

type Props = {
  data: KvData;
  tokens: Tokens;
  onDeliveryClick: (provider: string) => void;
};

/**
 * Access buttons + "Share with family" share button. Reference HTML
 * lines 433–513.
 *
 * - First delivery URL renders as the primary accent-coloured button.
 * - Subsequent URLs render as secondary cards (bgCard + borderHi).
 * - Share button below uses navigator.share, falls back to clipboard copy
 *   with a toast.
 */
export function AccessSection({ data, tokens, onDeliveryClick }: Props) {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string, ms = 2000) => {
    setToast(msg);
    setTimeout(() => setToast(null), ms);
  };

  const share = async () => {
    const shareData = {
      title: data.client_name
        ? `${data.client_name} — ${data.company_name ?? "Studio"}`
        : data.company_name ?? "Studio",
      url: typeof window !== "undefined" ? window.location.href : "",
    };
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // user cancelled or share failed; fall through to clipboard.
    }
    try {
      await navigator.clipboard?.writeText(shareData.url);
      showToast("Link copied to clipboard");
    } catch {
      showToast("Couldn't copy — please copy the URL manually");
    }
  };

  const items = data.delivery_urls;

  return (
    <section className="px-6 pt-8">
      {items.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {items.map((item, idx) => (
            <AccessButton
              key={`${item.url}-${idx}`}
              link={item}
              tokens={tokens}
              primary={idx === 0}
              onClick={() => onDeliveryClick(item.provider)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={share}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl px-[18px] py-[13px] text-[13px] font-semibold transition-colors"
        style={{
          background: "transparent",
          border: `1px solid ${tokens.border}`,
          color: tokens.muted,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = tokens.text;
          e.currentTarget.style.borderColor = tokens.borderHi;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = tokens.muted;
          e.currentTarget.style.borderColor = tokens.border;
        }}
      >
        <ShareIcon s={15} c="currentColor" /> Share with family
      </button>

      {toast && (
        <div
          className="fixed bottom-7 left-1/2 z-[200] -translate-x-1/2 whitespace-nowrap rounded-lg px-5 py-2.5 text-[13px] font-medium"
          style={{
            background: tokens.bgRaised,
            color: tokens.text,
            border: `1px solid ${tokens.borderHi}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}
    </section>
  );
}

function AccessButton({
  link,
  tokens,
  primary,
  onClick,
}: {
  link: DeliveryUrl;
  tokens: Tokens;
  primary: boolean;
  onClick: () => void;
}) {
  const label = labelFor(link);
  const sub = `${link.provider} · Tap to open`;
  const iconColor = primary ? "#ffffff" : tokens.text;
  const textColor = primary ? "#ffffff" : tokens.text;
  const subColor = primary ? "rgba(255,255,255,0.65)" : tokens.muted;

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-[18px] py-[17px] text-left transition-opacity"
      style={{
        background: primary ? tokens.accent : tokens.bgCard,
        border: `1px solid ${primary ? tokens.accent : tokens.borderHi}`,
        color: textColor,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      <div className="flex items-center gap-3.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
          style={{
            background: primary ? "rgba(255,255,255,0.15)" : tokens.bgRaised,
          }}
        >
          {renderIcon(link, iconColor)}
        </div>
        <div>
          <div className="text-[15px] font-bold leading-[1.3]">{label}</div>
          <div className="mt-0.5 text-[12px]" style={{ color: subColor }}>
            {sub}
          </div>
        </div>
      </div>
      <ArrowRight
        s={16}
        c={primary ? "rgba(255,255,255,0.7)" : tokens.muted}
      />
    </a>
  );
}

function labelFor(link: DeliveryUrl): string {
  switch (link.content_type) {
    case "Videos":
      return "Watch your videos";
    case "Images & Videos":
      return "View your gallery";
    case "Images":
    default:
      return "View your photos";
  }
}

function renderIcon(link: DeliveryUrl, color: string) {
  switch (link.content_type) {
    case "Videos":
      return <FilmIcon s={20} c={color} />;
    case "Images & Videos":
      return <BookIcon s={20} c={color} />;
    case "Images":
    default:
      return <CamIcon s={20} c={color} />;
  }
}
