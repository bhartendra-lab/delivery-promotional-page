"use client";

import { useEffect, useRef, useState } from "react";
import { IconWarning } from "./icons";

export type ConfirmAction = "activate" | "deactivate";

/**
 * Type-to-confirm safety gate (recreated from `event-tabs.jsx`). The user must
 * type the exact action word before the confirm button enables. Deactivate
 * uses the red danger button; activate uses navy. Esc cancels, Enter confirms
 * once matched. (Publish/republish no longer exist — events are live from
 * creation and media syncs automatically.)
 */
export function TypeConfirmModal({
  action,
  title,
  description,
  warningText,
  busy = false,
  onConfirm,
  onCancel,
}: {
  action: ConfirmAction;
  title: string;
  description: string;
  warningText?: string | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matched = typed.trim().toLowerCase() === action.toLowerCase();
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const f = card.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const confirmBg = action === "deactivate" ? "var(--color-brand-danger)" : "var(--color-brand-navy)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="type-confirm-title"
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: "rgba(42,34,24,0.48)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={cardRef}
        className="dash-rise w-full max-w-[444px] rounded-[14px] border border-[var(--color-brand-border)] bg-white p-7 shadow-[0_24px_64px_rgba(42,34,24,0.24)]"
      >
        <h3
          id="type-confirm-title"
          className="mb-2 text-[17px] font-bold tracking-tight text-[var(--color-brand-ink)]"
        >
          {title}
        </h3>
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--color-brand-muted)]">{description}</p>

        {warningText && (
          <div className="mb-[18px] flex items-start gap-2.5 rounded-lg border border-[#F0D9B5] bg-[var(--color-brand-warning-soft)] px-3 py-2.5">
            <IconWarning size={15} className="mt-px shrink-0 text-[var(--color-brand-warning)]" />
            <span className="text-[12.5px] leading-relaxed text-[var(--color-brand-warning)]">{warningText}</span>
          </div>
        )}

        <div className="mb-2 text-[12.5px] font-semibold text-[var(--color-brand-ink)]">
          Type{" "}
          <code className="rounded-[5px] border border-[var(--color-brand-border)] bg-[#F2F0EB] px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--color-brand-navy)]">
            {action}
          </code>{" "}
          to confirm
        </div>
        <input
          ref={inputRef}
          value={typed}
          disabled={busy}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matched && !busy) {
              e.preventDefault();
              onConfirm();
            }
          }}
          placeholder={`Type "${action}" here…`}
          aria-label={`Type ${action} to confirm`}
          className="mb-5 block w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] text-[var(--color-brand-ink)] outline-none transition-colors"
          style={{
            borderWidth: 1.5,
            borderColor: matched ? "var(--color-brand-success)" : "var(--color-brand-border)",
            background: matched ? "var(--color-brand-success-soft)" : "#FFFFFF",
          }}
        />

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="brand-focus inline-flex h-10 items-center rounded-lg border border-[var(--color-brand-border)] bg-white px-4 text-[13px] font-medium text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => matched && !busy && onConfirm()}
            disabled={!matched || busy}
            className="brand-focus inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13px] font-bold capitalize text-white transition-colors disabled:cursor-not-allowed"
            style={{ background: matched && !busy ? confirmBg : "var(--color-brand-border)" }}
          >
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[2px] border-white/60 border-t-white" />
                Working…
              </>
            ) : (
              action
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
