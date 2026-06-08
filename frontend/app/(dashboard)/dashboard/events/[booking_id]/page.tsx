import { EventPageClient } from "./EventPageClient";

type PageProps = {
  params: Promise<{ booking_id: string }>;
};

export default async function EventDetailPage({ params }: PageProps) {
  const { booking_id } = await params;
  return <EventPageClient bookingId={booking_id} />;
}
