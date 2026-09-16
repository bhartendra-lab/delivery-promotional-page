"use client";

import { Modal } from "./Modal";

/**
 * A plain-language confirm for a deliberate, reversible change: a title that
 * asks the question, one sentence of consequence, Cancel, and an action button
 * named for what it does ("Set required visit", never "OK").
 *
 * Built on `Modal`, so it is a full-screen sheet under 640px and a centred card
 * above, with the shared focus trap and Escape handling. Escape, the X and
 * Cancel all mean "don't". For a destructive action that should make the
 * Studio type the word first, use `TypeConfirmModal` instead.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** One sentence: what happens if they go ahead. */
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13.5px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="brand-focus inline-flex h-10 items-center rounded-lg bg-[var(--color-brand-navy)] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--color-brand-navy-deep)]"
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--color-brand-muted)]">{description}</p>
    </Modal>
  );
}
