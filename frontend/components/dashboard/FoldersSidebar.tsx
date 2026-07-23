"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TypeConfirmModal } from "@/app/(dashboard)/dashboard/events/[booking_id]/TypeConfirmModal";

export type FolderRow = {
  id: string;
  label: string;
  count: number;
  system?: boolean;
  /** Which glyph to show. Defaults to a folder (or the stack for `system` rows). */
  icon?: "images" | "heart";
  /** "Highlights": a public folder is visible to guests without the family passcode. */
  visibility?: "private" | "public";
};

type Props = {
  folders: FolderRow[];
  activeFolderId: string;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void | Promise<void>;
  onAddFolder?: (name: string) => void | Promise<void>;
  /**
   * Delete a folder. The caller owns error handling/toasting (e.g. the
   * backend refusing a non-empty folder) — this always resolves, so the
   * confirm dialog closes regardless of outcome.
   */
  onDelete?: (id: string) => void | Promise<void>;
  /** Persist a full reordering of the non-system folders after a drag. */
  onReorder?: (orderedIds: string[]) => void | Promise<void>;
  /** Flip a folder between "Highlights" (public) and private. */
  onToggleVisibility?: (id: string) => void | Promise<void>;
  /**
   * Locks folder *mutations* (rename, delete, reorder, visibility, add) — used
   * while an upload is running, since `ensureFolders` is creating and targeting
   * folders concurrently. Switching folders stays live: reading the gallery is
   * never a conflict.
   */
  disabled?: boolean;
  /** Exposes the scrollable `<aside>` node so a wheel over it that hits its
   *  scroll boundary can be forwarded to a sibling scroll region. */
  scrollRef?: React.RefObject<HTMLElement | null>;
};

const FOLDERS_W = 240;

