import type { OrientationSample } from './pipeline';

/**
 * Thin adapter over `deviceorientation`. Ignores events with null angles
 * (desktop browsers often fire one of those) and reports whether real data
 * ever arrived so callers can fall back to the Touch Trackpad.
 */
export class OrientationSource {
  private handler: ((event: DeviceOrientationEvent) => void) | null = null;
  private gotData = false;
  private waiters: Array<(ok: boolean) => void> = [];

  get receiving(): boolean {
    return this.gotData;
  }

  /** `onSample` receives the angles plus the event time in ms (same clock as performance.now()). */
  start(onSample: (sample: OrientationSample, timeMs: number) => void): void {
    if (this.handler || typeof window === 'undefined') return;
    this.handler = (event) => {
      if (event.beta == null || event.gamma == null) return;
      const sample = { alpha: event.alpha ?? 0, beta: event.beta, gamma: event.gamma };
      if (!this.gotData) {
        this.gotData = true;
        for (const resolve of this.waiters.splice(0)) resolve(true);
      }
      onSample(sample, event.timeStamp > 0 ? event.timeStamp : performance.now());
    };
    window.addEventListener('deviceorientation', this.handler);
  }

  /** Resolves true as soon as a valid sample arrives, false after `timeoutMs`. */
  waitForData(timeoutMs: number): Promise<boolean> {
    if (this.gotData) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        resolve(false);
      }, timeoutMs);
      const done = (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok);
      };
      this.waiters.push(done);
    });
  }

  stop(): void {
    if (this.handler) window.removeEventListener('deviceorientation', this.handler);
    this.handler = null;
    this.gotData = false;
    for (const resolve of this.waiters.splice(0)) resolve(false);
  }
}
