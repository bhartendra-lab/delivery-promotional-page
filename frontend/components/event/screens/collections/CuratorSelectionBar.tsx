"use client";

import type { ClientTheme } from "@/lib/client-theme";
import { IconDownload, IconHeart, IconMinus, IconPlus, IconX } from "@/components/ui/icons";

export type BarAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

/**
 * The selection bar every guest gets while collections are switched on, in
 * place of Cancel + Download: the count on the left, then labelled icon
 * buttons. Like (Unlike when every selected photo is already liked by me),
 * Add to collection for curators only, Download only where the studio allows
 * it, and Remove inside a collection's own view.
 *
 * Phone: a pill above the bottom nav, clearing the same home-indicator inset
 * as today's bar. Desktop: bottom-centred.
 */
export function CuratorSelectionBar({
  t,
  label,
  count,
  likeMode,
  onCancel,
  onLike,
  onCollect,
  onDownload,
  onRemove,
  removeLabel = "Remove",
  busy,
  aboveNav = true,
}: {
  t: ClientTheme;
  /** "24 selected" / "All 1,240 selected". */
  label: string;
  count: number;
  likeMode: "like" | "unlike";
  onCancel: () => void;
  onLike: () => void;
  /** Curators only: absent, a plain guest's bar has no Add to collection. */
  onCollect?: () => void;
  /** Absent when the studio has downloads off. */
  onDownload?: () => void;
  /** A collection's own view only. */
  onRemove?: () => void;
  removeLabel?: string;
  /** Something is resolving or writing: the buttons wait. */
  busy?: boolean;
  /** The phone's bottom nav is under it (false in a full-screen view). */
  aboveNav?: boolean;
}) {
  const none = count === 0 || !!busy;
  const actions: BarAction[] = [
    {
      key: "like",
      label: likeMode === "unlike" ? "Unlike" : "Like",
      icon: <IconHeart size={19} filled={likeMode === "unlike"} weight={likeMode === "unlike" ? undefined : "bold"} />,
      onClick: onLike,
      disabled: none,
    },
    ...(onCollect ? [{ key: "collect", label: "Add to collection", icon: <IconPlus size={19} weight="bold" />, onClick: onCollect, disabled: none }] : []),
    ...(onRemove ? [{ key: "remove", label: removeLabel, icon: <IconMinus size={19} weight="bold" />, onClick: onRemove, disabled: none }] : []),
    ...(onDownload ? [{ key: "download", label: "Download", icon: <IconDownload size={19} weight="bold" />, onClick: onDownload, disabled: none }] : []),
  ];

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-3 lg:bottom-6"
      style={{ bottom: aboveNav ? "calc(84px + env(safe-area-inset-bottom))" : "calc(16px + env(safe-area-inset-bottom))" }}
    >
      <div
        role="toolbar"
        aria-label="Selected photos"
        className="flex w-full max-w-[560px] items-center gap-1 rounded-[22px] py-1.5 pl-1.5 pr-2 lg:max-w-[640px] lg:rounded-full"
        style={{ background: t.card, boxShadow: t.shadow }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel selection"
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full"
          style={{ color: t.muted }}
        >
          <IconX size={18} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-extrabold" style={{ color: t.text }}>
          {busy ? "Getting photos ready…" : label}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              aria-label={a.label}
              className="flex min-w-[52px] cursor-pointer flex-col items-center gap-0.5 rounded-2xl px-1.5 py-1 text-[10.5px] font-bold leading-tight disabled:cursor-not-allowed disabled:opacity-45 lg:min-w-0 lg:flex-row lg:gap-1.5 lg:rounded-full lg:px-3 lg:py-2 lg:text-[12.5px] can-hover:hover:bg-[var(--bar-hover)]"
              style={{ color: a.key === "collect" ? t.brand : t.text, ["--bar-hover" as string]: t.sunken }}
            >
              {a.icon}
              <span className="max-w-[64px] truncate lg:max-w-none">{a.key === "collect" ? <CollectLabel /> : a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** "Add" on a phone, where four labels must fit; the full words on desktop. */
function CollectLabel() {
  return (
    <>
      <span className="lg:hidden">Add</span>
      <span className="hidden lg:inline">Add to collection</span>
    </>
  );
}
