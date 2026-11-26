import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { poweredByUrl } from "./powered-by.ts";

const root = new URL("..", import.meta.url).pathname;

test("the Powered by Vyavasth link is tagged, and keeps what was already on it", () => {
  assert.equal(poweredByUrl(), "https://vyavasth.in/?utm_source=gallery&utm_medium=referral");
  const u = new URL(poweredByUrl("https://vyavasth.in/studios?ref=ABC"));
  assert.equal(u.searchParams.get("ref"), "ABC");
  assert.equal(u.searchParams.get("utm_source"), "gallery");
});

test("the gallery's link uses it and does not pass on the gallery's private address", () => {
  const src = readFileSync(join(root, "components/event/screens/LoungeGallery.tsx"), "utf8");
  const at = src.indexOf("Powered by Vyavasth\n");
  assert.ok(at > 0);
  const block = src.slice(src.lastIndexOf("<a", at), at);
  assert.match(block, /href=\{poweredByUrl\(\)\}/);
  assert.match(block, /rel="noopener noreferrer"/);
});

test("no third-party script or tracker is loaded anywhere on the guest gallery", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(name) && !name.endsWith(".test.ts")) files.push(p);
    }
  };
  for (const d of ["app/(client)", "app/e", "components/event"]) walk(join(root, d));
  assert.ok(files.length > 20, "found the guest files");
  const banned = /posthog|googletagmanager|GoogleTagManager|gtag\(|fbq\(|connect\.facebook|@next\/third-parties|lib\/analytics["'/]/;
  for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), banned, f);
});
