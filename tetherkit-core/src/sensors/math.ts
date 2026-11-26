/**
 * Pure sensor math. Everything here is deterministic and DOM-free so it can be
 * property-tested (tests/sensor-math.pbt.test.ts).
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Clamp that maps NaN to `fallback` instead of leaking it. */
export function clamp(x: number, min: number, max: number, fallback = min): number {
  if (Number.isNaN(x)) return fallback;
  return x < min ? min : x > max ? max : x;
}

/** Clamp to [-1, 1]; NaN -> 0; also normalizes -0 to +0. */
export function clampUnit(x: number): number {
  return clamp(x, -1, 1, 0) + 0;
}

/** Clamp to [0, 1]; NaN -> 0. */
export function clamp01(x: number): number {
  return clamp(x, 0, 1, 0) + 0;
}

/** Round to a fixed number of decimals (used by the wire codec). */
export function quantize(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f + 0;
}

/**
 * Shortest signed angular distance from `origin` to `current`, in [-180, 180).
 * Crossing the 359 -> 0 boundary never produces a jump.
 */
export function wrapDeltaDegrees(current: number, origin: number): number {
  const diff = current - origin;
  if (!Number.isFinite(diff)) return 0;
  return ((((diff % 360) + 540) % 360) - 180) + 0;
}

/** Maps an angular delta onto [-1, 1] using a comfortable +/- range. */
export function normalizeDelta(deltaDeg: number, rangeDeg: number): number {
  if (!(rangeDeg > 0)) return 0;
  return clampUnit(deltaDeg / rangeDeg);
}

/** Absolute pointing pose of the phone, in degrees. */
export interface Pose {
  /** Heading of the phone's top edge, clockwise from the reference (-180..180). */
  yaw: number;
  /** Elevation of the top edge above the horizon (-90..90). */
  pitch: number;
  /** Twist around the pointing axis; +right side down (-180..180). */
  roll: number;
}

/**
 * Converts W3C DeviceOrientation Euler angles (Z-X'-Y'' intrinsic: alpha, beta,
 * gamma) into a pointing pose for the device's +Y axis (its top edge).
 *
 * Working with direction vectors instead of raw Euler angles avoids the
 * alpha/gamma flips that happen when the phone is tilted steeply (beta ~ 90).
 * Returns null for non-finite input or when the pose is degenerate
 * (pointing straight up/down, where heading is undefined).
 */
export function orientationToPose(alpha: number, beta: number, gamma: number): Pose | null {
  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const a = alpha * DEG;
  const b = beta * DEG;
  const g = gamma * DEG;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cg = Math.cos(g);
  const sg = Math.sin(g);

  // Device +Y (top edge) in world coordinates (x = east, y = north, z = up).
  const fx = -sa * cb;
  const fy = ca * cb;
  const fz = sb;
  // Device +X (right edge) in world coordinates.
  const rx = ca * cg - sa * sb * sg;
  const ry = sa * cg + ca * sb * sg;
  const rz = -cb * sg;

  // Horizontal "right" reference perpendicular to the pointing direction.
  const hLen = Math.hypot(fy, fx);
  if (hLen < 1e-6) return null;
  const hx = fy / hLen;
  const hy = -fx / hLen;
  // "Up" reference perpendicular to the pointing direction: h x f.
  const ux = hy * fz;
  const uy = -hx * fz;
  const uz = hx * fy - hy * fx;

  const yaw = Math.atan2(fx, fy) * RAD;
  const pitch = Math.asin(clamp(fz, -1, 1, 0)) * RAD;
  const roll = -Math.atan2(rx * ux + ry * uy + rz * uz, rx * hx + ry * hy) * RAD;
  return { yaw: yaw + 0, pitch: pitch + 0, roll: roll + 0 };
}

export interface OneEuroOptions {
  /** Cutoff (Hz) when the hand is still: lower = steadier. Default 1.0. */
  minCutoff?: number;
  /** How fast the cutoff rises with speed (per unit/s): higher = less lag. Default 8. */
  beta?: number;
  /** Cutoff (Hz) used to smooth the speed estimate. Default 1.0. */
  derivativeCutoff?: number;
  /** Ignore output changes smaller than this (float noise). Default 0.0015. */
  deadzone?: number;
}

const DEFAULT_DT_SEC = 1 / 60;

function smoothingFactor(cutoffHz: number, dtSec: number): number {
  return 1 / (1 + 1 / (2 * Math.PI * cutoffHz * dtSec));
}

/**
 * One Euro filter (Casiez et al., CHI 2012): an exponential smoother whose
 * cutoff rises with speed. Still hands get heavy smoothing (no tremor), fast
 * wrist turns get almost none (no lag). Each output is a convex combination of
 * the new input and the previous output, so it never leaves their range.
 */
export class OneEuroFilter {
  private current: number;
  private speed = 0;
  private lastTime: number | null = null;
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private readonly deadzone: number;

  constructor(options: OneEuroOptions = {}, initial = 0) {
    this.minCutoff = options.minCutoff ?? 1.0;
    this.beta = options.beta ?? 8;
    this.dCutoff = options.derivativeCutoff ?? 1.0;
    this.deadzone = options.deadzone ?? 0.0015;
    this.current = initial + 0;
  }

  get value(): number {
    return this.current;
  }

  /**
   * @param x new raw value
   * @param timeMs sample timestamp in ms (event.timeStamp / performance.now())
   */
  push(x: number, timeMs: number): number {
    if (!Number.isFinite(x)) return this.current;
    let dt = DEFAULT_DT_SEC;
    if (this.lastTime !== null && Number.isFinite(timeMs)) {
      // Clamp to [1 ms, 100 ms]: duplicate or out-of-order timestamps must not explode the speed.
      dt = clamp((timeMs - this.lastTime) / 1000, 0.001, 0.1, DEFAULT_DT_SEC);
    }
    if (Number.isFinite(timeMs)) this.lastTime = timeMs;

    const rawSpeed = (x - this.current) / dt;
    const ad = smoothingFactor(this.dCutoff, dt);
    this.speed = ad * rawSpeed + (1 - ad) * this.speed;
    const a = smoothingFactor(this.minCutoff + this.beta * Math.abs(this.speed), dt);
    const next = a * x + (1 - a) * this.current;
    // Deadzone on the distance to the input (not on the step size), so the
    // output can never freeze more than `deadzone` away from where the hand is.
    if (Math.abs(x - this.current) >= this.deadzone) this.current = next + 0;
    return this.current;
  }

  reset(value = 0): void {
    this.current = value + 0;
    this.speed = 0;
    this.lastTime = null;
  }
}
