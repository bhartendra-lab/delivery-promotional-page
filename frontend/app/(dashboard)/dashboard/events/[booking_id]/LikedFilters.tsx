"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAllGuests } from "@/lib/api";
import type { Guest } from "@/lib/types";
import {
  EMPTY_LIKED_FILTERS,
  hasActiveLikedFilters,
  type LikedFilters as LikedFiltersState,
} from "./EventContext";
import { IconCaretDown, IconCheck, IconHeart, IconSearch, IconStar, IconUsers, IconX } from "./icons";

const SORT_LABEL: Record<LikedFiltersState["sort"], string> = {
  likes: "Most liked",
  recent: "Newest",
};

/**
 * Filter bar for the Smart Selects view — a single compact, wrapping row: quick
 * scope pills (All liked / Host picks / Shortlisted, each carrying its own
 * count badge) followed by the refinement controls — guest teams (only when
 * the event has `guest_types`), specific guests (lazy-loaded), and Sort. Pills
 * just set the underlying filter fields, so they stay in sync with the
 * refinement controls. All constraints AND-combine; changing any re-fetches
 * (via EventWorkspace).
 */
export function LikedFilters({
  bookingId,
  guestTypes,
  filters,
  onChange,
  likedCount = 0,
  shortlistedCount = 0,
}: {
  bookingId: string;
  guestTypes: string[] | undefined;
  filters: LikedFiltersState;
  onChange: React.Dispatch<React.SetStateAction<LikedFiltersState>>;
  /** Total liked media in the booking — shown as the "All liked" pill's count. */
  likedCount?: number;
  shortlistedCount?: number;
}) {
  const showTeams = !!guestTypes && guestTypes.length > 0;
  const active = hasActiveLikedFilters(filters);

  // Guests are lazy-loaded the first time the guests dropdown opens.
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [guestsLoading, setGuestsLoading] = useState(false);
  const [guestsError, setGuestsError] = useState<string | null>(null);

  const loadGuests = useCallback(async () => {
    if (guests || guestsLoading) return;
    setGuestsLoading(true);
    setGuestsError(null);
    try {
      const res = await getAllGuests(bookingId);
      setGuests(res.guests ?? []);
    } catch (e) {
      setGuestsError(e instanceof Error ? e.message : "Couldn't load guests");
    } finally {
      setGuestsLoading(false);
    }
  }, [bookingId, guests, guestsLoading]);

  const setSort = (sort: LikedFiltersState["sort"]) => onChange((f) => ({ ...f, sort }));
  const toggleSubType = (t: string) =>
    onChange((f) => ({
      ...f,
      subTypes: f.subTypes.includes(t) ? f.subTypes.filter((x) => x !== t) : [...f.subTypes, t],
    }));
  const toggleGuest = (id: string) =>
    onChange((f) => ({
      ...f,
      guestIds: f.guestIds.includes(id) ? f.guestIds.filter((x) => x !== id) : [...f.guestIds, id],
    }));

  // ── Quick pills. Each maps to underlying filter fields (so pill state derives
  // from the same fields the refinement row edits — they can't drift apart).
  const scopeAll =
    filters.audience === "all" &&
    filters.subTypes.length === 0 &&
    filters.guestIds.length === 0;
  const allLikedOn = scopeAll && !filters.shortlistedOnly;
  const hostPicksOn = filters.audience === "host";
  const shortlistedOn = filters.shortlistedOnly;

  const setAllLiked = () =>
    onChange((f) => ({
      ...f,
      audience: "all",
      subTypes: [],
      guestIds: [],
      shortlistedOnly: false,
    }));
  const toggleHostPicks = () =>
    onChange((f) => ({ ...f, audience: f.audience === "host" ? "all" : "host" }));
  const toggleShortlisted = () =>
    onChange((f) => ({ ...f, shortlistedOnly: !f.shortlistedOnly }));

  // Button summary for the Guests dropdown (name when one, count otherwise).
  const guestsLabel = useMemo(() => {
    if (filters.guestIds.length === 0) return "Guests";
    if (filters.guestIds.length === 1) {
      const g = guests?.find((x) => x._id === filters.guestIds[0]);
      return g?.name ?? "1 guest";
    }
    return `${filters.guestIds.length} guests`;
  }, [filters.guestIds, guests]);

  return (
    <div className="mb-4 mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-brand-border)] bg-white px-3 py-2">
      <QuickPill active={allLikedOn} onClick={setAllLiked} count={likedCount}>
        All liked
      </QuickPill>
      <QuickPill active={hostPicksOn} onClick={toggleHostPicks}>
        Host picks
      </QuickPill>
      <QuickPill active={shortlistedOn} onClick={toggleShortlisted} count={shortlistedCount}>
        <IconStar size={12} filled={shortlistedOn} />
        Shortlisted
      </QuickPill>

      <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-[var(--color-brand-border)] sm:block" aria-hidden />

      {showTeams && (
        <FilterDropdown label="Team" count={filters.subTypes.length}>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {guestTypes!.map((t) => (
              <CheckRow
                key={t}
                label={t}
                checked={filters.subTypes.includes(t)}
                onToggle={() => toggleSubType(t)}
              />
            ))}
          </div>
        </FilterDropdown>
      )}

      <FilterDropdown
        label={guestsLabel}
        icon={<IconUsers size={14} />}
        count={filters.guestIds.length}
        onOpen={loadGuests}
      >
        <GuestPicker
          guests={guests}
          loading={guestsLoading}
          error={guestsError}
          selected={filters.guestIds}
          onToggle={toggleGuest}
          onRetry={loadGuests}
        />
      </FilterDropdown>

      {/* Sort — pushed to the right; Clear follows it. */}
      <FilterDropdown
        label={`Sort: ${SORT_LABEL[filters.sort]}`}
        count={0}
        className="sm:ml-auto"
        align="right"
      >
        <div className="py-1">
          <CheckRow
            label="Most liked"
            checked={filters.sort === "likes"}
            onToggle={() => setSort("likes")}
          />
          <CheckRow
            label="Newest"
            checked={filters.sort === "recent"}
            onToggle={() => setSort("recent")}
          />
        </div>
      </FilterDropdown>

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_LIKED_FILTERS)}
          className="brand-focus inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          <IconX size={12} />
          Clear
        </button>
      )}
    </div>
  );
}