export function FoldersSidebar({
  folders,
  activeFolderId,
  onSelect,
  onRename,
  onAddFolder,
  onDelete,
  onReorder,
  onToggleVisibility,
  disabled = false,
  scrollRef,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FolderRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const empty = folders.length === 0;
  // "All Media" (and any other system row) always renders first, pinned, and
  // is excluded from the draggable set entirely.
  const systemFolders = folders.filter((f) => f.system);
  const userFolders = folders.filter((f) => !f.system);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const oldIndex = userFolders.findIndex((f) => f.id === active.id);
    const newIndex = userFolders.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    void onReorder(arrayMove(userFolders, oldIndex, newIndex).map((f) => f.id));
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <aside
      ref={scrollRef}
      className="hidden h-full shrink-0 overflow-y-auto border-r border-[var(--color-brand-border)] bg-[var(--color-brand-bg)] md:block"
      style={{ width: FOLDERS_W }}
    >
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-muted)]">
          Folders
        </span>
        {!empty && (
          <span className="text-[11px] tabular-nums text-[var(--color-brand-muted)]">
            {userFolders.length}
          </span>
        )}
      </div>

      {empty ? (
        <div className="mx-4 mt-2 rounded-lg border border-dashed border-[var(--color-brand-border)] bg-white px-4 py-5 text-center">
          <FolderIcon size={22} className="mx-auto mb-2 text-[#B5ADA4]" />
          <div className="text-[12.5px] font-semibold text-[var(--color-brand-ink)]">No folders yet</div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--color-brand-muted)]">
            Upload a folder of photos to organise this event.
          </p>
        </div>
      ) : (
        <div className="px-2.5">
          {systemFolders.map((f) => (
            <FolderRowComponent
              key={f.id}
              folder={f}
              isActive={f.id === activeFolderId}
              isRenaming={false}
              disabled={disabled}
              onSelect={() => onSelect(f.id)}
              onStartRename={() => {}}
              onCommitRename={() => {}}
              onCancelRename={() => {}}
            />
          ))}

          {systemFolders.length > 0 && userFolders.length > 0 && (
            <div className="my-2 h-px bg-[var(--color-brand-border)]" aria-hidden />
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={userFolders.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              {userFolders.map((f) => {
                const isActive = f.id === activeFolderId;
                const isRenaming = renamingId === f.id;
                return (
                  <SortableFolderRow
                    key={f.id}
                    folder={f}
                    isActive={isActive}
                    isRenaming={isRenaming}
                    disabled={disabled}
                    dragDisabled={disabled || isRenaming}
                    onSelect={() => onSelect(f.id)}
                    onStartRename={() => setRenamingId(f.id)}
                    onCommitRename={async (name) => {
                      setRenamingId(null);
                      const trimmed = name.trim();
                      if (trimmed && trimmed !== f.label) await onRename(f.id, trimmed);
                    }}
                    onCancelRename={() => setRenamingId(null)}
                    onDeleteRequest={onDelete ? () => setDeleteTarget(f) : undefined}
                    onToggleVisibility={onToggleVisibility ? () => onToggleVisibility(f.id) : undefined}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {!empty && onAddFolder && (
        <div className="px-3.5 pb-4 pt-2.5">
          {addingFolder ? (
            <InlineFolderInput
              placeholder="New folder name"
              onCommit={async (name) => {
                setAddingFolder(false);
                if (name.trim()) await onAddFolder(name.trim());
              }}
              onCancel={() => setAddingFolder(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingFolder(true)}
              disabled={disabled}
              className="brand-focus flex w-full items-center gap-2 rounded-md border border-dashed border-[var(--color-brand-border)] bg-transparent px-3 py-2 text-[12.5px] font-semibold text-[var(--color-brand-muted)] hover:border-[var(--color-brand-outline)] hover:text-[var(--color-brand-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderPlusIcon size={15} />
              <span>Add folder</span>
            </button>
          )}
        </div>
      )}

      {deleteTarget && (
        <TypeConfirmModal
          action="delete"
          requireTyping={false}
          busy={deleting}
          title="Delete this folder?"
          description={`“${deleteTarget.label}” will be removed. This can't be undone.`}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        />
      )}
    </aside>
  );
}

/** Wraps a folder row with dnd-kit's sortable behaviour; the drag handle
 *  inside `FolderRowComponent` is the only element wired to the drag listeners
 *  so a plain click elsewhere on the row still selects it. */
function SortableFolderRow({
  folder,
  isActive,
  isRenaming,
  disabled,
  dragDisabled,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDeleteRequest,
  onToggleVisibility,
}: {
  folder: FolderRow;
  isActive: boolean;
  isRenaming: boolean;
  disabled: boolean;
  dragDisabled: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void | Promise<void>;
  onCancelRename: () => void;
  onDeleteRequest?: () => void;
  onToggleVisibility?: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.id, disabled: dragDisabled });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={isDragging ? "relative z-10 opacity-70" : undefined}
    >
      <FolderRowComponent
        folder={folder}
        isActive={isActive}
        isRenaming={isRenaming}
        disabled={disabled}
        onSelect={onSelect}
        onStartRename={onStartRename}
        onCommitRename={onCommitRename}
        onCancelRename={onCancelRename}
        onDeleteRequest={onDeleteRequest}
        onToggleVisibility={onToggleVisibility}
        dragHandle={{ ref: setActivatorNodeRef, attributes, listeners }}
      />
    </div>
  );
}

/** Structurally derived from `useSortable`'s own return type instead of
 *  reaching into dnd-kit's internal type paths. */
type SortableDragProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

type FolderMenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  destructive?: boolean;
  onSelect: () => void;
};

function FolderRowComponent({
  folder,
  isActive,
  isRenaming,
  disabled,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDeleteRequest,
  onToggleVisibility,
  dragHandle,
}: {
  folder: FolderRow;
  isActive: boolean;
  isRenaming: boolean;
  disabled: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void | Promise<void>;
  onCancelRename: () => void;
  onDeleteRequest?: () => void;
  onToggleVisibility?: () => void;
  dragHandle?: SortableDragProps & { ref: (node: HTMLElement | null) => void };
}) {
  const isPublic = folder.visibility === "public";
  const Icon =
    folder.icon === "heart"
      ? HeartIcon
      : folder.system
        ? ImageStackIcon
        : isPublic
          ? FolderStarIcon
          : FolderIcon;
  const showRowActions = !isRenaming && !folder.system;

  const menuItems: FolderMenuItem[] = [
    { key: "rename", label: "Rename", icon: <EditIcon size={12} />, onSelect: onStartRename },
    ...(onToggleVisibility
      ? [
          {
            key: "visibility",
            label: "Highlight",
            icon: <CheckboxIcon size={13} checked={isPublic} />,
            onSelect: onToggleVisibility,
          } as FolderMenuItem,
        ]
      : []),
    ...(onDeleteRequest
      ? [
          {
            key: "delete",
            label: "Delete",
            icon: <TrashIcon size={12} />,
            destructive: true,
            onSelect: onDeleteRequest,
          } as FolderMenuItem,
        ]
      : []),
  ];

  return (
    <div
      onClick={isRenaming ? undefined : onSelect}
      role={isRenaming ? undefined : "button"}
      className={`group relative my-px flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-2 ${
        isActive ? "bg-[var(--color-brand-navy-soft)]" : "hover:bg-white"
      }`}
    >
      {showRowActions && (
        <button
          type="button"
          ref={dragHandle?.ref}
          {...dragHandle?.attributes}
          {...dragHandle?.listeners}
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
          aria-label="Drag to reorder"
          title="Drag to reorder"
          className={`brand-focus flex h-[22px] w-[14px] shrink-0 cursor-grab touch-none items-center justify-center text-[var(--color-brand-muted)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing ${
            disabled ? "cursor-not-allowed" : ""
          }`}
        >
          <DragHandleIcon size={12} />
        </button>
      )}
      <Icon
        size={15}
        className={`shrink-0 ${isActive ? "text-[var(--color-brand-navy)]" : "text-[var(--color-brand-muted)]"}`}
      />
      {isRenaming ? (
        <InlineFolderInput
          initial={folder.label}
          onCommit={onCommitRename}
          onCancel={onCancelRename}
        />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${
            isActive
              ? "font-semibold text-[var(--color-brand-navy)]"
              : "font-medium text-[var(--color-brand-ink)]"
          }`}
        >
          {folder.label}
        </span>
      )}
      {!isRenaming && (
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-brand-muted)]">
          {folder.count.toLocaleString("en-IN")}
        </span>
      )}
      {showRowActions && menuItems.length > 0 && (
        <FolderMenu isActive={isActive} disabled={disabled} items={menuItems} />
      )}
    </div>
  );
}

/**
 * Hover-revealed "⋮" menu per folder row. Takes a plain item list so a third
 * action (e.g. a visibility toggle) can be appended later without touching
 * this component — any item flagged `destructive` gets a divider above it and
 * renders in the danger colour, so Delete stays visually separated at the
 * bottom regardless of how many safe actions precede it.
 */
function FolderMenu({
  isActive,
  disabled,
  items,
}: {
  isActive: boolean;
  disabled?: boolean;
  items: FolderMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label="Folder actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`brand-focus -mr-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-[var(--color-brand-navy)] opacity-0 transition-opacity hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 ${
          isActive || open ? "opacity-100" : ""
        }`}
      >
        <KebabIcon size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="dash-rise absolute right-0 top-[calc(100%+2px)] z-30 w-[136px] overflow-hidden rounded-lg border border-[var(--color-brand-border)] bg-white p-1 shadow-[0_14px_44px_rgba(42,34,24,0.18)]"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium ${
                item.destructive
                  ? "mt-1 border-t border-[var(--color-brand-border)] pt-[9px] text-[var(--color-brand-danger)] hover:bg-[var(--color-brand-danger-soft)]"
                  : "text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-surface)]"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function InlineFolderInput({
  initial = "",
  placeholder,
  onCommit,
  onCancel,
}: {
  initial?: string;
  placeholder?: string;
  onCommit: (name: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 rounded border border-[var(--color-brand-navy)] bg-white px-1.5 py-0.5 text-[13px] font-semibold text-[var(--color-brand-ink)] outline-none"
    />
  );
}

/* ── Icons ──────────────────────────────────────────────────────── */

function FolderIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function FolderPlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="9.5" y1="13.5" x2="14.5" y2="13.5" />
    </svg>
  );
}

function ImageStackIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="3" width="14" height="14" rx="1.5" />
      <path d="M4 6v14a1 1 0 0 0 1 1h14" />
      <circle cx="11" cy="8" r="1.2" fill="currentColor" />
      <path d="M6 14l4-4 6 6" />
    </svg>
  );
}

function HeartIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function EditIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4l4 4-11 11H5v-4z" />
      <line x1="13" y1="7" x2="17" y2="11" />
    </svg>
  );
}

/** Folder glyph with a small filled star badge — flags a folder as
 *  "Highlight" (public) right on the row, no menu needed to tell. */
function FolderStarIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path
        d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 12.6l1 2.1 2.3.3-1.65 1.6.4 2.3-2.05-1.1-2.05 1.1.4-2.3-1.65-1.6 2.3-.3z"
        fill="var(--color-brand-warning)"
        stroke="var(--color-brand-warning)"
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Empty box / filled-with-tick box used for the "Highlight" menu item —
 *  reads as a toggle at a glance, no icon-meaning to learn (unlike a star). */
function CheckboxIcon({ size = 14, checked }: { size?: number; checked?: boolean }) {
  if (checked) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="var(--color-brand-navy)" />
        <path d="M7.5 12.5l3 3 6-6.5" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    </svg>
  );
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  );
}

function KebabIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function DragHandleIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="8" cy="5" r="1.6" />
      <circle cx="16" cy="5" r="1.6" />
      <circle cx="8" cy="12" r="1.6" />
      <circle cx="16" cy="12" r="1.6" />
      <circle cx="8" cy="19" r="1.6" />
      <circle cx="16" cy="19" r="1.6" />
    </svg>
  );
}
