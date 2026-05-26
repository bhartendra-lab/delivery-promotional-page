"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/api";
import {
  captureClientSignals,
  captureGeoData,
  type VisitorData,
} from "@/lib/visitor";
import { getEventTemplate } from "@/lib/event-templates";
import { resolveStudioTheme } from "@/lib/studio-theme";
import type { KvData } from "@/lib/types";
import { WeddingTemplate } from "@/components/client/templates/WeddingTemplate";
import { BirthdayTemplate } from "@/components/client/templates/BirthdayTemplate";
import { AnniversaryTemplate } from "@/components/client/templates/AnniversaryTemplate";
import { PreWeddingTemplate } from "@/components/client/templates/PreWeddingTemplate";
import { EngagementTemplate } from "@/components/client/templates/EngagementTemplate";
import { CorporateTemplate } from "@/components/client/templates/CorporateTemplate";

export type ClientPageProps = {
  id: string;
  data: KvData;
  template: ReturnType<typeof getEventTemplate>;
  theme: ReturnType<typeof resolveStudioTheme>;
  onDeliveryClick: (provider: string) => void;
  onReviewClick: () => void;
};

type Props = {
  id: string;
  data: KvData;
};

export function ClientPage({ id, data }: Props) {
  const template = getEventTemplate(data.event_type);
  const theme = resolveStudioTheme(data);
  const visitorRef = useRef<VisitorData>({});

  useEffect(() => {
    const clientData = captureClientSignals();
    visitorRef.current = clientData;
    void trackEvent(id, "visit", clientData);

    let cancelled = false;
    (async () => {
      const geo = await captureGeoData();
      if (cancelled) return;
      visitorRef.current = { ...clientData, ...geo };
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onDeliveryClick = (provider: string) => {
    void trackEvent(id, "delivery", {
      provider,
      ...visitorRef.current,
    });
  };
  const onReviewClick = () => {
    void trackEvent(id, "review", visitorRef.current);
  };

  const shared: ClientPageProps = {
    id,
    data,
    template,
    theme,
    onDeliveryClick,
    onReviewClick,
  };

  switch (data.event_type) {
    case "Birthday":
      return <BirthdayTemplate {...shared} />;
    case "Anniversary":
      return <AnniversaryTemplate {...shared} />;
    case "Pre-wedding":
      return <PreWeddingTemplate {...shared} />;
    case "Engagement":
      return <EngagementTemplate {...shared} />;
    case "Corporate":
      return <CorporateTemplate {...shared} />;
    case "Wedding":
    default:
      return <WeddingTemplate {...shared} />;
  }
}
