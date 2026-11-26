/** Fixed-size sliding window: at most `limit` hits per `windowMs` for each key (e.g. client IP). */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit; returns false when the key is over its budget. */
  hit(key: string): boolean {
    const t = this.now();
    const list = this.hits.get(key) ?? [];
    while (list.length > 0 && list[0]! <= t - this.windowMs) list.shift();
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    return true;
  }

  /** Drops keys with no hits inside the window (call periodically). */
  prune(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [key, list] of this.hits) {
      if (list.length === 0 || list[list.length - 1]! <= cutoff) this.hits.delete(key);
    }
  }
}

/** Per-connection message budget: refills `ratePerSec`, bursts up to `burst`. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerSec: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.last = now();
  }

  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.ratePerSec);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
