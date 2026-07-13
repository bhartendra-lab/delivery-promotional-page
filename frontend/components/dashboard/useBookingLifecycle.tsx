"use client";

import { useCallback, useRef, useState } from "react";
import type { Booking } from "@/lib/types";
import { archiveBooking, clearBookingData, restoreBooking } from "@/lib/api";
import { useChrome } from "./ChromeContext";

/**
 * Shared archive/restore/clear handlers for the card grids (dashboard + events).
 * Each handler runs the API call, refreshes the list, and toasts — then rethrows
 * on failure so the calling card can keep its confirm modal open for a retry.
 * `clearBookingData` also re-syncs DLP usage (media was deleted server-side).
 */
export function useBookingLifecycle(reload: () => Promise<void> | void) {
  const { refreshDlpUsage } = useChrome();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type });
    timerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const onArchive = useCallback(
    async (row: Booking) => {
      try {
        await archiveBooking(row._id);
        await reload();
        notify("Event archived — it's hidden from guests.");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not archive the event", "error");
        throw err;
      }
    },
    [reload, notify],
  );

  const onRestore = useCallback(
    async (row: Booking) => {
      try {
        await restoreBooking(row._id);
        await reload();
        notify("Event restored — it's live for guests again.");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not restore the event", "error");
        throw err;
      }
    },
    [reload, notify],
  );

  const onClearData = useCallback(
    async (row: Booking) => {
      try {
        await clearBookingData(row._id);
        await refreshDlpUsage();
        await reload();
        notify("Event data cleared. Only the cover photo remains.");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Could not clear the event data", "error");
        throw err;
      }
    },
    [reload, refreshDlpUsage, notify],
  );

  const toastNode = toast ? (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[230] flex justify-center px-4">
      <div
        className={`toast-rise pointer-events-auto inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(42,34,24,0.18)] ${
          toast.type === "error" ? "bg-[var(--color-brand-danger)]" : "bg-[var(--color-brand-success)]"
        }`}
      >
        {toast.message}
      </div>
    </div>
  ) : null;

  return { onArchive, onRestore, onClearData, toastNode };
}
