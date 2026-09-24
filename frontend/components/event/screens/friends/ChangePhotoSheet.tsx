"use client";

/**
 * Change photo — pick which face of yours other guests see.
 *
 * The candidates are faces the worker already found in photos this guest
 * appears in; the backend stores the id and the detector's box for each, and
 * this picker shows the CROP it would produce rather than the photo it comes
 * from. A wedding photo shown whole tells the guest nothing about which face
 * was picked or how it will look as a circle.
 *
 * The photos themselves are fetched only when this sheet opens, through the
 * gallery's own `get-media` with the candidates' ids — so a guest who never
 * opens it never pays for them.
 */

import { useEffect, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { GuestAuthError, getGuestMedia } from "@/lib/guest-api";
import { avatarCropRect, cropStyle } from "@/lib/friend-finder/avatar";
import type { FriendAvatarCandidate } from "@/lib/friend-finder/types";
import type { GuestMediaItem } from "@/lib/types";
import { Avatar } from "./Avatar";
import { SheetShell } from "./SheetShell";

const TILE = 92;

export function ChangePhotoSheet({
  t,
  open,
  uid,
  bookingId,
  guestId,
  name,
  currentUrl,
  /** "auto" when the backend picked it, or the guest's own choice. */
  currentSource,
  candidates,
  busy,
  onClose,
  onPick,
  onUseAutomatic,
  onReauth,
}: {
  t: ClientTheme;
  open: boolean;
  uid: string;
  bookingId: string;
  guestId: string;
  name: string;
  currentUrl: string | null;
  currentSource: string | null;
  candidates: FriendAvatarCandidate[];
  busy: boolean;
  onClose: () => void;
  onPick: (candidate: FriendAvatarCandidate) => void;
  onUseAutomatic: () => void;
  onReauth: () => void;
}) {
  const [media, setMedia] = useState<Map<string, GuestMediaItem> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || candidates.length === 0) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve(); // defer — no synchronous setState in an effect body
      if (cancelled) return;
      try {
        const ids = [...new Set(candidates.map((c) => c.media_id))];
        // `mine: true` with the candidates' own ids: these are photos of this
        // guest by definition, so the request is inside what they can already
        // see and needs no new permission.
        const res = await getGuestMedia(uid, bookingId, { mine: true, limit: ids.length }, ids);
        if (cancelled) return;
        setMedia(new Map((res.media ?? []).map((m) => [m.media_id, m])));
      } catch (err) {
        if (cancelled) return;
        if (err instanceof GuestAuthError) onReauth();
        else setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, candidates, uid, bookingId, onReauth]);

  return (
    <SheetShell t={t} open={open} onClose={onClose} title="Change photo">
      <div className="flex items-center gap-3 pb-1">
        <Avatar t={t} guestId={guestId} name={name} url={currentUrl} size={56} />
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold" style={{ color: t.text }}>
            {currentUrl ? "Your picture now" : "Your initials show now"}
          </p>
          <p className="text-[12px] font-semibold" style={{ color: t.muted }}>
            {currentSource === "auto" || !currentSource ? "Chosen automatically" : "Chosen by you"}
          </p>
        </div>
      </div>

      {candidates.length === 0 ? (
        <p className="mt-4 text-[13px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
          No clear photo of you yet, so your initials show.
        </p>
      ) : (
        <>
          <p className="mt-4 text-[12px] font-extrabold" style={{ color: t.text }}>
            Pick a photo
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {candidates.map((candidate) => (
              <CandidateTile
                key={`${candidate.media_id}:${candidate.face_index}`}
                t={t}
                candidate={candidate}
                item={media?.get(candidate.media_id)}
                loading={media === null && !failed}
                busy={busy}
                onPick={() => onPick(candidate)}
              />
            ))}
          </div>
          {failed && (
            <p className="mt-3 text-[12px] font-semibold" style={{ color: t.muted }}>
              Couldn&rsquo;t load your photos. Close this and try again.
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onUseAutomatic}
        disabled={busy}
        className="mt-5 min-h-[44px] w-full cursor-pointer rounded-full text-[13px] font-bold disabled:opacity-50"
        style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
      >
        Use automatic
      </button>
    </SheetShell>
  );
}

/**
 * One candidate, shown as the circle it would become.
 *
 * The crop is computed from the image's own `naturalWidth`/`naturalHeight`
 * rather than from the media document, because the detector measured the
 * 2560px delivery copy and that is the image rendered here — reading the size
 * off the element means nothing has to assume a scale factor.
 */
function CandidateTile({
  t,
  candidate,
  item,
  loading,
  busy,
  onPick,
}: {
  t: ClientTheme;
  candidate: FriendAvatarCandidate;
  item: GuestMediaItem | undefined;
  loading: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const rect = natural ? avatarCropRect(candidate.bbox, natural) : null;

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={busy || !item}
      aria-label="Use this photo"
      className="relative shrink-0 cursor-pointer overflow-hidden rounded-full transition-transform active:scale-95 disabled:cursor-not-allowed"
      style={{ width: TILE, height: TILE, background: t.sunken, opacity: busy ? 0.5 : 1 }}
    >
      {loading && <span aria-hidden className="skeleton absolute inset-0 rounded-full" />}
      {item && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt=""
          decoding="async"
          onLoad={(e) =>
            setNatural({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
          // Before the dimensions are known the photo fills the circle
          // uncropped, which is a worse picture but never a broken one.
          className={rect ? "block" : "block h-full w-full object-cover"}
          style={rect && natural ? cropStyle(rect, natural, TILE) : undefined}
        />
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: `inset 0 0 0 2px ${t.border}` }}
      />
    </button>
  );
}
