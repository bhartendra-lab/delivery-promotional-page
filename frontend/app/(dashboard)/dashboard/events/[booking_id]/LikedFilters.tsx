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

const AUDIENCE: { key: LikedFiltersState["audience"]; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "host", label: "Host" },
  { key: "guest", label: "Guests" },
];

/**
 * Filter bar for the Smart Selects view. Slices the liked feed by *who* liked:
 * audience (host/guest), guest teams (only when the event has `guest_types`), and
 * specific guests (lazy-loaded from get-all-guests) — plus a "Shortlisted only"
 * toggle. All constraints AND-combine; changing any re-fetches (via EventWorkspace).
 */
export function LikedFilters({
  bookingId,
  guestTypes,
  filters,
  onChange,
  shortlistedCount = 0,
}: {
  bookingId: string;
  guestTypes: string[] | undefined;
  filters: LikedFiltersState;
  onChange: React.Dispatch<React.SetStateAction<LikedFiltersState>>;
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

  const setAudience = (audience: LikedFiltersState["audience"]) =>
    onChange((f) => ({ ...f, audience }));
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
  const toggleShortlistedOnly = () =>
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
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-brand-border)] bg-white px-2.5 py-2">
      <span className="inline-flex shrink-0 items-center gap-1.5 pl-1 pr-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-muted)]">
        <IconHeart size={13} className="text-[var(--color-brand-navy)]" />
        Liked by
      </span>

      {/* Audience segmented control */}
      <div className="inline-flex items-center rounded-lg border border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] p-0.5">
        {AUDIENCE.map((a) => {
          const on = filters.audience === a.key;
          return (
            <button
              key={a.key}
              type="button"
              aria-pressed={on}
              onClick={() => setAudience(a.key)}
              className={`brand-focus rounded-md px-3 py-1.5 text-[12.5px] transition-colors ${
                on
                  ? "bg-white font-semibold text-[var(--color-brand-navy)] shadow-[0_1px_3px_rgba(42,34,24,0.1)]"
                  : "font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {showTeams && (
        <FilterDropdown label="Teams" count={filters.subTypes.length}>
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

      {/* Shortlisted-only toggle — a distinct slice, set apart from "liked by". */}
      <span className="mx-0.5 hidden h-6 w-px bg-[var(--color-brand-border)] sm:block" aria-hidden />
      <button
        type="button"
        aria-pressed={filters.shortlistedOnly}
        onClick={toggleShortlistedOnly}
        className={`brand-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
          filters.shortlistedOnly
            ? "border-[var(--color-brand-warning)] bg-[var(--color-brand-warning-soft)] text-[var(--color-brand-warning)]"
            : "border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
        }`}
      >
        <IconStar size={13} filled={filters.shortlistedOnly} />
        Shortlisted
        {shortlistedCount > 0 && (
          <span
            className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
              filters.shortlistedOnly
                ? "bg-[var(--color-brand-warning)] text-white"
                : "bg-[#F2F0EB] text-[var(--color-brand-muted)]"
            }`}
          >
            {shortlistedCount.toLocaleString("en-IN")}
          </span>
        )}
      </button>

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_LIKED_FILTERS)}
          className="brand-focus ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
        >
          <IconX size={12} />
          Clear
        </button>
      )}
    </div>
  );
}

/* ── dropdown shell ─────────────────────────────────────────────── */

function FilterDropdown({
  label,
  icon,
  count,
  onOpen,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  count: number;
  onOpen?: () => void;
  children: React.ReactNode;
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
    <div ref={ref} className="relative">
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
        <div className="dash-rise absolute left-0 z-30 mt-1.5 w-[260px] overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white p-1 shadow-[0_14px_44px_rgba(42,34,24,0.18)]">
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
