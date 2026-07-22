"use client";

import type { DeliveryLandingPageData } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { StudioMenu } from "./StudioMenu";

/** Above this length the studio name crowds the centered event name out. */
const SHORT_STUDIO_NAME = 18;

/**
 * Condensed persistent top bar for mobile — mirrors the desktop `TopBar` but
 * sized down, and present on ALL THREE tabs (Home / Gallery / Liked) so the
 * studio identity and actions never disappear.
 *
 * Space is tight below `lg`, so things collapse in a fixed priority order:
 *   1. the icons (review / share / profile) always survive;
 *   2. the centered event name drops first — it's hidden on Home entirely,
 *      and elsewhere only appears from `sm` up AND when the studio name is
 *      short enough not to fight it;
 *   3. the studio-name TEXT goes last, hidden on the narrowest phones so the
 *      logo + caret still open the menu.
 */
export function MobileTopBar({
  t,
  event,
  hasStudio,
  showEventName,
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
  /** False on Home — the cover already carries the event name there. */
  showEventName: boolean;
  reviewUrl: string | null;
  contactUrl: string | null;
  onReviewClick: () => void;
  onContactClick: () => void;
  onShare: () => void;
  onOpenProfile: () => void;
  onResetToTop: () => void;
  guestName?: string;
  selfieUrl: string | null;
}) {
  const studioNameIsShort = (event.company_name?.length ?? 0) <= SHORT_STUDIO_NAME;
  const centerName = showEventName && studioNameIsShort;

  return (
    <div
      className="relative z-40 flex h-14 shrink-0 items-center gap-1 px-3"
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
            compact
          />
        )}
      </div>

      {centerName && (
        <div className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden sm:flex">
          <span
            className="truncate text-[13.5px] font-semibold italic"
            style={{ fontFamily: "var(--font-playfair), Georgia, serif", color: t.text }}
          >
            {event.event_name}
          </span>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        {reviewUrl && (
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onReviewClick}
            aria-label="Leave a Google review"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full"
            style={{ color: t.brand }}
          >
            <StarIcon size={16} />
          </a>
        )}
        <button
          type="button"
          onClick={onShare}
          aria-label="Share gallery"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full"
          style={{ color: t.muted }}
        >
          <ShareIcon size={16} />
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Your profile"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[12px] font-semibold transition-transform active:scale-95"
          style={{ background: t.ring, padding: 2 }}
        >
          <span
            className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
            style={{ background: t.card, color: t.brand }}
          >
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

function StarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.6l-6.1 3.3 1.5-6.8-5.2-4.6 6.9-.7z" />
    </svg>
  );
}
function ShareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13M8 7l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}
