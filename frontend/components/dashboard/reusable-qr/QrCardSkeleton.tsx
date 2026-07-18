/**
 * Loading placeholder for the QR grid — mirrors the real `QrCard`'s three-zone
 * row (thumbnail · details · action rail), including the container-query split
 * of the details into two columns on wide cards.
 */
export function QrCardSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-1 2xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="@container flex flex-col gap-4 rounded-xl border border-[var(--color-brand-border)] bg-[var(--color-brand-surface-raised)] p-4 @md:flex-row @md:items-stretch @md:gap-5"
          style={{ animationDelay: `${i * 0.06}s` }}
        >
          <div className="skeleton h-24 w-24 shrink-0 self-start rounded-lg @md:h-32 @md:w-32 @md:self-center" />

          <div className="flex min-w-0 flex-1 flex-col gap-4 @3xl:flex-row @3xl:items-stretch @3xl:gap-6">
            <div className="flex flex-col justify-center gap-2 @3xl:w-44 @3xl:shrink-0">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-4 w-24 rounded" />
              <div className="skeleton h-3 w-28 rounded" />
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2 border-t border-[var(--color-brand-border)] pt-4 @3xl:border-l @3xl:border-t-0 @3xl:pl-6 @3xl:pt-0">
              <div className="skeleton h-3 w-24 rounded" />
              <div className="flex items-center gap-3">
                <div className="skeleton h-11 w-[68px] shrink-0 rounded-md" />
                <div className="skeleton h-4 w-32 rounded" />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--color-brand-border)] pt-4 @md:w-40 @md:justify-center @md:border-l @md:border-t-0 @md:pl-5 @md:pt-0">
            <div className="skeleton h-9 w-full rounded-lg" />
            <div className="skeleton h-9 w-full rounded-lg" />
            <div className="skeleton h-9 w-full rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
