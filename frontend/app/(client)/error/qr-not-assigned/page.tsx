import type { Metadata } from "next";
import { QrScanError } from "@/components/event/QrScanError";

export const metadata: Metadata = {
  title: "QR not linked yet",
  robots: { index: false, follow: false },
};

/** Coerce a Next searchParam (string | string[] | undefined) to a single string. */
function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Landing for a scanned reusable QR that resolves to a real studio but isn't
 * pointed at a live event yet. `redirectQR` passes the studio's name + phone as
 * query params so we can offer a "Contact studio on WhatsApp" button.
 */
export default async function QrNotAssignedPage({
  searchParams,
}: {
  searchParams: Promise<{ studio?: string | string[]; phone?: string | string[] }>;
}) {
  const sp = await searchParams;
  return <QrScanError variant="not-assigned" studioName={one(sp.studio) ?? null} phone={one(sp.phone) ?? null} />;
}
