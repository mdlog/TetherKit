import {
  OneEuroFilter,
  clampUnit,
  normalizeDelta,
  orientationToPose,
  wrapDeltaDegrees,
  type OneEuroOptions,
  type Pose,
} from './math';

export interface OrientationSample {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface NormalizedPose {
  nx: number;
  ny: number;
  roll: number;
}

export interface PipelineOptions extends OneEuroOptions {
  /** Degrees of yaw that map to the full [-1, 1] range. Default 35. */
  yawRangeDeg?: number;
  /** Degrees of pitch that map to the full [-1, 1] range. Default 35. */
  pitchRangeDeg?: number;
  /** Degrees of roll that map to the full [-1, 1] range. Default 45. */
  rollRangeDeg?: number;
  /** Set to false to bypass smoothing (raw mapping, used by tests). Default true. */
  filter?: boolean;
}

/**
 * Gyro pipeline: raw DeviceOrientation -> pose -> relative to calibration
 * origin (Recenter / Zero) -> normalized [-1, 1] -> One Euro smoothing.
 *
 * Invariants (PBT): outputs are always finite and within [-1, 1]; processing
 * the exact sample used for calibration yields nx = ny = roll = 0.
 */
export class SensorPipeline {
  private origin: Pose | null = null;
  private lastPose: Pose | null = null;
  private pendingCalibration = false;
  private readonly yawRange: number;
  private readonly pitchRange: number;
  private readonly rollRange: number;
  private readonly sx: OneEuroFilter;
  private readonly sy: OneEuroFilter;
  private readonly sr: OneEuroFilter;

  constructor(options: PipelineOptions = {}) {
    this.yawRange = options.yawRangeDeg ?? 35;
    this.pitchRange = options.pitchRangeDeg ?? 35;
    this.rollRange = options.rollRangeDeg ?? 45;
    const filterOptions: OneEuroOptions =
      options.filter === false
        ? { minCutoff: Number.POSITIVE_INFINITY, beta: 0, deadzone: options.deadzone ?? 0 }
        : options;
    this.sx = new OneEuroFilter(filterOptions);
    this.sy = new OneEuroFilter(filterOptions);
    this.sr = new OneEuroFilter(filterOptions);
  }

  get calibrated(): boolean {
    return this.origin !== null;
  }

  get output(): NormalizedPose {
    return { nx: this.sx.value, ny: this.sy.value, roll: this.sr.value };
  }

  /**
   * Stores the given sample (or the last seen one) as the zero reference.
   * If no sample has been seen yet, the next valid sample becomes the origin.
   */
  calibrate(sample?: OrientationSample): boolean {
    const pose = sample ? orientationToPose(sample.alpha, sample.beta, sample.gamma) : this.lastPose;
    if (!pose) {
      this.pendingCalibration = true;
      return false;
    }
    this.origin = pose;
    this.lastPose = pose;
    this.pendingCalibration = false;
    this.sx.reset();
    this.sy.reset();
    this.sr.reset();
    return true;
  }

  /**
   * @param sample raw DeviceOrientation angles
   * @param timeMs sample time in ms (use `event.timeStamp`); drives the adaptive filter
   */
  process(sample: OrientationSample, timeMs: number = performance.now()): NormalizedPose {
    const pose = orientationToPose(sample.alpha, sample.beta, sample.gamma);
    if (!pose) return this.output;
    this.lastPose = pose;
    if (!this.origin || this.pendingCalibration) {
      this.calibrate(sample);
      return this.output;
    }
    const nx = normalizeDelta(wrapDeltaDegrees(pose.yaw, this.origin.yaw), this.yawRange);
    const ny = normalizeDelta(pose.pitch - this.origin.pitch, this.pitchRange);
    const roll = normalizeDelta(wrapDeltaDegrees(pose.roll, this.origin.roll), this.rollRange);
    return {
      nx: clampUnit(this.sx.push(nx, timeMs)),
      ny: clampUnit(this.sy.push(ny, timeMs)),
      roll: clampUnit(this.sr.push(roll, timeMs)),
    };
  }

  reset(): void {
    this.origin = null;
    this.lastPose = null;
    this.pendingCalibration = false;
    this.sx.reset();
    this.sy.reset();
    this.sr.reset();
  }
}
