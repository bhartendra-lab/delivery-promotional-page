import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FILTER, DEFAULT_SORT, eventsViewQuery, parseEventsView, totalPagesFor, withChange } from "./events-query.ts";

const params = (qs: string) => new URLSearchParams(qs);

test("a plain URL is the default view, and the default view makes a plain URL", () => {
  const v = parseEventsView(params(""));
  assert.deepEqual(v, { filter: DEFAULT_FILTER, sort: DEFAULT_SORT, q: "", page: 1 });
  assert.equal(eventsViewQuery(v), "");
});

test("filter, sort, search and page survive a round trip", () => {
  const v = { filter: "deactivated" as const, sort: "date_asc" as const, q: "priya", page: 3 };
  const qs = eventsViewQuery(v);
  assert.equal(qs, "?filter=deactivated&sort=date_asc&q=priya&page=3");
  assert.deepEqual(parseEventsView(params(qs.slice(1))), v);
});

test("anything unrecognised falls back to the default, so a pasted or old link never breaks the page", () => {
  const v = parseEventsView(params("filter=everything&sort=random&page=-2&q=%20%20x%20"));
  assert.equal(v.filter, DEFAULT_FILTER);
  assert.equal(v.sort, DEFAULT_SORT);
  assert.equal(v.page, 1);
  assert.equal(v.q, "x");
  assert.equal(parseEventsView(params("page=abc")).page, 1);
  assert.equal(parseEventsView(params("page=2.5")).page, 1);
});

test("the selected filter is kept in the URL even when it is All; the default is left out", () => {
  assert.equal(eventsViewQuery({ filter: "all", sort: DEFAULT_SORT, q: "", page: 1 }), "?filter=all");
  assert.equal(eventsViewQuery({ filter: DEFAULT_FILTER, sort: "created_asc", q: "", page: 1 }), "?sort=created_asc");
});

test("changing the filter, sort or search goes back to page 1", () => {
  const v = { filter: "active" as const, sort: DEFAULT_SORT, q: "", page: 4 };
  assert.equal(withChange(v, { filter: "archived" }).page, 1);
  assert.equal(withChange(v, { sort: "date_desc" }).page, 1);
  assert.equal(withChange(v, { q: "rohan" }).page, 1);
  assert.equal(withChange(v, { filter: "archived" }).sort, DEFAULT_SORT, "the sort is kept");
});

test("a very long search is cut", () => {
  assert.equal(parseEventsView(params(`q=${"x".repeat(500)}`)).q.length, 100);
});

test("page count is exact when the server sent the size, else it pages forward while a page is full", () => {
  assert.equal(totalPagesFor({ total: 41, pageSize: 20, page: 1, returned: 20 }), 3);
  assert.equal(totalPagesFor({ total: 0, pageSize: 20, page: 1, returned: 0 }), 1);
  assert.equal(totalPagesFor({ total: null, pageSize: 20, page: 2, returned: 20 }), 3);
  assert.equal(totalPagesFor({ total: undefined, pageSize: 20, page: 2, returned: 7 }), 2);
});
