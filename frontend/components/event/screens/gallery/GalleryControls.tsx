"use client";

import type { CustomFolder } from "@/lib/types";
import { SIGNAL, type ClientTheme } from "@/lib/client-theme";
import { useEffect, useRef, useState } from "react";
import { IconHeart, IconLock, IconDownload, IconSquare, IconCheckSquare, IconChecks, IconDotsVertical } from "@/components/ui/icons";

/** Sentinel folder id meaning "no specific folder" — shared by every screen
 *  that reads/sets the active folder pill. */
export const ALL = "__all__";

/**
 * The tabs the gallery switcher can show.
 *
 * "group" is "Find my people"'s My People tab, offered once that guest has
 * answered the consent question (see `showGroup`). The union is widened rather
 * than a second control being added, because these three are mutually
 * exclusive views of the same grid and a separate control would let a guest
 * pick two.
 *
 * The key is still "group" rather than "people": it is persisted in the guest's
 * per-tab storage, and renaming it would silently drop every guest who was
 * sitting on that tab back to My Photos on their next visit. It is a label
 * change, not a data change.
 */
export type GalleryTab = "mine" | "all" | "group";

/**
 * My Photos / All Photos switcher. Both segments are always plain, tappable
 * tabs — unlocking the gallery passcode is no longer gated here (see the
 * "Unlock" action in `ActionsCluster`). A non-host guest tapping "All Photos"
 * still gets a real view: the backend scopes a locked guest's "all" request to
 * Highlights (folders marked public), so there's always something to show
 * instead of a dead end behind a lock. Shared by the mobile compact header and
 * the desktop sticky control row.
 *
 * With face search off for the event there is no "My Photos" to switch to, and
 * the control collapses to a single static "All Photos" label — see `showMine`.
 */
export function UnlockAwareSwitcher({
  t,
  tab,
  setTab,
  dimmed = false,
  showMine = true,
  showGroup = false,
  pendingCount = 0,
}: {
  t: ClientTheme;
  tab: GalleryTab;
  setTab: (k: GalleryTab) => void;
  /** Renders the switcher de-emphasized but fully visible — used on desktop
   *  while the Liked pill owns the active filter (Liked ignores My/All). */
  dimmed?: boolean;
  /**
   * False when the Studio has switched face search off for this event: there is
   * no face-matched set, so "My Photos" would be a tab with nothing behind it.
   * The control keeps its shape rather than disappearing — the row's layout is
   * built around something sitting in this slot, and an empty left-hand side
   * would leave the action cluster floating alone.
   */
  showMine?: boolean;
  /**
   * Offer the third segment, My People. False by default, so every existing
   * call site renders the same two segments it always has — and a guest who
   * has not answered the question never sees a tab with nothing behind it.
   */
  showGroup?: boolean;
  /** People waiting on an answer from this guest. Shown as a red dot with the
   *  count on My People, and as nothing at all at zero. */
  pendingCount?: number;
}) {
  return (
    <div
      /* `min-w-0 shrink`, NOT `shrink-0`. With three segments and an action
         button beside it this control is wider than a 375px phone, and a
         `shrink-0` flex child does not give way — it pushes the button off the
         edge and the whole row into a horizontal scroll. Allowed to shrink, the
         segments truncate instead, which is the right thing to lose. */
      className="inline-flex min-w-0 shrink rounded-full p-0.5 transition-opacity"
      style={{ background: t.sunken, opacity: dimmed ? 0.75 : 1 }}
    >
      {showMine ? (
        <>
          <SwitchSeg t={t} on={tab === "mine"} dimmed={dimmed} tight={showGroup} onClick={() => setTab("mine")}>
            My Photos
          </SwitchSeg>
          <SwitchSeg t={t} on={tab === "all"} dimmed={dimmed} tight={showGroup} onClick={() => setTab("all")}>
            {/* Three segments do not fit ANY phone at the full label — not just
                a 320px one, which is what this used to assume. The one that
                survives shortening is this one: "My Photos" and "My People" are
                the two the guest is choosing between, and "All" alone is
                unambiguous next to them. Full label returns from `sm` up, where
                there is room for it. */}
            {showGroup ? (
              <>
                <span className="sm:hidden">All</span>
                <span className="hidden sm:inline">All Photos</span>
              </>
            ) : (
              "All Photos"
            )}
          </SwitchSeg>
          {showGroup && (
            <SwitchSeg
              t={t}
              on={tab === "group"}
              dimmed={dimmed}
              tight
              onClick={() => setTab("group")}
              badge={
                pendingCount > 0 ? (
                  <span
                    // Anchored to the label rather than to the segment, so it
                    // does not shift when the segment fills on selection.
                    className="absolute -right-2.5 -top-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-[3px] text-[9.5px] font-extrabold leading-none tabular-nums"
                    style={{ background: SIGNAL.liked, color: "#fff" }}
                    aria-label={`${pendingCount} waiting for your answer`}
                  >
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                ) : null
              }
            >
              My People
            </SwitchSeg>
          )}
        </>
      ) : (
        // A label, not a tab: with one destination there is nothing to switch
        // to, and a lone clickable segment invites a tap that does nothing.
        <span
          className="flex items-center gap-1 whitespace-nowrap rounded-full px-4 py-1.5 text-[14px] font-bold"
          style={{ background: t.card, color: t.brand, boxShadow: t.shadowSm }}
        >
          All Photos
        </span>
      )}
    </div>
  );
}

