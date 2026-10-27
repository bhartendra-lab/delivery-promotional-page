"use client";

import { statusLabel } from "@/lib/collections/logic";
import { railTarget } from "@/lib/collections/studio";
import type { GuestCollection } from "@/lib/collections/types";
import { IconHeart, IconLock, IconPlus } from "./icons";

/** What Smart Selects is showing: the liked feed, or one client collection. */
export type SmartView = { kind: "liked" } | { kind: "collection"; id: string };

type Props = {
  view: SmartView;
  likedCount: number;
  collections: GuestCollection[];
  canCreate: boolean;
  onAllLiked: () => void;
  onCollection: (id: string) => void;
  onNew: () => void;
};

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Smart Selects' left rail on a laptop (220px): All liked, then the Client's
 * collections with their count, status and album progress, and New
 * collection. Shown only while collections are switched on.
 */
export function CollectionsRail(p: Props) {
  const likedOn = p.view.kind === "liked";
  return (
    <nav aria-label="Smart Selects views" className="flex w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--color-brand-border)] px-3 py-6">
      <RailItem active={likedOn} onClick={p.onAllLiked} icon={<IconHeart size={15} />} label="All liked" count={p.likedCount} />

      <div className="mb-1 mt-5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-brand-muted)]">
        Client collections
      </div>
      {p.collections.length === 0 && (
        <p className="px-2.5 py-1 text-[12px] leading-relaxed text-[var(--color-brand-muted)]">
          The Client&apos;s album selections appear here once they add photos.
        </p>
      )}
      {p.collections.map((c) => {
        const active = p.view.kind === "collection" && p.view.id === c._id;
        const target = railTarget(c);
        return (
          <button
            key={c._id}
            type="button"
            onClick={() => p.onCollection(c._id)}
            aria-current={active ? "page" : undefined}
            className={`brand-focus w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
              active ? "bg-[var(--color-brand-navy-soft)]" : "hover:bg-[var(--color-brand-hover)]"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${active ? "text-[var(--color-brand-navy)]" : "text-[var(--color-brand-ink)]"}`}>
                {c.name}
              </span>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[var(--color-brand-muted)]">{fmt(c.count)}</span>
            </span>
            <span className="mt-1 flex items-center gap-2">
              <StatusChip c={c} />
              {target && <span className="truncate text-[11px] text-[var(--color-brand-muted)]">{target}</span>}
            </span>
            {c.target_count ? (
              <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-[var(--color-brand-track)]">
                <span className="block h-full bg-[var(--color-brand-navy)]" style={{ width: `${Math.min(100, Math.round((c.count / c.target_count) * 100))}%` }} />
              </span>
            ) : null}
          </button>
        );
      })}
      {p.canCreate && (
        <button
          type="button"
          onClick={p.onNew}
          className="brand-focus mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-[var(--color-brand-navy)] hover:bg-[var(--color-brand-hover)]"
        >
          <IconPlus size={14} />
          New collection
        </button>
      )}
    </nav>
  );
}

/** The same items as one scrolling pill row, under the title on a phone. */
export function CollectionsPills(p: Props) {
  const likedOn = p.view.kind === "liked";
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ scrollbarWidth: "none" }} role="toolbar" aria-label="Smart Selects views">
      <Pill active={likedOn} onClick={p.onAllLiked} label="All liked" count={p.likedCount} />
      {p.collections.map((c) => (
        <Pill
          key={c._id}
          active={p.view.kind === "collection" && p.view.id === c._id}
          onClick={() => p.onCollection(c._id)}
          label={c.name}
          count={c.count}
          locked={c.status === "final"}
        />
      ))}
      {p.canCreate && (
        <button
          type="button"
          onClick={p.onNew}
          className="brand-focus inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[var(--color-brand-outline)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--color-brand-navy)]"
        >
          <IconPlus size={13} />
          New
        </button>
      )}
    </div>
  );
}

/** "Sent 26 Oct" in a terracotta outline, or a quiet "Draft". */
export function StatusChip({ c }: { c: Pick<GuestCollection, "status" | "finalized_at"> }) {
  const sent = c.status === "final";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold ${
        sent
          ? "border border-[var(--color-brand-navy)] text-[var(--color-brand-navy)]"
          : "bg-[var(--color-brand-track)] text-[var(--color-brand-muted)]"
      }`}
    >
      {sent && <IconLock size={10} />}
      {statusLabel(c)}
    </span>
  );
}

function RailItem({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`brand-focus flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors ${
        active
          ? "bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
          : "text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)]"
      }`}
    >
      <span className="shrink-0 text-[var(--color-brand-muted)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[12px] tabular-nums text-[var(--color-brand-muted)]">{fmt(count)}</span>
    </button>
  );
}

function Pill({ active, onClick, label, count, locked }: { active: boolean; onClick: () => void; label: string; count: number; locked?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`brand-focus inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
        active
          ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white"
          : "border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)]"
      }`}
    >
      {locked && <IconLock size={11} />}
      <span className="max-w-[160px] truncate">{label}</span>
      <span className={`tabular-nums ${active ? "text-white/80" : "text-[var(--color-brand-muted)]"}`}>{fmt(count)}</span>
    </button>
  );
}
