import { test } from "node:test";
import assert from "node:assert/strict";
import { chosenTargets, groupByPlacement, locateDefaults, placementPath } from "./placements.ts";
import type { LocateItem } from "../collections/types.ts";

const item = (id: string, placements: string[]): LocateItem => ({
  _id: id,
  media_id: `b__${id}.jpg-10-1`,
  url: `https://r2/${id}.jpg`,
  filename: `${id}.jpg`,
  custom_folder_ids: [],
  placements,
});

test("defaults: the sent collections; else every one with photos", () => {
  const c = (id: string, count: number, sent: boolean) => ({ id, name: id, count, sent });
  assert.deepEqual([...locateDefaults([c("a", 10, true), c("b", 5, false), c("e", 0, true)])], ["a"]);
  assert.deepEqual([...locateDefaults([c("a", 10, false), c("b", 5, false), c("e", 0, false)])], ["a", "b"]);
  assert.equal(locateDefaults([c("e", 0, false)]).size, 0);
  assert.equal(locateDefaults([]).size, 0);
});

test("a choice keeps only its placements, and the count is of unique photos", () => {
  const items = [item("1", ["A", "B"]), item("2", ["B"]), item("3", ["C"])];
  const both = chosenTargets(items, new Set(["A", "B"]));
  assert.equal(both.length, 2);
  assert.deepEqual(both[0].placements, ["A", "B"]);
  const onlyA = chosenTargets(items, new Set(["A"]));
  assert.deepEqual(onlyA.map((i) => [i._id, i.placements]), [["1", ["A"]]]);
  assert.equal(chosenTargets(items, new Set()).length, 0);
});

test("paths: collection, then folder, then file; the old layout without a collection", () => {
  assert.equal(placementPath("Priya's Side", "Haldi", "DSC_1.jpg"), "Priya's Side/Haldi/DSC_1.jpg");
  // Characters a disk will not take are dropped, as for folders today.
  assert.equal(placementPath('Calendar: "2027"', "Wedding/Day 1", "a.jpg"), "Calendar 2027/WeddingDay 1/a.jpg");
  assert.equal(placementPath(null, "Haldi", "a.jpg"), "Haldi/a.jpg");
  assert.equal(placementPath("A", "", "a.jpg"), "A/Uncategorised/a.jpg");
});

test("not found is grouped by placement, in the run's order, a photo under each of its albums", () => {
  const groups = groupByPlacement([item("1", ["B", "A"]), item("2", ["A"])], ["A", "B", "C"]);
  assert.deepEqual(
    groups.map((g) => [g.placement, g.items.map((i) => i._id)]),
    [
      ["A", ["1", "2"]],
      ["B", ["1"]],
    ],
  );
});
