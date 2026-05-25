import { getToken, clearToken } from "./auth";
import type {
  Company,
  DeliveryLandingPage,
  DeliveryUrl,
  DlpUsage,
  EventType,
  GetByIdResponse,
  ListResponse,
  LoginResponse,
  TrackingType,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  const text = await res.text();
  const body = text ? safeParse(text) : null;

  if (!res.ok) {
    if (res.status === 401 && auth) clearToken();
    const message =
      (body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : null) || `Request failed: ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export { ApiError };

export function getCompanyDetails() {
  return request<{ company: Company }>("/onboarding/get-company-details");
}

export type CompanyUpdateInput = {
  name?: string;
  address?: string;
  contact_number?: string;
  website?: string;
  gmb_link?: string;
  instagram_link?: string;
  facebook_link?: string;
  google_place_id?: string;
  logo?: File | null;
};

export function updateCompanyDetails(input: CompanyUpdateInput) {
  const fd = new FormData();
  if (input.name !== undefined) fd.append("name", input.name);
  if (input.address !== undefined) fd.append("address", input.address);
  if (input.contact_number !== undefined) fd.append("contact_number", input.contact_number);
  if (input.website !== undefined) fd.append("website", input.website);
  if (input.gmb_link !== undefined) fd.append("gmb_link", input.gmb_link);
  if (input.instagram_link !== undefined) fd.append("instagram_link", input.instagram_link);
  if (input.facebook_link !== undefined) fd.append("facebook_link", input.facebook_link);
  if (input.google_place_id !== undefined) fd.append("google_place_id", input.google_place_id);
  if (input.logo) fd.append("logo", input.logo);
  return request<{ company: Company }>("/onboarding/update-company-details", {
    method: "PUT",
    body: fd,
  });
}

export function checkResetLink(userId: string) {
  return request<{ valid: true }>(`/auth/check-reset-link/${encodeURIComponent(userId)}`, {
    auth: false,
  });
}

export function resetPassword(userId: string, newPassword: string) {
  return request<LoginResponse>("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, new_password: newPassword }),
    auth: false,
  });
}

export function login(email: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    auth: false,
  });
}

export type DeliveryFormInput = {
  client_name?: string;
  event_type?: EventType;
  event_date?: number;
  custom_message?: string;
  delivery_urls?: DeliveryUrl[];
  background_image?: File | null;
};

function buildFormData(input: DeliveryFormInput): FormData {
  const fd = new FormData();
  if (input.client_name !== undefined) fd.append("client_name", input.client_name);
  if (input.event_type !== undefined) fd.append("event_type", input.event_type);
  if (input.event_date !== undefined)
    fd.append("event_date", String(input.event_date));
  if (input.custom_message !== undefined)
    fd.append("custom_message", input.custom_message);
  if (input.delivery_urls !== undefined)
    fd.append("delivery_urls", JSON.stringify(input.delivery_urls));
  if (input.background_image) fd.append("background_image", input.background_image);
  return fd;
}

export function createDeliveryPage(input: DeliveryFormInput) {
  return request<{ deliveryLandingPage: DeliveryLandingPage }>(
    "/deliverables/create-delivery-landing-page",
    {
      method: "POST",
      body: buildFormData(input),
    },
  );
}

export function updateDeliveryPage(id: string, input: DeliveryFormInput) {
  return request<{ deliveryLandingPage: DeliveryLandingPage }>(
    `/deliverables/update-delivery-landing-page/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: buildFormData(input),
    },
  );
}

export function listDeliveryPages(params: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.search) sp.set("search", params.search);
  const qs = sp.toString();
  return request<ListResponse>(
    `/deliverables/get-all-delivery-landing-pages${qs ? `?${qs}` : ""}`,
  );
}

export function getDeliveryPageById(id: string) {
  return request<GetByIdResponse>(
    `/deliverables/get-delivery-landing-page-by-id/${encodeURIComponent(id)}`,
  );
}

export function getDlpUsage() {
  return request<DlpUsage>("/deliverables/get-dlp-usage");
}

/**
 * Tracking endpoint. Per BACKEND_NOTES, this endpoint is currently auth-protected
 * (backend bug) — we still call it without an Authorization header because the
 * client view is unauthenticated. Failures are logged but never thrown so they
 * cannot break the user flow.
 */
export async function trackEvent(
  id: string,
  trackingType: TrackingType,
  trackingData?: Record<string, unknown>,
): Promise<void> {
  const payload = {
    tracking_type: trackingType,
    // Always send an object so JSON.stringify never drops the field.
    tracking_data: trackingData ?? {},
  };
  try {
    const res = await fetch(
      `${API_BASE}/deliverables/create-delivery-landing-page-tracking/${encodeURIComponent(id)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        // ignore
      }
      console.warn(
        `[trackEvent] ${trackingType} → ${res.status} ${res.statusText}`,
        detail,
      );
    }
  } catch (err) {
    console.warn(`[trackEvent] ${trackingType} failed`, err);
  }
}
