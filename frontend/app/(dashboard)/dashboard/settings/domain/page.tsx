"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCustomDomainStatus,
  recheckCustomDomain,
  removeCustomDomain,
  ApiError,
} from "@/lib/api";
import type { CustomDomainStatusResponse } from "@/lib/types";
import { useUpgradeModal } from "@/components/billing/UpgradeModalProvider";
import { useReminders } from "@/components/dashboard/RemindersProvider";
import { CustomDomainSetupPanel, DnsRecord } from "@/components/settings/CustomDomainSetupPanel";
import { Modal } from "@/components/ui/Modal";
import {
  SectionHeading,
  Card,
  SectionSkeleton,
  FetchError,
  GlobeIcon,
  CheckIcon,
  AlertIcon,
} from "../SettingsUI";

/** How often to re-read our own status while a domain is mid-setup. Polls the
 *  backend's cached fields, never Cloudflare — the 30-minute reconciliation
 *  cron is what keeps those fresh, and this is what surfaces the result. */
const POLL_MS = 10_000;

export default function CustomDomainPage() {
  const { openUpgradeModal } = useUpgradeModal();
  const { refresh: refreshReminders } = useReminders();
  const [data, setData] = useState<CustomDomainStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // A wall-clock deadline, not a tick counter — same drift-safety as
  // OtpCodeStep: a backgrounded tab catches up on its next tick instead of
  // under-counting. Only set when the server's own limiter says to wait.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const load = useCallback(async () => {
    const res = await getCustomDomainStatus();
    setData(res);
    return res;
  }, []);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-then-setState is the documented React pattern for effects
    load().catch((err) => {
      if (!active) return;
      // A 404 here means the backend kill switch is off, not that something
      // broke — the nav shouldn't have shown this tab at all in that case, so
      // the honest message is "not available yet", not an error.
      setLoadError(
        err instanceof ApiError && err.status === 404
          ? "Custom domains aren't available yet."
          : err instanceof Error
            ? err.message
            : "Failed to load",
      );
    });
    return () => {
      active = false;
    };
  }, [load]);

  const status = data?.status ?? "none";
  const isPending = status === "pending_dns" || status === "pending_certificate";

  // Poll only while there is something to wait for, and stop on unmount. The
  // terminal states (active / failed / none) never change without the studio
  // doing something, which re-fetches anyway.
  useEffect(() => {
    if (!isPending) return;
    const id = setInterval(() => {
      void load().catch(() => {
        /* best-effort; the next tick retries */
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isPending, load]);

  useEffect(() => {
    if (cooldownUntil === 0) return;
    function tick() {
      setCooldownLeft(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  // A successful state change can resolve the custom-domain reminder, so keep
  // RemindersProvider's once-per-visit snapshot from going stale — same
  // best-effort refresh useSectionSave already does for the other two.
  const refreshedRef = useRef(false);
  useEffect(() => {
    if (status !== "active" || refreshedRef.current) return;
    refreshedRef.current = true;
    void refreshReminders();
  }, [status, refreshReminders]);

  async function handleRecheck() {
    setRechecking(true);
    setActionError(null);
    try {
      setData(await recheckCustomDomain());
    } catch (err) {
      // Drift-safety: when the server's limiter disagrees with our own idea of
      // how often this may be pressed, resume from ITS retryAfter rather than
      // showing a dead-end error.
      if (
        err instanceof ApiError &&
        err.status === 429 &&
        err.body &&
        typeof err.body === "object" &&
        "retryAfter" in err.body
      ) {
        const retryAfter = Number((err.body as { retryAfter?: number }).retryAfter);
        setCooldownUntil(Date.now() + (Number.isFinite(retryAfter) ? retryAfter : 60) * 1000);
      } else if (err instanceof ApiError && err.status === 429) {
        setCooldownUntil(Date.now() + 60_000);
      }
      setActionError(err instanceof Error ? err.message : "Couldn't check right now.");
    } finally {
      setRechecking(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setActionError(null);
    try {
      await removeCustomDomain();
      setConfirmRemove(false);
      await load();
      void refreshReminders();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't remove the domain.");
    } finally {
      setRemoving(false);
    }
  }

  if (loadError) return <FetchError message={loadError} />;
  if (!data) return <SectionSkeleton />;

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Custom Domain"
        description="Serve your galleries from your own domain, so every link you send carries your studio's name instead of ours."
      />

      {!data.allowed ? (
        <LockedCard onUpgrade={() => openUpgradeModal()} />
      ) : (
        <Card title="Your gallery domain" icon={<GlobeIcon />}>
          {status === "active" ? (
            <ActiveState
              hostname={data.hostname}
              onRemove={() => setConfirmRemove(true)}
              removing={removing}
            />
          ) : status === "failed" || status === "moved" ? (
            <FailedState
              hostname={data.pending_hostname ?? data.hostname}
              error={data.error}
              cnameTarget={data.cname_target}
              onRecheck={handleRecheck}
              rechecking={rechecking}
              cooldownLeft={cooldownLeft}
              onRemove={() => setConfirmRemove(true)}
            />
          ) : (
            <CustomDomainSetupPanel
              status={status}
              pendingHostname={data.pending_hostname}
              cnameTarget={data.cname_target}
              onRequested={() => void load()}
              pendingFooter={
                <RecheckRow
                  onRecheck={handleRecheck}
                  rechecking={rechecking}
                  cooldownLeft={cooldownLeft}
                  onCancel={() => setConfirmRemove(true)}
                />
              }
            />
          )}

          {actionError && (
            <p role="alert" className="mt-4 text-sm text-[var(--color-brand-danger)]">
              {actionError}
            </p>
          )}
        </Card>
      )}

      <Modal
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={status === "active" ? "Remove this domain?" : "Cancel this setup?"}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-brand-muted)]">
            {status === "active" ? (
              <>
                New gallery links will go back to using <strong>deliver.vyavasth.in</strong>. Links
                you&apos;ve already shared on{" "}
                <strong className="text-[var(--color-brand-ink)]">{data.hostname}</strong> will stop
                working, and your printed QR codes will keep working either way.
              </>
            ) : (
              <>
                We&apos;ll stop waiting for{" "}
                <strong className="text-[var(--color-brand-ink)]">{data.pending_hostname}</strong>.
                You can add it again any time.
              </>
            )}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-danger)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
            >
              {removing ? "Removing…" : status === "active" ? "Remove domain" : "Cancel setup"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(false)}
              className="brand-focus inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)] sm:flex-1"
            >
              Keep it
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** Free plan. Sells the outcome, not the mechanism, and offers the one action. */
function LockedCard({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <Card title="Your gallery domain" icon={<GlobeIcon />}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-brand-muted)]">
          On a paid plan you can send galleries from{" "}
          <span className="font-mono text-[var(--color-brand-ink)]">gallery.yourstudio.com</span>{" "}
          instead of deliver.vyavasth.in — so the link a couple forwards to fifty relatives has your
          studio&apos;s name on it, not ours.
        </p>
        <button
          type="button"
          onClick={onUpgrade}
          className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
        >
          Upgrade plan
        </button>
      </div>
    </Card>
  );
}

function ActiveState({
  hostname,
  onRemove,
  removing,
}: {
  hostname: string | null;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-sm text-[var(--color-brand-ink)]">{hostname}</span>
        {/* Same chip as VerifiedWhatsappField / VerifiedBusinessEmailField. */}
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-success)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-success)]">
          <CheckIcon className="h-3 w-3" />
          Verified
        </span>
      </div>
      <div className="rounded-card border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
          Your gallery links now look like
        </p>
        <code className="mt-1 block truncate font-mono text-[13px] text-[var(--color-brand-ink)]">
          https://{hostname}/event/riya-and-arjun
        </code>
      </div>
      <p className="text-xs text-[var(--color-brand-muted)]">
        Links you shared before this was set up still work, and so do your printed QR codes — they
        follow whichever domain is live at the moment someone scans them.
      </p>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        className="brand-focus text-xs font-semibold text-[var(--color-brand-danger)] underline-offset-2 hover:underline disabled:opacity-60"
      >
        Remove domain
      </button>
    </div>
  );
}

/**
 * Setup failed, or a live domain regressed. Shows Cloudflare's own message
 * verbatim (it names the actual record or CAA entry at fault) plus a
 * plain-language hint for the three failures that actually happen.
 */
function FailedState({
  hostname,
  error,
  cnameTarget,
  onRecheck,
  rechecking,
  cooldownLeft,
  onRemove,
}: {
  hostname: string | null;
  error: string | null;
  cnameTarget: string;
  onRecheck: () => void;
  rechecking: boolean;
  cooldownLeft: number;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-sm text-[var(--color-brand-ink)]">{hostname ?? "—"}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-warning)]">
          <AlertIcon className="h-3 w-3" />
          Needs attention
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]">
          {error}
        </p>
      )}

      <div className="space-y-2 text-xs text-[var(--color-brand-muted)]">
        <p className="font-semibold text-[var(--color-brand-ink)]">What usually causes this</p>
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            <strong className="text-[var(--color-brand-ink)]">The CNAME isn&apos;t there yet.</strong>{" "}
            Check the record below is saved and not proxied through another service.
          </li>
          <li>
            <strong className="text-[var(--color-brand-ink)]">
              The domain is behind another CDN.
            </strong>{" "}
            If something else (another CDN, a site builder) is already serving this hostname, we
            can&apos;t verify it. Point the subdomain at us directly.
          </li>
          <li>
            <strong className="text-[var(--color-brand-ink)]">A CAA record is blocking it.</strong>{" "}
            If your domain has CAA records, add <span className="font-mono">digicert.com</span> and{" "}
            <span className="font-mono">letsencrypt.org</span> to them.
          </li>
        </ul>
      </div>

      <DnsRecord hostname={hostname} cnameTarget={cnameTarget} />

      <RecheckRow
        onRecheck={onRecheck}
        rechecking={rechecking}
        cooldownLeft={cooldownLeft}
        onCancel={onRemove}
        cancelLabel="Remove domain"
      />
    </div>
  );
}

/** The "Check again" affordance, shared by the pending and failed states. */
function RecheckRow({
  onRecheck,
  rechecking,
  cooldownLeft,
  onCancel,
  cancelLabel = "Cancel setup",
}: {
  onRecheck: () => void;
  rechecking: boolean;
  cooldownLeft: number;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const waiting = cooldownLeft > 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        onClick={onRecheck}
        disabled={rechecking || waiting}
        className="brand-focus inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {rechecking
          ? "Checking…"
          : waiting
            ? `Check again in 0:${String(cooldownLeft).padStart(2, "0")}`
            : "Check again"}
      </button>
      <span className="text-xs text-[var(--color-brand-muted)]">
        We also check on our own every half hour.
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="brand-focus text-xs font-semibold text-[var(--color-brand-danger)] underline-offset-2 hover:underline"
      >
        {cancelLabel}
      </button>
    </div>
  );
}
