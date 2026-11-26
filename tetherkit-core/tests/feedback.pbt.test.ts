/**
 * Property-based tests for downstream feedback safety.
 * Spec: .kiro/specs/tether-protocol/design.md — Correctness Properties P9–P10.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FeedbackThrottle } from '../src/feedback/throttle';
import { sanitizeVibrationPattern } from '../src/feedback/vibration';

describe('P9 Vibration Sanitizer', () => {
  const entry = fc.oneof(
    fc.integer({ min: -100_000, max: 100_000 }),
    fc.double(),
    fc.string(),
    fc.constant(null),
    fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, -0),
  );
  const input = fc.oneof(fc.array(entry, { maxLength: 200 }), fc.anything(), fc.integer());

  it('always returns <= 10 integer entries in [0, 1000] with total <= 10 000 ms', () => {
    fc.assert(
      fc.property(input, (raw) => {
        const out = sanitizeVibrationPattern(raw);
        expect(out.length).toBeLessThanOrEqual(10);
        for (const ms of out) {
          expect(Number.isInteger(ms)).toBe(true);
          expect(ms).toBeGreaterThanOrEqual(0);
          expect(ms).toBeLessThanOrEqual(1000);
        }
        expect(out.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10_000);
      }),
      { numRuns: 2000 },
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(input, (raw) => {
        const once = sanitizeVibrationPattern(raw);
        expect(sanitizeVibrationPattern(once)).toEqual(once);
      }),
    );
  });

  it('keeps already-valid patterns unchanged', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 10 }), (pattern) => {
        fc.pre(pattern.some((ms) => ms > 0));
        expect(sanitizeVibrationPattern(pattern)).toEqual(pattern);
      }),
    );
  });
});

describe('P10 Feedback throttle (EMF 15 Hz cap)', () => {
  const step = fc.record({
    // Mix uniform integers with doubles: fc.double alone clusters near 0 and rarely crosses 66 ms.
    dt: fc.oneof(fc.integer({ min: 0, max: 200 }), fc.double({ min: 0, max: 200, noNaN: true })),
    value: fc.double({ min: 0, max: 1, noNaN: true }),
    force: fc.boolean(),
  });

  it('never accepts two offers closer than minIntervalMs', () => {
    let runs = 0;
    let runsWithRepeatSends = 0;
    fc.assert(
      fc.property(fc.array(step, { minLength: 20, maxLength: 300 }), (steps) => {
        const throttle = new FeedbackThrottle({ minIntervalMs: 66 });
        let now = 0;
        let lastSent = Number.NEGATIVE_INFINITY;
        let sends = 0;
        for (const { dt, value, force } of steps) {
          now += dt;
          if (throttle.offer(now, value, force)) {
            expect(now - lastSent).toBeGreaterThanOrEqual(66);
            lastSent = now;
            sends++;
          }
        }
        runs++;
        if (sends >= 2) runsWithRepeatSends++;
      }),
    );
    // Non-vacuous: most runs must contain at least two sends, otherwise the interval check never ran.
    expect(runsWithRepeatSends / runs).toBeGreaterThan(0.5);
  });

  it('heartbeat: a 60 Hz caller always gets a send at least every heartbeat + one frame', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 100, maxLength: 400 }), (values) => {
        const throttle = new FeedbackThrottle({ minIntervalMs: 66, heartbeatMs: 250 });
        const frame = 1000 / 60;
        let lastSent = 0;
        values.forEach((value, i) => {
          const now = i * frame;
          if (throttle.offer(now, value)) lastSent = now;
          expect(now - lastSent).toBeLessThanOrEqual(250 + frame + 1e-9);
        });
      }),
    );
  });

  it('a change larger than minDelta is delivered within one interval', () => {
    const throttle = new FeedbackThrottle({ minIntervalMs: 66, minDelta: 0.03 });
    expect(throttle.offer(0, 0.1)).toBe(true);
    expect(throttle.offer(30, 0.9)).toBe(false); // too soon
    expect(throttle.offer(70, 0.9)).toBe(true);
    expect(throttle.offer(140, 0.91)).toBe(false); // tiny change, before heartbeat
  });
});