function SwitchSeg({
  t,
  on,
  dimmed = false,
  /** Three segments on a phone: trim the horizontal padding so all three fit
   *  beside the action button. Full padding returns from `sm` up. */
  tight = false,
  /** Rendered over the label's top-right corner. A node rather than a count,
   *  so this stays a segmented control that knows nothing about requests. */
  badge = null,
  onClick,
  children,
}: {
  t: ClientTheme;
  on: boolean;
  dimmed?: boolean;
  tight?: boolean;
  badge?: React.ReactNode;
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
      /* The button itself must NOT clip: the badge is positioned outside the
         label's box, and an `overflow-hidden` here would slice it in half. The
         truncation lives on the label span instead, which is the only thing
         that should ever be cut. */
      className={`flex min-w-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full py-1.5 text-[14px] transition-colors ${
        tight ? "px-2.5 sm:px-4" : "px-4"
      }`}
      style={{
        background: filled ? t.card : "transparent",
        color,
        // fontWeight: on ? 600 : 500,
        fontWeight: 700,
        boxShadow: filled ? t.shadowSm : "none",
      }}
    >
      <span className="relative min-w-0">
        <span className="block truncate">{children}</span>
        {badge}
      </span>
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
 * the full gallery (nothing left to unlock).
 *
 * ON A PHONE (`overflow`) none of that is a row of icons any more. Four bare
 * glyphs beside a three-segment switcher did not fit: at 360px they crowded
 * the tabs and at 320px they wrapped, and an icon with no label is a guess
 * even when it does fit. They collapse into one menu instead, and Liked is
 * dropped from it entirely — the bottom nav already has a Liked tab, so it
 * was the one item on the row with a second way to reach it.
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
  overflow = false,
  extraSlotRef,
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
  /** Phone: one overflow menu instead of a row, and no Liked (the bottom nav
   *  has it). */
  overflow?: boolean;
  /**
   * A portal target rendered as the FIRST item of the overflow menu, for
   * "Manage my people" — which belongs to the lazily-loaded friends chunk and
   * must not pull any of its copy into the lounge's own bundle. Absent on a
   * gallery without the feature, and `empty:hidden` keeps the divider honest.
   */
  extraSlotRef?: (el: HTMLDivElement | null) => void;
}) {
  if (overflow) {
    return (
      <OverflowMenu
        t={t}
        selectMode={selectMode}
        canSelect={canSelect}
        onToggleSelectMode={onToggleSelectMode}
        canDownloadAll={canDownloadAll}
        zipping={zipping}
        onDownloadAll={onDownloadAll}
        downloadCount={downloadCount}
        unlocked={unlocked}
        onOpenPrivate={onOpenPrivate}
        extraSlotRef={extraSlotRef}
      />
    );
  }
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


/**
 * The phone's one action control: a 3-dot button and a popover.
 *
 * Closes on an outside pointer-down, on Escape, and on any click INSIDE —
 * including the portalled "Manage my people" row, which this component cannot
 * attach a handler to because it does not render it. Listening on the
 * container in the bubble phase covers all of them with one rule.
 *
 * Anchored to the button with `absolute right-0`, not portalled: the control
 * row is not inside the scrolling container, so there is nothing for the menu
 * to drift away from.
 */
function OverflowMenu({
  t,
  selectMode,
  canSelect,
  onToggleSelectMode,
  canDownloadAll,
  zipping,
  onDownloadAll,
  downloadCount,
  unlocked,
  onOpenPrivate,
  extraSlotRef,
}: {
  t: ClientTheme;
  selectMode: boolean;
  canSelect: boolean;
  onToggleSelectMode: () => void;
  canDownloadAll: boolean;
  zipping: boolean;
  onDownloadAll: () => void;
  downloadCount?: number;
  unlocked: boolean;
  onOpenPrivate: () => void;
  extraSlotRef?: (el: HTMLDivElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Stopped so the PhotoViewer or a sheet underneath does not close on the
      // same keypress — the menu is what the guest meant to dismiss.
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // In select mode the only actions are Cancel and Download, and both live in
  // the select action bar at the bottom. A menu here would be a second place
  // to do the same two things.
  if (selectMode) {
    return (
      <button
        type="button"
        onClick={onToggleSelectMode}
        className="flex min-h-[44px] shrink-0 cursor-pointer items-center px-2 text-[13.5px] font-extrabold"
        style={{ color: t.brand }}
      >
        Cancel
      </button>
    );
  }

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-[44px] w-[44px] cursor-pointer items-center justify-center rounded-full"
        style={{ color: t.brand, background: open ? t.sunken : "transparent" }}
      >
        <IconDotsVertical size={18} />
      </button>

      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 top-[48px] z-50 flex w-[232px] flex-col overflow-hidden rounded-2xl py-1"
          style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
        >
          {/* Manage my people, from the friends chunk. First, because it is the
              only item that is about people rather than about this grid. */}
          {extraSlotRef && <div ref={extraSlotRef} className="empty:hidden" />}
          {!unlocked && (
            <MenuItem t={t} icon={<IconLock size={15} />} label="Unlock photos" onClick={onOpenPrivate} />
          )}
          {canDownloadAll && (
            <MenuItem
              t={t}
              icon={<IconDownload size={16} />}
              label={
                zipping
                  ? "Preparing…"
                  : downloadCount != null && downloadCount > 0
                    ? `Download all (${downloadCount.toLocaleString("en-IN")})`
                    : "Download all"
              }
              disabled={zipping}
              onClick={onDownloadAll}
            />
          )}
          {canSelect && (
            <MenuItem
              t={t}
              icon={<IconSquare size={15} />}
              label="Select photos"
              onClick={onToggleSelectMode}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  t,
  icon,
  label,
  disabled = false,
  onClick,
}: {
  t: ClientTheme;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 px-4 text-left text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
      style={{ color: t.text }}
    >
      <span className="shrink-0" style={{ color: t.muted }}>
        {icon}
      </span>
      {label}
    </button>
  );
}
