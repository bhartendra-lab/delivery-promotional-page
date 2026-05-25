import { StatCard } from "@/components/ui/StatCard";

type Props = {
  visits: number;
  deliveries: number;
  reviews: number;
  total: number;
};

export function StatsBar({ visits, deliveries, reviews, total }: Props) {
  return (
    <div className="dash-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Total events" value={total} hint="All tracked actions" />
      <StatCard label="Page visits" value={visits} hint="Unique page opens" />
      <StatCard label="Gallery opens" value={deliveries} hint="Delivery link clicks" />
      <StatCard label="Google reviews" value={reviews} hint="Review taps" />
    </div>
  );
}
