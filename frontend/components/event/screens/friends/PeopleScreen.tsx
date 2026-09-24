"use client";

/**
 * Surface 4 — the people screen, which is also the approval screen.
 *
 * One screen, not two: the link in a WhatsApp or email request opens exactly
 * this, scrolled to "Wants to add you". Building an "approval screen" beside it
 * would have meant two places to keep the relationship ladder correct, and a
 * guest who came to answer one person almost always wants to add three more
 * while they are here.
 *
 * Everything below is filtered from ONE loaded payload. There is no search
 * endpoint, no pagination and no second request — see `lib/friend-finder/search.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import type { ClientTheme } from "@/lib/client-theme";
import { ACTION_FAILED_TOAST, DECLINED_BANNER, REQUEST_LIMIT_TOAST } from "@/lib/friend-finder/copy";
import { foldName, matchesQuery } from "@/lib/friend-finder/search";
import type { FriendFinderBlock, FriendPerson } from "@/lib/friend-finder/types";
import { IconSearch, IconShare, IconUsers } from "@/components/ui/icons";
import { PersonRow } from "./PersonRow";
import { SheetShell } from "./SheetShell";
import type { UseFriendsDirectory } from "./useFriendsDirectory";

/** Long enough that a fast typist does not re-filter on every keystroke, short
 *  enough that the list never feels like it is lagging behind the keyboard. */
const SEARCH_DEBOUNCE_MS = 100;

/**
 * Below this many people every row is rendered and nothing is windowed.
 *
 * `content-visibility: auto` already keeps rows off the layout and paint paths
 * while they are off screen, which is most of the cost; what it does not save
 * is the DOM nodes and React's reconciliation of them. At a normal wedding the
 * whole list is well under this and the windowing never engages at all.
 */
const WINDOW_THRESHOLD = 150;
/** How many more rows one scroll to the bottom reveals. */
const WINDOW_STEP = 100;

/**
 * Mounted only while it is open (FriendsSurface renders it conditionally), so
 * closing it discards the search box, the scroll position and the in-flight
 * row set. That is the intended behaviour for all three: reopening the list
 * pre-filtered to somebody the guest looked up last time is confusing every
 * time, and the payload itself survives in the cache regardless.
 */
