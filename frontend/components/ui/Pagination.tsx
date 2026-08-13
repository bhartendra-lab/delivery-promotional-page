"use client";

import { IconChevronLeft, IconChevronRight } from "@/components/ui/icons";

type Props = {
  current: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Prev/Next + a bare "current / total" label — fits a single locked toolbar line. */
  compact?: boolean;
};

export function Pagination({ current, totalPages, onChange, compact = false }: Props) {
  if (totalPages <= 1) return null;
  const canPrev = current > 1;
  const canNext = current < totalPages;

  if (compact) {
    return (
      <nav aria-label="Pagination" className="flex shrink-0 items-center gap-1">
        <PageBtn disabled={!canPrev} onClick={() => onChange(current - 1)} aria-label="Previous page">
          <IconChevronLeft size={13} />
        </PageBtn>
        <span className="whitespace-nowrap px-1 text-xs text-[var(--color-brand-muted)]">
          <span className="font-semibold text-[var(--color-brand-ink)]">{current}</span> / {totalPages}
        </span>
        <PageBtn disabled={!canNext} onClick={() => onChange(current + 1)} aria-label="Next page">
          <IconChevronRight size={13} />
        </PageBtn>
      </nav>
    );
  }

  const pages = buildPageList(current, totalPages);

  return (
    <nav aria-label="Pagination" className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-[var(--color-brand-muted)]">
        Page{" "}
        <span className="font-semibold text-[var(--color-brand-ink)]">{current}</span>{" "}
        of{" "}
        <span className="font-semibold text-[var(--color-brand-ink)]">{totalPages}</span>
      </p>

      <div className="flex items-center gap-1">
        <PageBtn disabled={!canPrev} onClick={() => onChange(current - 1)} aria-label="Previous page">
          <IconChevronLeft size={13} />
        </PageBtn>

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-[var(--color-brand-muted)]" aria-hidden>…</span>
          ) : (
            <PageBtn
              key={p}
              active={p === current}
              onClick={() => onChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === current ? "page" : undefined}
            >
              {p}
            </PageBtn>
          ),
        )}

        <PageBtn disabled={!canNext} onClick={() => onChange(current + 1)} aria-label="Next page">
          <IconChevronRight size={13} />
        </PageBtn>
      </div>
    </nav>
  );
}

function PageBtn({ children, active, disabled, onClick, ...rest }: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      {...rest}
      className={`brand-focus inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--color-brand-navy)] text-white"
          : disabled
            ? "cursor-not-allowed text-[var(--color-brand-muted)]/40"
            : "border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] text-[var(--color-brand-ink)] hover:border-[var(--color-brand-outline)]"
      }`}
    >
      {children}
    </button>
  );
}

function buildPageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

