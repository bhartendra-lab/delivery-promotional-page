"use client";

import { createContext, useContext } from "react";
import type { CustomFolder, MediaItem } from "@/lib/types";
import type { UploadEngineHook } from "./useUploadEngine";

/** Synthetic folder id for the "All Media" view (no server folder filter). */
export const ALL_MEDIA_ID = "__all__";

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
  /** Per-folder media counts (server-derived), keyed by folder id. */
  folderCounts: Record<string, number>;
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
   * True once the gallery has been published at least once. While true the
   * event name and cover photo are locked read-only to keep the shared
   * `/event/<unique_identifier>` URL (and the guest-facing cover) stable.
   */
  publishedEver: boolean;
  /** Edit name + type + date from the edit sheet. */
  saveMeta: (next: { name: string; type: string; eventDate: number | null }) => Promise<void>;
  /** Mint a fresh family passcode; returns the new code. */
  regenerateFamilyPasscode: () => Promise<string>;
  /** Set the cover from an already-uploaded R2 url. */
  setCoverFromUrl: (url: string) => Promise<void>;
  /** Upload a new cover via the engine, then persist it. */
  setCoverFromFile: (file: File) => Promise<void>;
  /** Persist the cover focal point (CSS object-position string). */
  setCoverPosition: (position: string) => Promise<void>;
  coverBusy: boolean;
  /** Delete media by id (optimistic removal + reconcile + cover refresh). */
  deleteMediaIds: (ids: string[]) => Promise<void>;
  toast: (msg: string) => void;
};

const Ctx = createContext<EventContextValue | null>(null);

export const EventProvider = Ctx.Provider;

export function useEvent(): EventContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEvent must be used within EventProvider");
  return v;
}
