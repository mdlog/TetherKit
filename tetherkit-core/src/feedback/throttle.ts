export interface ThrottleOptions {
  /** Never send more often than this. Default 66 ms (~15 Hz). */
  minIntervalMs?: number;
  /** Send early only if the value moved more than this. Default 0.03. */
  minDelta?: number;
  /** Re-send an unchanged value at least this often. Default 250 ms. */
  heartbeatMs?: number;
}

/**
 * Downstream (host -> controller) rate limiter for continuous values such as
 * EMF intensity. Protects the ordered control channel and the vibration motor
 * from floods while still delivering meaningful changes quickly.
 *
 * Invariant (PBT): two accepted offers are never closer than `minIntervalMs`.
 */
export class FeedbackThrottle {
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private lastValue = Number.NaN;
  private readonly minInterval: number;
  private readonly minDelta: number;
  private readonly heartbeat: number;

  constructor(options: ThrottleOptions = {}) {
    this.minInterval = options.minIntervalMs ?? 66;
    this.minDelta = options.minDelta ?? 0.03;
    this.heartbeat = options.heartbeatMs ?? 250;
  }

  /**
   * @param now monotonic timestamp in ms
   * @param value current value
   * @param force send as soon as the interval allows (e.g. phase changed)
   * @returns true if the caller should send now
   */
  offer(now: number, value: number, force = false): boolean {
    if (!Number.isFinite(now)) return false;
    const elapsed = now - this.lastSentAt;
    if (elapsed < this.minInterval) return false;
    const changed = Number.isNaN(this.lastValue) || Math.abs(value - this.lastValue) > this.minDelta;
    if (!force && !changed && elapsed < this.heartbeat) return false;
    this.lastSentAt = now;
    this.lastValue = Number.isFinite(value) ? value : 0;
    return true;
  }

  reset(): void {
    this.lastSentAt = Number.NEGATIVE_INFINITY;
    this.lastValue = Number.NaN;
  }
}
