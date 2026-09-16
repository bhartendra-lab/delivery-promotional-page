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
import { CustomDomainDialog } from "@/components/dashboard/CustomDomainDialog";

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auth/onboarding gate: flips once after a synchronous cache check
      setReady(true);
      // Refresh the cache in the BACKGROUND, without re-running the gate above.
      //
      // The cached company used to be written only at login and on a Settings
      // save, so a tab that stayed signed in could serve a week-old company.
      // That was survivable when the cache only fed the Topbar's studio name;
      // it is not now that every gallery link is derived from it
      // (lib/gallery-url) — a studio who connected their domain on their laptop
      // would keep copying deliver.vyavasth.in links on their desktop until the
      // token expired.
      //
      // Deliberately does NOT re-evaluate needsOnboarding: the gate has already
      // decided from the cache, and letting a late response redirect someone
      // mid-session would be a behaviour change well beyond keeping links fresh.
      getCompanyDetails()
        .then((res) => setCompany(res.company))
        .catch(() => {
          /* best-effort; the cache simply stays as it was */
        });
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
            {/* Layout-level, not page-level (unlike WelcomeDialog, which is
                mounted on the dashboard home): a studio's plan can activate on
                the billing page, on /checkout, or silently via a Razorpay
                webhook they see the result of on whatever page they open next.
                `should_show` is computed server-side, so wherever they land is
                where the prompt appears. */}
            <CustomDomainDialog />
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
        <SubscriptionBanner snapshot={snapshot} scope="app" className="px-4 pt-4 sm:px-6" />
        <main ref={mainRef as React.RefObject<HTMLElement>} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
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
