"use client";

import type { CustomFolder } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { IconHeart, IconLock, IconDownload, IconSquare, IconCheckSquare } from "@/components/ui/icons";

/** Sentinel folder id meaning "no specific folder" — shared by every screen
 *  that reads/sets the active folder pill. */
export const ALL = "__all__";

/**
 * My Photos / All Photos switcher. Both segments are always plain, tappable
 * tabs — unlocking the family passcode is no longer gated here (see the
 * "Private" action in `ActionsCluster`). A non-host guest tapping "All Photos"
 * still gets a real view: the backend scopes a locked guest's "all" request to
 * Highlights (folders marked public), so there's always something to show
 * instead of a dead end behind a lock. Shared by the mobile compact header and
 * the desktop sticky control row.
 */
export function UnlockAwareSwitcher({
  t,
  tab,
  setTab,
  dimmed = false,
}: {
  t: ClientTheme;
  tab: "mine" | "all";
  setTab: (k: "mine" | "all") => void;
  /** Renders the switcher de-emphasized but fully visible — used on desktop
   *  while the Liked pill owns the active filter (Liked ignores My/All). */
  dimmed?: boolean;
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-full p-0.5 transition-opacity"
      style={{ background: t.sunken, opacity: dimmed ? 0.75 : 1 }}
    >
      <SwitchSeg t={t} on={tab === "mine"} dimmed={dimmed} onClick={() => setTab("mine")}>
        My Photos
      </SwitchSeg>
      <SwitchSeg t={t} on={tab === "all"} dimmed={dimmed} onClick={() => setTab("all")}>
        All Photos
      </SwitchSeg>
    </div>
  );
}

function SwitchSeg({
  t,
  on,
  dimmed = false,
  onClick,
  children,
}: {
  t: ClientTheme;
  on: boolean;
  dimmed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // While dimmed nothing is filled — the active segment is only hinted by
  // weight/colour, so the Liked pill clearly reads as the live filter. The
  // undimmed path stays byte-identical to the original (mobile renders it).
  const filled = on && !dimmed;
  // const color = filled ? t.brand : dimmed ? (on ? t.muted : t.faint) : t.muted;
  const color = t.brand;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-4 py-1.5 text-[14px] transition-colors"
      style={{
        background: filled ? t.card : "transparent",
        color,
        // fontWeight: on ? 600 : 500,
        fontWeight: 700,
        boxShadow: filled ? t.shadowSm : "none",
      }}
    >
      {children}
    </button>
  );
}

/** Scrollable folder-pill row ("All" + every custom folder). Squarish
 *  (Google-Photos style) rather than fully-rounded — Liked now lives in
 *  `ActionsCluster` instead of trailing this row as a peer pill. Shared by the
 *  mobile compact header and the desktop sticky control row. */
export function FolderPillsRow({
  t,
  folders,
  folderCounts,
  folder,
  setFolder,
  className = "",
  likedView = false,
  allCount,
}: {
  t: ClientTheme;
  folders: CustomFolder[];
  folderCounts: Record<string, number>;
  folder: string;
  setFolder: (f: string) => void;
  className?: string;
  /** True while Liked owns the active filter — no folder pill highlights (Liked
   *  and a folder pill are never sent together). */
  likedView?: boolean;
  /** Count for the "All" pill. `folderCounts` only covers custom folders, so
   *  this comes from the active view's own total. Shown on both mobile and
   *  desktop. */
  allCount?: number;
}) {
  // Nothing to choose between with zero custom folders — a lone "All" pill
  // adds no value once Liked/Select/Private live in their own cluster.
  if (folders.length === 0) return null;
  return (
    <div className={`flex gap-2 overflow-x-auto ${className}`} style={{ scrollbarWidth: "none" }}>
      {[{ _id: ALL, name: "All" } as Pick<CustomFolder, "_id" | "name">, ...folders].map((f) => {
        const active = !likedView && folder === f._id;
        return (
          <button
            key={f._id}
            type="button"
            onClick={() => setFolder(f._id)}
            className="shrink-0 cursor-pointer rounded-md px-3.5 py-1.5 text-[14px] transition-colors"
            style={{
              background: active ? t.accentWash : "transparent",
              // color: active ? t.brand : t.muted,
              color: t.brand,
              border: `1px solid ${active ? "transparent" : t.border}`,
              // fontWeight: active ? 600 : 500,
              fontWeight: 700,
            }}
          >
            {f.name}
            {f._id === ALL
              ? allCount != null && <span className="ml-1 opacity-70">{allCount.toLocaleString("en-IN")}</span>
              : folderCounts[f._id] != null && <span className="ml-1 opacity-70">{folderCounts[f._id]}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Right-side action cluster: Liked, Download, Select, Private — icon + title,
 * no pill backgrounds. Liked and Select show their active state as an
 * underline (they're the two real view toggles); Download is a one-shot
 * action; Private opens the family-passcode sheet and disappears once the
 * guest has unlocked the full gallery (nothing left to unlock). On mobile
 * (`iconOnly`) the titles drop and only the icons show. Shared by the mobile
 * compact header and the desktop sticky control row.
 */
export function ActionsCluster({
  t,
  likedView,
  onSelectLiked,
  selectMode,
  onToggleSelectMode,
  canDownloadAll,
  zipping,
  onDownloadAll,
  unlocked,
  onOpenPrivate,
  iconOnly = false,
}: {
  t: ClientTheme;
  likedView: boolean;
  onSelectLiked: () => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  canDownloadAll: boolean;
  zipping: boolean;
  onDownloadAll: () => void;
  /** Whether the guest has unlocked the full gallery — Private hides once true. */
  unlocked: boolean;
  /** Opens the passcode sheet. Ignored (Private isn't rendered) once unlocked. */
  onOpenPrivate: () => void;
  /** Mobile: icons only, no titles. */
  iconOnly?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ActionItem
        t={t}
        icon={<IconHeart size={15} filled={likedView} />}
        label="Liked"
        active={likedView}
        underline
        onClick={onSelectLiked}
        iconOnly={iconOnly}
      />
      {!selectMode && canDownloadAll && (
        <ActionItem
          t={t}
          icon={<IconDownload size={16} />}
          label={zipping ? "Preparing…" : "Download"}
          onClick={onDownloadAll}
          disabled={zipping}
          iconOnly={iconOnly}
        />
      )}
      <ActionItem
        t={t}
        icon={selectMode ? <IconCheckSquare size={15} weight="fill" /> : <IconSquare size={15} />}
        label={selectMode ? "Cancel" : "Select"}
        active={selectMode}
        underline
        onClick={onToggleSelectMode}
        iconOnly={iconOnly}
      />
      {!unlocked && (
        <ActionItem
          t={t}
          icon={<IconLock size={14} />}
          label="Private"
          onClick={onOpenPrivate}
          iconOnly={iconOnly}
        />
      )}
    </div>
  );
}

function ActionItem({
  t,
  icon,
  label,
  active = false,
  underline = false,
  disabled = false,
  onClick,
  iconOnly = false,
}: {
  t: ClientTheme;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  /** Show the selected state as a bottom underline rather than a fill. */
  underline?: boolean;
  disabled?: boolean;
  onClick: () => void;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={underline ? active : undefined}
      className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-1.5 py-1.5 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        // color: active ? t.brand : t.muted,
        color: t.brand,
        // fontWeight: active ? 600 : 500,
        fontWeight: 700,
        borderBottom: `2px solid ${underline && active ? t.brand : "transparent"}`,
      }}
    >
      {icon}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}

