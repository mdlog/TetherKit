/**
 * Pure, framework-free game rules for phantom-beam (no Three.js, no DOM).
 * The engine calls `stepGame` once per frame with the flashlight direction.
 * Spec: .kiro/specs/phantom-beam/requirements.md (FR-PHAN-01..05, Req 7).
 */
import { clamp, clamp01 } from 'tetherkit-core';
import type { PhantomSync } from '../../shared/phantom-protocol';
import { alignment, computeEmf } from './emf';
import type { AimInput, GameEvent, GameState, Ghost, GhostKind, SpawnSlot, Vec3 } from './types';

export const SESSION_SEC = 60;
export const EYE_HEIGHT = 1.6;
/** Eye position at the corridor entrance (where every hunt starts). */
export const CAMERA: Vec3 = { x: 0, y: EYE_HEIGHT, z: 0 };
/** A new lock requires the ghost to be within 10° of the exact beam centre. */
export const LOCK_ACQUIRE_DEG = 10;
export const LOCK_COS = Math.cos((LOCK_ACQUIRE_DEG * Math.PI) / 180);
/** Once acquired, keep the lock within 14° so normal hand tremor does not flicker it. */
export const LOCK_HOLD_DEG = 14;
export const LOCK_HOLD_COS = Math.cos((LOCK_HOLD_DEG * Math.PI) / 180);

export function isLockAligned(cosTheta: number, alreadyLocked: boolean): boolean {
  return Number.isFinite(cosTheta) && cosTheta > (alreadyLocked ? LOCK_HOLD_COS : LOCK_COS);
}

/** Fully inside the visible beam. */
export const REVEAL_COS = 0.9;
/** Outer edge of the beam. */
export const EDGE_COS = 0.8;
/** UV Surge must be held on a locked ghost this long. */
export const BANISH_SEC = 2;
export const TOUCH_DISTANCE = 1.6;
export const TOUCH_DRAIN_PER_SEC = 20;
export const MAX_ACTIVE = 2;
/** Auto-walk: full speed in an empty corridor, slower as EMF rises, stopped by UV Surge or contact. */
export const WALK_SPEED = 1.0;
/** How far the player can advance before the corridor's far door (m). */
export const MAX_WALK = 38;
const WALK_EMF_BRAKE = 0.5;
const WALK_ACCEL = 2.5;
const CORRIDOR_HALF_WIDTH = 2.6;
const WRAITH_SPEED = 0.7;
const WRAITH_LIT_SPEED = 0.3;
const MIMIC_SPEED = 0.5;
const MIMIC_LATERAL_SPEED = 2.2;
const MIMIC_DODGE_SPEED = 9;
const MIMIC_DODGE_AFTER_SEC = 0.9;
const WRAITH_SPAWN_AHEAD = 24;
const MIMIC_SPAWN_AHEAD = 18;

const SPAWN_PLAN: SpawnSlot[] = [
  { kind: 'wraith', at: 1 },
  { kind: 'mimic', at: 9 },
  { kind: 'wraith', at: 20 },
  { kind: 'mimic', at: 31 },
];

export function createGame(): GameState {
  return {
    phase: 'lobby',
    lostReason: null,
    elapsed: 0,
    timeLeft: SESSION_SEC,
    sanity: 100,
    score: 0,
    total: SPAWN_PLAN.length,
    banished: 0,
    ghosts: [],
    queue: SPAWN_PLAN.map((slot) => ({ ...slot })),
    nextId: 1,
    quietFor: 0,
    emf: 0,
    lockedId: null,
    progress: 0,
    uvActive: false,
    touching: false,
    playerZ: 0,
    walkSpeed: 0,
  };
}

/** Resets everything and starts a fresh 60-second hunt at the corridor entrance. */
export function startGame(state: GameState): void {
  Object.assign(state, createGame(), { phase: 'playing' as const });
}

/** Where the player's eyes (and the flashlight) are right now. */
export function eyeOf(state: GameState): Vec3 {
  return { x: 0, y: EYE_HEIGHT, z: state.playerZ };
}

/** Metres walked from the entrance. */
export function walkedOf(state: GameState): number {
  return -state.playerZ;
}

function spawnGhost(state: GameState, kind: GhostKind, rand: () => number): Ghost {
  const laneX = (rand() * 2 - 1) * (kind === 'wraith' ? 2.2 : CORRIDOR_HALF_WIDTH);
  const ahead = kind === 'wraith' ? WRAITH_SPAWN_AHEAD : MIMIC_SPAWN_AHEAD;
  const ghost: Ghost = {
    id: state.nextId++,
    kind,
    pos: { x: laneX, y: kind === 'wraith' ? 1.7 : 1.35, z: state.playerZ - ahead },
    state: 'stalking',
    reveal: 0,
    banish: 0,
    edgeExposure: 0,
    laneX,
    lateralSpeed: MIMIC_LATERAL_SPEED,
    age: 0,
    dissolve: 0,
    cos: 0,
    distance: 99,
  };
  state.ghosts.push(ghost);
  return ghost;
}