/* ── quick scope pill ───────────────────────────────────────────── */

function QuickPill({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  /** Optional count badge; hidden when 0. */
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`brand-focus inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
        active
          ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white"
          : "border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
      }`}
    >
      {children}
      {typeof count === "number" && count > 0 && (
        <span
          className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
            active ? "bg-white/25 text-white" : "bg-[#F2F0EB] text-[var(--color-brand-muted)]"
          }`}
        >
          {count.toLocaleString("en-IN")}
        </span>
      )}
    </button>
  );
}

/* ── dropdown shell ─────────────────────────────────────────────── */

function FilterDropdown({
  label,
  icon,
  count,
  onOpen,
  children,
  className,
  align = "left",
}: {
  label: string;
  icon?: React.ReactNode;
  count: number;
  onOpen?: () => void;
  children: React.ReactNode;
  /** Extra classes for the positioning wrapper (e.g. `ml-auto`). */
  className?: string;
  /** Which edge the menu aligns to (right for right-anchored triggers). */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const on = count > 0;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) onOpen?.();
        }}
        className={`brand-focus inline-flex max-w-[190px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
          on
            ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]"
            : "border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
        }`}
      >
        {icon}
        <span className="truncate">{label}</span>
        {on && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand-navy)] px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
        <IconCaretDown size={12} className="opacity-60" />
      </button>

      {open && (
        <div
          className={`dash-rise absolute z-30 mt-1.5 w-[260px] overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white p-1 shadow-[0_14px_44px_rgba(42,34,24,0.18)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function CheckRow({
  label,
  sub,
  checked,
  onToggle,
}: {
  label: string;
  sub?: React.ReactNode;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="brand-focus flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-[var(--color-brand-surface)]"
    >
      <span
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
          checked
            ? "border-[var(--color-brand-navy)] bg-[var(--color-brand-navy)] text-white"
            : "border-[var(--color-brand-outline)] bg-white text-transparent"
        }`}
      >
        <IconCheck size={12} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-brand-ink)]">
        {label}
      </span>
      {sub}
    </button>
  );
}

/* ── guest picker (search + list) ───────────────────────────────── */

function GuestPicker({
  guests,
  loading,
  error,
  selected,
  onToggle,
  onRetry,
}: {
  guests: Guest[] | null;
  loading: boolean;
  error: string | null;
  selected: string[];
  onToggle: (id: string) => void;
  onRetry: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const list = guests ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (g) =>
        g.name.toLowerCase().includes(needle) ||
        (g.email ?? "").toLowerCase().includes(needle),
    );
  }, [guests, q]);

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-[var(--color-brand-border)] px-2 pb-1.5 pt-1">
        <IconSearch size={14} className="shrink-0 text-[var(--color-brand-muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search guests…"
          className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-[var(--color-brand-ink)] outline-none placeholder:text-[var(--color-brand-muted)]"
        />
      </div>

      <div className="max-h-[260px] overflow-y-auto py-1">
        {loading && (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-[12.5px] text-[var(--color-brand-muted)]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
            Loading guests…
          </div>
        )}
        {!loading && error && (
          <div className="px-3 py-5 text-center text-[12.5px] text-[var(--color-brand-muted)]">
            {error}
            <button
              type="button"
              onClick={onRetry}
              className="brand-focus mt-1 block w-full font-semibold text-[var(--color-brand-navy)] hover:underline"
            >
              Try again
            </button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-[12.5px] text-[var(--color-brand-muted)]">
            {(guests?.length ?? 0) === 0 ? "No guests yet." : "No matching guests."}
          </div>
        )}
        {!loading &&
          !error &&
          filtered.map((g) => (
            <CheckRow
              key={g._id}
              label={g.name}
              checked={selected.includes(g._id)}
              onToggle={() => onToggle(g._id)}
              sub={
                (g.likes_count ?? 0) > 0 ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[var(--color-brand-muted)]">
                    <IconHeart size={11} filled className="text-[var(--color-brand-navy)]" />
                    {g.likes_count}
                  </span>
                ) : null
              }
            />
          ))}
      </div>
    </div>
  );
}
