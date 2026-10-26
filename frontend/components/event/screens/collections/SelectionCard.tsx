"use client";

import { useEffect, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { GuestAuthError } from "@/lib/guest-api";
import { getCuratorFeed } from "@/lib/collections/api";
import { selectionCardState, shortDate, startCardText, unsortedLabel } from "@/lib/collections/logic";
import { IconArrowRight, IconHeart } from "@/components/ui/icons";
import type { CollectionsApi } from "./useCollections";

/**
 * The curator's card on the home view (under the cover on both shells): where
 * the album selection stands, in one glance, and the way back into it.
 *
 *   start     nothing liked or saved yet: what to do, and "Start selecting"
 *   progress  a chip per collection with photos, what is left to sort,
 *             "Continue" and, for Clients, "Review and send"
 *   sent      every collection with photos is with the studio
 */
export function SelectionCard({
  t,
  studio,
  col,
  uid,
  bookingId,
  onStart,
  onContinue,
  onOpenCollection,
  onReview,
  onReauth,
  className = "",
}: {
  t: ClientTheme;
  studio: string;
  col: CollectionsApi;
  uid: string;
  bookingId: string;
  onStart: () => void;
  onContinue: () => void;
  onOpenCollection: (collectionId: string) => void;
  onReview: () => void;
  onReauth: () => void;
  className?: string;
}) {
  const [counts, setCounts] = useState<{ liked: number; unsorted: number } | null>(null);
  const sig = col.collections.map((c) => `${c._id}:${c.count}:${c.status}`).join("|");
  useEffect(() => {
    let cancelled = false;
    getCuratorFeed(uid, bookingId, { view: "liked", limit: 1 })
      .then((res) => {
        if (!cancelled) setCounts({ liked: res.total ?? 0, unsorted: res.unsorted_count ?? 0 });
      })
      .catch((err) => {
        if (err instanceof GuestAuthError) onReauth();
      });
    return () => {
      cancelled = true;
    };
  }, [uid, bookingId, sig, onReauth]);

  if (!col.loaded || !counts) return null;
  const state = selectionCardState(col.collections, counts.liked);
  const filled = col.collections.filter((c) => c.count > 0);

  return (
    <section
      aria-label="Your album selection"
      className={`lounge-rise rounded-[20px] p-5 ${className}`}
      style={{ background: t.card, boxShadow: t.shadow, fontFamily: t.font }}
    >
      {state === "start" ? (
        <>
          <div className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: t.brand }}>
            <IconHeart size={14} filled />
            Album selection
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-relaxed" style={{ color: t.text }}>
            {startCardText(col.collections)}
          </p>
          <CardButton t={t} primary onClick={onStart}>
            Start selecting
          </CardButton>
        </>
      ) : state === "sent" ? (
        <>
          <h3 className="text-[17px] font-extrabold" style={{ color: t.text }}>
            Sent to {studio}
          </h3>
          <ul className="mt-2 flex flex-col gap-1" role="list">
            {filled.map((c) => (
              <li key={c._id} className="flex items-center justify-between gap-3 text-[13px] font-semibold" style={{ color: t.muted }}>
                <span className="truncate" style={{ color: t.text }}>
                  {c.name}
                </span>
                <span className="shrink-0 tabular-nums">
                  {c.count.toLocaleString("en-IN")} · {shortDate(c.finalized_at) ?? "Sent"}
                </span>
              </li>
            ))}
          </ul>
          <CardButton t={t} onClick={onContinue}>
            View selection
          </CardButton>
        </>
      ) : (
        <>
          <h3 className="text-[17px] font-extrabold" style={{ color: t.text }}>
            Your album selection
          </h3>
          {filled.length > 0 && (
            <div className="-mx-1 mt-3 flex flex-wrap gap-2 px-1">
              {filled.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => onOpenCollection(c._id)}
                  className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-bold"
                  style={{ background: t.sunken, color: t.text }}
                >
                  <span
                    aria-label={c.status === "final" ? "Sent" : "Draft"}
                    className="h-2 w-2 rounded-full"
                    style={{ background: c.status === "final" ? t.brand : t.faint }}
                  />
                  <span className="max-w-[160px] truncate">{c.name}</span>
                  <span className="tabular-nums" style={{ color: t.muted }}>
                    {c.count.toLocaleString("en-IN")}
                  </span>
                </button>
              ))}
            </div>
          )}
          {counts.unsorted > 0 && (
            <p className="mt-3 text-[13px] font-semibold" style={{ color: t.muted }}>
              {unsortedLabel(counts.unsorted)}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <CardButton t={t} primary inline onClick={onContinue}>
              Continue
            </CardButton>
            {col.caps.canSend && filled.some((c) => c.status === "draft") && (
              <CardButton t={t} inline onClick={onReview}>
                Review and send
              </CardButton>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function CardButton({
  t,
  primary,
  inline,
  onClick,
  children,
}: {
  t: ClientTheme;
  primary?: boolean;
  inline?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${inline ? "" : "mt-4"} inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] font-extrabold transition-transform active:scale-[0.99] ${primary ? "cta-shine" : ""}`}
      style={primary ? { background: t.brand, color: t.onBrand } : { background: t.accentWash, color: t.brand }}
    >
      {children}
      {primary && <IconArrowRight size={15} weight="bold" />}
    </button>
  );
}
