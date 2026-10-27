"use client";

import type { CustomFolder } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { UnlockAwareSwitcher, FolderPillsRow, ActionsCluster, SelectAllToggle, type GalleryTab } from "./GalleryControls";
import { Collapse, FOLD_MS } from "./Collapse";

/**
 * Desktop sticky control row. Pins at `top-0` — the top bar is a flex sibling
 * ABOVE the scroll container, not inside it, so this row's sticky offset is
 * measured from the container's own top edge (a `top-16` here would leave a
 * 64px dead gap).
 *
 * The first line: the My/All switcher on the left, the Liked/Download/Select/
 * Unlock cluster on the right. Under it, the folder pills and the face filter
 * bar. Every control stays visible in every view, including Liked; while it's
 * active the switcher renders de-emphasized (Liked ignores My/All).
 *
 * `folded` (the guest is scrolling down the grid): the pills and the face bar
 * slide up behind the first line and come back on the first scroll up. They
 * slide rather than shrink: the row keeps its height in the page, so the
 * photos never move under the pointer and the browser never re-anchors the
 * scroll. The parent folds it only once the row's own place in the page has
 * scrolled away, so the space they leave shows the photos under it.
 *
 * Select mode is lean, as on the phone: "◯ All (N)" on the left and nothing
 * else. The count and the way out are in the action bar at the bottom (and
 * Escape), and the pills and face bar fold away, since changing either would
 * end the selection anyway.
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
  selectionHint,
  scopeTotal,
  canDownloadAll,
  zipping,
  onDownloadAll,
  downloadCount,
  rowRef,
  allCount,
  showMine = true,
  showGroup = false,
  showFolders = true,
  pendingCount = 0,
  faceBar = null,
  folded = false,
}: {
  t: ClientTheme;
  unlocked: boolean;
  tab: GalleryTab;
  setTab: (k: GalleryTab) => void;
  /** False with face search off — see `UnlockAwareSwitcher`. */
  showMine?: boolean;
  /** True whenever Find my people is live for this guest — adds the third
   *  segment, My People. */
  showGroup?: boolean;
  /** People waiting on this guest — the red count on that segment. The laptop
   *  keeps it on the tab (it has no menu button to move it to), and on the
   *  Manage my people pill. */
  pendingCount?: number;
  /**
   * False on My People, whose feed is ranked by likes and by who is in each
   * photo rather than filed by folder. The pills would filter a view they do
   * not describe. Default true, so every other tab is untouched.
   */
  showFolders?: boolean;
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
  /** The face filter bar, under the pills. Absent while it has nothing to show. */
  faceBar?: React.ReactNode;
  /** The guest is scrolling down the grid: only the first line shows. */
  folded?: boolean;
}) {
  const hasLower = showFolders || !!faceBar;
  /** The first line carries the row's bottom border whenever it is all that
   *  shows. */
  const lineAlone = !hasLower || selectMode || folded;
  return (
    // The row itself takes no clicks: while folded, the space under its first
    // line shows photos, and a click there is theirs.
    <div ref={rowRef} className="pointer-events-none sticky top-0 z-40">
      <div
        className="pointer-events-auto relative z-[2] flex items-center justify-between gap-3 px-8 py-3"
        style={{ background: t.bg, borderBottom: `1px solid ${lineAlone ? t.border : "transparent"}` }}
      >
        {selectMode ? (
          <SelectAllToggle
            t={t}
            selectAll={selectAll}
            scopeTotal={scopeTotal}
            onSelectAll={onSelectAll}
            onClearSelectAll={onClearSelectAll}
            hint={selectionHint}
          />
        ) : (
          <UnlockAwareSwitcher
            t={t}
            tab={tab}
            setTab={setTab}
            dimmed={likedView}
            showMine={showMine}
            showGroup={showGroup}
            pendingCount={pendingCount}
          />
        )}

        {!selectMode && (
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
        )}
      </div>

      {hasLower && (
        <Collapse open={!selectMode}>
          <div
            className="relative z-[1] flex flex-col gap-2.5 px-8 pb-3 transition-[transform,opacity] ease-out motion-reduce:transition-none"
            style={{
              background: t.bg,
              borderBottom: `1px solid ${t.border}`,
              transform: folded ? "translateY(-100%)" : "none",
              opacity: folded ? 0 : 1,
              transitionDuration: `${FOLD_MS}ms`,
              pointerEvents: folded ? "none" : "auto",
            }}
            inert={folded}
            aria-hidden={folded || undefined}
          >
            {showFolders && (
              <FolderPillsRow
                t={t}
                folders={folders}
                folderCounts={folderCounts}
                folder={folder}
                setFolder={setFolder}
                likedView={likedView}
                allCount={allCount}
              />
            )}
            {faceBar}
          </div>
        </Collapse>
      )}
    </div>
  );
}
