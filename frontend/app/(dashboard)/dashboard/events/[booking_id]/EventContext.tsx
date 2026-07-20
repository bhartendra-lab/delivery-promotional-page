"use client";

import { createContext, useContext } from "react";
import type { CustomFolder, MediaItem } from "@/lib/types";
import type { UploadEngineHook } from "./useUploadEngine";

/** Synthetic folder id for the "All Media" view (no server folder filter). */
export const ALL_MEDIA_ID = "__all__";

/** Synthetic folder id for the "Liked Media" view (server-side only_liked). */
export const LIKED_MEDIA_ID = "__liked__";

/**
 * Filters for the "Liked Media" folder — narrows to photos liked by a matching
 * audience. All constraints AND-combine (a like counts only if its guest matches
 * every active one). `audience: "all"` and empty arrays mean "no filter".
 */
export type LikedFilters = {
  audience: "all" | "host" | "guest";
  /** Guest teams (delivery-landing-page `guest_types` → guest `guest_sub_type`). */
  subTypes: string[];
  /** Specific guest ids (from get-all-guests). */
  guestIds: string[];
  /** Show only shortlisted (picked-for-delivery) media. */
  shortlistedOnly: boolean;
  /** Result ordering. "likes" = most-liked first (default); "recent" = newest first. */
  sort: "likes" | "recent";
};

export const EMPTY_LIKED_FILTERS: LikedFilters = {
  audience: "all",
  subTypes: [],
  guestIds: [],
  shortlistedOnly: false,
  sort: "likes",
};

/** True when any Smart Selects filter is active (drives the "Clear" affordance).
 *  Sort is a refinement, not a scope filter, so it's included so Clear resets it. */
export function hasActiveLikedFilters(f: LikedFilters): boolean {
  return (
    f.audience !== "all" ||
    f.subTypes.length > 0 ||
    f.guestIds.length > 0 ||
    f.shortlistedOnly ||
    f.sort !== "likes"
  );
}

export type EventMeta = {
  name: string;
  type: string;
  /** Epoch ms, or null when unset. */
  eventDate: number | null;
  backgroundImage?: string;
  /** Cover focal point as CSS object-position, e.g. "50% 35%". */
  backgroundPosition?: string;
  customMessage?: string;
  styleVariant?: string;
  includeBranding?: boolean;
  /** Public shared-link slug for the guest gallery (`/event/<unique_identifier>`). */
  uniqueIdentifier?: string;
  /** Family passcode that unlocks the full gallery in-lounge. */
  familyPasscode?: string;
  /** Guest teams / sub-types shown on the client "Which team are you in?" screen. */
  guestTypes?: string[];
  /** Reusable QR pointed at this event, if any (joined by `getBookingById`). */
  qrUniqueId?: string;
  qrImageUrl?: string;
};

/**
 * Shared state for one event workspace, owned by `EventWorkspace` and consumed
 * by the Media tab (and others). Centralises media/folder data + the upload
 * engine so the engine↔state wiring keeps working regardless of which tab is
 * mounted.
 */
export type EventContextValue = {
  bookingId: string;
  meta: EventMeta;
  /** Loaded media for the active view (All Media or a folder), accumulated by page. */
  media: MediaItem[];
  folders: CustomFolder[];
  setFolders: React.Dispatch<React.SetStateAction<CustomFolder[]>>;
  reload: () => Promise<MediaItem[]>;
  /** Currently selected folder id (or `ALL_MEDIA_ID`). */
  activeFolderId: string;
  /** Switch the active folder — triggers a fresh first-page load for that view. */
  setActiveFolder: (folderId: string) => void;
  /**
   * Display order for the plain Media view (All Media + named folders) —
   * driven by `createdAt`, since the upload engine's concurrent, non-sequential
   * uploads mean completion order doesn't reliably match local file order.
   * Independent of the Smart Selects (Liked) view's own `likedFilters.sort`.
   * Persists across folder switches; changing it resets the view to page 1.
   */
  mediaSort: "recent" | "oldest";
  setMediaSort: React.Dispatch<React.SetStateAction<"recent" | "oldest">>;
  /** Per-folder media counts (server-derived), keyed by folder id. */
  folderCounts: Record<string, number>;
  /** Count of liked media in the booking (drives the Smart Selects header). */
  likedCount: number;
  /** Count of shortlisted media in the booking (drives the "Shortlisted" chip). */
  shortlistedCount: number;
  /** Active filters for the Smart Selects (liked) view. */
  likedFilters: LikedFilters;
  /** Update the Smart Selects filters (re-fetches the liked view when it's active). */
  setLikedFilters: React.Dispatch<React.SetStateAction<LikedFilters>>;
  /** Flag/unflag media as shortlisted (optimistic; used by Smart Selects). */
  setShortlisted: (ids: string[], shortlisted: boolean) => Promise<void>;
  /** Total media in the booking (drives the header + All Media count). */
  totalCount: number;
  /** Total media in the active view (drives the folder's photo count + hasMore). */
  totalForView: number;
  /** True while more pages exist for the active view. */
  hasMore: boolean;
  /** True while a "load more" page request is in flight. */
  loadingMore: boolean;
  /** Append the next page of media for the active view. */
  loadMore: () => void;
  engine: UploadEngineHook;
  /** True once the active upload run is genuinely running (not paused). */
  activeLocked: boolean;
  /**
   * True while a pause/cancel/complete-triggered `recalculate-studio-storage`
   * call (+ usage refresh) is settling. The Media tab treats this like
   * "still uploading" so the upload card doesn't hand off to its resting
   * state with a stale storage number.
   */
  finalizingStorage: boolean;
  /** Pause the upload, then kick off the storage recalculation for it. */
  pauseUpload: () => void;
  /**
   * True once the gallery has been published at least once. While true the
   * event name is locked read-only to keep the shared
   * `/event/<unique_identifier>` URL stable. The cover photo stays editable.
   */
  publishedEver: boolean;
  /** Edit name + type + date from the edit sheet. */
  saveMeta: (next: { name: string; type: string; eventDate: number | null }) => Promise<void>;
  /** Mint a fresh family passcode; returns the new code. */
  regenerateFamilyPasscode: () => Promise<string>;
  /** Set the cover from an already-uploaded R2 url, optionally with a focal position. */
  setCoverFromUrl: (url: string, position?: string) => Promise<void>;
  /** Upload a new cover via the engine, then persist it (optionally with a focal position). */
  setCoverFromFile: (file: File, position?: string) => Promise<void>;
  /** Persist the cover focal point (CSS object-position string). */
  setCoverPosition: (position: string) => Promise<void>;
  coverBusy: boolean;
  /** Delete media by id (optimistic removal + reconcile + cover refresh). */
  deleteMediaIds: (ids: string[]) => Promise<void>;
  toast: (msg: string, type?: "success" | "error") => void;
};

const Ctx = createContext<EventContextValue | null>(null);

export const EventProvider = Ctx.Provider;

export function useEvent(): EventContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEvent must be used within EventProvider");
  return v;
}
