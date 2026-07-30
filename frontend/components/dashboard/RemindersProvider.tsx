"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getReminderStatus, dismissReminder as dismissReminderApi } from "@/lib/api";
import type { ReminderStatus } from "@/lib/types";

type RemindersContextValue = {
  /** Null until the fetch resolves, or forever on a failed fetch — both reminder dialogs stay closed in that case. */
  status: ReminderStatus | null;
  loading: boolean;
  dismiss: (reminder: "watermark" | "branding") => Promise<void>;
  /**
   * Re-fetches the status outright. `RemindersProvider` is mounted once at
   * the dashboard layout and never remounts on in-app navigation, so a
   * checkpoint completed elsewhere (a watermark preset saved on Settings, a
   * Studio Identity/Social Links field filled in) would otherwise leave the
   * cached `status` stale when the studio returns to an event. Best-effort
   * and silent on failure — the next natural fetch (or a hard reload) will
   * eventually catch up.
   */
  refresh: () => Promise<void>;
};

const RemindersCtx = createContext<RemindersContextValue>({
  status: null,
  loading: true,
  dismiss: async () => {},
  refresh: async () => {},
});

/**
 * Fetches `GET /onboarding/reminder-status` once per dashboard visit and
 * shares it with both the watermark nudge (MediaTab) and the branding
 * checklist (AccessSharingTab), so neither re-fetches or re-derives the
 * checkpoints itself. A failed fetch is best-effort: `status` stays null and
 * both dialogs simply never show — a reminder must never break the dashboard.
 */
export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ReminderStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getReminderStatus();
      setStatus(res);
    } catch {
      /* best-effort — see the type-level note above */
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchStatus().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
    // fetchStatus is stable (empty deps) — this effect should still only ever
    // run once per provider mount, matching "once per dashboard visit".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never throws — a caller can always `await dismiss(...)` and then proceed
  // unconditionally, the same way WelcomeDialog#markSeen never blocks its own
  // close on the network. On failure this optimistically patches the flag
  // locally so the dialog doesn't nag again this session even if the POST
  // never actually landed server-side.
  const dismiss = useCallback(async (reminder: "watermark" | "branding") => {
    try {
      const res = await dismissReminderApi(reminder);
      setStatus(res.status);
    } catch {
      setStatus((prev) => {
        if (!prev) return prev;
        return reminder === "watermark"
          ? { ...prev, watermark: { ...prev.watermark, dismissed_at: Date.now(), should_show: false } }
          : { ...prev, branding: { ...prev.branding, dismissed_at: Date.now(), should_show: false } };
      });
    }
  }, []);

  const value = useMemo(
    () => ({ status, loading, dismiss, refresh: fetchStatus }),
    [status, loading, dismiss, fetchStatus],
  );

  return <RemindersCtx.Provider value={value}>{children}</RemindersCtx.Provider>;
}

export function useReminders(): RemindersContextValue {
  return useContext(RemindersCtx);
}
