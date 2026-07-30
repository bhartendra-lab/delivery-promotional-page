"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getCompany, setCompany, isAuthenticated, needsOnboarding } from "@/lib/auth";
import { getCompanyDetails } from "@/lib/api";
import { Sidebar, useSidebarCollapsed } from "@/components/dashboard/Sidebar";
import { Topbar, type Breadcrumb } from "@/components/dashboard/Topbar";
import { ActiveUploadsIndicator } from "@/components/dashboard/ActiveUploadsIndicator";
import { ChromeProvider, useChrome } from "@/components/dashboard/ChromeContext";
import { SubscriptionProvider, useSubscription } from "@/components/billing/SubscriptionProvider";
import { UpgradeModalProvider } from "@/components/billing/UpgradeModalProvider";
import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner";
import { RemindersProvider } from "@/components/dashboard/RemindersProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const cached = getCompany();
    if (cached) {
      if (needsOnboarding(cached)) {
        router.replace("/onboarding");
        return;
      }
      setReady(true);
    } else {
      getCompanyDetails()
        .then((res) => {
          setCompany(res.company);
          if (needsOnboarding(res.company)) {
            router.replace("/onboarding");
            return;
          }
          setReady(true);
        })
        .catch(() => setReady(true));
    }
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-[var(--color-brand-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          <p className="text-sm text-[var(--color-brand-muted)]">Loading your studio…</p>
        </div>
      </div>
    );
  }

  return (
    <ChromeProvider>
      <SubscriptionProvider>
        <UpgradeModalProvider>
          <RemindersProvider>
            <DashboardShell>{children}</DashboardShell>
          </RemindersProvider>
        </UpgradeModalProvider>
      </SubscriptionProvider>
    </ChromeProvider>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const { customBreadcrumb, mainRef } = useChrome();
  const { snapshot } = useSubscription();

  const breadcrumb: Breadcrumb = customBreadcrumb ?? deriveBreadcrumb(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-brand-bg)] text-[var(--color-brand-ink)]">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar breadcrumb={breadcrumb} />
        <main ref={mainRef as React.RefObject<HTMLElement>} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="px-4 pt-4 sm:px-6">
            <SubscriptionBanner snapshot={snapshot} scope="app" />
          </div>
          {children}
        </main>
      </div>
      {/* Floats above every dashboard page: uploads keep running when you
          navigate away, so they need a permanent, reachable home. */}
      <ActiveUploadsIndicator />
    </div>
  );
}

function deriveBreadcrumb(pathname: string): Breadcrumb {
  if (pathname === "/dashboard" || pathname === "/dashboard/") {
    return [{ label: "Dashboard" }];
  }
  if (pathname.startsWith("/dashboard/events")) {
    const items: Breadcrumb = [{ label: "Events", href: "/dashboard/events" }];
    const rest = pathname.slice("/dashboard/events".length).replace(/^\//, "");
    if (rest) items.push({ label: "Event" });
    return items;
  }
  if (pathname.startsWith("/dashboard/reusable-qr")) {
    return [{ label: "Reusable QR" }];
  }
  if (pathname.startsWith("/dashboard/settings")) {
    // The settings layout overrides this via usePageBreadcrumb (adding the
    // active section); this is just the pre-hydration fallback.
    return [{ label: "Settings" }];
  }
  return [{ label: "Dashboard", href: "/dashboard" }];
}
