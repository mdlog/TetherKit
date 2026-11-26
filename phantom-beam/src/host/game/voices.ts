import { clamp01, clampUnit } from 'tetherkit-core';
import { eyeOf } from './session';
import type { GameState, GhostKind } from './types';

/** One positional ghost voice for the desktop soundscape. */
export interface GhostVoice {
  id: number;
  kind: GhostKind;
  /** Stereo position: -1 hard left … +1 hard right, relative to where the player looks. */
  pan: number;
  /** 0 (≥ 22 m away) … 1 (in your face). */
  proximity: number;
  /** UV Surge progress on this ghost (voice rises in pitch as it is banished). */
  banish: number;
}

const HEARING_RANGE = 22;

/** How often (per second) a nearby entity creaks, scaled by how close it is. */
export function creakRate(proximity: number): number {
  return proximity <= 0 ? 0 : 0.15 + 1.6 * proximity * proximity;
}

/**
 * Maps active ghosts to stereo voices. `viewYaw` is the camera's horizontal
 * rotation in radians (+ = looking right), so a ghost straight ahead of the
 * beam is centred and one off to the side is heard from that side.
 */
export function ghostVoices(state: GameState, viewYaw: number): GhostVoice[] {
  const eye = eyeOf(state);
  return state.ghosts
    .filter((g) => g.state !== 'banished')
    .map((g) => {
      const dx = g.pos.x - eye.x;
      const dz = g.pos.z - eye.z;
      const angle = Math.atan2(dx, -dz) - (Number.isFinite(viewYaw) ? viewYaw : 0);
      return {
        id: g.id,
        kind: g.kind,
        pan: clampUnit(Math.sin(angle) * 1.4),
        proximity: clamp01(1 - Math.hypot(dx, g.pos.y - eye.y, dz) / HEARING_RANGE),
        banish: clamp01(g.banish),
      };
    });
}
