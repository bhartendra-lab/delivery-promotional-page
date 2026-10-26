"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientTheme } from "@/lib/client-theme";
import { ApiError } from "@/lib/api";
import { GuestAuthError } from "@/lib/guest-api";
import { getGuestControl, regeneratePasscode, setCollectionEditor } from "@/lib/collections/api";
import { capFirst, editorCounter, editorSwitchState, levelBadge, matchesPeopleQuery } from "@/lib/collections/logic";
import type { GuestControl, GuestControlRow } from "@/lib/collections/types";
import { galleryUrlForDomain } from "@/lib/gallery-url";
import { copyText, galleryInviteMessage, passcodeShareMessage, shareTextOrCopy } from "@/lib/share-message";
import { IconCopy, IconRestore, IconSearch, IconShare } from "@/components/ui/icons";
import { CollectionSheet } from "./CollectionSheet";
import { ConfirmDialog } from "./CollectionsSegment";
import { Face } from "./PickerSheets";
import type { Notify } from "./useCuratorActions";

/**
 * Guest Control: the Client's own small Access & Sharing. Share the gallery,
 * the family passcode, and who may edit the album selection (up to six).
 *
 * Names, faces and teams only. The endpoint never sends a phone number or an
 * email, and this screen would not show one if it did: that data is the
 * studio's.
 *
 * Full-screen with a back chevron on a phone; a 560px right-side drawer on
 * desktop.
 */
