"use client";

import type { CustomFolder } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { UnlockAwareSwitcher, FolderPillsRow, ActionsCluster } from "./GalleryControls";

/**
 * Desktop sticky control row. Pins at `top-0` — the top bar is a flex sibling
 * ABOVE the scroll container, not inside it, so this row's sticky offset is
 * measured from the container's own top edge (a `top-16` here would leave a
 * 64px dead gap).
 *
 * Two lines: My/All switcher (left) + Liked/Download/Select/Private action
 * cluster (right) on the first line, folder pills on the second — folder pills
 * no longer share a line with the switcher/actions. Every control stays
 * visible in every view, including Liked; while it's active the switcher
 * renders de-emphasized (Liked ignores My/All).
 */
export function StickyControlRow({
  t,
  unlocked,
  tab,
  setTab,
  onOpenPrivate,
  folders,
  folderCounts,
  folder,
  setFolder,
  likedView,
  onSelectLiked,
  selectMode,
  onToggleSelectMode,
  canDownloadAll,
  zipping,
  onDownloadAll,
  rowRef,
  allCount,
}: {
  t: ClientTheme;
  unlocked: boolean;
  tab: "mine" | "all";
  setTab: (k: "mine" | "all") => void;
  /** Opens the family-passcode sheet (the "Private" action). */
  onOpenPrivate: () => void;
  folders: CustomFolder[];
  folderCounts: Record<string, number>;
  folder: string;
  setFolder: (f: string) => void;
  likedView: boolean;
  onSelectLiked: () => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  canDownloadAll: boolean;
  zipping: boolean;
  onDownloadAll: () => void;
  /** Lets the parent measure the pinned height for the grid's scroll-margin. */
  rowRef?: React.Ref<HTMLDivElement>;
  /** Count for the "All" pill — same source as mobile's, just previously never
   *  threaded through on desktop. */
  allCount?: number;
}) {
  return (
    <div
      ref={rowRef}
      className="sticky top-0 z-40 flex flex-col gap-2.5 px-8 py-3"
      style={{ background: t.bg, borderBottom: `1px solid ${t.border}` }}
    >
      <div className="flex items-center justify-between gap-3">
        <UnlockAwareSwitcher t={t} tab={tab} setTab={setTab} dimmed={likedView} />

        <ActionsCluster
          t={t}
          likedView={likedView}
          onSelectLiked={onSelectLiked}
          selectMode={selectMode}
          onToggleSelectMode={onToggleSelectMode}
          canDownloadAll={canDownloadAll}
          zipping={zipping}
          onDownloadAll={onDownloadAll}
          unlocked={unlocked}
          onOpenPrivate={onOpenPrivate}
        />
      </div>

      <FolderPillsRow
        t={t}
        folders={folders}
        folderCounts={folderCounts}
        folder={folder}
        setFolder={setFolder}
        likedView={likedView}
        allCount={allCount}
      />
    </div>
  );
}
