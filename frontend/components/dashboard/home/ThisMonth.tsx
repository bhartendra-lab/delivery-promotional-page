"use client";

import { useCallback, useState } from "react";
import { ApiError, exportAllLeadsCsv, getDashboardStats } from "@/lib/api";
import { trackEvent } from "@/lib/analytics";
import { monthTiles } from "@/lib/dashboard-home";
import { BlockError, BlockShell } from "./BlockShell";
import { useLoader } from "./useLoader";
import { Tip } from "@/components/ui/Tip";

/** This month: four studio-wide numbers, each against last month where the data has a date to put it in one. */
export function ThisMonth() {
  const load = useCallback(() => getDashboardStats(), []);
  const { state, reload } = useLoader(load);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  async function exportLeads() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportAllLeadsCsv();
      trackEvent("leads_exported", { scope: "all" });
    } catch (e) {
      setExportError(e instanceof ApiError || e instanceof Error ? e.message : "The export did not work. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <BlockShell title="This month">
      {state.status === "loading" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-[var(--color-brand-border)] py-5 sm:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton h-8 w-16 rounded" />
              <div className="skeleton h-3 w-28 rounded" />
            </div>
          ))}
        </div>
      ) : state.status === "error" ? (
        <BlockError message="Could not load this month's numbers." onRetry={reload} />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-[var(--color-brand-border)] py-4 sm:grid-cols-4 sm:gap-0">
          {monthTiles(state.data).map((t, i) => (
            <div key={t.key} className={i > 0 ? "sm:border-l sm:border-[var(--color-brand-border)] sm:pl-6" : ""}>
              {/* What the number counts is behind the info icon: the label
                  says enough to read the row at a glance. */}
              <p className="type-label flex items-center gap-1.5">
                {t.label}
                <Tip text={t.hint} />
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-brand-ink)]">{t.value.toLocaleString()}</p>
              {t.change && (
                <p className="mt-1 text-xs font-medium" style={{ color: t.up === null ? "var(--color-brand-muted)" : t.up ? "var(--color-brand-success)" : "var(--color-brand-danger)" }}>
                  {t.change}
                </p>
              )}
              {t.key === "leads" && (
                <>
                  <button
                    type="button"
                    onClick={() => void exportLeads()}
                    disabled={exporting}
                    className="brand-focus mt-1.5 text-xs font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    {exporting ? "Preparing the file…" : "Export all leads"}
                  </button>
                  {exportError && (
                    <p role="alert" className="mt-1 text-xs text-[var(--color-brand-danger)]">
                      {exportError}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </BlockShell>
  );
}
