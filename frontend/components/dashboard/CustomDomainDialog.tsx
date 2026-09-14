"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getCustomDomainStatus } from "@/lib/api";
import type { CustomDomainStatusResponse } from "@/lib/types";
import { useReminders } from "@/components/dashboard/RemindersProvider";
import { CustomDomainSetupPanel } from "@/components/settings/CustomDomainSetupPanel";
import { Modal } from "@/components/ui/Modal";
import { IconGlobe } from "@/components/ui/icons";

/**
 * One-shot custom-domain setup prompt, shown the first time a studio is on a
 * paid plan.
 *
 * NOT part of signup. Every new studio is provisioned on Free, so a domain step
 * during onboarding would be shown almost entirely to studios who can't use it;
 * tying it to paid activation instead puts it in front of the only audience it
 * applies to, at the moment they become entitled. Whether to show it is decided
 * entirely server-side (`status.custom_domain.should_show`) — this component
 * re-derives none of the plan, subscription-health or kill-switch rules.
 *
 * It is a setup step, not a nag: it renders the real setup panel so a studio can
 * enter a hostname and walk away with their DNS record without leaving the
 * dialog. Both exits dismiss permanently — there is no "remind me later",
 * because the Settings tab is where this lives from here on.
 */
export function CustomDomainDialog() {
  const { status, dismiss } = useReminders();
  const [closed, setClosed] = useState(false);
  const [data, setData] = useState<CustomDomainStatusResponse | null>(null);
  // Ref-guarded like WelcomeDialog#markSeen: Escape, the X and a button click
  // racing each other must only ever fire one POST.
  const dismissedRef = useRef(false);

  const open = Boolean(status?.custom_domain?.should_show) && !closed;

  // The dialog needs the CNAME target, which only the status endpoint knows.
  // Fetched lazily on open so a studio who never sees this dialog — which is
  // almost all of them, almost all of the time — pays nothing for it.
  useEffect(() => {
    if (!open || data) return;
    let active = true;
    getCustomDomainStatus()
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        // Best-effort, exactly like RemindersProvider's own fetch: if we can't
        // load the setup details we close rather than show a broken dialog.
        if (active) setClosed(true);
      });
    return () => {
      active = false;
    };
  }, [open, data]);

  /** Never blocks the close on the network — see WelcomeDialog#markSeen. */
  const ack = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    void dismiss("custom_domain");
  }, [dismiss]);

  function handleClose() {
    setClosed(true);
    ack();
  }

  if (!open || !data) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Use your own domain"
      subtitle="Send galleries from your studio's domain instead of ours."
      size="md"
      dismissOnBackdrop={false}
    >
      <div className="space-y-5">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field bg-[var(--color-brand-navy-soft)] text-[var(--color-brand-navy)]">
            <IconGlobe size={19} />
          </span>
          <p className="text-sm text-[var(--color-brand-muted)]">
            Your plan includes serving galleries from{" "}
            <span className="font-mono text-[var(--color-brand-ink)]">gallery.yourstudio.com</span>.
            It takes one DNS record, and everything you&apos;ve already shared keeps working.
          </p>
        </div>

        <CustomDomainSetupPanel
          status={data.status}
          pendingHostname={data.pending_hostname}
          cnameTarget={data.cname_target}
          // Submitting a hostname hands the studio off to Settings, where the
          // recheck loop lives — so this dismisses too. Re-reading the status
          // moves the panel to its pending-DNS state in place first, so the
          // studio gets their record without a navigation.
          onRequested={() => {
            ack();
            void getCustomDomainStatus()
              .then(setData)
              .catch(() => setClosed(true));
          }}
          pendingFooter={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/dashboard/settings/domain"
                onClick={handleClose}
                className="brand-focus inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
              >
                Finish in Settings
              </Link>
              <button
                type="button"
                onClick={handleClose}
                className="brand-focus text-xs font-semibold text-[var(--color-brand-muted)] underline-offset-2 hover:underline"
              >
                Close
              </button>
            </div>
          }
        />

        {data.status === "none" && (
          <button
            type="button"
            onClick={handleClose}
            className="brand-focus text-xs font-semibold text-[var(--color-brand-muted)] underline-offset-2 hover:underline"
          >
            Set up later
          </button>
        )}
      </div>
    </Modal>
  );
}
