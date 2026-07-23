"use client";

import { useEffect } from "react";
import type { DeliveryLandingPageData } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { initials, SocialRow } from "./StudioCard";
import { IconStar, IconX } from "@/components/ui/icons";

export type NudgeReason = "download" | "likes" | "load";

const COPY: Record<NudgeReason, { title: string; body: string }> = {
  download: { title: "Enjoying your photos?", body: "A quick Google review helps the studio a lot." },
  likes: { title: "Loving the gallery?", body: "Let the studio know with a quick Google review." },
  load: { title: "Glad you're here", body: "If you enjoy the gallery, a quick Google review means a lot." },
};

/**
 * Dismissible review nudge. Appears at most twice per page load and never two
 * at once: once gently a few seconds after the gallery first renders, and once
 * in response to an action (a download, or liking several photos). Mobile gets
 * a bottom sheet; desktop a small corner card — never a persistent floating
 * button, since it always goes away on dismiss or after the CTA is used.
 */
export function ReviewNudge({
  t,
  variant,
  reason,
  reviewUrl,
  onReviewClick,
  onDismiss,
}: {
  t: ClientTheme;
  variant: "sheet" | "corner";
  reason: NudgeReason;
  reviewUrl: string;
  onReviewClick: () => void;
  onDismiss: () => void;
}) {
  const copy = COPY[reason];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const go = () => {
    onReviewClick();
    onDismiss();
  };

  if (variant === "sheet") {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[55] px-4 pb-[calc(env(safe-area-inset-bottom)+84px)]">
        <div
          className="nudge-rise relative mx-auto flex w-full max-w-[460px] items-center gap-3 rounded-2xl p-4"
          style={{ background: t.card, boxShadow: t.shadow }}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: t.accentWash, color: t.brand }}>
            <IconStar size={18} weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold" style={{ color: t.text }}>{copy.title}</div>
            <div className="text-[11.5px] font-medium" style={{ color: t.muted }}>{copy.body}</div>
          </div>
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={go}
            className="shrink-0 cursor-pointer rounded-full px-3.5 py-2 text-[12px] font-bold"
            style={{ background: t.brand, color: t.onBrand }}
          >
            Review
          </a>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full"
            style={{ color: t.faint }}
          >
            <IconX size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="nudge-rise fixed bottom-6 right-6 z-[55] w-[290px] rounded-2xl p-4"
      style={{ background: t.card, boxShadow: t.shadow, border: `1px solid ${t.border}` }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2.5 top-2.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full"
        style={{ color: t.faint }}
      >
        <IconX size={12} />
      </button>
      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: t.accentWash, color: t.brand }}>
        <IconStar size={17} weight="fill" />
      </span>
      <div className="mt-2.5 text-[13.5px] font-bold" style={{ color: t.text }}>{copy.title}</div>
      <div className="mt-0.5 text-[12px] font-medium" style={{ color: t.muted }}>{copy.body}</div>
      <a
        href={reviewUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={go}
        className="mt-3 flex cursor-pointer items-center justify-center rounded-full py-2 text-[12.5px] font-bold"
        style={{ background: t.brand, color: t.onBrand }}
      >
        Leave a review
      </a>
    </div>
  );
}

/**
 * Studio "outro" band at the end of the gallery scroll — both breakpoints.
 * The last thing a guest sees, so it carries every way to keep in touch:
 * the Google review CTA, "Talk to us", and the studio's socials.
 */
export function OutroBand({
  t,
  event,
  reviewUrl,
  onReviewClick,
  contactUrl,
  onContactClick,
}: {
  t: ClientTheme;
  event: DeliveryLandingPageData;
  reviewUrl: string | null;
  onReviewClick: () => void;
  contactUrl: string | null;
  onContactClick: () => void;
}) {
  if (!event.include_company_branding || !event.company_name) return null;
  return (
    <div className="fx-rise mx-auto mt-10 flex max-w-[520px] flex-col items-center gap-3 rounded-3xl px-8 py-10 text-center" style={{ background: t.sunken }}>
      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl" style={{ background: t.ink, color: t.brand }}>
        {event.company_logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.company_logo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[15px] font-semibold">{initials(event.company_name)}</span>
        )}
      </span>
      <div className="text-[15px] font-extrabold" style={{ color: t.text }}>That&rsquo;s the whole gallery!</div>
      <p className="max-w-[320px] text-[13px] font-medium" style={{ color: t.muted }}>
        Thank you for celebrating with {event.company_name}. If you enjoyed your photos, a quick review means a lot.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2.5">
        {reviewUrl && (
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onReviewClick}
            className="flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold"
            style={{ background: t.brand, color: t.onBrand }}
          >
            Leave us a Google review ↗
          </a>
        )}
        {contactUrl && (
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onContactClick}
            className="flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold"
            style={{ background: t.card, border: `1.5px solid ${t.border}`, color: t.text }}
          >
            Talk to us
          </a>
        )}
      </div>
      <SocialRow event={event} size={34} />
    </div>
  );
}

