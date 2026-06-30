import { StatCard } from "@/components/ui/StatCard";

type Props = {
  visits: number;
  contacts: number;
  reviews: number;
  total: number;
};

export function StatsBar({ visits, contacts, reviews, total }: Props) {
  // TODO(backend): dashboard aggregates endpoint.
  // The values below only sum the visible ≤20-row page (the list endpoint
  // returns one paginated page, not company-wide totals). The richer mockup
  // sublabels ("Indore · Jaipur +4", "last 30 days ↑18%", "6.6% of visits")
  // and true totals/deltas need a dedicated backend aggregate endpoint — left
  // unpopulated here rather than fabricated. Pass `subLabel`/`delta` once it
  // ships.
  const stats: {
    label: string;
    value: number;
    hint: string;
    subLabel?: string;
    delta?: { value: number; label: string } | null;
  }[] = [
    { label: "Total Live Events", value: total, hint: "" },
    { label: "Guest visits", value: visits, hint: "Guests who opened the gallery" },
    { label: "Studio contacts", value: contacts, hint: "Guests who tapped Contact us" },
    { label: "Google reviews", value: reviews, hint: "Guests who tapped Leave a review" },
  ];

  return (
    <div className="dash-stagger grid grid-cols-2 gap-x-4 gap-y-5 border-y border-[var(--color-brand-border)] py-5 sm:grid-cols-4 sm:gap-0">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={
            i > 0 ? "sm:border-l sm:border-[var(--color-brand-border)] sm:pl-6" : ""
          }
        >
          <StatCard
            label={s.label}
            value={s.value}
            hint={s.hint}
            subLabel={s.subLabel}
            delta={s.delta}
          />
        </div>
      ))}
    </div>
  );
}
