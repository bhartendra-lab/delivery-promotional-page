import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  applyCreatedFolders,
  defaultFolderName,
  filterImages,
  isJunkFile,
  normalizeFolderName,
  planFolderReuse,
  RAW_EXTENSIONS,
  relParts,
  type SelectedFile,
} from "./selection.ts";

function f(relativePath: string, type = "image/jpeg"): SelectedFile {
  const name = relativePath.split("/").pop() ?? relativePath;
  return { name, size: 1000, lastModified: 1, relativePath, type };
}

/** Group names with their file paths, for compact assertions. */
function shape(files: SelectedFile[], firstRoot: string | null) {
  const a = analyze(files, firstRoot);
  return {
    kind: a.kind,
    folderName: a.folderName,
    groups: a.subGroups.map((g) => [g.name, g.files.map((x) => x.relativePath)]),
    loose: a.looseFiles.map((x) => x.relativePath),
  };
}

/* ── analyze ─────────────────────────────────────────────────────── */

test("empty selection is an empty grouped analysis", () => {
  assert.deepEqual(shape([], null), { kind: "grouped", folderName: "", groups: [], loose: [] });
});

test("direct: individually picked files have no folder structure", () => {
  const files = [f("a.jpg"), f(""), f("b.jpg")];
  files[1] = { ...files[1], name: "c.jpg" };
  const a = analyze(files, null);
  assert.equal(a.kind, "direct");
  assert.equal(a.folderName, "");
  assert.deepEqual(a.subGroups, []);
  assert.equal(a.looseFiles.length, 3);
  assert.equal(a.looseFiles[0], files[0]); // the same objects, in order
});

test("grouped: a flat folder is one group under its own name", () => {
  const files = [f("Wedding/1.jpg"), f("Wedding/2.jpg")];
  assert.deepEqual(shape(files, "Wedding"), {
    kind: "grouped",
    folderName: "Wedding",
    groups: [["Wedding", ["Wedding/1.jpg", "Wedding/2.jpg"]]],
    loose: [],
  });
});

test("grouped: first-level subfolders become groups, nested ones roll up", () => {
  const files = [
    f("Wedding/Candids/1.jpg"),
    f("Wedding/Haldi/2.jpg"),
    f("Wedding/Candids/Day2/Evening/3.jpg"),
    f("Wedding/Haldi/Raw edits/4.jpg"),
  ];
  assert.deepEqual(shape(files, "Wedding"), {
    kind: "grouped",
    folderName: "Wedding",
    groups: [
      ["Candids", ["Wedding/Candids/1.jpg", "Wedding/Candids/Day2/Evening/3.jpg"]],
      ["Haldi", ["Wedding/Haldi/2.jpg", "Wedding/Haldi/Raw edits/4.jpg"]],
    ],
    loose: [],
  });
});

test("mixed: files at the root of a subfoldered folder are loose", () => {
  const files = [f("Wedding/cover.jpg"), f("Wedding/Candids/1.jpg")];
  assert.deepEqual(shape(files, "Wedding"), {
    kind: "mixed",
    folderName: "Wedding",
    groups: [["Candids", ["Wedding/Candids/1.jpg"]]],
    loose: ["Wedding/cover.jpg"],
  });
});

test("mixed: a stray single file next to a folder pick is loose", () => {
  const files = [f("Wedding/1.jpg"), f("stray.jpg")];
  assert.deepEqual(shape(files, "Wedding"), {
    kind: "mixed",
    folderName: "Wedding",
    groups: [["Wedding", ["Wedding/1.jpg"]]],
    loose: ["stray.jpg"],
  });
});

test("a second folder added later is flattened under its own name", () => {
  const files = [
    f("Wedding/Candids/1.jpg"),
    f("Reception/Stage/2.jpg"),
    f("Reception/Stage/Deep/3.jpg"),
    f("Reception/4.jpg"),
  ];
  assert.deepEqual(shape(files, "Wedding"), {
    kind: "grouped",
    folderName: "",
    groups: [
      ["Candids", ["Wedding/Candids/1.jpg"]],
      ["Reception", ["Reception/Stage/2.jpg", "Reception/Stage/Deep/3.jpg", "Reception/4.jpg"]],
    ],
    loose: [],
  });
});

test("a subfolder named like a later folder merges into one group", () => {
  const files = [f("Wedding/Reception/1.jpg"), f("Reception/2.jpg")];
  assert.deepEqual(shape(files, "Wedding").groups, [
    ["Reception", ["Wedding/Reception/1.jpg", "Reception/2.jpg"]],
  ]);
});

