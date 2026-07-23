"use client";

import type { DeliveryLandingPageData } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { StudioMenu } from "./StudioMenu";

/**
 * Desktop sticky top bar — replaces the SideRail. Studio identity + menu on
 * the left, the couple/event name fades in centre once the cover has scrolled
 * past (so it reads as a persistent title once the masthead itself is gone),
 * and Review (standing CTA #2) + Share + profile avatar on the right.
 */
export function TopBar({
  t,
  event,
  hasStudio,
  showName,
  reviewUrl,
  contactUrl,
  onReviewClick,
  onContactClick,
  onShare,
  onOpenProfile,
  onResetToTop,
  guestName,
  selfieUrl,
}: {
  t: ClientTheme;
  event: DeliveryLandingPageData;
  hasStudio: boolean;
  showName: boolean;
  reviewUrl: string | null;
  contactUrl: string | null;
  onReviewClick: () => void;
  onContactClick: () => void;
  onShare: () => void;
  onOpenProfile: () => void;
  /** Smooth-scrolls the desktop scroll container back to the cover. */
  onResetToTop: () => void;
  guestName?: string;
  selfieUrl: string | null;
}) {
  return (
    <div
      className="relative z-50 flex h-16 shrink-0 items-center justify-between gap-3 px-6 lg:px-9"
      style={{ background: t.card, borderBottom: `1px solid ${t.border}` }}
    >
      <div className="flex min-w-0 flex-1 items-center">
        {hasStudio && (
          <StudioMenu
            t={t}
            event={event}
            contactUrl={contactUrl}
            onContactClick={onContactClick}
            onResetToTop={onResetToTop}
          />
        )}
      </div>

      <div
        className="flex min-w-0 flex-[1.4] items-center justify-center overflow-hidden text-center transition-opacity duration-300"
        style={{ opacity: showName ? 1 : 0, pointerEvents: showName ? "auto" : "none" }}
      >
        <span
          className="truncate text-[40px] font- italic"
          style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: t.text }}
        >
          {event.event_name}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        {reviewUrl && (
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onReviewClick}
            aria-label="Leave a Google review"
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors"
            style={{ color: t.brand }}
          >
            <MegaphoneIcon size={18} />
            <span className="hidden xl:inline">Review us</span>
          </a>
        )}
        <button
          type="button"
          onClick={onShare}
          aria-label="Share gallery"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors"
          style={{ color: t.muted }}
        >
          <ShareIcon size={18} />
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Your profile"
          className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-[14px] font-semibold transition-transform active:scale-95"
          style={{ background: t.ring, padding: 2 }}
        >
          <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full" style={{ background: t.card, color: t.brand }}>
            {selfieUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selfieUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (guestName?.[0] ?? "·").toUpperCase()
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

function MegaphoneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}
function ShareIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13M8 7l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}
