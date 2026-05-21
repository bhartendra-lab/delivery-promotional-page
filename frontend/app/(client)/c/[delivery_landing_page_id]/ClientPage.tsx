"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/api";
import {
  captureClientSignals,
  captureGeoData,
  type VisitorData,
} from "@/lib/visitor";
import { getEventTemplate } from "@/lib/event-templates";
import { resolveStudioTheme, themeToCssVars } from "@/lib/studio-theme";
import type { KvData } from "@/lib/types";
import { WeddingTemplate } from "@/components/client/templates/WeddingTemplate";
import { BirthdayTemplate } from "@/components/client/templates/BirthdayTemplate";
import { AnniversaryTemplate } from "@/components/client/templates/AnniversaryTemplate";
import { PreWeddingTemplate } from "@/components/client/templates/PreWeddingTemplate";
import { EngagementTemplate } from "@/components/client/templates/EngagementTemplate";

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

  const Template = pickTemplate(data.event_type);

  return (
    <div
      style={{
        ...themeToCssVars(theme),
        ["--color-accent" as string]: template.accentColor,
      }}
      className={template.pageBackground}
    >
      <Template {...shared} />
    </div>
  );
}

function pickTemplate(eventType: string) {
  switch (eventType) {
    case "Wedding":
      return WeddingTemplate;
    case "Birthday":
      return BirthdayTemplate;
    case "Anniversary":
      return AnniversaryTemplate;
    case "Pre-wedding":
      return PreWeddingTemplate;
    case "Engagement":
      return EngagementTemplate;
    default:
      return WeddingTemplate;
  }
}
