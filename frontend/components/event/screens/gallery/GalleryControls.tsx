"use client";

import type { CustomFolder } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";
import { IconHeart, IconLock, IconDownload, IconSquare, IconCheckSquare, IconChecks } from "@/components/ui/icons";

/** Sentinel folder id meaning "no specific folder" — shared by every screen
 *  that reads/sets the active folder pill. */
export const ALL = "__all__";

/**
 * My Photos / All Photos switcher. Both segments are always plain, tappable
 * tabs — unlocking the gallery passcode is no longer gated here (see the
 * "Unlock" action in `ActionsCluster`). A non-host guest tapping "All Photos"
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
  // adds no value once Liked/Select/Unlock live in their own cluster.
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
 * Select mode's left-hand slot, in place of the My/All switcher: the live count
 * with Select all stacked directly beneath it. Select all belongs next to the
 * number it changes — in the action cluster it was an unlabelled checkbox glyph
 * beside Select's unlabelled checkbox glyph, and in the bottom tray it was two
 * thumb-lengths away from the count it acts on. Shared by both shells so the
 * control sits in the same place on each.
 */
export function SelectionSummary({
  t,
  label,
  selectAll,
  scopeTotal,
  onSelectAll,
  onClearSelectAll,
  hint,
}: {
  t: ClientTheme;
  /** "All 4,812 selected" / "3 selected" — owned by the parent. */
  label: string;
  selectAll: boolean;
  /** Photos in the active view, shown on the button so the guest knows the
   *  size of what one tap takes. */
  scopeTotal: number;
  onSelectAll: () => void;
  onClearSelectAll: () => void;
  /** Optional quiet line under the control (the large-selection warning). */
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      <span className="truncate text-[13px] font-bold" style={{ color: t.text }} aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        onClick={selectAll ? onClearSelectAll : onSelectAll}
        aria-pressed={selectAll}
        className="flex cursor-pointer items-center gap-1 whitespace-nowrap text-[12px] font-extrabold underline-offset-2 hover:underline"
        style={{ color: t.brand }}
      >
        <IconChecks size={13} weight={selectAll ? "bold" : "regular"} />
        {selectAll ? "Clear selection" : `Select all${scopeTotal > 0 ? ` (${scopeTotal.toLocaleString("en-IN")})` : ""}`}
      </button>
      {hint && (
        <span className="truncate text-[10.5px] font-semibold" style={{ color: t.muted }}>
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * Right-side action cluster: Liked, Download, Select, Unlock — icon + title, no
 * pill backgrounds. Liked and Select show their active state as an underline
 * (they're the two real view toggles); Download is a one-shot action; Unlock
 * opens the gallery-passcode sheet and disappears once the guest has unlocked
 * the full gallery (nothing left to unlock). On mobile (`iconOnly`) the titles
 * drop and only the icons show.
 *
 * Select hides entirely when `canSelect` is false: select mode's action bar is
 * Cancel + Download and nothing else, so with the studio's download preference
 * off it would be a mode with no action in it.
 *
 * Select all deliberately does NOT live here — see `SelectionSummary`, which
 * owns it. Shared by the mobile compact header and the desktop sticky control
 * row.
 */
export function ActionsCluster({
  t,
  likedView,
  onSelectLiked,
  selectMode,
  canSelect = true,
  onToggleSelectMode,
  canDownloadAll,
  zipping,
  onDownloadAll,
  downloadCount,
  unlocked,
  onOpenPrivate,
  iconOnly = false,
}: {
  t: ClientTheme;
  likedView: boolean;
  onSelectLiked: () => void;
  selectMode: boolean;
  /** False hides Select — its only action (Download) has been turned off. */
  canSelect?: boolean;
  onToggleSelectMode: () => void;
  canDownloadAll: boolean;
  zipping: boolean;
  onDownloadAll: () => void;
  /** Photos the header Download would fetch — shown so the guest knows the
   *  size of what they're committing to before the Save dialog opens. */
  downloadCount?: number;
  /** Whether the guest has unlocked the full gallery — Unlock hides once true. */
  unlocked: boolean;
  /** Opens the passcode sheet. Ignored (Unlock isn't rendered) once unlocked. */
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
          label={
            zipping
              ? "Preparing…"
              : downloadCount != null && downloadCount > 0
                ? `Download (${downloadCount.toLocaleString("en-IN")})`
                : "Download"
          }
          onClick={onDownloadAll}
          disabled={zipping}
          iconOnly={iconOnly}
        />
      )}
      {canSelect && (
        <ActionItem
          t={t}
          icon={selectMode ? <IconCheckSquare size={15} weight="fill" /> : <IconSquare size={15} />}
          label={selectMode ? "Cancel" : "Select"}
          active={selectMode}
          underline
          onClick={onToggleSelectMode}
          iconOnly={iconOnly}
        />
      )}
      {!unlocked && (
        <ActionItem
          t={t}
          icon={<IconLock size={14} />}
          label="Unlock"
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