export function PeopleScreen({
  t,
  open,
  uid,
  block,
  hasSelfie,
  desktop,
  directory,
  /** Open scrolled to "Wants to add you" — how the approval link arrives. */
  focusRequests,
  onClose,
  onBlockChange,
  onToast,
  /** Toast with a "View My Group" action, shown on the guest's first add ever. */
  onFirstGroup,
  /** The guest added someone but has no selfie, so there is nothing to show
   *  them together yet. Hands off to the existing face-scan flow. */
  onNeedSelfie,
}: {
  t: ClientTheme;
  open: boolean;
  uid: string;
  block: FriendFinderBlock;
  hasSelfie: boolean;
  desktop: boolean;
  /** Owned by FriendsSurface so the lounge card keeps its faces while this
   *  screen is closed — see the note there. */
  directory: UseFriendsDirectory;
  focusRequests: boolean;
  onClose: () => void;
  onBlockChange: (patch: Partial<FriendFinderBlock>) => void;
  onToast: (message: string) => void;
  onFirstGroup: (message: string) => void;
  onNeedSelfie: () => void;
}) {
  const [query, setQuery] = useState("");
  /**
   * The typed value drives the input; this debounced copy drives the filter, so
   * a three-hundred-guest list is not re-partitioned on every keystroke. The
   * input itself is never debounced — the characters appear as they are typed.
   */
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);
  const [confirming, setConfirming] = useState<{ person: FriendPerson; prompt: string } | null>(null);
  /** Connected to someone, but with no selfie there is no set to intersect. */
  const [selfiePrompt, setSelfiePrompt] = useState(false);
  /** Announced politely after every action, for anyone not watching the row. */
  const [announcement, setAnnouncement] = useState("");
  const requestsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** The scrolling region, for the arrow-key roving and the window sentinel. */
  const listRef = useRef<HTMLDivElement>(null);
  const [windowSize, setWindowSize] = useState(WINDOW_THRESHOLD);

  const { payload, status, pending, act } = directory;

  // Laptop only: the search takes focus so the guest can type a name straight
  // away. On a phone that would throw the keyboard over the list they came to
  // read, so the panel takes focus there instead (see SheetShell).
  useEffect(() => {
    if (!open || !desktop) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, desktop]);

  // The approval link's landing: bring the people waiting on this guest into
  // view. Runs once the rows exist, not on open — there is nothing to scroll to
  // while the list is still loading.
  useEffect(() => {
    if (!open || !focusRequests || status !== "ready") return;
    const timer = window.setTimeout(
      () => requestsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
      60,
    );
    return () => window.clearTimeout(timer);
  }, [open, focusRequests, status]);

  const folded = useMemo(() => foldName(debouncedQuery), [debouncedQuery]);

  /**
   * Laptop keyboard: the arrows walk the list.
   *
   * Roving focus over the rows' own buttons rather than a separate `tabIndex`
   * scheme, so Enter and Space keep working exactly as they do on any button
   * and a screen reader still reads "Add Priya". Held on the container so it
   * also catches ArrowDown from the search box, which is how a guest who typed
   * a name gets into the results without reaching for the mouse.
   */
  const onListKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const root = listRef.current;
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-row-action]"));
    if (rows.length === 0) return;
    e.preventDefault();
    const active = document.activeElement as HTMLElement | null;
    const at = active ? rows.indexOf(active) : -1;
    // From anywhere that is not a row (the search box, say), ArrowDown enters
    // at the top and ArrowUp at the bottom.
    const next =
      at === -1
        ? e.key === "ArrowDown" ? 0 : rows.length - 1
        : Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)));
    rows[next]?.focus();
    rows[next]?.scrollIntoView({ block: "nearest" });
  }, []);

  const { requests, others } = useMemo(() => {
    const visible = (payload?.people ?? []).filter((p) => matchesQuery(p.name, folded));
    return {
      requests: visible.filter((p) => p.rel === "added_you"),
      others: visible.filter((p) => p.rel !== "added_you"),
    };
  }, [payload, folded]);

  // Only the long section is windowed. "Wants to add you" is never long enough
  // to need it, and hiding people who are waiting on this guest behind a scroll
  // threshold would be the worst thing on this screen to truncate.
  const shownOthers = others.length > windowSize ? others.slice(0, windowSize) : others;
  const moreToShow = others.length - shownOthers.length;


  /** Ask before anything that takes something away. Adding is cheap and
   *  reversible; leaving someone's group, or withdrawing a request they may
   *  already have been messaged about, is not. */
  const confirmPromptFor = (person: FriendPerson): string | null => {
    if (person.rel === "in_group") return `Remove ${person.name} from your group?`;
    if (person.rel === "requested") return `Cancel your request to ${person.name}?`;
    return null;
  };

  const runAction = useCallback(
    async (person: FriendPerson, action: "add" | "remove" | "decline") => {
      const wasFirstGroup = !block.has_group;
      try {
        const result = await act(person, action);
        if (!result) return; // re-auth took over

        if (action === "decline") {
          // Deliberately silent: "Not now" is a quiet no, and a toast
          // announcing it to the room is the opposite of that. The row leaves
          // "Wants to add you" on its own, because the server's recomputed
          // `rel` is no longer `added_you` — usually `open`, since they do
          // still allow this guest, which is exactly the Add button the design
          // asks for. Not forced to `open` here: if they stopped sharing in
          // the meantime, `not_sharing` is the truth and the server knows it.
          onBlockChange({ pending_count: Math.max(0, block.pending_count - 1) });
          return;
        }

        if (action === "remove") {
          setAnnouncement(
            person.rel === "requested"
              ? `Request to ${person.name} cancelled`
              : `${person.name} removed from your group`,
          );
          onToast(
            person.rel === "requested"
              ? `Request to ${person.name} cancelled`
              : `${person.name} is no longer in your group`,
          );
          return;
        }

        // action === "add"
        if (person.rel === "added_you") {
          onBlockChange({ pending_count: Math.max(0, block.pending_count - 1) });
        }
        const message = result.connected
          ? `${person.name} is in your group`
          : `Request sent to ${person.name}`;
        setAnnouncement(message);

        if (result.connected && wasFirstGroup) {
          // The My Group tab exists from this moment on. Tell the session block
          // so the tab and the card both know, and offer the way straight there.
          onBlockChange({ has_group: true });
          onFirstGroup(message);
        } else {
          onToast(message);
        }

        // Connected, but with no face set of their own there is nothing for the
        // group feed to show this guest. Said now rather than left for them to
        // discover as an empty tab.
        // Connected, but with no face set of their own there is nothing to show
        // them together yet. A toast would be wrong here twice over: it says
        // nothing about what to do, and the scan flow it leads to unmounts the
        // whole lounge, taking the toast with it before it can be read.
        if (result.connected && !hasSelfie) setSelfiePrompt(true);
      } catch (err) {
        const limited = err instanceof ApiError && err.status === 429;
        const message = limited ? REQUEST_LIMIT_TOAST : ACTION_FAILED_TOAST;
        setAnnouncement(message);
        onToast(message);
      }
    },
    [act, block.has_group, block.pending_count, hasSelfie, onBlockChange, onFirstGroup, onToast],
  );

  const onPrimary = useCallback(
    (person: FriendPerson) => {
      const prompt = confirmPromptFor(person);
      if (prompt) {
        setConfirming({ person, prompt });
        return;
      }
      void runAction(person, "add");
    },
    [runAction],
  );

  const shareLink = useCallback(() => {
    // The event's PUBLIC gallery URL, rebuilt from the origin the guest is
    // already on — never `location.href`, which on this screen carries nothing
    // secret today but is one refactor away from carrying a token or a query
    // that identifies this guest.
    const url = `${window.location.origin}/event/${encodeURIComponent(uid)}`;
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      nav.share({ url }).catch(() => {});
      return;
    }
    nav?.clipboard
      ?.writeText(url)
      .then(() => onToast("Gallery link copied"))
      .catch(() => onToast("Couldn't copy the link"));
  }, [uid, onToast]);

  return (
    <>
      <SheetShell
        t={t}
        open={open}
        onClose={onClose}
        title="Your friends group"
        fullScreenOnPhone
        desktopWidth={720}
        autoFocus={false}
        footer={
          <button
            type="button"
            onClick={shareLink}
            className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[13.5px] font-bold"
            style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
          >
            <IconShare size={15} />
            Can&rsquo;t find someone? Share the gallery link.
          </button>
        }
      >
        {/* The keydown sits here rather than on the list, so ArrowDown from the
            search box walks into the results too. */}
        <div ref={listRef} onKeyDown={onListKeyDown}>
        <p className="text-[12.5px] font-semibold" style={{ color: t.muted }}>
          Guests at this wedding
        </p>

        {/* Sticky so it survives a long list — the guest can start typing at any
            scroll position rather than flicking back to the top. */}
        <div className="sticky top-0 z-10 -mx-5 mt-3 px-5 pb-3 pt-1" style={{ background: t.card }}>
          <div
            className="flex items-center gap-2 rounded-full px-3.5"
            style={{ background: t.sunken, border: `1px solid ${t.border}` }}
          >
            <span style={{ color: t.faint }} aria-hidden>
              <IconSearch size={15} />
            </span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Searching re-partitions the list, so the window starts again.
                // Without this a guest who had scrolled far down and then typed
                // would get a truncated result set with no sign it was cut.
                setWindowSize(WINDOW_THRESHOLD);
              }}
              placeholder="Search by name"
              aria-label="Search guests by name"
              enterKeyHint="search"
              autoComplete="off"
              className="min-h-[44px] w-full bg-transparent text-[14px] font-semibold outline-none"
              style={{ color: t.text }}
            />
          </div>
        </div>

        {block.choice === "none" && (
          <p
            className="mb-3 rounded-2xl px-3.5 py-2.5 text-[12px] font-semibold leading-[1.45]"
            style={{ background: t.sunken, color: t.muted }}
          >
            {DECLINED_BANNER}
          </p>
        )}

        {payload?.state === "preparing" && (
          <p
            className="mb-3 rounded-2xl px-3.5 py-2.5 text-[12px] font-semibold leading-[1.45]"
            style={{ background: t.accentWash, color: t.brand }}
          >
            Getting your photos ready. This can take a few minutes.
          </p>
        )}

        {/* Results of the last action, for anyone not watching the row change. */}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        {status === "loading" ? (
          <RowSkeleton t={t} />
        ) : status === "error" && !payload ? (
          <EmptyNote t={t} text="Couldn't load the guest list. Close this and try again." />
        ) : (
          <>
            {requests.length > 0 && (
              <div ref={requestsRef} className="scroll-mt-4">
                <SectionHeading t={t}>Wants to add you</SectionHeading>
                <ul className={desktop ? "grid grid-cols-2 gap-x-6" : ""}>
                  {requests.map((person) => (
                    <PersonRow
                      key={person.guest_id}
                      t={t}
                      person={person}
                      sharedCount={person.shared.length}
                      busy={pending.has(person.guest_id)}
                      desktop={desktop}
                      onPrimary={() => void runAction(person, "add")}
                      onDecline={() => void runAction(person, "decline")}
                    />
                  ))}
                </ul>
              </div>
            )}

            {others.length > 0 && (
              <>
                {requests.length > 0 && <SectionHeading t={t}>Everyone else</SectionHeading>}
                <ul className={desktop ? "grid grid-cols-2 gap-x-6" : ""}>
                  {shownOthers.map((person) => (
                    <PersonRow
                      key={person.guest_id}
                      t={t}
                      person={person}
                      sharedCount={person.shared.length}
                      busy={pending.has(person.guest_id)}
                      desktop={desktop}
                      onPrimary={() => onPrimary(person)}
                    />
                  ))}
                </ul>
              </>
            )}

            {status === "ready" && requests.length === 0 && others.length === 0 && (
              <EmptyNote
                t={t}
                text={
                  folded
                    ? "Nobody here by that name."
                    : "No other guests have added their name yet. Share the gallery link so they can."
                }
              />
            )}

            {moreToShow > 0 && (
              <button
                type="button"
                onClick={() => setWindowSize((n) => n + WINDOW_STEP)}
                className="mt-3 min-h-[44px] w-full cursor-pointer rounded-full text-[13px] font-bold"
                style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
              >
                Show {Math.min(moreToShow, WINDOW_STEP)} more
              </button>
            )}
          </>
        )}
        </div>
      </SheetShell>

      {selfiePrompt && (
        <ConfirmSheet
          t={t}
          prompt="Scan your face so you can see your photos together"
          confirmLabel="Scan my face"
          cancelLabel="Later"
          onCancel={() => setSelfiePrompt(false)}
          onConfirm={() => {
            setSelfiePrompt(false);
            onNeedSelfie();
          }}
        />
      )}

      {confirming && (
        <ConfirmSheet
          t={t}
          prompt={confirming.prompt}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { person } = confirming;
            setConfirming(null);
            void runAction(person, "remove");
          }}
        />
      )}
    </>
  );
}

