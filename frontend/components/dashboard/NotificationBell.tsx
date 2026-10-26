"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, listNotifications, markNotificationsRead } from "@/lib/api";
import {
  NOTIFICATIONS_POLL_MS,
  OPEN_COLLECTION_EVENT,
  noticeHref,
  timeAgo,
  unreadBadge,
  type OpenCollectionDetail,
  type StudioNotice,
} from "@/lib/notifications";
import { IconBell, IconX } from "@/components/ui/icons";

/**
 * The dashboard's bell, made real. Asks on mount, every minute while the tab
 * is visible, and on focus; the dot shows only when something is unread (a
 * number from two, "9+" above nine). A click on a notice marks it read and
 * opens that event's Smart Selects on the collection it is about.
 *
 * Every notice today comes from collections, and the endpoint answers 404
 * while COLLECTIONS_ENABLED is off: the bell then shows no dot, stops asking
 * for the session, and opens on "Nothing new yet".
 */
export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<StudioNotice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const offRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (offRef.current) return;
    try {
      const res = await listNotifications(20);
      setItems(res.items ?? []);
      setUnread(res.unread_count ?? 0);
      setNow(Date.now());
    } catch (err) {
      // Switched off (or no such route on this backend): nothing to show, and
      // nothing more to ask this session.
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) offRef.current = true;
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, NOTIFICATIONS_POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Close on a press outside, or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = (ids: string[] | "all") => {
    const before = { items, unread };
    setItems((list) => list.map((n) => (ids === "all" || ids.includes(n._id) ? { ...n, read: true } : n)));
    setUnread((u) => (ids === "all" ? 0 : Math.max(0, u - items.filter((n) => ids.includes(n._id) && !n.read).length)));
    markNotificationsRead(ids === "all" ? { all: true } : { ids })
      .then((res) => setUnread(res.unread_count ?? 0))
      .catch(() => {
        setItems(before.items);
        setUnread(before.unread);
      });
  };

  const openNotice = (n: StudioNotice) => {
    if (!n.read) markRead([n._id]);
    setOpen(false);
    const eventPath = `/dashboard/events/${n.booking_id}`;
    if (pathname === eventPath) {
      // Already on that event: navigating to the same page would not re-run
      // its on-mount read of the link, so tell the page directly.
      const detail: OpenCollectionDetail = { bookingId: n.booking_id, collectionId: n.data?.collection_ids?.[0] ?? null };
      window.dispatchEvent(new CustomEvent(OPEN_COLLECTION_EVENT, { detail }));
    } else {
      router.push(noticeHref(n));
    }
  };

  const badge = unreadBadge(unread);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        title="Notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setNow(Date.now());
        }}
        className="brand-focus relative flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:text-[var(--color-brand-ink)]"
      >
        <IconBell size={16} />
        {badge.dot &&
          (badge.label ? (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-brand-navy)] px-1 text-[9.5px] font-bold text-white ring-[1.5px] ring-white"
              aria-hidden
            >
              {badge.label}
            </span>
          ) : (
            <span
              className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-brand-navy)] ring-[1.5px] ring-white"
              aria-hidden
            />
          ))}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="dash-rise fixed inset-x-0 top-[56px] z-[200] max-h-[calc(100dvh-56px)] overflow-y-auto border-b border-[var(--color-brand-border)] bg-white shadow-[0_16px_40px_rgba(42,34,24,0.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:max-h-[480px] sm:w-[360px] sm:rounded-xl sm:border"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-brand-border)] px-4 py-3">
            <span className="text-[13.5px] font-bold text-[var(--color-brand-ink)]">Notifications</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markRead("all")}
                  className="brand-focus rounded px-1.5 py-1 text-[12px] font-semibold text-[var(--color-brand-navy)] hover:underline"
                >
                  Mark all as read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="brand-focus flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-brand-muted)] hover:bg-[var(--color-brand-hover)] sm:hidden"
              >
                <IconX size={15} />
              </button>
            </div>
          </div>
          {!loaded ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-[var(--color-brand-muted)]">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-[var(--color-brand-muted)]">Nothing new yet.</p>
          ) : (
            <ul role="list">
              {items.map((n) => (
                <li key={n._id}>
                  <button
                    type="button"
                    onClick={() => openNotice(n)}
                    className={`brand-focus flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-[var(--color-brand-hover)] ${
                      n.read ? "" : "bg-[var(--color-brand-navy-soft)]"
                    }`}
                  >
                    <span
                      aria-label={n.read ? undefined : "Unread"}
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-[var(--color-brand-navy)]"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] leading-snug text-[var(--color-brand-ink)] ${n.read ? "font-medium" : "font-semibold"}`}>
                        {n.title}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-[var(--color-brand-muted)]">
                        {[n.body, timeAgo(n.createdAt, now)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