function moveGhost(ghost: Ghost, playerZ: number, dt: number, rand: () => number, events: GameEvent[]): void {
  const contactZ = playerZ - TOUCH_DISTANCE;
  if (ghost.state === 'touching') {
    ghost.pos.z = contactZ + Math.sin(ghost.age * 3) * 0.08;
    ghost.pos.x += (0 - ghost.pos.x) * (1 - Math.exp(-dt * 1.5));
    return;
  }
  if (ghost.kind === 'wraith') {
    // Stalker Wraith: drifts toward the player, flinches (slows) when lit.
    ghost.pos.z += (ghost.reveal > 0.5 ? WRAITH_LIT_SPEED : WRAITH_SPEED) * dt;
    ghost.pos.x = clamp(ghost.laneX + Math.sin(ghost.age * 0.9) * 0.9, -CORRIDOR_HALF_WIDTH, CORRIDOR_HALF_WIDTH);
    ghost.pos.y = 1.7 + Math.sin(ghost.age * 1.7) * 0.12;
  } else {
    // Shadow Mimic: strafes between walls; dodges if it sits in the beam's edge too long.
    const inEdge = ghost.cos > EDGE_COS && ghost.cos <= LOCK_COS;
    ghost.edgeExposure = inEdge ? ghost.edgeExposure + dt : Math.max(0, ghost.edgeExposure - dt * 0.5);
    if (ghost.edgeExposure > MIMIC_DODGE_AFTER_SEC) {
      ghost.laneX = (ghost.pos.x > 0 ? -1 : 1) * (1.4 + rand() * 1.2);
      ghost.lateralSpeed = MIMIC_DODGE_SPEED;
      ghost.edgeExposure = 0;
      events.push({ type: 'dodge', id: ghost.id });
    }
    const dx = ghost.laneX - ghost.pos.x;
    ghost.pos.x += Math.sign(dx) * Math.min(Math.abs(dx), ghost.lateralSpeed * dt);
    if (Math.abs(dx) < 0.05) {
      ghost.laneX = (rand() * 2 - 1) * CORRIDOR_HALF_WIDTH;
      ghost.lateralSpeed = MIMIC_LATERAL_SPEED;
    }
    ghost.pos.z += MIMIC_SPEED * dt;
    ghost.pos.y = 1.35 + Math.sin(ghost.age * 2.3) * 0.06;
  }
  if (ghost.pos.z > contactZ) {
    ghost.pos.z = contactZ;
    ghost.state = 'touching';
    events.push({ type: 'touch-start', id: ghost.id, kind: ghost.kind });
  }
}

