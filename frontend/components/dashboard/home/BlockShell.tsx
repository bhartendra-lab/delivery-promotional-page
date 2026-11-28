"use client";

import type { ReactNode } from "react";

/** A Dashboard block's heading row and its shared loading and error looks. */
export function BlockShell({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="type-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function BlockError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="type-body flex items-center justify-between gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] px-4 py-3">
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="brand-focus shrink-0 text-sm font-semibold text-[var(--color-brand-navy)] underline-offset-2 hover:underline">
        Try again
      </button>
    </div>
  );
}
