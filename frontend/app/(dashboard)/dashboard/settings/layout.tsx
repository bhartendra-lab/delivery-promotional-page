"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePageBreadcrumb } from "@/components/dashboard/ChromeContext";
import { SettingsProvider } from "./SettingsContext";
import { SettingsNav, sectionLabelFor } from "./SettingsNav";
import { SectionSkeleton, FetchError } from "./SettingsUI";

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

  // Top-bar breadcrumb: "Settings" on the index, "Settings › <section>"
  // deeper. Overrides deriveBreadcrumb in the dashboard layout.
  usePageBreadcrumb(
    sectionLabel && pathname !== "/dashboard/settings"
      ? [{ label: "Settings", href: "/dashboard/settings" }, { label: sectionLabel }]
      : [{ label: "Settings" }],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 dash-rise">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path
            d="M19 12H5M12 19l-7-7 7-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to dashboard
      </Link>

      <div className="lg:grid lg:grid-cols-[220px_1fr]">
        <aside className="mb-8 lg:mb-0 lg:border-r lg:border-[var(--color-brand-border)] lg:pr-8">
          <div className="lg:sticky lg:top-8">
            <SettingsNav />
          </div>
        </aside>

        <div className="min-w-0 lg:pl-10">
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
