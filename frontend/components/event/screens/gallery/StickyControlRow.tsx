"use client";

import type { CustomFolder } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { UnlockAwareSwitcher, FolderPillsRow, ActionsCluster, SelectionSummary } from "./GalleryControls";

/**
 * Desktop sticky control row. Pins at `top-0` — the top bar is a flex sibling
 * ABOVE the scroll container, not inside it, so this row's sticky offset is
 * measured from the container's own top edge (a `top-16` here would leave a
 * 64px dead gap).
 *
 * Two lines: My/All switcher — or, in select mode, the selection count with
 * Select all under it — on the left, Liked/Download/Select/Unlock action
 * cluster on the right, folder pills on the second line. Folder pills
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
  canSelect = true,
  onToggleSelectMode,
  selectAll,
  onSelectAll,
  onClearSelectAll,
  selectionLabel,
  selectionHint,
  scopeTotal,
  canDownloadAll,
  zipping,
  onDownloadAll,
  downloadCount,
  rowRef,
  allCount,
}: {
  t: ClientTheme;
  unlocked: boolean;
  tab: "mine" | "all";
  setTab: (k: "mine" | "all") => void;
  /** Opens the gallery-passcode sheet (the "Unlock" action). */
  onOpenPrivate: () => void;
  folders: CustomFolder[];
  folderCounts: Record<string, number>;
  folder: string;
  setFolder: (f: string) => void;
  likedView: boolean;
  onSelectLiked: () => void;
  selectMode: boolean;
  /** False hides Select — see `ActionsCluster`. */
  canSelect?: boolean;
  onToggleSelectMode: () => void;
  selectAll: boolean;
  onSelectAll: () => void;
  onClearSelectAll: () => void;
  /** "All 4,812 selected" / "3 selected" — replaces the switcher in select mode. */
  selectionLabel: string;
  /** Quiet line under Select all; only set for large selections. */
  selectionHint?: string;
  /** Photos in the active view — shown on the Select all button. */
  scopeTotal: number;
  canDownloadAll: boolean;
  zipping: boolean;
  onDownloadAll: () => void;
  /** Photos the header Download would fetch, shown on its label. */
  downloadCount?: number;
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
        {/* The switcher steps aside in select mode: changing tab clears the
            selection anyway, so offering it mid-selection only invites losing
            one, and the count needs somewhere prominent to live. */}
        {selectMode ? (
          <SelectionSummary
            t={t}
            label={selectionLabel}
            selectAll={selectAll}
            scopeTotal={scopeTotal}
            onSelectAll={onSelectAll}
            onClearSelectAll={onClearSelectAll}
            hint={selectionHint}
          />
        ) : (
          <UnlockAwareSwitcher t={t} tab={tab} setTab={setTab} dimmed={likedView} />
        )}

        <ActionsCluster
          t={t}
          likedView={likedView}
          onSelectLiked={onSelectLiked}
          selectMode={selectMode}
          canSelect={canSelect}
          onToggleSelectMode={onToggleSelectMode}
          canDownloadAll={canDownloadAll}
          zipping={zipping}
          onDownloadAll={onDownloadAll}
          downloadCount={downloadCount}
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
