/**
 * What the guest screens get back while the gallery preview is on (see
 * lib/preview-mode.ts). Called by `guestFetch` instead of the network.
 *
 * Two things are real, because the preview is only useful with them:
 *  - the session: a signed-in Host with the full gallery (previewGuestSession);
 *  - the photos and folders: the studio's own, read with the studio's own
 *    credentials through the dashboard endpoint, so the preview shows the
 *    gallery as a guest with full access would see it.
 * Everything else is answered locally and writes nothing: a like, an unlike, a
 * visit, a consent, an intake answer, a selfie search, a download, a report,
 * a notification. Nothing reaches the guest API, so nothing is recorded: no
 * views, likes, downloads, review prompts, social visits or analytics.
 */
import { previewContext } from "./preview-mode.ts";
import { previewGuestSession, toGuestMedia } from "./preview-data.ts";
import type { GetMediaResponse, GuestMediaResponse } from "./types";

/** The studio's own media read (`getMedia` in lib/api.ts), handed in so this module imports nothing that touches the network on its own. */
export type PreviewMediaReader = (
  bookingId: string,
  opts: { customFolderId?: string; sort?: "captured"; skip?: number; limit?: number },
) => Promise<GetMediaResponse>;

/** The paths that read (and so need real data). Anything else is a local no-op. */
const SESSION_PATH = /^\/deliverables\/get-guest-session(\?|$)/;
const MEDIA_PATH = /^\/deliverables\/get-media\/([^/?]+)(\?.*)?$/;

/** What a write is answered with: success, and nothing stored. */
const ACK = { message: "Preview: nothing was recorded" };

/**
 * Answers one guest API call for the preview. Always resolves to a value (never
 * the network), so no caller can leak a request out of the preview.
 */
export async function previewGuestFetch<T>(path: string, init: RequestInit, readMedia: PreviewMediaReader): Promise<T> {
  const ctx = previewContext();
  if (SESSION_PATH.test(path)) {
    return { guest: previewGuestSession() } as T;
  }
  const media = MEDIA_PATH.exec(path);
  if (media && ctx) {
    const query = new URLSearchParams(media[2] ?? "");
    // "My Photos" is a face match and "Liked" is this guest's own likes: the
    // preview guest has neither, so both are honestly empty.
    if (query.get("mine") === "true" || query.get("only_liked") === "true") {
      return { media: [], total: 0 } as T;
    }
    const skip = Number(query.get("skip") ?? 0) || 0;
    const limit = Number(query.get("limit") ?? 0) || undefined;
    const res = await readMedia(ctx.bookingId, {
      customFolderId: query.get("custom_folder_id") ?? undefined,
      sort: "captured",
      skip,
      ...(limit ? { limit } : {}),
    });
    const body: GuestMediaResponse = {
      media: (res.media ?? []).map(toGuestMedia),
      ...(res.customFolders ? { customFolders: res.customFolders } : {}),
      ...(res.folderCounts ? { folderCounts: res.folderCounts } : {}),
      ...(typeof res.total === "number" ? { total: res.total } : {}),
      ...(typeof res.totalCount === "number" ? { totalCount: res.totalCount } : {}),
      // Downloads are a write to the studio's own numbers: the preview offers none to try.
      archive_access: false,
    };
    return body as T;
  }
  void init;
  return ACK as T;
}
