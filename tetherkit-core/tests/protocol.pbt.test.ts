/**
 * Property-based tests for TetherProtocol v1 wire handling.
 * Spec: .kiro/specs/tether-protocol/design.md — Correctness Properties P5–P8.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeMessage, encodeMessage } from '../src/protocol/codec';
import { FrameOrderGuard } from '../src/protocol/seq-guard';
import type { SensorFrame, TetherMessage } from '../src/protocol/types';

const unit = fc.double({ min: -1, max: 1, noNaN: true });

const sensorFrame: fc.Arbitrary<SensorFrame> = fc.record({
  v: fc.constant(1 as const),
  type: fc.constant('sensor' as const),
  seq: fc.nat(),
  ts: fc.double({ min: 0, max: 1e7, noNaN: true }),
  inputSource: fc.constantFrom('gyro' as const, 'touch' as const),
  nx: unit,
  ny: unit,
  roll: unit,
  primaryHeld: fc.boolean(),
});

/** Structural invariants every decoded message must satisfy. */
function assertWellFormed(message: TetherMessage): void {
  expect(message.v).toBe(1);
  const inUnit = (x: number) => Number.isFinite(x) && x >= -1 && x <= 1;
  switch (message.type) {
    case 'sensor':
      expect(Number.isSafeInteger(message.seq) && message.seq >= 0).toBe(true);
      expect(Number.isFinite(message.ts)).toBe(true);
      expect(inUnit(message.nx) && inUnit(message.ny) && inUnit(message.roll)).toBe(true);
      expect(typeof message.primaryHeld).toBe('boolean');
      break;
    case 'feedback':
      if (message.emfIntensity !== undefined) {
        expect(message.emfIntensity >= 0 && message.emfIntensity <= 1).toBe(true);
      }
      if (message.vibratePattern) {
        expect(message.vibratePattern.length).toBeLessThanOrEqual(10);
        expect(message.vibratePattern.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10_000);
      }
      break;
    case 'action':
      expect(message.action).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
      break;
    case 'status':
      if (message.battery !== undefined) expect(message.battery >= 0 && message.battery <= 1).toBe(true);
      break;
    default:
      break;
  }
}

describe('P5 Sensor frame round-trip', () => {
  it('decode(encode(frame)) preserves every field within quantization error', () => {
    fc.assert(
      fc.property(sensorFrame, (frame) => {
        const decoded = decodeMessage(encodeMessage(frame));
        expect(decoded?.type).toBe('sensor');
        const f = decoded as SensorFrame;
        expect(f.seq).toBe(frame.seq);
        expect(f.inputSource).toBe(frame.inputSource);
        expect(f.primaryHeld).toBe(frame.primaryHeld);
        expect(Math.abs(f.nx - frame.nx)).toBeLessThanOrEqual(5e-5 + 1e-12);
        expect(Math.abs(f.ny - frame.ny)).toBeLessThanOrEqual(5e-5 + 1e-12);
        expect(Math.abs(f.roll - frame.roll)).toBeLessThanOrEqual(5e-5 + 1e-12);
        expect(Math.abs(f.ts - frame.ts)).toBeLessThanOrEqual(0.05 + 1e-9);
      }),
    );
  });

  it('a 60 Hz frame stays small on the wire', () => {
    fc.assert(fc.property(sensorFrame, (frame) => encodeMessage(frame).length <= 80));
  });
});

