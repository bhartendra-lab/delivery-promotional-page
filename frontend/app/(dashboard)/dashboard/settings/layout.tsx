"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePageBreadcrumb } from "@/components/dashboard/ChromeContext";
import { SettingsProvider, useSettingsMaybe } from "./SettingsContext";
import { SettingsNav, SettingsMobileNav, sectionLabelFor } from "./SettingsNav";
import { SectionSkeleton, FetchError, SECTION_SAVE_BAR_ROOT_ID } from "./SettingsUI";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      {(load) => <SettingsChrome load={load}>{children}</SettingsChrome>}
    </SettingsProvider>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" };

function SettingsChrome({
  load,
  children,
}: {
  load: LoadState;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const sectionLabel = sectionLabelFor(pathname);
  const settings = useSettingsMaybe();
  const isDirty = settings?.isDirty ?? false;

  // Top-bar breadcrumb: "Settings" on the index, "Settings › <section>"
  // deeper. Overrides deriveBreadcrumb in the dashboard layout.
  usePageBreadcrumb(
    sectionLabel && pathname !== "/dashboard/settings"
      ? [{ label: "Settings", href: "/dashboard/settings" }, { label: sectionLabel }]
      : [{ label: "Settings" }],
  );

  // Covers tab close/reload/typing a new URL — the in-app case (switching
  // Settings sections) is guarded separately in SettingsNav, which can show
  // an actual confirm dialog; beforeunload's dialog text is browser chrome
  // that can't be customized, same pattern as useUploadEngine.ts.
  useEffect(() => {
    if (!isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "You have unsaved changes. Leaving will discard them.";
      return e.returnValue;
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  return (
    <div className="max-w-6xl px-4 pb-8 sm:px-10 sm:pb-10 dash-rise">
      {/* No top padding here — the aside's border-right should start flush
          with the Topbar below, not offset by page-level padding. Each
          column carries its own small top inset instead, since padding
          lives inside an element's border box and doesn't push the border
          itself down. */}
      <div className="lg:grid lg:grid-cols-[220px_1fr]">
        <aside className="mb-6 pt-4 lg:mb-0 lg:border-r lg:border-[var(--color-brand-border)] lg:pr-8">
          <div className="lg:hidden">
            <SettingsMobileNav />
          </div>
          <div className="hidden lg:block lg:sticky lg:top-8">
            <SettingsNav />
          </div>
        </aside>

        <div className="min-w-0 max-w-[760px] pt-4 lg:pl-10">
          {/* Portal target for the active section's sticky save bar — kept
              as the first child so `position: sticky; top: 0` pins it
              immediately instead of only once scrolled down to it. */}
          <div id={SECTION_SAVE_BAR_ROOT_ID} />
          {load.status === "loading" ? (
            <SectionSkeleton />
          ) : load.status === "error" ? (
            <FetchError message={load.message} />
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
