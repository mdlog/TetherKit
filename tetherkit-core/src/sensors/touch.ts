import { clampUnit } from './math';
import type { NormalizedPose } from './pipeline';

export interface TrackpadOptions {
  /** Full pad width of travel maps to this much of the [-1, 1] range. Default 1.8. */
  sensitivity?: number;
}

/**
 * Touch Trackpad fallback: relative pointer deltas accumulate into a clamped
 * (nx, ny) position. Used when gyro permission is denied, unavailable, or the
 * page runs inside an in-app WebView.
 */
export class TouchTrackpad {
  private x = 0;
  private y = 0;
  private readonly sensitivity: number;

  constructor(options: TrackpadOptions = {}) {
    this.sensitivity = options.sensitivity ?? 1.8;
  }

  get output(): NormalizedPose {
    return { nx: this.x, ny: this.y, roll: 0 };
  }

  /**
   * @param dxPx horizontal pointer delta in CSS pixels (+ right)
   * @param dyPx vertical pointer delta in CSS pixels (+ down, DOM convention)
   * @param refPx reference size of the pad (usually its width)
   */
  move(dxPx: number, dyPx: number, refPx: number): NormalizedPose {
    if (!Number.isFinite(dxPx) || !Number.isFinite(dyPx) || !(refPx > 0) || !Number.isFinite(refPx)) {
      return this.output;
    }
    const scale = this.sensitivity / refPx;
    this.x = clampUnit(this.x + dxPx * scale);
    this.y = clampUnit(this.y - dyPx * scale);
    return this.output;
  }

  set(nx: number, ny: number): void {
    this.x = clampUnit(nx);
    this.y = clampUnit(ny);
  }

  reset(): void {
    this.x = 0;
    this.y = 0;
  }
}
