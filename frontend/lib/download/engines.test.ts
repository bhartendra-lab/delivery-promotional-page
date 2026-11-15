import { test } from "node:test";
import assert from "node:assert/strict";
import { DirectoryRefusedError, runDirectoryDownload, type FsDirHandle } from "./engines.ts";
import type { PlanItem } from "./plan.ts";

const refusal = () =>
  new DOMException(
    "Failed to execute 'getDirectoryHandle' on 'FileSystemDirectoryHandle': The request is not allowed by the user agent or the platform in the current context.",
    "NotAllowedError",
  );

/** An in-memory folder. `refuseFolders` / `refuseFiles` reproduce Samsung
 *  Internet 30's refusals; `written` records "folder/name" of every file. */
function fakeDir({ refuseFolders = false, refuseFiles = false } = {}) {
  const written: string[] = [];
  const make = (path: string): FsDirHandle => ({
    kind: "directory",
    name: path || "Downloads",
    async *entries() {},
    async getDirectoryHandle(name: string) {
      if (refuseFolders) throw refusal();
      return make(`${path}${name}/`);
    },
    async getFileHandle(name: string) {
      if (refuseFiles) throw refusal();
      return {
        kind: "file" as const,
        name,
        getFile: async () => new File([], name),
        createWritable: async () => {
          const stream = new WritableStream<Uint8Array>({
            close() {
              written.push(`${path}${name}`);
            },
          });
          return Object.assign(stream, {
            write: async () => {},
            close: async () => {},
            abort: async () => {},
          }) as unknown as import("./engines.ts").FsWritable;
        },
      };
    },
    async removeEntry() {},
  });
  return { dir: make(""), written };
}

const item = (mediaId: string, name: string, folderName = ""): PlanItem => ({
  mediaId,
  url: `https://media.example/${mediaId}.jpg`,
  needsArchiveUrl: false,
  name,
  folderName,
  bytes: 3,
  bytesEstimated: false,
  degraded: false,
});

const items = [item("a", "DSC_1.jpg", "Haldi"), item("b", "DSC_1.jpg", "Sangeet"), item("c", "DSC_1.jpg")];

function withFakeFetch(run: () => Promise<void>) {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = real;
  });
}

test("photos keep their folders where the browser allows it", () =>
  withFakeFetch(async () => {
    const { dir, written } = fakeDir();
    const result = await runDirectoryDownload({ dir, items, signal: new AbortController().signal });
    assert.equal(result.saved, 3);
    assert.deepEqual(written.sort(), ["DSC_1.jpg", "Haldi/DSC_1.jpg", "Sangeet/DSC_1.jpg"]);
  }));

test("a refused subfolder saves its photos flat, under names that can't collide", () =>
  withFakeFetch(async () => {
    const { dir, written } = fakeDir({ refuseFolders: true });
    const result = await runDirectoryDownload({ dir, items, signal: new AbortController().signal });
    assert.equal(result.saved, 3);
    assert.equal(result.failed, 0);
    assert.deepEqual(written.sort(), ["DSC_1.jpg", "Haldi - DSC_1.jpg", "Sangeet - DSC_1.jpg"]);
  }));

test("a browser that refuses to write files at all stops the run for a ZIP instead", () =>
  withFakeFetch(async () => {
    const { dir } = fakeDir({ refuseFolders: true, refuseFiles: true });
    await assert.rejects(
      runDirectoryDownload({ dir, items, signal: new AbortController().signal }),
      (err: unknown) => err instanceof DirectoryRefusedError && /not allowed/.test(String((err as Error).message)),
    );
  }));
