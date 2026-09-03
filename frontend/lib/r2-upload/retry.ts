/**
 * Retry policy for individual file uploads and the final metadata save.
 *
 * Backoff: 500ms * 2^attempt, capped at 15s, with ±30% jitter.
 * Max attempts: 5 (i.e. up to 4 retries).
 *
 * Retryable:    network errors (no response), 408, 425, 429, and any 5xx
 * Non-retryable: any other 4xx — likely a signing/CORS/bucket policy issue and
 *                retrying with the same presigned URL won't help. The caller
 *                should re-presign and try again if it wants to recover.
 */

export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

export type RetryClassification = "retryable" | "terminal";

/** HTTP-aware classifier. */
export function classifyHttp(status: number): RetryClassification {
  if (status === 408 || status === 425 || status === 429) return "retryable";
  if (status >= 500 && status < 600) return "retryable";
  return "terminal";
}

/**
 * True when storage rejected a PUT because its presigned URL had already
 * expired — R2 answers 403 with an `ExpiredRequest` body.
 *
 * Worth separating from every other 403: the rest (a bad signature, a bucket
 * policy) genuinely are terminal and retrying the same URL is pointless, which
 * is exactly what `classifyHttp` assumes. An expiry is the one 403 a NEW
 * signature fixes outright, and it is the common failure on a run left in a
 * background tab — browsers throttle background timers to about one tick a
 * minute, so a queued PUT can easily outlive its 900 s window.
 *
 * Duck-typed rather than `instanceof R2PutError` so this stays importable by
 * the unit tests, which cannot resolve the `@/lib` alias.
 */
export function isExpiredPresignError(err: unknown): boolean {
  const e = err as { status?: unknown; body?: unknown } | null;
  return (
    !!e &&
    e.status === 403 &&
    typeof e.body === "string" &&
    e.body.includes("ExpiredRequest")
  );
}

/** Error-object classifier — network errors are retryable; anything else terminal. */
export function classifyError(err: unknown): RetryClassification {
  // Fetch network errors throw TypeError ("Failed to fetch", "Network request failed").
  if (err instanceof TypeError) return "retryable";
  // AbortError is terminal — caller cancelled.
  if (err instanceof DOMException && err.name === "AbortError") return "terminal";
  // Heuristic: messages with "timeout"/"network" hint at retryable.
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("fetch failed")) {
    return "retryable";
  }
  return "terminal";
}

export function backoffMs(attempt: number /* zero-based */): number {
  const base = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  const jitter = base * (Math.random() * 0.6 - 0.3); // ±30%
  return Math.max(0, Math.round(base + jitter));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort);
  });
}

/**
 * Run `task` with the retry policy above. Stops early on terminal errors
 * or when the abort signal fires.
 */
export async function withRetry<T>(
  task: (attempt: number) => Promise<T>,
  opts: {
    classify?: (err: unknown) => RetryClassification;
    maxAttempts?: number;
    signal?: AbortSignal;
    onAttemptError?: (err: unknown, attempt: number, willRetry: boolean) => void;
  } = {},
): Promise<T> {
  const classify = opts.classify ?? classifyError;
  const max = opts.maxAttempts ?? MAX_ATTEMPTS;
  let lastErr: unknown;
  for (let attempt = 0; attempt < max; attempt++) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await task(attempt);
    } catch (err) {
      lastErr = err;
      const verdict = classify(err);
      const willRetry = verdict === "retryable" && attempt < max - 1;
      opts.onAttemptError?.(err, attempt, willRetry);
      if (!willRetry) break;
      await sleep(backoffMs(attempt), opts.signal);
    }
  }
  throw lastErr;
}
