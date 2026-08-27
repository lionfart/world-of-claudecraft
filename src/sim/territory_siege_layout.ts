import type { TerritorySiegeAction, TerritoryWarSide } from '../world_api';
import type { Collider } from './colliders';
import { DUNGEON_FLOOR_Y, territorySiegeOrigin } from './data';

export const TERRITORY_SIEGE_FLOOR_Y = DUNGEON_FLOOR_Y;
export const TERRITORY_SIEGE_FIELD_HALF_X = 46;
export const TERRITORY_SIEGE_FIELD_HALF_Z = 66;

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
    action === 'deploy_ramp'
      ? { x: 31, z: 8, radius: 10 }
      : action === 'strike_core'
        ? { x: 0, z: -28, radius: 10 }
        : action === 'deploy_ram'
          ? { x: 0, z: 34, radius: 12 }
          : { x: 0, z: 22, radius: 10 };
  return { x: origin.x + local.x, z: origin.z + local.z, radius: local.radius };
}

/**
 * Static collision shared by sim and renderer. The gate opening is physically
 * open because gate destruction is runtime state; the server-side objective
 * lock still prevents core damage until its gate HP reaches zero.
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
    { type: 'obb', x: 0, z: -28, hw: 8, hd: 7, rot: 0, cameraTopY: y + 12 },
    // Side ramp: authored as a permanent standable prototype surface. Its
    // visibility and objective availability still follow rampDeployed.
    {
      type: 'obb',
      x: 31,
      z: 4,
      hw: 3,
      hd: 12,
      rot: 0,
      moveTopY: wallTop,
      standable: true,
      cameraTopY: wallTop,
      topSlope: { kind: 'ridge', axis: 'x', pitch: 5 / 12, eaveY: y },
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
