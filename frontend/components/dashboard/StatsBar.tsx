import { StatCard } from "@/components/ui/StatCard";

type Props = {
  visits: number;
  deliveries: number;
  reviews: number;
  total: number;
};

export function StatsBar({ visits, deliveries, reviews, total }: Props) {
  return (
    <div className="dash-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total events"
        value={total}
        hint="All tracked actions"
        icon={<PulseIcon />}
        tone="navy"
      />
      <StatCard
        label="Visits"
        value={visits}
        hint="Page opens"
        icon={<EyeIcon />}
        tone="gold"
      />
      <StatCard
        label="Delivery clicks"
        value={deliveries}
        hint="Gallery opens"
        icon={<LinkIcon />}
        tone="success"
      />
      <StatCard
        label="Reviews"
        value={reviews}
        hint="Google review taps"
        icon={<StarIcon />}
        tone="warning"
      />
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M2 10s2.5-5 8-5 8 5 8 5-2.5 5-8 5-8-5-8-5z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M8 12l4-4M7 13l-1.5 1.5a2.5 2.5 0 11-3.5-3.5L4 9.5M13 7l1.5-1.5a2.5 2.5 0 113.5 3.5L16 10.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 2.5l2.4 5 5.1.6-3.7 3.5 1 5.4L10 14.6l-4.8 2.4 1-5.4-3.7-3.5 5.1-.6L10 2.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M2 10h3l2-5 4 10 2-5 2 3h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
