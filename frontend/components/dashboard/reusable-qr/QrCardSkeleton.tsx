/**
 * Loading placeholder for the QR grid — mirrors the `CardGridSkeleton` in the
 * events list, but laid out as the wide horizontal rows the real `QrCard` uses.
 */
export function QrCardSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-1 2xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-4 sm:flex-row sm:items-center"
          style={{ animationDelay: `${i * 0.06}s` }}
        >
          <div className="skeleton h-32 w-32 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-3">
            <div className="skeleton h-4 w-1/3 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
            <div className="flex gap-2 pt-1">
              <div className="skeleton h-9 w-28 rounded-lg" />
              <div className="skeleton h-9 w-24 rounded-lg" />
              <div className="skeleton h-9 w-9 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