describe('P6 Decoder never throws and only returns well-formed messages', () => {
  const inputs = fc.oneof(
    fc.string(),
    fc.jsonValue().map((value) => JSON.stringify(value)),
    fc.anything(),
    // Near-miss envelopes exercise each validator branch.
    fc
      .record({
        v: fc.oneof(fc.constant(1), fc.integer()),
        type: fc.constantFrom('sensor', 'action', 'feedback', 'hello', 'ack', 'ping', 'pong', 'status', 'nope'),
        seq: fc.oneof(fc.integer(), fc.double()),
        ts: fc.double(),
        nx: fc.double(),
        ny: fc.double(),
        roll: fc.double(),
        primaryHeld: fc.anything(),
        inputSource: fc.constantFrom('gyro', 'touch', 'mouse'),
        action: fc.string(),
        emfIntensity: fc.double(),
        vibratePattern: fc.anything(),
        audioCue: fc.string(),
        syncState: fc.anything(),
        sessionId: fc.string(),
        app: fc.string(),
        id: fc.integer(),
        t: fc.double(),
        calibrated: fc.anything(),
        battery: fc.double(),
      }, { requiredKeys: ['v', 'type'] })
      .map((value) => JSON.stringify(value)),
    fc
      .tuple(fc.constant(1), fc.constant('s'), fc.integer(), fc.double(), fc.integer({ min: -1, max: 2 }), fc.double(), fc.double(), fc.double(), fc.integer({ min: -1, max: 2 }))
      .map((tuple) => JSON.stringify(tuple)),
  );

  it('returns null or a well-formed message for any input', () => {
    fc.assert(
      fc.property(inputs, (raw) => {
        const decoded = decodeMessage(raw);
        if (decoded !== null) assertWellFormed(decoded);
      }),
      { numRuns: 2000 },
    );
  });

  it('rejects oversized payloads', () => {
    expect(decodeMessage(JSON.stringify({ v: 1, type: 'action', action: 'x', payload: 'a'.repeat(5000) }))).toBeNull();
  });
});

describe('P7 Normalization is stable', () => {
  it('after one encode/decode cycle, further cycles change nothing', () => {
    const raw = fc.oneof(
      fc.jsonValue().map((value) => JSON.stringify(value)),
      sensorFrame.map((frame) => JSON.stringify(frame)),
      fc
        .record({
          v: fc.constant(1),
          type: fc.constant('feedback'),
          emfIntensity: fc.double(),
          vibratePattern: fc.array(fc.integer({ min: -5000, max: 5000 }), { maxLength: 20 }),
          audioCue: fc.constantFrom('tick', 'banish', 'warning', 'click', 'boo'),
          syncState: fc.dictionary(fc.string(), fc.jsonValue()),
        })
        .map((value) => JSON.stringify(value)),
    );
    fc.assert(
      fc.property(raw, (input) => {
        const first = decodeMessage(input);
        if (!first) return;
        const second = decodeMessage(encodeMessage(first));
        expect(second).not.toBeNull();
        const third = decodeMessage(encodeMessage(second!));
        expect(third).toEqual(second);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('P8 Monotonic Sequence Guard', () => {
  it('accepted seqs strictly increase and stale frames are always rejected', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.integer({ min: -10, max: 500 }), fc.double()), { maxLength: 200 }), (seqs) => {
        const guard = new FrameOrderGuard();
        let max = -1;
        for (const seq of seqs) {
          const before = guard.lastAcceptedSeq;
          const accepted = guard.accept(seq);
          const shouldAccept = Number.isSafeInteger(seq) && seq >= 0 && seq > max;
          expect(accepted).toBe(shouldAccept);
          if (accepted) max = seq;
          expect(guard.lastAcceptedSeq).toBeGreaterThanOrEqual(before);
          expect(guard.lastAcceptedSeq).toBe(max);
        }
      }),
    );
  });

  it('a shuffled stream never applies a frame older than one already applied', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.nat({ max: 1000 }), { maxLength: 120 }).chain((xs) => fc.shuffledSubarray(xs, { minLength: xs.length })), (stream) => {
        const guard = new FrameOrderGuard();
        const applied: number[] = [];
        for (const seq of stream) if (guard.accept(seq)) applied.push(seq);
        for (let i = 1; i < applied.length; i++) expect(applied[i]!).toBeGreaterThan(applied[i - 1]!);
      }),
    );
  });

  it('reset() starts a new session', () => {
    const guard = new FrameOrderGuard();
    expect(guard.accept(10)).toBe(true);
    expect(guard.accept(3)).toBe(false);
    guard.reset();
    expect(guard.accept(3)).toBe(true);
  });
});
