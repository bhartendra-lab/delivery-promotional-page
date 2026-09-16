"use client";

import { useState } from "react";
import { requestCustomDomain } from "@/lib/api";
import { checkHostnameInput } from "@/lib/custom-domain";
import type { CustomDomainStatus } from "@/lib/types";
import { CopyableIdField } from "@/app/(dashboard)/dashboard/settings/SettingsUI";
import { IconWarningCircle } from "@/components/ui/icons";

/**
 * The two-step setup experience — "type your domain" then "add this DNS
 * record" — extracted so the Settings tab and the post-upgrade dialog render
 * the SAME component rather than two setups that slowly diverge.
 *
 * Deliberately owns only the entry and instruction steps. The recheck loop, the
 * active/failed states and the remove action all live on the Settings tab,
 * because that is where a studio comes back to after editing DNS; the dialog
 * hands off to it with a link rather than duplicating it.
 *
 * Copy rule for this whole feature: say "your domain". Never "custom hostname",
 * never "Cloudflare" — the studio is buying a Vyavasth feature, and the
 * provider behind it is our problem, not theirs.
 */
export function CustomDomainSetupPanel({
  status,
  pendingHostname,
  cnameTarget,
  onRequested,
  /** Rendered under the DNS record — the dialog puts its "Finish in Settings"
   *  link here; the Settings tab puts its recheck controls there instead. */
  pendingFooter,
}: {
  status: CustomDomainStatus;
  pendingHostname: string | null;
  cnameTarget: string;
  /** Fired after a successful request so the host can refresh its own state. */
  onRequested: (hostname: string) => void;
  pendingFooter?: React.ReactNode;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only shown once the studio has finished typing (blur or submit) — live
  // validation on every keystroke would flag "gallery.stu" as a root domain
  // while they are still typing it.
  const [touched, setTouched] = useState(false);

  const { hostname, error: localError } = checkHostnameInput(value);
  const showLocalError = touched && value.trim() !== "" && localError;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (localError || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestCustomDomain(hostname);
      setValue("");
      setTouched(false);
      onRequested(hostname);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that domain. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Setup is under way — show the record to create rather than the input.
  if (status === "pending_dns" || status === "pending_certificate") {
    return (
      <div className="space-y-4">
        {status === "pending_dns" ? (
          <>
            <p className="text-sm text-[var(--color-brand-muted)]">
              Add this record wherever you manage DNS for{" "}
              <strong className="font-semibold text-[var(--color-brand-ink)]">
                {pendingHostname ?? "your domain"}
              </strong>
              . Most providers apply it within a few minutes.
            </p>
            <DnsRecord hostname={pendingHostname} cnameTarget={cnameTarget} />
          </>
        ) : (
          <div className="rounded-card border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] px-4 py-3.5">
            <p className="text-sm font-semibold text-[var(--color-brand-ink)]">
              DNS is correct — issuing your certificate.
            </p>
            <p className="mt-1 text-[13px] text-[var(--color-brand-muted)]">
              This usually takes a few minutes. You can close this and come back; nothing is
              waiting on you.
            </p>
          </div>
        )}
        {pendingFooter}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="custom-domain-input"
          className="mb-1.5 block text-[13px] font-medium text-[var(--color-brand-ink)]"
        >
          Your gallery domain
        </label>
        <input
          id="custom-domain-input"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="gallery.yourstudio.com"
          aria-invalid={showLocalError ? true : undefined}
          aria-describedby="custom-domain-help"
          className="brand-focus h-10 w-full rounded-field border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-3 text-sm text-[var(--color-brand-ink)] placeholder:text-[var(--color-brand-muted)]"
        />
        <p id="custom-domain-help" className="mt-1.5 text-xs text-[var(--color-brand-muted)]">
          Use a subdomain you own, like <span className="font-mono">gallery.yourstudio.com</span>.
          You&apos;ll need access to your domain&apos;s DNS settings to finish — it&apos;s one record.
        </p>
        {showLocalError && (
          <p className="mt-1.5 text-xs text-[var(--color-brand-danger)]">{localError}</p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-brand-danger)]"
        >
          <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || value.trim() === ""}
        className="brand-focus inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--color-brand-navy)] text-sm font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-5"
      >
        {submitting ? "Adding domain…" : "Add domain"}
      </button>
    </form>
  );
}

/**
 * The one DNS record a studio has to create. `CopyableIdField` for the value
 * specifically — that string is long, exact, and the single most
 * transcription-error-prone thing in this flow.
 */
export function DnsRecord({
  hostname,
  cnameTarget,
}: {
  hostname: string | null;
  cnameTarget: string;
}) {
  return (
    <div className="space-y-3 rounded-card border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-4">
      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
          Type
        </span>
        <code className="font-mono text-[13px] text-[var(--color-brand-ink)]">CNAME</code>
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand-muted)]">
          Name
        </span>
        <code className="truncate font-mono text-[13px] text-[var(--color-brand-ink)]">
          {hostname ?? "—"}
        </code>
      </div>
      <CopyableIdField label="Value" value={cnameTarget} />
      <p className="text-xs text-[var(--color-brand-muted)]">
        Some providers ask for just the first part of the name (
        <span className="font-mono">{hostname?.split(".")[0] ?? "gallery"}</span>) instead of the
        full domain. Either is fine.
      </p>
    </div>
  );
}
