import type { TerritorySiegeAction, TerritoryWarSide } from '../world_api';
import type { Collider } from './colliders';
import { DUNGEON_FLOOR_Y, territorySiegeOrigin } from './data';

export const TERRITORY_SIEGE_FLOOR_Y = DUNGEON_FLOOR_Y;
export const TERRITORY_SIEGE_FIELD_HALF_X = 46;
export const TERRITORY_SIEGE_FIELD_HALF_Z = 66;
export const TERRITORY_SIEGE_GATE_Z = 18;
export const TERRITORY_SIEGE_GATE_HALF_WIDTH = 10;
export const TERRITORY_SIEGE_CORE_Z = -26;
export const TERRITORY_SIEGE_CORE_ATTACK_RADIUS = 12;
export const TERRITORY_SIEGE_CORE_COLLIDER_RADIUS = 2.8;

/** Stable, separated spawn rows for the first twenty seats on each side. */
export function territorySiegeSpawn(
  slot: number,
  side: TerritoryWarSide,
  seatNo: number,
): { x: number; z: number; facing: number } {
  const origin = territorySiegeOrigin(slot);
  const index = Math.max(0, Math.min(19, Math.floor(seatNo) - 1));
  const column = index % 5;
  const row = Math.floor(index / 5);
  return {
    x: origin.x + (column - 2) * 3.2,
    z: origin.z + (side === 'attacker' ? 48 - row * 3 : -48 + row * 3),
    facing: side === 'attacker' ? Math.PI : 0,
  };
}

export function territorySiegeActionPoint(
  slot: number,
  action: TerritorySiegeAction,
): { x: number; z: number; radius: number } {
  const origin = territorySiegeOrigin(slot);
  const local =
    action === 'start_core_channel'
      ? { x: 0, z: TERRITORY_SIEGE_CORE_Z, radius: TERRITORY_SIEGE_CORE_ATTACK_RADIUS }
      : action === 'stop_core_channel'
        ? { x: 0, z: TERRITORY_SIEGE_CORE_Z, radius: Number.POSITIVE_INFINITY }
        : action === 'deploy_ram'
          ? { x: 0, z: 27, radius: 8 }
          : action === 'leave_ram'
            ? { x: 0, z: 23, radius: Number.POSITIVE_INFINITY }
            : { x: 0, z: 23, radius: 5 };
  return { x: origin.x + local.x, z: origin.z + local.z, radius: local.radius };
}

export function territorySiegeRamSeat(
  slot: number,
  seatNo: number,
): { x: number; z: number; facing: number } {
  const origin = territorySiegeOrigin(slot);
  const positions = [
    { x: -1.5, z: 24.5 },
    { x: 1.5, z: 24.5 },
    { x: -1.5, z: 21.5 },
    { x: 1.5, z: 21.5 },
  ];
  const local = positions[Math.max(0, Math.min(3, Math.floor(seatNo) - 1))];
  return { x: origin.x + local.x, z: origin.z + local.z, facing: Math.PI };
}

export function clampTerritorySiegeGate(
  slot: number,
  gateOpen: boolean,
  fromZ: number,
  x: number,
  z: number,
  radius: number,
): { x: number; z: number } {
  if (gateOpen) return { x, z };
  const origin = territorySiegeOrigin(slot);
  const localX = x - origin.x;
  const gateZ = origin.z + TERRITORY_SIEGE_GATE_Z;
  if (Math.abs(localX) > TERRITORY_SIEGE_GATE_HALF_WIDTH + radius) return { x, z };
  const front = gateZ + 1.4 + radius;
  const back = gateZ - 1.4 - radius;
  if (fromZ >= front && z < front) return { x, z: front };
  if (fromZ <= back && z > back) return { x, z: back };
  if (fromZ > back && fromZ < front) {
    return { x, z: fromZ >= gateZ ? front : back };
  }
  return { x, z };
}

/**
 * Static collision shared by sim and renderer. The gate leaf is dynamic and is
 * enforced by the authoritative movement clamp until gate HP reaches zero.
 */
export function territorySiegeLocalColliders(): Collider[] {
  const y = TERRITORY_SIEGE_FLOOR_Y;
  const wallTop = y + 5;
  return [
    { type: 'obb', x: -34, z: -5, hw: 2, hd: 43, rot: 0, moveTopY: wallTop, cameraTopY: wallTop },
    { type: 'obb', x: 34, z: -5, hw: 2, hd: 43, rot: 0, moveTopY: wallTop, cameraTopY: wallTop },
    { type: 'obb', x: 0, z: -48, hw: 36, hd: 2, rot: 0, moveTopY: wallTop, cameraTopY: wallTop },
    { type: 'obb', x: -22, z: 18, hw: 12, hd: 2, rot: 0, moveTopY: wallTop, cameraTopY: wallTop },
    { type: 'obb', x: 22, z: 18, hw: 12, hd: 2, rot: 0, moveTopY: wallTop, cameraTopY: wallTop },
    { type: 'circle', x: -34, z: 18, r: 4, moveTopY: y + 7, cameraTopY: y + 9 },
    { type: 'circle', x: 34, z: 18, r: 4, moveTopY: y + 7, cameraTopY: y + 9 },
    {
      type: 'circle',
      x: 0,
      z: TERRITORY_SIEGE_CORE_Z,
      r: TERRITORY_SIEGE_CORE_COLLIDER_RADIUS,
      cameraTopY: y + 6.5,
    },
  ];
}

export function territorySiegeBandColliders(): Collider[] {
  const local = territorySiegeLocalColliders();
  const out: Collider[] = [];
  for (let slot = 0; slot < 4; slot += 1) {
    const origin = territorySiegeOrigin(slot);
    for (const collider of local) {
      out.push({ ...collider, x: collider.x + origin.x, z: collider.z + origin.z });
    }
  }
  return out;
}