export function GuestControlSheet({
  t,
  desktop,
  studio,
  uid,
  bookingId,
  eventName,
  faceSearchOn,
  notify,
  onClose,
  onReauth,
}: {
  t: ClientTheme;
  desktop: boolean;
  studio: string;
  uid: string;
  bookingId: string;
  eventName: string;
  faceSearchOn: boolean;
  notify: Notify;
  onClose: () => void;
  onReauth: () => void;
}) {
  const [data, setData] = useState<GuestControl | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [regenOpen, setRegenOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getGuestControl(uid, bookingId)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setFailed(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof GuestAuthError) onReauth();
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, bookingId, onReauth, tick]);

  const url = data ? galleryUrlForDomain(data.custom_domain, data.unique_identifier) : null;

  const shareLink = async () => {
    if (!url) return;
    const r = await shareTextOrCopy(galleryInviteMessage({ eventName, url, faceSearchOn }), eventName);
    if (r === "copied") notify("Link copied");
    else if (r === "failed") notify("Couldn’t share");
  };
  const copyLink = async () => {
    if (!url) return;
    notify((await copyText(url)) === "copied" ? "Link copied" : "Couldn’t copy");
  };
  const copyPasscode = async () => {
    if (!data?.passcode) return;
    notify((await copyText(data.passcode)) === "copied" ? "Passcode copied" : "Couldn’t copy");
  };
  const sharePasscode = async () => {
    if (!data?.passcode) return;
    const r = await shareTextOrCopy(passcodeShareMessage({ passcode: data.passcode, eventName, url }), eventName);
    if (r === "copied") notify("Passcode copied");
    else if (r === "failed") notify("Couldn’t share");
  };

  /** Optimistic: the switch moves at once and goes back if the server says no. */
  const setEditor = useCallback(
    async (row: GuestControlRow, enabled: boolean) => {
      if (!data || pending.has(row._id)) return;
      const before = data;
      const optimistic: GuestControlRow = { ...row, level: enabled ? "editor" : "host", editor_source: enabled ? "client" : null };
      setPending((p) => new Set(p).add(row._id));
      setData((d) =>
        d
          ? {
              ...d,
              guests: d.guests.map((g) => (g._id === row._id ? optimistic : g)),
              editors: { ...d.editors, used: Math.max(0, d.editors.used + (enabled ? 1 : -1)) },
            }
          : d,
      );
      try {
        const res = await setCollectionEditor(uid, bookingId, row._id, enabled);
        setData((d) => (d ? { ...d, guests: d.guests.map((g) => (g._id === row._id ? res.guest : g)), editors: res.editors } : d));
      } catch (err) {
        if (err instanceof GuestAuthError) onReauth();
        setData(before);
        const code = err instanceof ApiError ? (err.body as { code?: string } | null)?.code : undefined;
        if (code === "stale") setTick((n) => n + 1);
        notify(
          code === "editor_limit"
            ? `You can add up to ${before.editors.max} editors.`
            : code === "stale"
              ? "This changed somewhere else. Showing the latest."
              : "Couldn’t change that. Try again.",
        );
      } finally {
        setPending((p) => {
          const n = new Set(p);
          n.delete(row._id);
          return n;
        });
      }
    },
    [data, pending, uid, bookingId, notify, onReauth],
  );

  const rows = useMemo(() => (data?.guests ?? []).filter((g) => matchesPeopleQuery(g, query)), [data, query]);

  return (
    <>
      <CollectionSheet t={t} desktop={desktop} phone="full" desktopKind="drawer" width={560} title="Guest Control" onClose={onClose}>
        {failed ? (
          <p className="py-10 text-center text-[13.5px] font-semibold" style={{ color: t.muted }}>
            Couldn’t load Guest Control. Close this and try again.
          </p>
        ) : !data ? (
          <div className="flex flex-col gap-3 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="tile-skeleton h-24 rounded-2xl" style={{ ["--skel-a" as string]: t.sunken, ["--skel-b" as string]: t.card }} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-6 pb-4">
            <Section t={t} title="Share the gallery">
              {url ? (
                <>
                  <div className="truncate rounded-xl px-3.5 py-3 text-[13px] font-semibold" style={{ background: t.sunken, color: t.text }}>
                    {url}
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <ActionButton t={t} onClick={() => void copyLink()} icon={<IconCopy size={16} />}>
                      Copy
                    </ActionButton>
                    <ActionButton t={t} primary onClick={() => void shareLink()} icon={<IconShare size={16} />}>
                      Share
                    </ActionButton>
                  </div>
                </>
              ) : (
                <p className="text-[13px] font-semibold" style={{ color: t.muted }}>
                  The gallery link isn’t ready yet. {capFirst(studio)} can share it with you.
                </p>
              )}
            </Section>

            <Section t={t} title="Family passcode" hint="Anyone with this passcode sees every photo.">
              <div
                className="rounded-2xl py-4 text-center text-[28px] font-extrabold tracking-[0.32em] tabular-nums"
                style={{ background: t.sunken, color: t.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                aria-label={data.passcode ? `Passcode ${data.passcode.split("").join(" ")}` : "No passcode"}
              >
                {data.passcode ?? "······"}
              </div>
              <div className="mt-2.5 flex gap-2">
                <ActionButton t={t} onClick={() => void copyPasscode()} icon={<IconCopy size={16} />} disabled={!data.passcode}>
                  Copy
                </ActionButton>
                <ActionButton t={t} onClick={() => void sharePasscode()} icon={<IconShare size={16} />} disabled={!data.passcode}>
                  Share
                </ActionButton>
                <ActionButton t={t} onClick={() => setRegenOpen(true)} icon={<IconRestore size={16} />}>
                  New passcode
                </ActionButton>
              </div>
            </Section>

            <Section t={t} title="People" hint={editorCounter(data.editors)}>
              <label className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: t.sunken, color: t.muted }}>
                <IconSearch size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or team"
                  aria-label="Search people"
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none"
                  style={{ color: t.text }}
                />
              </label>
              <ul className="mt-2 flex flex-col" role="list">
                {rows.map((g) => {
                  const sw = editorSwitchState(g, data.editors, studio);
                  return (
                    <li key={g._id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: `1px solid ${t.border}` }}>
                      <Face t={t} name={g.name} url={g.profile_face_url ?? null} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-bold" style={{ color: t.text }}>
                          {g.name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-semibold" style={{ color: t.muted }}>
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                            style={g.level === "client" || g.level === "editor" ? { background: t.accentWash, color: t.brand } : { background: t.sunken, color: t.muted }}
                          >
                            {levelBadge(g.level)}
                          </span>
                          {g.guest_sub_type && <span className="truncate">{g.guest_sub_type}</span>}
                        </div>
                        {sw.note && (
                          <div className="mt-0.5 text-[11.5px] font-semibold" style={{ color: t.faint }}>
                            {sw.note}
                          </div>
                        )}
                      </div>
                      {sw.show && (
                        <Switch
                          t={t}
                          on={sw.on}
                          disabled={sw.disabled || pending.has(g._id)}
                          label={`Can edit selection: ${g.name}`}
                          onChange={(next) => void setEditor(g, next)}
                        />
                      )}
                    </li>
                  );
                })}
                {rows.length === 0 && (
                  <li className="py-6 text-center text-[13px] font-semibold" style={{ color: t.muted }}>
                    {query ? "Nobody by that name yet." : "Nobody has opened the gallery yet."}
                  </li>
                )}
              </ul>
              <p className="mt-3 text-[12px] font-semibold leading-relaxed" style={{ color: t.faint }}>
                Can edit selection: they see every photo and can add photos to your collections. Only you send the final selection.
              </p>
            </Section>
          </div>
        )}
      </CollectionSheet>

      {regenOpen && (
        <ConfirmDialog
          t={t}
          desktop={desktop}
          title="New passcode"
          sentence={`Make a new passcode? Anyone who used the old one will lose full access. People you or ${studio} added keep theirs.`}
          confirm="Make a new passcode"
          onClose={() => setRegenOpen(false)}
          onConfirm={async () => {
            try {
              const { passcode } = await regeneratePasscode(uid, bookingId);
              setData((d) => (d ? { ...d, passcode } : d));
              setTick((n) => n + 1);
              notify("New passcode made");
            } catch (err) {
              if (err instanceof GuestAuthError) onReauth();
              throw new Error("Couldn’t make a new passcode. Try again.");
            }
          }}
        />
      )}
    </>
  );
}

function Section({ t, title, hint, children }: { t: ClientTheme; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h3 className="text-[14.5px] font-extrabold" style={{ color: t.text }}>
          {title}
        </h3>
        {hint && (
          <span className="text-[12px] font-semibold" style={{ color: t.muted }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function ActionButton({
  t,
  primary,
  icon,
  disabled,
  onClick,
  children,
}: {
  t: ClientTheme;
  primary?: boolean;
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2.5 text-[13px] font-extrabold disabled:cursor-not-allowed disabled:opacity-45"
      style={primary ? { background: t.brand, color: t.onBrand } : { background: t.accentWash, color: t.brand }}
    >
      {icon}
      {children}
    </button>
  );
}

function Switch({ t, on, disabled, label, onChange }: { t: ClientTheme; on: boolean; disabled?: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45"
      style={{ background: on ? t.brand : t.border }}
    >
      <span
        aria-hidden
        className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200"
        style={{ left: on ? 22 : 2 }}
      />
    </button>
  );
}