/** Advances the simulation by `dt` seconds. Mutates `state`; returns what happened. */
export function stepGame(state: GameState, input: AimInput, dt: number, rand: () => number = Math.random): GameEvent[] {
  const events: GameEvent[] = [];
  const step = clamp(dt, 0, 0.1, 0);

  for (const ghost of state.ghosts) {
    if (ghost.state === 'banished') ghost.dissolve = Math.min(1, ghost.dissolve + step / 1.2);
  }
  state.ghosts = state.ghosts.filter((g) => !(g.state === 'banished' && g.dissolve >= 1));

  if (state.phase !== 'playing') {
    state.emf *= Math.exp(-step * 4);
    state.uvActive = false;
    state.touching = false;
    state.lockedId = null;
    state.progress = 0;
    state.walkSpeed = 0;
    return events;
  }

  state.elapsed += step;
  state.timeLeft = Math.max(0, SESSION_SEC - state.elapsed);
  state.uvActive = input.uvHeld;

  // Spawning: follow the plan, but pull the next ghost forward when the corridor is quiet.
  let active = state.ghosts.filter((g) => g.state !== 'banished');
  state.quietFor = active.length === 0 ? state.quietFor + step : 0;
  const next = state.queue[0];
  if (next && active.length < MAX_ACTIVE && (state.elapsed >= next.at || (active.length === 0 && state.quietFor > 1.2))) {
    state.queue.shift();
    const ghost = spawnGhost(state, next.kind, rand);
    events.push({ type: 'spawn', id: ghost.id, kind: ghost.kind });
    active = [...active, ghost];
  }

  // Perception from where the player stands: reveal, lock candidate, EMF.
  const eye = eyeOf(state);
  let lock: Ghost | null = null;
  let emf = 0;
  for (const ghost of active) {
    ghost.age += step;
    const { cos, distance } = alignment(input.dir, eye, ghost.pos);
    ghost.cos = cos;
    ghost.distance = distance;
    // Far ghosts sit deep in the fog: they can only be revealed (and locked) within ~20 m.
    const fog = Math.max(0.2, clamp01((26 - distance) / 10));
    let target = (cos > REVEAL_COS ? 1 : cos > EDGE_COS ? 0.3 : 0) * fog;
    if (input.uvHeld && cos > EDGE_COS) target = Math.min(1, target + 0.2);
    ghost.reveal += (target - ghost.reveal) * (1 - Math.exp(-step * 6));
    const wasLocked = ghost.id === state.lockedId;
    const canAcquire = isLockAligned(cos, wasLocked) && ghost.reveal > 0.55;
    // Keep the previous target while it remains inside the wider hold cone; a new ghost cannot steal it.
    if (canAcquire && (wasLocked || !lock || (lock.id !== state.lockedId && cos > lock.cos))) lock = ghost;
    emf = Math.max(emf, computeEmf(distance, cos));
  }

  // UV Surge: progress only on the locked ghost while the button is held.
  for (const ghost of active) {
    if (ghost === lock && input.uvHeld) ghost.banish = Math.min(1, ghost.banish + step / BANISH_SEC);
    else ghost.banish = Math.max(0, ghost.banish - step * 0.35);
  }

  // Auto-walk first (so ghosts are then placed relative to the new position). Ease toward the
  // target speed; never walk while UV Surge is held or something is already touching you.
  const blocked = input.uvHeld || active.some((g) => g.state === 'touching') || walkedOf(state) >= MAX_WALK;
  const targetSpeed = blocked ? 0 : WALK_SPEED * (1 - WALK_EMF_BRAKE * emf);
  state.walkSpeed = blocked ? 0 : state.walkSpeed + (targetSpeed - state.walkSpeed) * (1 - Math.exp(-step * WALK_ACCEL));
  state.playerZ = Math.max(-MAX_WALK, state.playerZ - state.walkSpeed * step);

  for (const ghost of active) {
    const pinned = ghost === lock && input.uvHeld && ghost.banish > 0;
    if (!pinned) moveGhost(ghost, state.playerZ, step, rand, events);
  }

  for (const ghost of active) {
    if (ghost.banish >= 1 && ghost.state !== 'banished') {
      ghost.state = 'banished';
      state.banished++;
      state.score += 100 + Math.round(state.timeLeft);
      events.push({ type: 'banished', id: ghost.id, kind: ghost.kind, pos: { ...ghost.pos } });
    }
  }
  const touchingCount = active.filter((g) => g.state === 'touching').length;

  state.sanity = Math.max(0, state.sanity - touchingCount * TOUCH_DRAIN_PER_SEC * step);
  state.emf = emf;
  state.lockedId = lock && lock.state !== 'banished' ? lock.id : null;
  state.progress = lock && lock.state !== 'banished' ? lock.banish : 0;
  state.touching = touchingCount > 0;

  if (state.banished >= state.total) {
    state.phase = 'won';
    state.score += Math.round(state.sanity) * 2 + Math.ceil(state.timeLeft) * 5 + Math.round(walkedOf(state)) * 3;
    state.walkSpeed = 0;
    events.push({ type: 'won' });
  } else if (state.sanity <= 0) {
    state.phase = 'lost';
    state.lostReason = 'sanity';
    state.walkSpeed = 0;
    events.push({ type: 'lost', reason: 'sanity' });
  } else if (state.timeLeft <= 0) {
    state.phase = 'lost';
    state.lostReason = 'time';
    state.walkSpeed = 0;
    events.push({ type: 'lost', reason: 'time' });
  }
  return events;
}

/** Compact HUD / phone view of the game (scare fields are filled in by the host app). */
export function snapshot(state: GameState): PhantomSync {
  return {
    phase: state.phase,
    lostReason: state.lostReason,
    timeLeft: Math.round(state.timeLeft * 10) / 10,
    sanity: Math.round(state.sanity),
    score: state.score,
    banished: state.banished,
    total: state.total,
    progress: Math.round(state.progress * 100) / 100,
    locked: state.lockedId !== null,
    touching: state.touching,
    depth: Math.round(walkedOf(state)),
    walking: state.walkSpeed > 0.05,
    scare: 0,
    scareKind: 'wraith',
    scares: true,
  };
}
