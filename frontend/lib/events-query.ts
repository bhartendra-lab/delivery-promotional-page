/**
 * The Events page's view (filter, sort, search, page) as a URL query, so Back
 * and a refresh keep exactly what the studio was looking at.
 *
 * Pure. Defaults are left out of the URL, so the plain /dashboard/events stays
 * clean, and anything unrecognised in a pasted link falls back to its default.
 */
import type { EventsFilter } from "./event-status.ts";

export const EVENTS_FILTERS: readonly EventsFilter[] = ["all", "active", "deactivated", "archived"];
export const EVENTS_SORTS = ["created_desc", "created_asc", "date_desc", "date_asc"] as const;
export type EventsSort = (typeof EVENTS_SORTS)[number];

export const DEFAULT_FILTER: EventsFilter = "active";
export const DEFAULT_SORT: EventsSort = "created_desc";

export const FILTER_LABEL: Record<EventsFilter, string> = {
  all: "All",
  active: "Active",
  deactivated: "Deactivated",
  archived: "Archived",
};

export const SORT_LABEL: Record<EventsSort, string> = {
  created_desc: "Recently created",
  created_asc: "Oldest created",
  date_desc: "Event date: newest first",
  date_asc: "Event date: oldest first",
};

export type EventsView = { filter: EventsFilter; sort: EventsSort; q: string; page: number };

type Params = { get(name: string): string | null };

const SEARCH_MAX = 100;

export function parseEventsView(params: Params): EventsView {
  const filter = params.get("filter");
  const sort = params.get("sort");
  const page = Number(params.get("page"));
  return {
    filter: EVENTS_FILTERS.includes(filter as EventsFilter) ? (filter as EventsFilter) : DEFAULT_FILTER,
    sort: (EVENTS_SORTS as readonly string[]).includes(sort ?? "") ? (sort as EventsSort) : DEFAULT_SORT,
    q: (params.get("q") ?? "").trim().slice(0, SEARCH_MAX),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** The query string (with a leading "?", or "" when everything is a default). */
export function eventsViewQuery(view: EventsView): string {
  const sp = new URLSearchParams();
  if (view.filter !== DEFAULT_FILTER) sp.set("filter", view.filter);
  if (view.sort !== DEFAULT_SORT) sp.set("sort", view.sort);
  if (view.q.trim()) sp.set("q", view.q.trim().slice(0, SEARCH_MAX));
  if (view.page > 1) sp.set("page", String(view.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** A change of filter, sort or search starts again at page 1 (the old page may not exist in the new set). */
export function withChange(view: EventsView, change: Partial<Pick<EventsView, "filter" | "sort" | "q">>): EventsView {
  return { ...view, ...change, page: 1 };
}

/** How many pages there are: exact when the server knew the size of the set, else "one more while a page comes back full". */
export function totalPagesFor(args: { total: number | null | undefined; pageSize: number; page: number; returned: number }): number {
  if (typeof args.total === "number") return Math.max(1, Math.ceil(args.total / args.pageSize));
  return args.returned === args.pageSize ? args.page + 1 : args.page;
}
