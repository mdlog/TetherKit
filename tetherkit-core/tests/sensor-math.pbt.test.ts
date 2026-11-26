/**
 * Property-based tests for sensor math.
 * Spec: .kiro/specs/tether-protocol/design.md — Correctness Properties P1–P4.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OneEuroFilter, orientationToPose, wrapDeltaDegrees } from '../src/sensors/math';
import { SensorPipeline } from '../src/sensors/pipeline';
import { TouchTrackpad } from '../src/sensors/touch';

const angle360 = fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true });
// Keep away from straight up/down where heading is undefined (pose returns null).
const beta = fc.double({ min: -85, max: 85, noNaN: true });
const gamma = fc.double({ min: -89, max: 89, noNaN: true });
const anyNumber = fc.oneof(
  fc.double(),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, 359.999, 360, -360, 1e308),
);
const inRange = (x: number) => Number.isFinite(x) && x >= -1 && x <= 1;

describe('P1 Angle Wrapping Bounds', () => {
  it('wrapDeltaDegrees(a, b) is in [-180, 180) for angles in [0, 360)', () => {
    fc.assert(
      fc.property(angle360, angle360, (a, b) => {
        const d = wrapDeltaDegrees(a, b);
        expect(d).toBeGreaterThanOrEqual(-180);
        expect(d).toBeLessThan(180);
      }),
    );
  });

  it('wrapDeltaDegrees(a, a) === 0', () => {
    fc.assert(fc.property(angle360, (a) => wrapDeltaDegrees(a, a) === 0));
  });

  it('is the shortest rotation: origin + delta lands on current (mod 360)', () => {
    fc.assert(
      fc.property(angle360, angle360, (a, b) => {
        const d = wrapDeltaDegrees(a, b);
        const landed = (((b + d - a) % 360) + 360) % 360;
        expect(Math.min(landed, 360 - landed)).toBeLessThan(1e-6);
      }),
    );
  });

  it('never returns NaN/Infinity, whatever the input', () => {
    fc.assert(
      fc.property(anyNumber, anyNumber, (a, b) => {
        const d = wrapDeltaDegrees(a, b);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(-180);
        expect(d).toBeLessThan(180);
      }),
    );
  });
});

describe('P2 Calibration Identity', () => {
  it('processing the calibration sample yields exactly (0, 0, 0)', () => {
    fc.assert(
      fc.property(angle360, beta, gamma, (alpha, b, g) => {
        const pipeline = new SensorPipeline();
        const sample = { alpha, beta: b, gamma: g };
        expect(pipeline.calibrate(sample)).toBe(true);
        const out = pipeline.process(sample);
        expect(out).toEqual({ nx: 0, ny: 0, roll: 0 });
      }),
    );
  });

  it('recenter after arbitrary motion re-zeroes the output', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ alpha: angle360, beta, gamma }), { minLength: 1, maxLength: 30 }),
        (samples) => {
          const pipeline = new SensorPipeline();
          for (const s of samples) pipeline.process(s);
          const last = samples[samples.length - 1]!;
          pipeline.calibrate();
          expect(pipeline.process(last)).toEqual({ nx: 0, ny: 0, roll: 0 });
        },
      ),
    );
  });
});

describe('P3 Normalized Output Clamp', () => {
  it('gyro pipeline output is always finite and within [-1, 1]', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ alpha: anyNumber, beta: anyNumber, gamma: anyNumber }), { maxLength: 60 }),
        fc.boolean(),
        (samples, recenterMidway) => {
          const pipeline = new SensorPipeline();
          samples.forEach((s, i) => {
            if (recenterMidway && i === samples.length >> 1) pipeline.calibrate();
            const out = pipeline.process(s);
            expect(inRange(out.nx) && inRange(out.ny) && inRange(out.roll)).toBe(true);
          });
        },
      ),
    );
  });

  it('touch trackpad output is always finite and within [-1, 1]', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(anyNumber, anyNumber, anyNumber), { maxLength: 80 }), (moves) => {
        const pad = new TouchTrackpad();
        for (const [dx, dy, ref] of moves) {
          const out = pad.move(dx, dy, ref);
          expect(inRange(out.nx) && inRange(out.ny) && out.roll === 0).toBe(true);
        }
      }),
    );
  });

  it('orientationToPose returns finite angles or null, never NaN', () => {
    fc.assert(
      fc.property(anyNumber, anyNumber, anyNumber, (a, b, g) => {
        const pose = orientationToPose(a, b, g);
        if (pose) {
          expect(Number.isFinite(pose.yaw) && Number.isFinite(pose.pitch) && Number.isFinite(pose.roll)).toBe(true);
        }
      }),
    );
  });
});

describe('P4 No jump across the 0/360 boundary', () => {
  it('a small real rotation gives a small output, even when alpha wraps', () => {
    fc.assert(
      fc.property(angle360, fc.double({ min: -20, max: 20, noNaN: true }), (alpha0, delta) => {
        // filter off / deadzone 0 exposes the raw mapping.
        const pipeline = new SensorPipeline({ filter: false, deadzone: 0, yawRangeDeg: 35 });
        pipeline.calibrate({ alpha: alpha0, beta: 0, gamma: 0 });
        const turned = (((alpha0 + delta) % 360) + 360) % 360;
        const out = pipeline.process({ alpha: turned, beta: 0, gamma: 0 });
        // alpha grows counter-clockwise, so turning right (negative delta) is +nx.
        expect(Math.abs(out.nx - -delta / 35)).toBeLessThan(1e-6);
        expect(Math.abs(out.ny)).toBeLessThan(1e-6);
      }),
    );
  });
});

describe('P11 One Euro filter', () => {
  const unitValue = fc.double({ min: -1, max: 1, noNaN: true });

  it('output stays within the range of its inputs, whatever the timestamps', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(unitValue, anyNumber), { minLength: 1, maxLength: 200 }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 50, noNaN: true }),
        (samples, minCutoff, beta) => {
          const filter = new OneEuroFilter({ minCutoff, beta });
          let lo = 0;
          let hi = 0; // initial value is 0
          for (const [x, t] of samples) {
            lo = Math.min(lo, x);
            hi = Math.max(hi, x);
            const out = filter.push(x, t);
            expect(Number.isFinite(out)).toBe(true);
            expect(out).toBeGreaterThanOrEqual(lo - 1e-12);
            expect(out).toBeLessThanOrEqual(hi + 1e-12);
          }
        },
      ),
    );
  });

  it('settles on a held value within one second at 60 Hz', () => {
    fc.assert(
      fc.property(unitValue, unitValue, (start, target) => {
        const filter = new OneEuroFilter({}, start);
        let out = start;
        for (let i = 1; i <= 60; i++) out = filter.push(target, i * (1000 / 60));
        // Within the deadzone (0.0015) plus a small residual.
        expect(Math.abs(out - target)).toBeLessThan(0.01);
      }),
    );
  });

  it('follows a fast wrist turn with less lag than the old fixed EMA (alpha 0.35)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1.5, max: 4, noNaN: true }), (speed) => {
        const filter = new OneEuroFilter();
        let ema = 0;
        let out = 0;
        let x = 0;
        for (let i = 1; i <= 15; i++) {
          x = Math.min(1, speed * (i / 60));
          out = filter.push(x, i * (1000 / 60));
          ema = 0.35 * x + 0.65 * ema;
        }
        expect(Math.abs(x - out)).toBeLessThan(Math.abs(x - ema));
      }),
    );
  });
});
