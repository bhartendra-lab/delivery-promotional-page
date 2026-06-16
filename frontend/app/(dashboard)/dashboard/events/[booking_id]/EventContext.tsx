"use client";

import { createContext, useContext } from "react";
import type { CustomFolder, MediaItem } from "@/lib/types";
import type { UploadEngineHook } from "./useUploadEngine";

export type EventMeta = {
  name: string;
  type: string;
  /** Epoch ms, or null when unset. */
  eventDate: number | null;
  backgroundImage?: string;
  customMessage?: string;
  styleVariant?: string;
  includeBranding?: boolean;
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
  media: MediaItem[];
  folders: CustomFolder[];
  setFolders: React.Dispatch<React.SetStateAction<CustomFolder[]>>;
  reload: () => Promise<MediaItem[]>;
  engine: UploadEngineHook;
  /** True once the active upload run is genuinely running (not paused). */
  activeLocked: boolean;
  /** Edit name + type + date from the edit sheet. */
  saveMeta: (next: { name: string; type: string; eventDate: number | null }) => Promise<void>;
  /** Set the cover from an already-uploaded R2 url. */
  setCoverFromUrl: (url: string) => Promise<void>;
  /** Upload a new cover via the engine, then persist it. */
  setCoverFromFile: (file: File) => Promise<void>;
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
