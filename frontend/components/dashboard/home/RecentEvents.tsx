"use client";

import Link from "next/link";
import { useCallback } from "react";
import { getAllBookings } from "@/lib/api";
import { eventDisplayStatus, EVENT_STATUS_DOT, EVENT_STATUS_LABEL } from "@/lib/event-status";
import type { Booking } from "@/lib/types";
import { formatEventDate } from "../shared";
import { BlockError, BlockShell } from "./BlockShell";
import { useLoader } from "./useLoader";

const RECENT_COUNT = 4;

/** Recent events: the four most recently active live events as compact rows, and a way to all of them. */
export function RecentEvents({ onCreate }: { onCreate: () => void }) {
  const load = useCallback(() => getAllBookings({ view: "active", sort: "activity_desc", limit: RECENT_COUNT }), []);
  const { state, reload } = useLoader(load);
  return (
    <BlockShell
      title="Recent events"
      action={
        <Link href="/dashboard/events" className="brand-focus text-sm font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline">
          All events
        </Link>
      }
    >
      {state.status === "loading" ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          {Array.from({ length: RECENT_COUNT }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-3">
              <div className="skeleton h-14 w-20 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : state.status === "error" ? (
        <BlockError message="Could not load your recent events." onRetry={reload} />
      ) : state.data.bookings.length === 0 ? (
        <div className="type-body flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--color-brand-border)] px-4 py-4">
          <span>No live events yet. Create one and share the link with your client.</span>
          <button type="button" onClick={onCreate} className="brand-focus inline-flex h-9 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-brand-navy-deep)]">
            Create your first event
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {state.data.bookings.map((row) => (
            <li key={row._id}>
              <RecentRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </BlockShell>
  );
}

function RecentRow({ row }: { row: Booking }) {
  const status = eventDisplayStatus(row);
  const photos = row.media_count ?? 0;
  const date = row.event_date ? formatEventDate(row.event_date) : "No date set";
  return (
    <Link
      href={`/dashboard/events/${encodeURIComponent(row._id)}`}
      className="brand-focus flex items-center gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-3 transition-colors hover:border-[var(--color-brand-outline)]"
    >
      <span
        aria-hidden
        className="h-14 w-20 shrink-0 rounded-lg bg-[var(--color-brand-track)] bg-cover bg-center"
        style={row.background_image ? { backgroundImage: `url(${row.background_image})` } : undefined}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-[var(--color-brand-ink)]">{row.name}</span>
        <span className="type-meta block truncate">
          {date} · {photos.toLocaleString()} {photos === 1 ? "photo" : "photos"}
        </span>
        <span className="type-meta mt-0.5 inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: EVENT_STATUS_DOT[status] }} aria-hidden />
          {EVENT_STATUS_LABEL[status]}
        </span>
      </span>
    </Link>
  );
}
