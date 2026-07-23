"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken, clearCompany } from "@/lib/auth";
import { useCompany } from "@/lib/useCompany";
import { useUploadingBookingIds } from "@/lib/r2-upload/useActiveUploads";
import { IconGear, IconLogout, IconCaretUpDown } from "@/components/ui/icons";

/**
 * Signing out clears the token the running upload needs for its presign +
 * create-media calls, so an in-flight run really would die with it. Unlike
 * navigation (which the engine survives — it lives in a module-level registry),
 * this one still warrants a stop-and-think — but it's the studio's call to make,
 * not ours, so it's a confirm rather than a block.
 */
const SIGN_OUT_GUARD =
  "An upload is still running. Signing out now will stop it — photos already uploaded stay in the gallery. Sign out anyway?";

/**
 * Trigger flavours for the shared account popover:
 *   chip   — desktop sidebar footer, full profile chip (opens upward)
 *   icon   — collapsed sidebar footer, avatar-only button (opens upward)
 *   avatar — mobile Topbar, avatar button (opens downward)
 */
type Variant = "chip" | "icon" | "avatar";

/**
 * One account menu, two responsive triggers. Holds the identity header (logo or
 * initials + company name), a Settings link, and Sign out. Closes on
 * outside-click and Esc (mirrors CoverBanner's outside-click effect). Settings
 * navigates freely during an upload (the engine keeps running across routes);
 * only Sign out confirms first, since it revokes the token mid-run.
 */
export function AccountMenu({ variant }: { variant: Variant }) {
  const router = useRouter();
  const company = useCompany();
  const uploadingIds = useUploadingBookingIds();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const companyName = company?.name ?? "Studio";
  const initials = (
    (company?.name?.[0]?.toUpperCase() ?? "S") +
    (company?.name?.split(" ")[1]?.[0]?.toUpperCase() ?? "")
  ).slice(0, 2);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function signOut() {
    if (uploadingIds.size > 0 && !window.confirm(SIGN_OUT_GUARD)) return;
    setOpen(false);
    clearToken();
    clearCompany();
    router.replace("/login");
  }

  const upward = variant !== "avatar";
  const menuPos = `${upward ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"} ${
    variant === "avatar" ? "right-0" : "left-0"
  }`;

  return (
    <div className="relative" ref={wrapRef}>
      {variant === "chip" ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          className="brand-focus flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-[var(--color-brand-surface)]/60"
        >
          <Avatar logo={company?.logo} name={companyName} initials={initials} sizeCls="h-7 w-7" textCls="text-[11px]" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-brand-ink)]">
            {companyName}
          </span>
          <IconCaretUpDown size={14} className="shrink-0 text-[var(--color-brand-muted)]" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          title={variant === "icon" ? companyName : undefined}
          className={`brand-focus flex items-center rounded-md hover:bg-[var(--color-brand-surface)]/60 ${
            variant === "icon" ? "w-full justify-center py-1.5" : "p-1"
          }`}
        >
          <Avatar logo={company?.logo} name={companyName} initials={initials} sizeCls="h-7 w-7" textCls="text-[11px]" />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className={`absolute ${menuPos} z-40 w-[240px] overflow-hidden rounded-[10px] border border-[var(--color-brand-border)] bg-white shadow-[0_8px_28px_rgba(42,34,24,0.14)]`}
        >
          <div className="flex items-center gap-2.5 border-b border-[var(--color-brand-border)] px-3.5 py-3">
            <Avatar logo={company?.logo} name={companyName} initials={initials} sizeCls="h-8 w-8" textCls="text-[12px]" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--color-brand-ink)]">
              {companyName}
            </span>
          </div>
          <Link
            href="/dashboard/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium text-[var(--color-brand-ink)] no-underline hover:bg-[var(--color-brand-bg)]"
          >
            <IconGear size={16} className="text-[var(--color-brand-muted)]" />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-bg)]"
          >
            <IconLogout size={16} className="text-[var(--color-brand-muted)]" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Avatar({
  logo,
  name,
  initials,
  sizeCls,
  textCls,
}: {
  logo?: string;
  name: string;
  initials: string;
  sizeCls: string;
  textCls: string;
}) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt={name} className={`${sizeCls} shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <span
      className={`${sizeCls} ${textCls} inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-ink)] font-bold text-white`}
    >
      {initials}
    </span>
  );
}

