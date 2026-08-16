"use client";

import { IconReceipt } from "@/components/ui/icons";
import { BillingDetailsForm } from "@/components/billing/BillingDetailsForm";
import { useSettings } from "../SettingsContext";
import { Card } from "../SettingsUI";

/**
 * Thin wrapper over the shared BillingDetailsForm — this page's own
 * behavior is unchanged from before the form was extracted for reuse by the
 * upgrade modal's in-flow billing step.
 */
export function BillingDetailsCard() {
  const { company } = useSettings();

  return (
    <Card title="Billing details" icon={<IconReceipt size={15} />}>
      <BillingDetailsForm
        studioAddress={company.address}
        studioName={company.name}
        gmbSkipped={company.gmb_skipped}
        onSaved={() => {}}
        layout="row"
      />
    </Card>
  );
}
