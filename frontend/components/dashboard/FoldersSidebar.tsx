"use client";

import { useEffect, useRef, useState } from "react";

export type FolderRow = {
  id: string;
  label: string;
  count: number;
  system?: boolean;
  /** Which glyph to show. Defaults to a folder (or the stack for `system` rows). */
  icon?: "images" | "heart";
};

type Props = {
  folders: FolderRow[];
  activeFolderId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void | Promise<void>;
  onAddFolder?: (name: string) => void | Promise<void>;
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
  disabled = false,
  scrollRef,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);

  const empty = folders.length === 0;

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
            {folders.filter((f) => !f.system).length}
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
          {folders.map((f, idx) => {
            const isActive = f.id === activeFolderId;
            const prevWasSystem = idx > 0 && folders[idx - 1].system;
            const showDivider = !f.system && prevWasSystem;
            const isRenaming = renamingId === f.id;
            return (
              <div key={f.id}>
                {showDivider && (
                  <div className="my-2 h-px bg-[var(--color-brand-border)]" aria-hidden />
                )}
                <FolderRowComponent
                  folder={f}
                  isActive={isActive}
                  isRenaming={isRenaming}
                  disabled={disabled}
                  onSelect={() => onSelect(f.id)}
                  onStartRename={() => setRenamingId(f.id)}
                  onCommitRename={async (name) => {
                    setRenamingId(null);
                    const trimmed = name.trim();
                    if (trimmed && trimmed !== f.label) await onRename(f.id, trimmed);
                  }}
                  onCancelRename={() => setRenamingId(null)}
                />
              </div>
            );
          })}
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
    </aside>
  );
}

function FolderRowComponent({
  folder,
  isActive,
  isRenaming,
  disabled,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: {
  folder: FolderRow;
  isActive: boolean;
  isRenaming: boolean;
  disabled: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void | Promise<void>;
  onCancelRename: () => void;
}) {
  const Icon =
    folder.icon === "heart" ? HeartIcon : folder.system ? ImageStackIcon : FolderIcon;
  return (
    <div
      onClick={isRenaming || disabled ? undefined : onSelect}
      role={isRenaming || disabled ? undefined : "button"}
      className={`relative my-px flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 ${
        isActive ? "bg-[var(--color-brand-navy-soft)]" : "hover:bg-white"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <Icon
        size={15}
        className={isActive ? "text-[var(--color-brand-navy)]" : "text-[var(--color-brand-muted)]"}
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
      {isActive && !isRenaming && !folder.system && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          disabled={disabled}
          title="Rename folder"
          className="brand-focus -ml-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-[var(--color-brand-navy)]"
        >
          <EditIcon size={13} />
        </button>
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
