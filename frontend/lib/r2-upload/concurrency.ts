/**
 * AIMD (Additive Increase / Multiplicative Decrease) concurrency controller.
 *
 * Defaults — tuned for "talking to R2 from a residential connection":
 *   start = 2 (don't blast on the first packet)
 *   max   = 8 (R2 serves PUTs cheaply but the network is usually the bottleneck)
 *   min   = 1
 *   stepUpAfter = 8 consecutive successes → +1 to limit
 *   stepDown    = floor(limit / 2) on error/timeout, never below min
 *
 * The controller does NOT do the scheduling — it just answers "may I start a
 * new upload right now?" and tracks success/error events. The pipeline owns
 * the actual goroutine-style loop.
 */

export type ConcurrencyConfig = {
  start: number;
  max: number;
  min: number;
  /** Successful uploads required between additive +1 steps. */
  stepUpAfter: number;
};

export const DEFAULT_CONCURRENCY: ConcurrencyConfig = {
  start: 2,
  max: 8,
  min: 1,
  stepUpAfter: 8,
};

export class AimdController {
  private limit: number;
  private active = 0;
  private successesSinceLastStepUp = 0;
  private readonly cfg: ConcurrencyConfig;

  constructor(cfg: Partial<ConcurrencyConfig> = {}) {
    this.cfg = { ...DEFAULT_CONCURRENCY, ...cfg };
    this.limit = Math.max(this.cfg.min, Math.min(this.cfg.start, this.cfg.max));
  }

  /** Current allowed parallelism. */
  get currentLimit(): number {
    return this.limit;
  }

  /** May we start one more task right now? */
  canStart(): boolean {
    return this.active < this.limit;
  }

  start(): void {
    this.active++;
  }

  /** Call on a finished task (success). */
  noteSuccess(): void {
    this.active = Math.max(0, this.active - 1);
    this.successesSinceLastStepUp++;
    if (this.successesSinceLastStepUp >= this.cfg.stepUpAfter && this.limit < this.cfg.max) {
      this.limit++;
      this.successesSinceLastStepUp = 0;
    }
  }

  /** Call on a finished task (failure — whether retryable or not). */
  noteFailure(): void {
    this.active = Math.max(0, this.active - 1);
    this.successesSinceLastStepUp = 0;
    const next = Math.max(this.cfg.min, Math.floor(this.limit / 2));
    if (next < this.limit) {
      this.limit = next;
    }
  }

  /**
   * Release a slot for a task that neither succeeded nor failed — e.g. an
   * in-flight PUT aborted by a cancel. Frees the slot without penalising the
   * limit (a user cancel isn't a signal that the network is congested).
   */
  noteAborted(): void {
    this.active = Math.max(0, this.active - 1);
  }

  /**
   * Reset in-flight accounting for a fresh run. The engine instance (and this
   * controller) is reused per-booking across runs; a cancelled run can leave
   * `active` elevated if PUTs were aborted mid-flight, so a new run starts from
   * a clean slate. The learned `limit` is intentionally kept.
   */
  resetActive(): void {
    this.active = 0;
  }

  /** For diagnostics in the UI. */
  snapshot() {
    return {
      limit: this.limit,
      active: this.active,
      max: this.cfg.max,
      min: this.cfg.min,
    };
  }
}