test("with no first root recorded, every folder is flattened", () => {
  const files = [f("Wedding/Candids/1.jpg"), f("Wedding/2.jpg")];
  assert.deepEqual(shape(files, null), {
    kind: "grouped",
    folderName: "Wedding",
    groups: [["Wedding", ["Wedding/Candids/1.jpg", "Wedding/2.jpg"]]],
    loose: [],
  });
});

test("relParts drops empty segments", () => {
  assert.deepEqual(relParts({ relativePath: "/Wedding//Candids/1.jpg" }), ["Wedding", "Candids", "1.jpg"]);
  assert.deepEqual(relParts({ relativePath: "" }), []);
});

/* ── filtering ───────────────────────────────────────────────────── */

test("RAW files are skipped, case-insensitively", () => {
  for (const name of ["a.CR3", "a.nef", "a.ARW", "a.dng", "a.raf", "a.iiq", "a.3fr"]) {
    assert.equal(RAW_EXTENSIONS.test(name), true, name);
  }
  const { kept, skipped } = filterImages([f("x/a.CR2", "image/x-canon-cr2"), f("x/b.jpg")]);
  assert.deepEqual(kept.map((k) => k.name), ["b.jpg"]);
  assert.equal(skipped, 1);
});

test("junk files: AppleDouble, .DS_Store and any dotfile", () => {
  assert.equal(isJunkFile("._IMG_1.jpg"), true);
  assert.equal(isJunkFile(".DS_Store"), true);
  assert.equal(isJunkFile(".hidden.jpg"), true);
  assert.equal(isJunkFile("Wedding/._IMG_1.jpg"), true);
  assert.equal(isJunkFile("IMG_1.jpg"), false);
  assert.equal(isJunkFile("Wedding/.x/IMG_1.jpg"), false); // only the base name counts
});

test("accepted by MIME type, or by extension when the type is missing", () => {
  const files = [
    f("a.jpg", ""),
    f("b.JPEG", ""),
    f("c.heic", ""),
    f("d.HEIF", ""),
    f("e.png", ""),
    f("f.gif", ""),
    f("g.webp", ""),
    f("h.tiff", "image/tiff"), // any image/* type is kept
    f("i.mp4", "video/mp4"),
    f("j.txt", ""),
    { name: "k.jpg", size: 1, lastModified: 1, relativePath: "" }, // no type at all
  ];
  const { kept, skipped } = filterImages(files);
  assert.deepEqual(
    kept.map((k) => k.name),
    ["a.jpg", "b.JPEG", "c.heic", "d.HEIF", "e.png", "f.gif", "g.webp", "h.tiff", "k.jpg"],
  );
  assert.equal(skipped, 2);
});

/* ── default folder name ─────────────────────────────────────────── */

test("defaultFolderName uses an en dash, the day and en-GB's short month", () => {
  const d = new Date(2026, 10, 10, 12, 0, 0); // 10 Nov 2026, local time
  const mon = d.toLocaleDateString("en-GB", { month: "short" });
  assert.equal(defaultFolderName(d), `Photos – 10 ${mon} 2026`);
  assert.equal(mon, "Nov");
});

/* ── folder reuse ────────────────────────────────────────────────── */

test("normalizeFolderName trims and lower-cases", () => {
  assert.equal(normalizeFolderName("  Candids "), "candids");
});

test("planFolderReuse reuses by normalized name and creates one per distinct name", () => {
  const existing = new Map([["Candids", "f1"]]);
  const { resolved, toCreate } = planFolderReuse(
    [" candids", "Haldi", "haldi ", "Mehndi", "CANDIDS"],
    existing,
  );
  assert.deepEqual(toCreate, ["Haldi", "Mehndi"]);
  assert.deepEqual(Array.from(resolved.entries()), [
    ["Candids", "f1"],
    [" candids", "f1"],
    ["CANDIDS", "f1"],
  ]);
  // the caller's map is not mutated
  assert.deepEqual(Array.from(existing.entries()), [["Candids", "f1"]]);
});

test("applyCreatedFolders maps every requested spelling to the created id", () => {
  const names = ["Haldi", "haldi ", "Mehndi", "Candids"];
  const existing = new Map([["candids", "f1"]]);
  const { resolved, toCreate } = planFolderReuse(names, existing);
  assert.deepEqual(toCreate, ["Haldi", "Mehndi"]);
  const out = applyCreatedFolders(names, existing, resolved, [
    { name: "Haldi", id: "f2" },
    { name: "Mehndi", id: "f3" },
  ]);
  assert.equal(out.get("Haldi"), "f2");
  assert.equal(out.get("haldi "), "f2");
  assert.equal(out.get("Mehndi"), "f3");
  assert.equal(out.get("Candids"), "f1");
  assert.equal(out.get("candids"), "f1");
});
