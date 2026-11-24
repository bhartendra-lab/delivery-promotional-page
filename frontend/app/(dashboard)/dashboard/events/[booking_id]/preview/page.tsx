import { GalleryPreview } from "./GalleryPreview";

type PageProps = {
  params: Promise<{ booking_id: string }>;
};

/**
 * The real guest gallery, rendered for the studio inside the Gallery Design
 * tab's iframe. Studio sign-in only (the dashboard layout gates it); it records
 * nothing and needs no guest sign-in. See GalleryPreview.
 */
export default async function GalleryPreviewPage({ params }: PageProps) {
  const { booking_id } = await params;
  return <GalleryPreview bookingId={booking_id} />;
}
