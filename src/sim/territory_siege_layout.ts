import type { TerritorySiegeAction, TerritoryWarSide } from '../world_api';
import type { Collider } from './colliders';
import { DUNGEON_FLOOR_Y, territorySiegeOrigin } from './data';
import {
  TERRITORY_SIEGE_HOMES,
  TERRITORY_SIEGE_ROCKS,
  TERRITORY_SIEGE_TREES,
} from './territory_siege_environment';

export {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
} from './territory_siege_ground';

import {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
} from './territory_siege_ground';

export const TERRITORY_SIEGE_FLOOR_Y = DUNGEON_FLOOR_Y;
export const TERRITORY_SIEGE_GATE_Z = 18;
export const TERRITORY_SIEGE_GATE_HALF_WIDTH = 10;
export const TERRITORY_SIEGE_WALL_HALF_X = 44;
export const TERRITORY_SIEGE_BACK_WALL_Z = -72;
export const TERRITORY_SIEGE_TOWER_X = TERRITORY_SIEGE_WALL_HALF_X;
export const TERRITORY_SIEGE_TOWER_Z = TERRITORY_SIEGE_GATE_Z;
// Covers the gate and a useful slice of the approach instead of merely touching
// the gate centre at one tangent point. The attacker spawn row remains safe.
export const TERRITORY_SIEGE_TOWER_RANGE = 58;
export const TERRITORY_SIEGE_CORE_Z = -42;
export const TERRITORY_SIEGE_CORE_ATTACK_RADIUS = 12;
export const TERRITORY_SIEGE_CORE_COLLIDER_RADIUS = 2.8;

export type TerritorySiegeWallRun = 'left' | 'right' | 'back' | 'front_left' | 'front_right';

export interface TerritorySiegeWallPlacement {
  run: TerritorySiegeWallRun;
  x: number;
  z: number;
  /** The source wall is two units long on local X, so this is also its half-length. */
  scaleX: number;
  yaw: number;
}

const WALL_SEAM_OVERLAP = 0.24;

function wallRunX(
  run: TerritorySiegeWallRun,
  z: number,
  startX: number,
  endX: number,
  count: number,
  yaw: number,
): TerritorySiegeWallPlacement[] {
  const step = (endX - startX) / count;
  return Array.from({ length: count }, (_, index) => ({
    run,
    x: startX + step * (index + 0.5),
    z,
    scaleX: (step + WALL_SEAM_OVERLAP) / 2,
    yaw,
  }));
}

function wallRunZ(
  run: TerritorySiegeWallRun,
  x: number,
  startZ: number,
  endZ: number,
  count: number,
  yaw: number,
): TerritorySiegeWallPlacement[] {
  const step = (endZ - startZ) / count;
  return Array.from({ length: count }, (_, index) => ({
    run,
    x,
    z: startZ + step * (index + 0.5),
    scaleX: (step + WALL_SEAM_OVERLAP) / 2,
    yaw,
  }));
}

/**
 * A closed, grid-snapped visual perimeter. Opposing runs face opposite ways,
 * and the tiny deliberate overlap removes daylight between modular pieces.
 */
export function territorySiegeWallPlacements(): readonly TerritorySiegeWallPlacement[] {
  const outside = TERRITORY_SIEGE_WALL_HALF_X + 2;
  return [
    ...wallRunZ(
      'left',
      -TERRITORY_SIEGE_WALL_HALF_X,
      TERRITORY_SIEGE_BACK_WALL_Z - 2,
      TERRITORY_SIEGE_GATE_Z + 2,
      8,
      -Math.PI / 2,
    ),
    ...wallRunZ(
      'right',
      TERRITORY_SIEGE_WALL_HALF_X,
      TERRITORY_SIEGE_BACK_WALL_Z - 2,
      TERRITORY_SIEGE_GATE_Z + 2,
      8,
      Math.PI / 2,
    ),
    ...wallRunX('back', TERRITORY_SIEGE_BACK_WALL_Z, -outside, outside, 8, Math.PI),
    ...wallRunX(
      'front_left',
      TERRITORY_SIEGE_GATE_Z,
      -outside,
      -TERRITORY_SIEGE_GATE_HALF_WIDTH,
      3,
      0,
    ),
    ...wallRunX(
      'front_right',
      TERRITORY_SIEGE_GATE_Z,
      TERRITORY_SIEGE_GATE_HALF_WIDTH,
      outside,
      3,
      0,
    ),
  ];
}

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
    z: origin.z + (side === 'attacker' ? 178 - row * 4 : -57 + row * 4),
    facing: side === 'attacker' ? Math.PI : 0,
  };
}

export function territorySiegeTowerPositions(
  slot: number,
): readonly [{ x: number; z: number }, { x: number; z: number }] {
  const origin = territorySiegeOrigin(slot);
  return [
    { x: origin.x - TERRITORY_SIEGE_TOWER_X, z: origin.z + TERRITORY_SIEGE_TOWER_Z },
    { x: origin.x + TERRITORY_SIEGE_TOWER_X, z: origin.z + TERRITORY_SIEGE_TOWER_Z },
  ];
}

