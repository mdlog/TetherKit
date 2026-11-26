import type { LostReason, Phase } from '../../shared/phantom-protocol';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type GhostKind = 'wraith' | 'mimic';
export type GhostState = 'stalking' | 'touching' | 'banished';

export interface Ghost {
  id: number;
  kind: GhostKind;
  pos: Vec3;
  state: GhostState;
  /** 0-1 how visible the ghost is (lit by the beam). */
  reveal: number;
  /** 0-1 UV Surge exorcism progress. */
  banish: number;
  /** Seconds spent in the outer edge of the cone (Shadow Mimic dodges). */
  edgeExposure: number;
  /** Lateral lane target and speed. */
  laneX: number;
  lateralSpeed: number;
  /** Seconds since spawn. */
  age: number;
  /** 0-1 fade-out after banishment (render only). */
  dissolve: number;
  /** Last alignment with the flashlight. */
  cos: number;
  distance: number;
}

export type GameEvent =
  | { type: 'spawn'; id: number; kind: GhostKind }
  | { type: 'banished'; id: number; kind: GhostKind; pos: Vec3 }
  | { type: 'dodge'; id: number }
  | { type: 'touch-start'; id: number; kind: GhostKind }
  | { type: 'won' }
  | { type: 'lost'; reason: Exclude<LostReason, null> };

export interface SpawnSlot {
  kind: GhostKind;
  /** Earliest elapsed second this ghost may appear. */
  at: number;
}

export interface GameState {
  phase: Phase;
  lostReason: LostReason;
  elapsed: number;
  timeLeft: number;
  sanity: number;
  score: number;
  total: number;
  banished: number;
  ghosts: Ghost[];
  queue: SpawnSlot[];
  nextId: number;
  /** Seconds since no ghost was active (used to pull the next spawn forward). */
  quietFor: number;
  emf: number;
  lockedId: number | null;
  progress: number;
  uvActive: boolean;
  touching: boolean;
  /** Player position along the corridor (0 at the entrance, negative = deeper). */
  playerZ: number;
  /** Current walking speed in m/s (0 while UV Surge is held or a ghost touches). */
  walkSpeed: number;
}

export interface AimInput {
  /** Unit flashlight direction. */
  dir: Vec3;
  /** UV Surge button held. */
  uvHeld: boolean;
}
