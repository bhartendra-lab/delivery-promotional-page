"use client";

import { useEffect, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { GuestAuthError } from "@/lib/guest-api";
import { listLikers } from "@/lib/collections/api";
import { initialsOf } from "@/lib/collections/logic";
import type { Liker } from "@/lib/collections/types";
import { IconCheck } from "@/components/ui/icons";
import { CheckBox, CollectionSheet, PrimaryButton } from "./CollectionSheet";

/**
 * People: everyone at the event who liked something, with their face, most
 * likes first. Multi-select; Done applies. Names, faces and teams only (the
 * endpoint never sends a phone number or an email).
 */
export function LikersSheet({
  t,
  desktop,
  uid,
  bookingId,
  selected,
  onApply,
  onClose,
  onReauth,
}: {
  t: ClientTheme;
  desktop: boolean;
  uid: string;
  bookingId: string;
  selected: readonly string[];
  onApply: (ids: string[], names: Map<string, string>) => void;
  onClose: () => void;
  onReauth: () => void;
}) {
  const [likers, setLikers] = useState<Liker[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected));
  useEffect(() => {
    let cancelled = false;
    listLikers(uid, bookingId)
      .then((res) => {
        if (!cancelled) setLikers(res.likers ?? []);
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

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <CollectionSheet
      t={t}
      desktop={desktop}
      title="People"
      subtitle="Show photos these people liked"
      onClose={onClose}
      footer={
        <PrimaryButton
          t={t}
          onClick={() => onApply([...picked], new Map((likers ?? []).map((l) => [l._id, l.name])))}
          disabled={!likers}
        >
          {picked.size ? `Show ${picked.size === 1 ? "1 person’s" : `${picked.size} people’s`} likes` : "Show everyone’s likes"}
        </PrimaryButton>
      }
    >
      {failed ? (
        <p className="py-6 text-center text-[13px] font-semibold" style={{ color: t.muted }}>
          Couldn’t load who liked what. Try again in a moment.
        </p>
      ) : !likers ? (
        <div className="flex flex-col gap-2 py-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tile-skeleton h-12 rounded-2xl" style={{ ["--skel-a" as string]: t.sunken, ["--skel-b" as string]: t.card }} />
          ))}
        </div>
      ) : likers.length === 0 ? (
        <p className="py-6 text-center text-[13px] font-semibold" style={{ color: t.muted }}>
          Nobody has liked a photo yet.
        </p>
      ) : (
        <ul className="-mx-2 pb-1" role="list">
          {likers.map((l) => (
            <li key={l._id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={picked.has(l._id)}
                onClick={() => toggle(l._id)}
                className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-2xl px-2 py-1.5 text-left active:bg-[var(--row-hover)] can-hover:hover:bg-[var(--row-hover)]"
                style={{ ["--row-hover" as string]: t.sunken }}
              >
                <Face t={t} name={l.name} url={l.profile_face_url ?? null} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold" style={{ color: t.text }}>
                    {l.name}
                  </span>
                  <span className="block truncate text-[12px] font-semibold" style={{ color: t.muted }}>
                    {[l.guest_sub_type, `${l.likes_count.toLocaleString("en-IN")} ${l.likes_count === 1 ? "like" : "likes"}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <CheckBox t={t} state={picked.has(l._id) ? "checked" : "unchecked"} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </CollectionSheet>
  );
}

/** A round face, or initials on the theme's sunken fill. */
export function Face({ t, name, url, size = 40 }: { t: ClientTheme; name: string; url: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-extrabold"
      style={{ width: size, height: size, background: t.sunken, color: t.brand }}
    >
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} onError={() => setBroken(true)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

export type PickerOption = { id: string; label: string; detail?: string | null };

/** One choice from a short list (Folders, In collection, Sort). */
export function PickerSheet({
  t,
  desktop,
  title,
  options,
  value,
  allLabel,
  onPick,
  onClose,
}: {
  t: ClientTheme;
  desktop: boolean;
  title: string;
  options: PickerOption[];
  value: string | null;
  /** A first row meaning "no narrowing", or none. */
  allLabel?: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const rows: (PickerOption & { value: string | null })[] = [
    ...(allLabel ? [{ id: "__all", label: allLabel, value: null }] : []),
    ...options.map((o) => ({ ...o, value: o.id })),
  ];
  return (
    <CollectionSheet t={t} desktop={desktop} title={title} onClose={onClose}>
      <ul className="-mx-2 pb-1" role="listbox" aria-label={title}>
        {rows.map((o) => {
          const on = o.value === value;
          return (
            <li key={o.id}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => onPick(o.value)}
                className="flex min-h-[50px] w-full cursor-pointer items-center gap-3 rounded-2xl px-2 text-left active:bg-[var(--row-hover)] can-hover:hover:bg-[var(--row-hover)]"
                style={{ ["--row-hover" as string]: t.sunken }}
              >
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold" style={{ color: on ? t.brand : t.text }}>
                  {o.label}
                </span>
                {o.detail && (
                  <span className="shrink-0 text-[12.5px] font-bold tabular-nums" style={{ color: t.faint }}>
                    {o.detail}
                  </span>
                )}
                <span className="flex w-5 shrink-0 justify-center" style={{ color: t.brand }}>
                  {on && <IconCheck size={17} weight="bold" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </CollectionSheet>
  );
}
