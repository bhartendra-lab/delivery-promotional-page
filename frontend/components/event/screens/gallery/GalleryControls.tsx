"use client";

import type { CustomFolder } from "@/lib/types";
import type { ClientTheme } from "@/lib/client-theme";

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
  const color = filled ? t.brand : dimmed ? (on ? t.muted : t.faint) : t.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full px-4 py-1.5 text-[12.5px] transition-colors"
      style={{
        background: filled ? t.card : "transparent",
        color,
        fontWeight: on ? 600 : 500,
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
            className="shrink-0 cursor-pointer rounded-md px-3.5 py-1.5 text-[12px] transition-colors"
            style={{
              background: active ? t.accentWash : "transparent",
              color: active ? t.brand : t.muted,
              border: `1px solid ${active ? "transparent" : t.border}`,
              fontWeight: active ? 600 : 500,
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
        icon={<HeartIcon size={15} filled={likedView} />}
        label="Liked"
        active={likedView}
        underline
        onClick={onSelectLiked}
        iconOnly={iconOnly}
      />
      {!selectMode && canDownloadAll && (
        <ActionItem
          t={t}
          icon={<DownloadIcon size={16} />}
          label={zipping ? "Preparing…" : "Download"}
          onClick={onDownloadAll}
          disabled={zipping}
          iconOnly={iconOnly}
        />
      )}
      <ActionItem
        t={t}
        icon={<SelectIcon size={15} checked={selectMode} />}
        label={selectMode ? "Cancel" : "Select"}
        active={selectMode}
        underline
        onClick={onToggleSelectMode}
        iconOnly={iconOnly}
      />
      {!unlocked && (
        <ActionItem
          t={t}
          icon={<LockIcon size={14} />}
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
      className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-1.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        color: active ? t.brand : t.muted,
        fontWeight: active ? 600 : 500,
        borderBottom: `2px solid ${underline && active ? t.brand : "transparent"}`,
      }}
    >
      {icon}
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}

function HeartIcon({ size = 12, filled }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function DownloadIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 11l5 5 5-5M5 21h14" />
    </svg>
  );
}
function SelectIcon({ size = 15, checked }: { size?: number; checked?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      {checked && <polyline points="8 12.5 11 15.5 16.5 9" />}
    </svg>
  );
}
