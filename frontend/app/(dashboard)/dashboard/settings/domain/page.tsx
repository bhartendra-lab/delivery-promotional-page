"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCustomDomainStatus,
  recheckCustomDomain,
  removeCustomDomain,
  ApiError,
} from "@/lib/api";
import type { CustomDomainStatus, CustomDomainStatusResponse } from "@/lib/types";
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
  /** When the last manual check completed, for the "checked just now" line. */
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
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
  /** A domain the studio's plan no longer covers is frozen: recheck is refused
   *  and the reconciliation cron skips it, so nothing about it can change. */
  const planCoversDomain = Boolean(data?.allowed);
  /** A domain exists (in any state) that the current plan doesn't cover. */
  const isPaused = data != null && !data.allowed && status !== "none";

  // Poll only while there is something to wait for, and stop on unmount. The
  // terminal states (active / failed / none) never change without the studio
  // doing something, which re-fetches anyway.
  useEffect(() => {
    // Polling a frozen domain would spin forever against a status that cannot
    // move — see planCoversDomain.
    if (!isPending || !planCoversDomain) return;
    const id = setInterval(() => {
      void load().catch(() => {
        /* best-effort; the next tick retries */
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isPending, planCoversDomain, load]);

  useEffect(() => {
    if (cooldownUntil === 0) return;
    function tick() {
      setCooldownLeft(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  // "Checked just now" stops being true after a moment. Clear it rather than
  // leave a line on screen that quietly becomes a lie — the background poll
  // keeps running regardless, so nothing is lost by dropping the message.
  useEffect(() => {
    if (checkedAt === null) return;
    const id = setTimeout(() => setCheckedAt(null), 30_000);
    return () => clearTimeout(id);
  }, [checkedAt]);

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
    setCheckedAt(null);
    try {
      const res = await recheckCustomDomain();
      // MERGE, never replace. The server returns the full payload (see
      // customDomainPayload on the backend), but a response that is missing a
      // field for any reason must not be able to downgrade what is on screen —
      // that is exactly how a missing `allowed` once turned every "Check again"
      // into the Free-plan upgrade pitch.
      setData((prev) => ({ ...(prev as CustomDomainStatusResponse), ...res }));
      // A check that finds nothing new is the COMMON case — DNS takes minutes.
      // Without this the button would complete and change nothing on screen,
      // which reads as "the button is broken" rather than "not yet".
      setCheckedAt(Date.now());
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

      {isPaused ? (
        /* The studio HAS a domain but their plan no longer covers it — a
           downgrade to Free, or a subscription that lapsed without a
           replacement. Showing LockedCard here (the old behaviour) hid their
           own domain from them and, worse, hid the Remove action, leaving them
           unable to disconnect it without contacting support. */
        <Card title="Your gallery domain" icon={<GlobeIcon />}>
          <PausedState
            hostname={data.hostname ?? data.pending_hostname}
            isLive={status === "active"}
            onUpgrade={() => openUpgradeModal()}
            onRemove={() => setConfirmRemove(true)}
            removing={removing}
          />
          {actionError && (
            <p role="alert" className="mt-4 text-sm text-[var(--color-brand-danger)]">
              {actionError}
            </p>
          )}
        </Card>
      ) : !data.allowed ? (
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
              checkedAt={checkedAt}
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
                  checkedAt={checkedAt}
                  pendingStatus={status}
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

/**
 * A domain that exists but whose plan no longer covers it — a downgrade to
 * Free, or a lapsed subscription with nothing replacing it.
 *
 * Deliberately NOT the locked upsell card. The studio owns this hostname; they
 * need to see which one it is and be able to disconnect it themselves. The two
 * ways out are both offered: upgrade to get control back, or remove it.
 *
 * No "Check again" and no setup panel: `recheck` is refused for an uncovered
 * plan and the reconciliation cron skips it, so offering either would be a
 * button that cannot work.
 *
 * `isLive` is the honest distinction, not a cosmetic one. An ALREADY-ACTIVE
 * domain keeps serving — nothing revokes it on downgrade, by design, because
 * killing it would break gallery links guests already hold. A domain still
 * mid-setup will simply never finish.
 */
function PausedState({
  hostname,
  isLive,
  onUpgrade,
  onRemove,
  removing,
}: {
  hostname: string | null;
  isLive: boolean;
  onUpgrade: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-sm text-[var(--color-brand-ink)]">{hostname ?? "—"}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-brand-warning-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-brand-warning)]">
          <AlertIcon className="h-3 w-3" />
          Paused
        </span>
      </div>

      <p className="text-sm text-[var(--color-brand-muted)]">
        {isLive ? (
          <>
            Your galleries are still being served from this domain, but custom domains
            aren&apos;t part of your current plan — so you can&apos;t change it until you upgrade.
          </>
        ) : (
          <>
            Setting up this domain is on hold: custom domains aren&apos;t part of your current
            plan.
          </>
        )}
      </p>

      <p className="text-xs text-[var(--color-brand-muted)]">
        {isLive
          ? "Removing it sends new gallery links back to deliver.vyavasth.in, and links you've already shared on this domain would stop working."
          : "Upgrade to finish setting it up, or remove it if you've changed your mind."}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onUpgrade}
          className="brand-focus inline-flex h-11 items-center justify-center rounded-lg bg-[var(--color-brand-navy)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
        >
          Upgrade plan
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="brand-focus text-xs font-semibold text-[var(--color-brand-danger)] underline-offset-2 hover:underline disabled:opacity-60"
        >
          Remove domain
        </button>
      </div>
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
  checkedAt,
  onRemove,
}: {
  hostname: string | null;
  error: string | null;
  cnameTarget: string;
  onRecheck: () => void;
  rechecking: boolean;
  cooldownLeft: number;
  checkedAt: number | null;
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
        checkedAt={checkedAt}
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
  checkedAt,
  pendingStatus,
  onCancel,
  cancelLabel = "Cancel setup",
}: {
  onRecheck: () => void;
  rechecking: boolean;
  cooldownLeft: number;
  /** When the last manual check finished, or null if none has this session. */
  checkedAt: number | null;
  /** The status the check landed on, when this row is rendered in a pending
   *  state — used only to word the result line. */
  pendingStatus?: CustomDomainStatus;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const waiting = cooldownLeft > 0;
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onRecheck}
          disabled={rechecking || waiting}
          aria-busy={rechecking}
          className="brand-focus inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--color-brand-border)] px-4 text-sm font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {/* A spinner, not just a label swap. A DNS check can take a second or
              two, and a button whose only feedback is three extra characters
              reads as "nothing happened". */}
          {rechecking && (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-brand-border)] border-t-[var(--color-brand-navy)]" />
          )}
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

      {/* The result of the last check. Without this, a check that finds nothing
          new — which is most of them, since DNS takes minutes — completes with
          no visible change at all, and the button reads as broken. A promotion
          needs no line here: the whole card changes. */}
      {checkedAt !== null && !rechecking && (
        <p
          aria-live="polite"
          className="flex items-center gap-1.5 text-xs text-[var(--color-brand-muted)]"
        >
          <CheckIcon className="h-3 w-3 shrink-0 text-[var(--color-brand-success)]" />
          {pendingStatus === "pending_certificate"
            ? "Checked just now — your DNS is correct, the certificate is still issuing."
            : "Checked just now — your DNS record hasn't reached us yet. This usually takes a few minutes."}
        </p>
      )}
    </div>
  );
}
