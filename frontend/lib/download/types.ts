/**
 * Pure download types, split out of capability.ts so plan.ts imports nothing
 * that touches the browser (the mobile app copies plan.ts through its core
 * sync, which refuses browser globals).
 */

export type SaveCapability =
  /** File System Access directory picker: write each file into a chosen folder,
   *  streamed, no ZIP. Peak memory is one file regardless of selection size. */
  | "directory"
  /** File System Access save picker: one ZIP streamed to disk. Also bounded. */
  | "streamZip"
  /** iPhone / iPad with a share sheet that takes files: photos are handed to
   *  the sheet in small sets and saved straight to Photos, no ZIP. */
  | "share"
  /** Neither: a ZIP has to be built in RAM before it can be handed to the
   *  browser, so the selection size is bounded by what the tab can hold. */
  | "memoryZip";
