import { clamp01 } from 'tetherkit-core';
import type { Vec3 } from './types';

/** Distance at which a ghost stops contributing the proximity part of EMF. */
export const EMF_RANGE = 22;

/**
 * EMF for one entity (design.md §EMF):
 *   emf = clamp((1 - d) * 0.65 + max(0, cosTheta) * 0.35, 0, 1)
 * where d is the normalized distance (0 near, 1 at EMF_RANGE) and cosTheta is
 * the alignment between the flashlight and the direction to the entity.
 */
export function computeEmf(distance: number, cosTheta: number): number {
  const d = clamp01(distance / EMF_RANGE);
  return clamp01((1 - d) * 0.65 + Math.max(0, cosTheta) * 0.35);
}

/** Flashlight direction from normalized aim. yaw/pitch ranges in degrees. */
export function aimDirection(nx: number, ny: number, yawRangeDeg = 48, pitchRangeDeg = 28): Vec3 {
  const yaw = (nx * yawRangeDeg * Math.PI) / 180;
  const pitch = (ny * pitchRangeDeg * Math.PI) / 180;
  return {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}

/** cos of the angle between `dir` (unit) and the vector from `origin` to `target`. */
export function alignment(dir: Vec3, origin: Vec3, target: Vec3): { cos: number; distance: number } {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-6) return { cos: 1, distance: 0 };
  return { cos: (dir.x * dx + dir.y * dy + dir.z * dz) / distance, distance };
}
