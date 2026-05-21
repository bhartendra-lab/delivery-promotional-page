export type VisitorData = {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  isp?: string;
  userAgent?: string;
  language?: string;
  timezone?: string;
  screenResolution?: string;
  touchSupport?: boolean;
  referrer?: string;
  landingPage?: string;
  utmSource?: string | null;
};

/**
 * Synchronous, never-fails snapshot of navigator/screen/referrer signals.
 * Safe to call on first render of a client component.
 */
export function captureClientSignals(): VisitorData {
  if (typeof window === "undefined") return {};
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    touchSupport: navigator.maxTouchPoints > 0,
    referrer: document.referrer || "direct",
    landingPage: window.location.pathname,
    utmSource: new URLSearchParams(window.location.search).get("utm_source"),
  };
}

/**
 * Async geo enrichment via ipapi.co. Times out after 3s and returns {} on
 * any failure — geo is best-effort and must not block tracking.
 */
export async function captureGeoData(): Promise<Partial<VisitorData>> {
  if (typeof window === "undefined") return {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: controller.signal,
    });
    if (!res.ok) return {};
    const geo = (await res.json()) as Record<string, unknown>;
    return {
      ip: typeof geo.ip === "string" ? geo.ip : undefined,
      city: typeof geo.city === "string" ? geo.city : undefined,
      region: typeof geo.region === "string" ? geo.region : undefined,
      country: typeof geo.country_name === "string" ? geo.country_name : undefined,
      isp: typeof geo.org === "string" ? geo.org : undefined,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

export async function captureVisitorData(): Promise<VisitorData> {
  return { ...captureClientSignals(), ...(await captureGeoData()) };
}
