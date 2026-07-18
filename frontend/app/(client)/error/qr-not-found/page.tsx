import type { Metadata } from "next";
import { QrScanError } from "@/components/event/QrScanError";

export const metadata: Metadata = {
  title: "QR code not valid",
  robots: { index: false, follow: false },
};

/**
 * Landing for a scanned reusable QR that doesn't resolve to any event — the QR
 * was deleted or the printed code was mis-scanned. Generic copy, no contact
 * button (there's no studio to attribute a nonexistent QR to). Reached via the
 * backend's `redirectQR` fallback.
 */
export default function QrNotFoundPage() {
  return <QrScanError variant="not-found" />;
}
