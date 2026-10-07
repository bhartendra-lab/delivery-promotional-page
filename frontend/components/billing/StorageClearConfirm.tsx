"use client";

import type { StorageDataWarning } from "@/lib/billing-types";
import { IconWarningCircle } from "@/components/ui/icons";

/**
 * Shown on the confirm step when an event purchase leaves a lapsed storage
 * plan that still has galleries: paying deletes them, for good. The message is
 * the API's own (it names the count), and the purchase cannot go ahead until
 * the box is ticked: checkout refuses without `confirm_storage_clear`.
 */
export function StorageClearConfirm({
  warning,
  checked,
  onChange,
}: {
  warning: StorageDataWarning;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-brand-danger)]/30 bg-[var(--color-brand-danger-soft)] px-4 py-3"
    >
      <div className="flex items-start gap-2.5 text-sm leading-relaxed text-[var(--color-brand-danger)]">
        <IconWarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{warning.message}</p>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-[var(--color-brand-ink)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="brand-focus mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand-navy)]"
        />
        <span>
          I understand that {warning.galleries === 1 ? "this gallery" : `these ${warning.galleries} galleries`} and
          everything in {warning.galleries === 1 ? "it" : "them"} will be deleted and cannot be recovered.
        </span>
      </label>
    </div>
  );
}
