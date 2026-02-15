// ---------------------------------------------------------------------------
// Per-connection rate limiter for WebSocket player actions
// ---------------------------------------------------------------------------

export class WsRateLimiter {
  private timestamps: number[] = [];

  constructor(
    /** Maximum actions allowed within the window */
    private maxActions: number = 10,
    /** Sliding window duration in ms */
    private windowMs: number = 60_000,
  ) {}

  /**
   * Returns true if the action is allowed, false if rate-limited.
   */
  check(): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    this.timestamps = this.timestamps.filter((t) => t > cutoff);

    if (this.timestamps.length >= this.maxActions) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }
}
