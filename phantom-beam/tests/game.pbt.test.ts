/**
 * Property-based tests for the pure phantom-beam rules.
 * Spec: .kiro/specs/phantom-beam/design.md — Correctness Properties G1, G3, G4.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aimDirection, computeEmf } from '../src/host/game/emf';
import {
  LOCK_ACQUIRE_DEG,
  LOCK_HOLD_DEG,
  MAX_WALK,
  createGame,
  eyeOf,
  isLockAligned,
  startGame,
  stepGame,
} from '../src/host/game/session';
import type { GameState } from '../src/host/game/types';

const anyNumber = fc.oneof(fc.double(), fc.constantFrom(Number.NaN, Infinity, -Infinity, -0));

describe('G1 EMF formula', () => {
  it('is always within [0, 1]', () => {
    fc.assert(
      fc.property(anyNumber, anyNumber, (d, c) => {
        const emf = computeEmf(d, c);
        expect(emf).toBeGreaterThanOrEqual(0);
        expect(emf).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('never drops when the entity is closer or better aligned', () => {
    const dist = fc.double({ min: 0, max: 60, noNaN: true });
    const cos = fc.double({ min: -1, max: 1, noNaN: true });
    fc.assert(
      fc.property(dist, dist, cos, cos, (d1, d2, c1, c2) => {
        const [near, far] = d1 <= d2 ? [d1, d2] : [d2, d1];
        const [hi, lo] = c1 >= c2 ? [c1, c2] : [c2, c1];
        expect(computeEmf(near, hi)).toBeGreaterThanOrEqual(computeEmf(far, hi));
        expect(computeEmf(near, hi)).toBeGreaterThanOrEqual(computeEmf(near, lo));
      }),
    );
  });
});

/** A step either aims randomly or aims at the nearest ghost (so banishes actually happen). */
// Biased toward aimed, UV-held steps so locks, banishes and endings are actually exercised.
const mostly = fc.integer({ min: 0, max: 9 }).map((n) => n < 8);
const step = fc.record({
  oracle: mostly,
  nx: fc.double({ min: -1, max: 1, noNaN: true }),
  ny: fc.double({ min: -1, max: 1, noNaN: true }),
  uv: mostly,
  // Uniform milliseconds: fc.double() clusters near 0, which would leave game time frozen.
  dt: fc.integer({ min: 0, max: 100 }).map((ms) => ms / 1000),
});

function oracleAim(state: GameState): { nx: number; ny: number } {
  const target = state.ghosts.filter((g) => g.state !== 'banished').sort((a, b) => a.distance - b.distance)[0];
  if (!target) return { nx: 0, ny: 0 };
  const eye = eyeOf(state);
  const dx = target.pos.x - eye.x;
  const dy = target.pos.y - eye.y;
  const dz = target.pos.z - eye.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return {
    nx: Math.max(-1, Math.min(1, (Math.atan2(dx / len, -dz / len) * 180) / Math.PI / 48)),
    ny: Math.max(-1, Math.min(1, (Math.asin(dy / len) * 180) / Math.PI / 28)),
  };
}

describe('G3/G4 game invariants over random play', () => {
  it('banish progress is bounded, only grows under UV on the locked ghost, and phases end once', () => {
    let runsWithBanish = 0;
    fc.assert(
      fc.property(fc.array(step, { minLength: 300, maxLength: 1500 }), fc.integer(), (steps, seed) => {
        let s = seed >>> 0;
        const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
        const state = createGame();
        startGame(state);
        let endings = 0;
        let ended = false;
        for (const st of steps) {
          const aim = st.oracle ? oracleAim(state) : st;
          const before = new Map(state.ghosts.map((g) => [g.id, g.banish]));
          const zBefore = state.playerZ;
          const wasPlaying = state.phase === 'playing';
          const touchingBefore = state.ghosts.some((g) => g.state === 'touching');
          const events = stepGame(state, { dir: aimDirection(aim.nx, aim.ny), uvHeld: st.uv }, st.dt, rand);
          endings += events.filter((e) => e.type === 'won' || e.type === 'lost').length;

          // G6 auto-walk: only forward, never past the far door, and frozen while UV Surge is held or a ghost touches.
          expect(state.playerZ).toBeLessThanOrEqual(zBefore);
          expect(state.playerZ).toBeGreaterThanOrEqual(-MAX_WALK);
          if (st.uv || touchingBefore || !wasPlaying) expect(state.playerZ).toBe(zBefore);
          // Ghosts never get behind the player's contact line.
          for (const ghost of state.ghosts) {
            if (ghost.state !== 'banished') expect(ghost.pos.z).toBeLessThanOrEqual(state.playerZ - 1.6 + 0.08 + 1e-9);
          }

          for (const ghost of state.ghosts) {
            expect(ghost.banish).toBeGreaterThanOrEqual(0);
            expect(ghost.banish).toBeLessThanOrEqual(1);
            const prev = before.get(ghost.id);
            if (prev !== undefined && ghost.banish > prev) {
              expect(st.uv).toBe(true);
              expect(state.lockedId === ghost.id || ghost.state === 'banished').toBe(true);
            }
          }
          expect(state.banished).toBeLessThanOrEqual(state.total);
          expect(state.sanity).toBeGreaterThanOrEqual(0);
          expect(state.sanity).toBeLessThanOrEqual(100);
          expect(state.emf).toBeGreaterThanOrEqual(0);
          expect(state.emf).toBeLessThanOrEqual(1);
          if (ended) expect(state.phase).not.toBe('playing');
          if (state.phase !== 'playing') ended = true;
        }
        expect(endings).toBeLessThanOrEqual(1);
        if (state.banished > 0) runsWithBanish++;
      }),
      { numRuns: 150 },
    );
    // Guard against a vacuous property: random play must actually banish ghosts sometimes.
    expect(runsWithBanish).toBeGreaterThan(15);
  });

  it('G6 an empty corridor is walked at full speed, and walking stops while UV Surge is held', () => {
    const state = createGame();
    startGame(state);
    state.queue = []; // no ghosts
    const straight = aimDirection(0, 0);
    for (let i = 0; i < 300; i++) stepGame(state, { dir: straight, uvHeld: false }, 1 / 60);
    const walked = -state.playerZ;
    expect(walked).toBeGreaterThan(3.5); // ~1 m/s after the ease-in, 5 s
    const z = state.playerZ;
    for (let i = 0; i < 60; i++) stepGame(state, { dir: straight, uvHeld: true }, 1 / 60);
    expect(state.playerZ).toBe(z);
  });
});

describe('G7 precise lock cone with hysteresis', () => {
  const cosDeg = (deg: number) => Math.cos((deg * Math.PI) / 180);

  it('acquires only inside 10° and holds until 14°', () => {
    expect(isLockAligned(cosDeg(9.9), false)).toBe(true);
    expect(isLockAligned(cosDeg(10.1), false)).toBe(false);
    expect(isLockAligned(cosDeg(13.9), true)).toBe(true);
    expect(isLockAligned(cosDeg(14.1), true)).toBe(false);
    expect(LOCK_ACQUIRE_DEG).toBeLessThan(LOCK_HOLD_DEG);
  });

  it('the aligned set is monotonic as aim moves toward the centre', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 180, noNaN: true }),
        fc.double({ min: 0, max: 180, noNaN: true }),
        fc.boolean(),
        (a, b, held) => {
          const near = Math.min(a, b);
          const far = Math.max(a, b);
          if (isLockAligned(cosDeg(far), held)) expect(isLockAligned(cosDeg(near), held)).toBe(true);
        },
      ),
    );
  });
});