export function territorySiegeInTowerRange(slot: number, x: number, z: number): boolean {
  return territorySiegeTowerPositions(slot).some(
    (tower) => (x - tower.x) ** 2 + (z - tower.z) ** 2 <= TERRITORY_SIEGE_TOWER_RANGE ** 2,
  );
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
 * Side-aware backstop for the authoritative host. It repairs any position that
 * arrived across the closed leaf through reconciliation, forced movement or a
 * stale client prediction, instead of trusting only the movement segment that
 * happened to cross the doorway.
 */
export function sealTerritorySiegeGateForSide(
  slot: number,
  side: TerritoryWarSide,
  gateOpen: boolean,
  x: number,
  z: number,
  radius: number,
): { x: number; z: number } {
  if (gateOpen) return { x, z };
  const origin = territorySiegeOrigin(slot);
  if (Math.abs(x - origin.x) > TERRITORY_SIEGE_GATE_HALF_WIDTH + radius) return { x, z };
  const gateZ = origin.z + TERRITORY_SIEGE_GATE_Z;
  const front = gateZ + 1.4 + radius;
  const back = gateZ - 1.4 - radius;
  if (side === 'attacker' && z < front) return { x, z: front };
  if (side === 'defender' && z > back) return { x, z: back };
  return { x, z };
}

/**
 * Static collision shared by sim and renderer. The gate leaf is dynamic and is
 * enforced by the authoritative movement clamp until gate HP reaches zero.
 */
export function territorySiegeLocalColliders(): Collider[] {
  const y = TERRITORY_SIEGE_FLOOR_Y;
  const wallTop = y + 5;
  const scenery: Collider[] = [
    ...TERRITORY_SIEGE_TREES.map(
      (tree): Collider => ({ type: 'circle', x: tree.x, z: tree.z, r: 1.5 }),
    ),
    ...TERRITORY_SIEGE_ROCKS.map(
      (rock): Collider => ({ type: 'circle', x: rock.x, z: rock.z, r: 1.3 }),
    ),
    ...TERRITORY_SIEGE_HOMES.map(
      (home): Collider => ({
        type: 'obb',
        x: home.x,
        z: home.z,
        hw: 3.7,
        hd: 3.7,
        rot: home.yaw,
        cameraTopY: y + 8,
      }),
    ),
  ];
  return [
    {
      type: 'obb',
      x: -TERRITORY_SIEGE_WALL_HALF_X,
      z: (TERRITORY_SIEGE_BACK_WALL_Z + TERRITORY_SIEGE_GATE_Z) / 2,
      hw: 2,
      hd: (TERRITORY_SIEGE_GATE_Z - TERRITORY_SIEGE_BACK_WALL_Z) / 2,
      rot: 0,
      moveTopY: wallTop,
      cameraTopY: wallTop,
    },
    {
      type: 'obb',
      x: TERRITORY_SIEGE_WALL_HALF_X,
      z: (TERRITORY_SIEGE_BACK_WALL_Z + TERRITORY_SIEGE_GATE_Z) / 2,
      hw: 2,
      hd: (TERRITORY_SIEGE_GATE_Z - TERRITORY_SIEGE_BACK_WALL_Z) / 2,
      rot: 0,
      moveTopY: wallTop,
      cameraTopY: wallTop,
    },
    {
      type: 'obb',
      x: 0,
      z: TERRITORY_SIEGE_BACK_WALL_Z,
      hw: TERRITORY_SIEGE_WALL_HALF_X + 2,
      hd: 2,
      rot: 0,
      moveTopY: wallTop,
      cameraTopY: wallTop,
    },
    { type: 'obb', x: -27, z: 18, hw: 17, hd: 2, rot: 0, moveTopY: wallTop, cameraTopY: wallTop },
    { type: 'obb', x: 27, z: 18, hw: 17, hd: 2, rot: 0, moveTopY: wallTop, cameraTopY: wallTop },
    {
      type: 'circle',
      x: -TERRITORY_SIEGE_TOWER_X,
      z: TERRITORY_SIEGE_TOWER_Z,
      r: 4,
      moveTopY: y + 7,
      cameraTopY: y + 9,
    },
    {
      type: 'circle',
      x: TERRITORY_SIEGE_TOWER_X,
      z: TERRITORY_SIEGE_TOWER_Z,
      r: 4,
      moveTopY: y + 7,
      cameraTopY: y + 9,
    },
    {
      type: 'circle',
      x: 0,
      z: TERRITORY_SIEGE_CORE_Z,
      r: TERRITORY_SIEGE_CORE_COLLIDER_RADIUS,
      cameraTopY: y + 6.5,
    },
    {
      type: 'obb',
      x: -(TERRITORY_SIEGE_FIELD_HALF_X - 24),
      z: 0,
      hw: 1.5,
      hd: TERRITORY_SIEGE_FIELD_HALF_Z - 22,
      rot: 0,
      moveTopY: y + 30,
    },
    {
      type: 'obb',
      x: TERRITORY_SIEGE_FIELD_HALF_X - 24,
      z: 0,
      hw: 1.5,
      hd: TERRITORY_SIEGE_FIELD_HALF_Z - 22,
      rot: 0,
      moveTopY: y + 30,
    },
    {
      type: 'obb',
      x: 0,
      z: -(TERRITORY_SIEGE_FIELD_HALF_Z - 24),
      hw: TERRITORY_SIEGE_FIELD_HALF_X - 22,
      hd: 1.5,
      rot: 0,
      moveTopY: y + 30,
    },
    {
      type: 'obb',
      x: 0,
      z: TERRITORY_SIEGE_FIELD_HALF_Z - 24,
      hw: TERRITORY_SIEGE_FIELD_HALF_X - 22,
      hd: 1.5,
      rot: 0,
      moveTopY: y + 30,
    },
    ...scenery,
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
