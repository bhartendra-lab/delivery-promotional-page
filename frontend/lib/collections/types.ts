/**
 * Collections (album selections) as the guest gallery reads them. Mirrors the
 * backend's collections.controller.js responses; keep the two in step.
 *
 * Everything here is reached only when the session carries the `collections`
 * block (the server's COLLECTIONS_ENABLED switch) AND the guest is a curator
 * (`guest.can_edit_collections`). A plain Guest never loads this module's
 * data, so nothing here can change what they see.
 */
import type { CustomFolder, GuestMediaItem } from "../types";

/** Top level of `get-guest-session`, present only while the switch is on. */
export type CollectionsBlock = { enabled: true; max_editors: number };

export type CollectionStatus = "draft" | "final";

export type GuestCollection = {
  _id: string;
  name: string;
  system_key: "bride" | "groom" | null;
  order: number;
  status: CollectionStatus;
  /** The studio's soft album size ("a 40-sheet album = 250 photos"). */
  target_count: number | null;
  count: number;
  /** Up to four recent grid thumbnails, newest first. */
  cover_urls: string[];
  created_by: { kind: "guest" | "member" | "system"; name: string | null };
  /** Epoch ms of the last send, while the collection is sent. */
  finalized_at: number | null;
  finalized_by?: { name: string | null } | null;
  reopened_at: number | null;
  createdAt?: string | number | null;
};

export type CollectionList = {
  collections: GuestCollection[];
  can_manage: boolean;
  can_send: boolean;
  max_collections: number;
  /** The Clients' first names, Bride first. Absent on an older backend. */
  client_names?: string[];
};

/** One photo's place in one collection, as `membership` and the feed return it. */
export type MembershipRef = {
  collection_id: string;
  added_by_name: string | null;
  added_by_me: boolean;
  added_at: number | null;
};

/** Media `_id` → the live collections that photo is in, newest add first. */
export type Membership = ReadonlyMap<string, MembershipRef[]>;

/** A curator feed item: getMedia's item shape plus collection data. */
export type CuratorItem = GuestMediaItem & {
  /** The stored original file name (Smart Selects' Copy filenames and CSV). */
  filename?: string | null;
  collection_refs?: MembershipRef[];
  /** The folder this photo is grouped under in a collection's own view. */
  primary_folder_id?: string | null;
};

export type CuratorView = "liked" | "collection";
export type CuratorSort = "likes" | "captured" | "folder";

export type CuratorFeedQuery = {
  view: CuratorView;
  /** The collection to show (`view: "collection"`), or to narrow Liked to. */
  collectionId?: string | null;
  /** Liked only: "none" is the To sort lens, "any" is anything sorted. */
  inCollection?: "none" | "any" | null;
  likedBy?: string[];
  folderId?: string | null;
  sort?: CuratorSort | null;
  skip?: number;
  limit?: number;
};

export type CuratorFeedPage = {
  media: CuratorItem[];
  /** First page only. */
  total?: number;
  folders?: Pick<CustomFolder, "_id" | "name" | "order">[];
  folderCounts?: Record<string, number>;
  unsorted_count?: number;
};

export type Liker = {
  _id: string;
  name: string;
  guest_sub_type: string | null;
  profile_face_url?: string | null;
  likes_count: number;
};

export type FolderBreakdown = { folder_id: string | null; name: string | null; count: number };

export type ReviewCollection = GuestCollection & {
  folders: FolderBreakdown[];
  /** Up to six recent thumbnails. */
  sample_urls: string[];
};

export type WriteResult = { added: number; removed: number; unchanged: number; count: number };

export type GuestControlLevel = "client" | "editor" | "host" | "guest";

export type GuestControlRow = {
  _id: string;
  name: string;
  guest_sub_type: string | null;
  profile_face_url?: string | null;
  level: GuestControlLevel;
  client_role: string | null;
  editor_source: "client" | "studio" | null;
  joined_at?: number | string | null;
};

export type EditorCount = { used: number; max: number };

export type GuestControl = {
  passcode: string | null;
  unique_identifier: string | null;
  /** Only a domain that is live; null otherwise. */
  custom_domain: string | null;
  studio_name: string | null;
  guests: GuestControlRow[];
  editors: EditorCount;
};

/** One photo Locate Originals should find, with every place it goes: one
 *  per collection it is in, plus the shortlist's (GET /collections/:id/locate). */
export type LocateItem = {
  _id: string;
  media_id: string;
  url: string;
  filename: string | null;
  custom_folder_ids: string[];
  /** Output folder names, in the collections' order ("Priya's Side", "Shortlisted"). */
  placements: string[];
};

export type LocateResponse = {
  media: LocateItem[];
  customFolders: { _id: string; name: string }[];
};
