"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getReminderStatus, dismissReminder as dismissReminderApi, type ReminderName } from "@/lib/api";
import type { ReminderStatus } from "@/lib/types";

type RemindersContextValue = {
  /** Null until the fetch resolves, or forever on a failed fetch — both reminder dialogs stay closed in that case. */
  status: ReminderStatus | null;
  loading: boolean;
  /**
   * The watermark and branding dialogs only call this when their "Don't show
   * this again" checkbox is checked — an unchecked "Skip for now" never
   * reaches here, it just closes that one instance of the dialog locally.
   *
   * "custom_domain" is different by design: it is a one-shot setup prompt
   * rather than a recurring nag, so BOTH of its exits dismiss permanently.
   */
  dismiss: (reminder: ReminderName) => Promise<void>;
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
 * Fetches `GET /onboarding/reminder-status` once per dashboard visit and shares
 * it with the watermark nudge (MediaTab), the branding checklist
 * (AccessSharingTab) and the custom-domain setup prompt (CustomDomainDialog),
 * so none of them re-fetches or re-derives the checkpoints itself. A failed
 * fetch is best-effort: `status` stays null and every dialog simply never
 * shows — a reminder must never break the dashboard.
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-then-setState is the documented React pattern for effects
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
  const dismiss = useCallback(async (reminder: ReminderName) => {
    try {
      const res = await dismissReminderApi(reminder);
      setStatus(res.status);
    } catch {
      setStatus((prev) => {
        if (!prev) return prev;
        // `custom_domain` is optional on ReminderStatus (an older backend
        // omits it), so patch onto whatever is there rather than spreading
        // undefined — the only fields that matter to a dialog deciding whether
        // to open are the two set explicitly here.
        return {
          ...prev,
          [reminder]: { ...(prev[reminder] ?? {}), dismissed_at: Date.now(), should_show: false },
        };
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
