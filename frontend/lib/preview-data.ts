/**
 * Pure data shaping for the gallery preview: the full-access guest the preview
 * pretends to be, the studio's media in the guest gallery's shape, and the
 * unsaved Gallery Design draft laid over the real guest payload.
 */
import type { DeliveryLandingPageData, GuestMediaItem, GuestSession, MediaItem } from "./types";

/** The one guest the preview shows the gallery as: signed in, named, with the full gallery (a Host). No selfie, no team, nothing to answer. */
export function previewGuestSession(): GuestSession {
  return {
    name: "Preview",
    guest_type: "host",
    is_client: false,
    client_role: null,
    guest_sub_type: null,
    selfie_url: null,
    has_selfie: true,
    selfie_id: null,
    face_scan_skipped_at: null,
    mandatory_link_visited_at: Date.now(),
    mandatory_link_platform: null,
    language: "en",
  };
}

/** A studio media row as the guest gallery reads it. Likes are not the viewer's (nobody is signed in), so `liked_by_me` is false. */
export function toGuestMedia(item: MediaItem): GuestMediaItem {
  return {
    _id: item._id,
    media_id: item.media_id ?? item._id,
    url: item.url,
    type: item.type,
    custom_folder_ids: item.custom_folder_ids ?? [],
    createdAt: item.createdAt,
    likes_count: item.likes_count ?? 0,
    liked_by_me: false,
    ...(item.thumbnail_url ? { thumbnail_url: item.thumbnail_url } : {}),
    ...(item.width != null ? { width: item.width } : {}),
    ...(item.height != null ? { height: item.height } : {}),
    ...(item.captured_at !== undefined ? { captured_at: item.captured_at } : {}),
  };
}

/** The part of the Gallery Design tab the preview shows before it is saved. */
export type PreviewDraft = {
  style_variant?: string;
  /** The event briefing ("Dynamic Guest Text"). */
  custom_message?: string;
  /** The saved "Show your studio profile" switch. */
  include_company_branding?: boolean;
};

/** The real guest payload with the unsaved draft laid over it. Fields the draft does not carry are untouched. */
export function applyDraft(event: DeliveryLandingPageData, draft: PreviewDraft | null): DeliveryLandingPageData {
  if (!draft) return event;
  return {
    ...event,
    ...(draft.style_variant !== undefined ? { style_variant: draft.style_variant } : {}),
    ...(draft.custom_message !== undefined ? { custom_message: draft.custom_message } : {}),
    ...(draft.include_company_branding !== undefined ? { include_company_branding: draft.include_company_branding } : {}),
  };
}

/** What the iframe and its parent say to each other. Both sides check the origin, and the page they are talking to. */
export const PREVIEW_MESSAGE_SOURCE = "vyavasth-gallery-preview";

export type PreviewMessage =
  | { source: typeof PREVIEW_MESSAGE_SOURCE; type: "ready" }
  | { source: typeof PREVIEW_MESSAGE_SOURCE; type: "draft"; draft: PreviewDraft };

/** A message from the other side, or null when it is not ours (any other source, shape or origin). */
export function readPreviewMessage(event: { origin: string; data: unknown }, expectedOrigin: string): PreviewMessage | null {
  if (event.origin !== expectedOrigin) return null;
  const data = event.data as Partial<PreviewMessage> | null;
  if (!data || typeof data !== "object" || data.source !== PREVIEW_MESSAGE_SOURCE) return null;
  if (data.type === "ready") return { source: PREVIEW_MESSAGE_SOURCE, type: "ready" };
  if (data.type === "draft" && data.draft && typeof data.draft === "object") {
    const d = data.draft as PreviewDraft;
    return {
      source: PREVIEW_MESSAGE_SOURCE,
      type: "draft",
      draft: {
        ...(typeof d.style_variant === "string" ? { style_variant: d.style_variant } : {}),
        ...(typeof d.custom_message === "string" ? { custom_message: d.custom_message } : {}),
        ...(typeof d.include_company_branding === "boolean" ? { include_company_branding: d.include_company_branding } : {}),
      },
    };
  }
  return null;
}
