import { test } from "node:test";
import assert from "node:assert/strict";
import { readShareLang, saveShareLang, SHARE_LANG_KEY } from "./share-lang-store.ts";

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), data };
};

test("defaults to English, remembers a language, and ignores a value that is not one of ours", () => {
  const s = memory();
  assert.equal(readShareLang(s), "en");
  saveShareLang("mr", s);
  assert.equal(s.data[SHARE_LANG_KEY], "mr");
  assert.equal(readShareLang(s), "mr");
  assert.equal(readShareLang(memory({ [SHARE_LANG_KEY]: "klingon" })), "en");
});

test("a storage that throws, or none at all, never breaks the page", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("full");
    },
  };
  assert.equal(readShareLang(broken), "en");
  assert.doesNotThrow(() => saveShareLang("hi", broken));
  assert.equal(readShareLang(null), "en");
  assert.doesNotThrow(() => saveShareLang("hi", null));
});
