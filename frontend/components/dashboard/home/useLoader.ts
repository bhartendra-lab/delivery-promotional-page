"use client";

import { useCallback, useEffect, useState } from "react";

export type Loaded<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: T };

/**
 * One Dashboard block's own request: loads on mount, keeps what it has while it
 * reloads, and reports its own failure, so a block that fails shows its own
 * message and Try again and never blanks the others.
 */
export function useLoader<T>(load: () => Promise<T>): { state: Loaded<T>; reload: () => void } {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const run = useCallback(() => {
    let live = true;
    load()
      .then((data) => live && setState({ status: "ok", data }))
      .catch((err) => live && setState({ status: "error", message: err instanceof Error ? err.message : "Could not load this" }));
    return () => {
      live = false;
    };
  }, [load]);
  useEffect(() => run(), [run]);
  const reload = useCallback(() => {
    // A reload keeps the numbers on screen (no flash back to a skeleton); only a failure replaces them.
    run();
  }, [run]);
  return { state, reload };
}

/** The same small error line every block uses. */
export function errorText(message: string): string {
  return message || "Could not load this.";
}