function SectionHeading({ t, children }: { t: ClientTheme; children: React.ReactNode }) {
  return (
    <h3
      className="mb-1 mt-4 text-[11.5px] font-extrabold uppercase tracking-[0.06em]"
      style={{ color: t.faint }}
    >
      {children}
    </h3>
  );
}

function EmptyNote({ t, text }: { t: ClientTheme; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: t.sunken, color: t.faint }}
        aria-hidden
      >
        <IconUsers size={20} />
      </span>
      <p className="max-w-[280px] text-[13px] font-semibold leading-[1.5]" style={{ color: t.muted }}>
        {text}
      </p>
    </div>
  );
}

function RowSkeleton({ t }: { t: ClientTheme }) {
  return (
    <div className="mt-2 flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="skeleton h-12 w-12 rounded-full" style={{ animationDelay: `${i * 0.05}s` }} />
          <span className="skeleton h-3.5 flex-1 rounded-full" style={{ animationDelay: `${i * 0.05}s`, maxWidth: 160 }} />
          <span className="skeleton h-9 w-20 rounded-full" style={{ animationDelay: `${i * 0.05}s`, background: t.sunken }} />
        </div>
      ))}
    </div>
  );
}

/**
 * The one confirm this feature asks for.
 *
 * Deliberately not `components/ui/ConfirmDialog` — that one is themed for the
 * studio dashboard, and this has to sit above the people screen inside the
 * guest's own palette.
 */
function ConfirmSheet({
  t,
  prompt,
  confirmLabel = "Yes, do it",
  cancelLabel = "Keep as it is",
  onCancel,
  onConfirm,
}: {
  t: ClientTheme;
  prompt: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <SheetShell t={t} open onClose={onCancel} title={prompt} desktopWidth={400}>
      <div className="mt-2 flex flex-col gap-2 pb-1">
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-[44px] w-full cursor-pointer rounded-full text-[14px] font-extrabold"
          style={{ background: t.brand, color: t.onBrand }}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] w-full cursor-pointer rounded-full text-[13.5px] font-bold"
          style={{ background: t.sunken, color: t.text, border: `1px solid ${t.border}` }}
        >
          {cancelLabel}
        </button>
      </div>
    </SheetShell>
  );
}
