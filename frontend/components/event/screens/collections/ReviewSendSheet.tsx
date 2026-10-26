"use client";

import { useEffect, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { ApiError } from "@/lib/api";
import { GuestAuthError } from "@/lib/guest-api";
import { reviewCollections } from "@/lib/collections/api";
import {
  folderSummary,
  reviewCardState,
  reviewDefaults,
  sendButtonLabel,
  sendConfirmText,
  sentText,
  statusLabel,
  targetStatus,
} from "@/lib/collections/logic";
import type { ReviewCollection } from "@/lib/collections/types";
import { IconCheck } from "@/components/ui/icons";
import { CheckBox, CollectionSheet, PrimaryButton } from "./CollectionSheet";
import { ConfirmDialog } from "./CollectionsSegment";
import type { CollectionsApi } from "./useCollections";

/**
 * Review and send: the Client's handoff, per collection (spec §4.4). One card
 * per collection with its count, folders, six photos and target; every
 * non-empty draft checked to start with. Sent ones show when, and cannot be
 * picked; empty ones cannot either. One button, one confirm, then a calm
 * full-card "Sent." with the way back to the gallery.
 *
 * Full-screen on a phone, a 640px modal on desktop.
 */
export function ReviewSendSheet({
  t,
  desktop,
  studio,
  uid,
  bookingId,
  col,
  onClose,
  onReauth,
}: {
  t: ClientTheme;
  desktop: boolean;
  studio: string;
  uid: string;
  bookingId: string;
  col: CollectionsApi;
  onClose: () => void;
  onReauth: () => void;
}) {
  const [review, setReview] = useState<ReviewCollection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    reviewCollections(uid, bookingId)
      .then((res) => {
        if (cancelled) return;
        setReview(res.collections ?? []);
        setPicked(reviewDefaults(res.collections ?? []));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof GuestAuthError) onReauth();
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, bookingId, onReauth]);

  // The live list wins for status: the other Client may have sent one since.
  const cards = (review ?? []).map((r) => {
    const live = col.collectionsById.get(r._id);
    return live ? { ...r, status: live.status, finalized_at: live.finalized_at, name: live.name } : r;
  });
  const chosen = cards.filter((c) => picked?.has(c._id) && reviewCardState(c) === "sendable");

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (sent != null) {
    return (
      <CollectionSheet t={t} desktop={desktop} phone="full" width={640} title="Review and send" onClose={onClose}>
        <div className="flex flex-col items-center px-2 py-16 text-center">
          <span className="lounge-rise flex h-16 w-16 items-center justify-center rounded-full" style={{ background: t.accentWash, color: t.brand }}>
            <IconCheck size={30} weight="bold" />
          </span>
          <h3 className="lounge-rise mt-5 text-[22px] font-extrabold" style={{ color: t.text, animationDelay: "0.08s" }}>
            {sentText(studio)}
          </h3>
          <p className="lounge-rise mt-2 max-w-[340px] text-[13.5px] font-semibold leading-relaxed" style={{ color: t.muted, animationDelay: "0.16s" }}>
            {sent.toLocaleString("en-IN")} {sent === 1 ? "photo is" : "photos are"} on their way to your albums.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="lounge-rise mt-8 cursor-pointer rounded-full px-7 py-3.5 text-[14.5px] font-extrabold"
            style={{ background: t.brand, color: t.onBrand, animationDelay: "0.24s" }}
          >
            Back to gallery
          </button>
        </div>
      </CollectionSheet>
    );
  }

  return (
    <>
      <CollectionSheet
        t={t}
        desktop={desktop}
        phone="full"
        width={640}
        title="Review and send"
        subtitle="Choose the collections that are ready"
        onClose={onClose}
        footer={
          <PrimaryButton t={t} onClick={() => setConfirming(true)} disabled={chosen.length === 0}>
            {chosen.length ? sendButtonLabel(chosen.length, studio) : "Pick a collection to send"}
          </PrimaryButton>
        }
      >
        {failed ? (
          <p className="py-10 text-center text-[13.5px] font-semibold" style={{ color: t.muted }}>
            Couldn’t load your collections. Close this and try again.
          </p>
        ) : !review ? (
          <div className="flex flex-col gap-3 py-2">
            {[0, 1].map((i) => (
              <div key={i} className="tile-skeleton h-40 rounded-2xl" style={{ ["--skel-a" as string]: t.sunken, ["--skel-b" as string]: t.card }} />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <p className="py-10 text-center text-[13.5px] font-semibold" style={{ color: t.muted }}>
            No collections yet. Add photos to a collection first.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 pb-2" role="list">
            {cards.map((c) => {
              const state = reviewCardState(c);
              const on = state === "sendable" && !!picked?.has(c._id);
              const target = targetStatus(c.count, c.target_count);
              return (
                <li key={c._id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-disabled={state !== "sendable"}
                    onClick={() => state === "sendable" && toggle(c._id)}
                    className="w-full cursor-pointer rounded-2xl p-4 text-left transition-colors disabled:cursor-default"
                    style={{
                      background: on ? t.accentWash : t.bg,
                      border: `1.5px solid ${on ? t.brand : t.border}`,
                      opacity: state === "empty" ? 0.55 : 1,
                      cursor: state === "sendable" ? "pointer" : "default",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <CheckBox t={t} state={on ? "checked" : "unchecked"} disabled={state !== "sendable"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold" style={{ color: t.text }}>
                            {c.name}
                          </span>
                          <span className="shrink-0 text-[12.5px] font-bold" style={{ color: t.muted }}>
                            {state === "sent" ? statusLabel(c) : state === "empty" ? "Empty" : `${c.count.toLocaleString("en-IN")} ${c.count === 1 ? "photo" : "photos"}`}
                          </span>
                        </div>
                        {c.folders.length > 0 && (
                          <div className="mt-1 truncate text-[12px] font-semibold" style={{ color: t.muted }}>
                            {folderSummary(c.folders, 4)}
                          </div>
                        )}
                        {target && (
                          <div className="mt-1 text-[12px] font-bold" style={{ color: target.note ? t.brand : t.muted }}>
                            {target.note ?? target.label}
                          </div>
                        )}
                      </div>
                    </div>
                    {c.sample_urls.length > 0 && (
                      <div className="mt-3 grid grid-cols-6 gap-1 pl-[34px]">
                        {c.sample_urls.slice(0, 6).map((u, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={u} alt="" loading="lazy" draggable={false} className="aspect-square w-full rounded-lg object-cover" />
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CollectionSheet>

      {confirming && (
        <ConfirmDialog
          t={t}
          desktop={desktop}
          title={sendButtonLabel(chosen.length, studio)}
          sentence={sendConfirmText(studio)}
          confirm="Send"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            try {
              await col.send(chosen.map((c) => c._id));
              setSent(chosen.reduce((n, c) => n + c.count, 0));
            } catch (err) {
              if (err instanceof GuestAuthError) onReauth();
              throw new Error(
                err instanceof ApiError && (err.body as { code?: string } | null)?.code === "collection_empty"
                  ? "One of these collections is empty now. Close this and check."
                  : "Couldn’t send. Check your connection and try again.",
              );
            }
          }}
        />
      )}
    </>
  );
}
