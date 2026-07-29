/** Small token bucket for bounded per-connection message processing. */
export class InputRateLimiter {
  private tokens: number;
  private lastRefillMs: number | undefined;

  constructor(
    private readonly ratePerSecond: number,
    private readonly burst: number,
  ) {
    if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0)
      throw new Error("Rate must be positive");
    if (!Number.isInteger(burst) || burst <= 0)
      throw new Error("Burst must be a positive integer");
    this.tokens = burst;
  }

  tryTake(nowMs: number): boolean {
    if (!Number.isFinite(nowMs)) throw new Error("Timestamp must be finite");
    if (this.lastRefillMs === undefined) {
      this.lastRefillMs = nowMs;
    } else {
      const elapsedMs = Math.max(0, nowMs - this.lastRefillMs);
      this.tokens = Math.min(
        this.burst,
        this.tokens + elapsedMs * (this.ratePerSecond / 1_000),
      );
      this.lastRefillMs = nowMs;
    }

    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
