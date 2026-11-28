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
    // At least the height of the scrolling <main>, so the content column can
    // reach the bottom of the screen and the save bar's anchor (mt-auto, last
    // in that column) sits on the bottom edge even when a section is short.
    <div className="flex min-h-full max-w-6xl flex-col px-4 pb-4 sm:px-10 sm:pb-6 dash-rise">
      {/* No top padding here — the aside's border-right should start flush
          with the Topbar below, not offset by page-level padding. Each
          column carries its own small top inset instead, since padding
          lives inside an element's border box and doesn't push the border
          itself down. */}
      <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[244px_1fr]">
        <aside className="mb-6 pt-4 lg:mb-0 lg:border-r lg:border-[var(--color-brand-border)] lg:pr-8">
          <div className="lg:hidden">
            <SettingsMobileNav />
          </div>
          <div className="hidden lg:block lg:sticky lg:top-8">
            <SettingsNav />
          </div>
        </aside>

        <div className="flex min-w-0 max-w-[760px] flex-1 flex-col pt-4 lg:pl-10">
          {load.status === "loading" ? (
            <SectionSkeleton />
          ) : load.status === "error" ? (
            <FetchError message={load.message} />
          ) : (
            children
          )}
          {/* Portal target for the active section's save bar. LAST in this
              column and itself the sticky element: a sticky box only moves
              within its parent, and this one's parent is the whole column, so
              it stays pinned to the bottom of the screen for as long as the
              section is on screen. (The bar used to be the sticky element,
              inside an anchor exactly its own height at the TOP of the
              column, so it had nowhere to stick and scrolled away, and it
              pushed the form down when it appeared.) Empty, it takes no
              space; mt-auto keeps it on the bottom edge on a short section. */}
          <div id={SECTION_SAVE_BAR_ROOT_ID} className="sticky bottom-0 z-30 mt-auto" />
        </div>
      </div>
    </div>
  );
}
