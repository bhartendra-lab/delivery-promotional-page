"use client";

import type { ClientPageProps } from "@/app/(client)/c/[delivery_landing_page_id]/ClientPage";
import { DeliveryPage } from "@/components/client/delivery/DeliveryPage";

export function AnniversaryTemplate(props: ClientPageProps) {
  return <DeliveryPage {...props} />;
}
