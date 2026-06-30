"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  activeUploadsServerSnapshot,
  listActiveUploads,
  subscribeActiveUploads,
} from "@/lib/r2-upload/registry";

/**
 * Global cross-booking upload indicator. An upload started in booking A keeps
 * running (in the module-level engine registry) after you navigate away — this
 * chip surfaces that, linking back so you can resume. Hidden when you're already
 * on the only active booking's page.
 */
export function ActiveUploadsIndicator() {
  const active = useSyncExternalStore(subscribeActiveUploads, listActiveUploads, activeUploadsServerSnapshot);
  const pathname = usePathname();

  // Don't show a chip for the booking whose page you're already viewing.
  const elsewhere = active.filter((u) => !pathname.endsWith(`/events/${u.bookingId}`));
  if (elsewhere.length === 0) return null;

  const first = elsewhere[0];
  const label =
    elsewhere.length > 1
      ? `${elsewhere.length} uploads in progress`
      : first.paused
      ? `Upload paused · ${first.name}`
      : `Uploading · ${first.name}`;

  return (
    <Link
      href={`/dashboard/events/${first.bookingId}`}
      title="Go to the event that's still uploading"
      className="inline-flex max-w-[220px] items-center gap-2 rounded-full border border-[var(--color-brand-border)] bg-[var(--color-brand-navy-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-brand-navy)]"
    >
      {first.paused ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-muted)]" />
      ) : (
        <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-[2px] border-[var(--color-brand-navy)]/30 border-t-[var(--color-brand-navy)]" />
      )}
      <span className="truncate">{label}</span>
    </Link>
  );
}
