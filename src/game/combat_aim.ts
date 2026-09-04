export type CombatAimSource = 'cursor' | 'facing';

export interface CombatAimIntent {
  source: CombatAimSource;
  angle: number;
  pitch: number;
  point: { x: number; z: number } | null;
}

export interface CombatAimInput {
  player: { x: number; z: number };
  facing: number;
  cursorPoint: { x: number; z: number } | null;
  useFacing: boolean;
}

export function normalizeCombatAimAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

export const MAX_COMBAT_AIM_PITCH = Math.PI / 2 - 0.01;
export const LEVEL_COMBAT_CAMERA_PITCH = 0.32;

export function normalizeCombatAimPitch(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_COMBAT_AIM_PITCH, Math.min(MAX_COMBAT_AIM_PITCH, value));
}

function rayElevation(direction: { x: number; y: number; z: number }): number | null {
  const horizontal = Math.hypot(direction.x, direction.z);
  if (!Number.isFinite(horizontal) || !Number.isFinite(direction.y)) return null;
  if (horizontal <= 1e-6 && Math.abs(direction.y) <= 1e-6) return null;
  return Math.atan2(direction.y, horizontal);
}

/**
 * Convert cursor height into projectile pitch without inheriting the chase
 * camera's downward boom angle. The shared action-camera anchor is level at
 * the default camera pitch; moving the camera or cursor above/below it adds a
 * real vertical component while the existing horizontal aim stays unchanged.
 */
export function resolveCombatAimPitch(input: {
  cameraPitch: number;
  cursorRay: { x: number; y: number; z: number } | null;
  anchorRay: { x: number; y: number; z: number } | null;
}): number {
  if (!input.cursorRay || !input.anchorRay) return 0;
  const cursorElevation = rayElevation(input.cursorRay);
  const anchorElevation = rayElevation(input.anchorRay);
  if (cursorElevation === null || anchorElevation === null) return 0;
  return normalizeCombatAimPitch(
    LEVEL_COMBAT_CAMERA_PITCH - input.cameraPitch + cursorElevation - anchorElevation,
  );
}

/**
 * Resolve one frame's directional-combat intent. A missing/degenerate cursor
 * ray deliberately falls back to facing; the previous cursor direction is
 * never retained, so moving the pointer off the usable viewport cannot leave a
 * stale shot armed.
 */
export function resolveCombatAimIntent(input: CombatAimInput): CombatAimIntent {
  if (!input.useFacing && input.cursorPoint) {
    const dx = input.cursorPoint.x - input.player.x;
    const dz = input.cursorPoint.z - input.player.z;
    if (Number.isFinite(dx) && Number.isFinite(dz) && Math.hypot(dx, dz) > 1e-6) {
      return {
        source: 'cursor',
        angle: normalizeCombatAimAngle(Math.atan2(dx, dz)),
        pitch: 0,
        point: input.cursorPoint,
      };
    }
  }
  return {
    source: 'facing',
    angle: normalizeCombatAimAngle(input.facing),
    pitch: 0,
    point: null,
  };
}

export function pointAlongCombatAim(
  origin: { x: number; z: number },
  angle: number,
  distance = 100,
): { x: number; z: number } {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const normalized = normalizeCombatAimAngle(angle);
  return {
    x: origin.x + Math.sin(normalized) * safeDistance,
    z: origin.z + Math.cos(normalized) * safeDistance,
  };
}
