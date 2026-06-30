import { EventWorkspace } from "./EventWorkspace";

type PageProps = {
  params: Promise<{ booking_id: string }>;
};

export default async function EventDetailPage({ params }: PageProps) {
  const { booking_id } = await params;
  return <EventWorkspace bookingId={booking_id} />;
}
