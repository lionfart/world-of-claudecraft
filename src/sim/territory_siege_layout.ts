import type {
  TerritorySiegeAction,
  TerritorySiegeWallId,
  TerritorySiegeWallRun,
  TerritoryWarSide,
} from '../world_api';
import type { Collider } from './colliders';
import { DUNGEON_FLOOR_Y, territorySiegeOrigin } from './data';
import { hexBuildingBounds } from './hex_building_dims';
import {
  TERRITORY_SIEGE_ROCKS,
  TERRITORY_SIEGE_TREES,
  territorySiegeCourtyardFootprints,
} from './territory_siege_environment';

export {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
} from './territory_siege_ground';

import {
  resolveTerritorySiegeCitadelElevationTransitionLocal,
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
} from './territory_siege_ground';

export const TERRITORY_SIEGE_FLOOR_Y = DUNGEON_FLOOR_Y;
export const TERRITORY_SIEGE_GATE_Z = 18;
export const TERRITORY_SIEGE_GATE_HALF_WIDTH = 10;
export const TERRITORY_SIEGE_WALL_HALF_X = 44;
export const TERRITORY_SIEGE_BACK_WALL_Z = -72;
export const TERRITORY_SIEGE_INNER_WALL_HALF_X = 28;
export const TERRITORY_SIEGE_INNER_BACK_WALL_Z = -66;
export const TERRITORY_SIEGE_INNER_FRONT_WALL_Z = -22;
export const TERRITORY_SIEGE_INNER_GATE_HALF_WIDTH = 6;
export const TERRITORY_SIEGE_TOWER_X = TERRITORY_SIEGE_WALL_HALF_X;
export const TERRITORY_SIEGE_TOWER_Z = TERRITORY_SIEGE_GATE_Z;
// Covers the gate and a useful slice of the approach instead of merely touching
// the gate centre at one tangent point. The attacker spawn row remains safe.
export const TERRITORY_SIEGE_TOWER_RANGE = 58;
export const TERRITORY_SIEGE_TOWER_IMPACT_RADIUS = 5;
export const TERRITORY_SIEGE_CORE_Z = -42;
export const TERRITORY_SIEGE_CORE_ATTACK_RADIUS = 12;
export const TERRITORY_SIEGE_CORE_COLLIDER_RADIUS = 2.8;
export const TERRITORY_SIEGE_DEFENDER_GATE_INTERACT_HALF_WIDTH =
  TERRITORY_SIEGE_GATE_HALF_WIDTH - 1;
export const TERRITORY_SIEGE_DEFENDER_GATE_INTERACT_DEPTH = 5.5;
export const TERRITORY_SIEGE_DEFENDER_GATE_TRANSIT_OFFSET = 4.25;
export const TERRITORY_SIEGE_MAX_RAMS = 3;
export const TERRITORY_SIEGE_RAM_COLLIDER_RADIUS = 2.65;
export const TERRITORY_SIEGE_RAM_INTERACT_RADIUS = 5;
export const TERRITORY_SIEGE_RAM_DEPLOY_MIN_Z = 23;
export const TERRITORY_SIEGE_RAM_DEPLOY_MAX_Z = 29;
export const TERRITORY_SIEGE_RAM_DEPLOY_HALF_X = 8;
export const TERRITORY_SIEGE_MAX_MORTARS_PER_SIDE = 3;
export const TERRITORY_SIEGE_MORTAR_COLLIDER_RADIUS = 2.45;
export const TERRITORY_SIEGE_MORTAR_INTERACT_RADIUS = 5;
export const TERRITORY_SIEGE_MORTAR_RANGE = 85;
export const TERRITORY_SIEGE_MAX_CATAPULTS_PER_SIDE = 3;
export const TERRITORY_SIEGE_CATAPULT_COLLIDER_RADIUS = 3.1;
export const TERRITORY_SIEGE_CATAPULT_INTERACT_RADIUS = 5.5;
export const TERRITORY_SIEGE_CATAPULT_RANGE = 100;

export interface TerritorySiegeRamPlacement {
  id: number;
  x: number;
  z: number;
  yaw: number;
}

/**
 * Returns the opposite side of the closed castle gate for a nearby defender.
 * Attackers and destroyed gates are rejected by the caller before this helper
 * is used. Keeping the destination inside the actual doorway prevents the
 * former side-portal shortcut from clipping through an adjacent wall segment.
 */
export function territorySiegeDefenderGateDestination(
  x: number,
  z: number,
): { x: number; z: number } | null {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    Math.abs(x) > TERRITORY_SIEGE_DEFENDER_GATE_INTERACT_HALF_WIDTH ||
    Math.abs(z - TERRITORY_SIEGE_GATE_Z) > TERRITORY_SIEGE_DEFENDER_GATE_INTERACT_DEPTH
  ) {
    return null;
  }
  return {
    x,
    z:
      z > TERRITORY_SIEGE_GATE_Z
        ? TERRITORY_SIEGE_GATE_Z - TERRITORY_SIEGE_DEFENDER_GATE_TRANSIT_OFFSET
        : TERRITORY_SIEGE_GATE_Z + TERRITORY_SIEGE_DEFENDER_GATE_TRANSIT_OFFSET,
  };
}

/**
 * Three server-owned sockets on one arc around the gate. All carts have the
 * same gate distance, sit abreast rather than in rows, and pivot their noses
 * toward the gate centre.
 */
export const TERRITORY_SIEGE_RAM_FORMATION: readonly Omit<TerritorySiegeRamPlacement, 'id'>[] = [
  -0.6, 0, 0.6,
].map((yaw) => ({
  x: Math.sin(yaw) * 9.5,
  z: TERRITORY_SIEGE_GATE_Z + Math.cos(yaw) * 9.5,
  yaw,
}));

export interface TerritorySiegeMortarPlacement {
  id: number;
  x: number;
  z: number;
  yaw: number;
  side: TerritoryWarSide;
}

export function territorySiegeMortarDeployPlacement(
  side: TerritoryWarSide,
  x: number,
  z: number,
  yaw = side === 'defender' ? Math.PI : 0,
): Omit<TerritorySiegeMortarPlacement, 'id'> {
  return { x, z, yaw: Number.isFinite(yaw) ? yaw : 0, side };
}

export interface TerritorySiegeCatapultPlacement extends TerritorySiegeMortarPlacement {}

export function territorySiegeCatapultDeployPlacement(
  side: TerritoryWarSide,
  x: number,
  z: number,
  yaw: number,
): Omit<TerritorySiegeCatapultPlacement, 'id'> {
  return { x, z, yaw: Number.isFinite(yaw) ? yaw : 0, side };
}

function circleOverlapsCollider(x: number, z: number, radius: number, collider: Collider): boolean {
  if (collider.type === 'circle') {
    return (x - collider.x) ** 2 + (z - collider.z) ** 2 < (radius + collider.r) ** 2;
  }
  const cosine = Math.cos(-collider.rot);
  const sine = Math.sin(-collider.rot);
  const dx = x - collider.x;
  const dz = z - collider.z;
  const localX = dx * cosine + dz * sine;
  const localZ = -dx * sine + dz * cosine;
  const nearestX = Math.max(-collider.hw, Math.min(collider.hw, localX));
  const nearestZ = Math.max(-collider.hd, Math.min(collider.hd, localZ));
  return (localX - nearestX) ** 2 + (localZ - nearestZ) ** 2 < radius ** 2;
}

function overlapsTerritorySiegeStructureFootprint(
  x: number,
  z: number,
  radius: number,
  castleLevel: number,
): boolean {
  for (const wall of territorySiegeWallPlacements(castleLevel)) {
    if (
      circleOverlapsCollider(x, z, radius, {
        type: 'obb',
        x: wall.x,
        z: wall.z,
        hw: territorySiegeWallColliderHalfLength(wall, castleLevel),
        hd: territorySiegeWallColliderHalfDepth(castleLevel, wall.index),
        rot: wall.yaw,
      })
    ) {
      return true;
    }
  }
  return (['left', 'right'] as const).some((towerId) =>
    circleOverlapsCollider(x, z, radius, territorySiegeTowerCollider(towerId, castleLevel)),
  );
}

/**
 * Mortars may be placed anywhere on reachable battlefield ground. The only
 * restrictions are physical ones: keep the complete model inside the arena
 * and clear of scenery, the gate leaf, and other siege weapons.
 */
export function territorySiegeMortarPlacementAllowed(
  x: number,
  z: number,
  mortars: Iterable<Pick<TerritorySiegeMortarPlacement, 'x' | 'z'>>,
  rams: Iterable<Pick<TerritorySiegeRamPlacement, 'x' | 'z'>> = [],
  catapults: Iterable<Pick<TerritorySiegeCatapultPlacement, 'x' | 'z'>> = [],
  castleLevel = 3,
): boolean {
  const radius = TERRITORY_SIEGE_MORTAR_COLLIDER_RADIUS;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    Math.abs(x) > TERRITORY_SIEGE_FIELD_HALF_X - radius ||
    Math.abs(z) > TERRITORY_SIEGE_FIELD_HALF_Z - radius
  ) {
    return false;
  }
  if (
    Math.abs(x) < TERRITORY_SIEGE_GATE_HALF_WIDTH + radius &&
    Math.abs(z - TERRITORY_SIEGE_GATE_Z) < 1.4 + radius
  ) {
    return false;
  }
  if (
    overlapsTerritorySiegeStructureFootprint(x, z, radius, castleLevel) ||
    territorySiegeLocalColliders(castleLevel).some((collider) =>
      circleOverlapsCollider(x, z, radius, collider),
    )
  ) {
    return false;
  }
  for (const mortar of mortars) {
    if ((x - mortar.x) ** 2 + (z - mortar.z) ** 2 < (radius * 2) ** 2) return false;
  }
  for (const ram of rams) {
    const minimum = radius + TERRITORY_SIEGE_RAM_COLLIDER_RADIUS;
    if ((x - ram.x) ** 2 + (z - ram.z) ** 2 < minimum ** 2) return false;
  }
  for (const catapult of catapults) {
    const minimum = radius + TERRITORY_SIEGE_CATAPULT_COLLIDER_RADIUS;
    if ((x - catapult.x) ** 2 + (z - catapult.z) ** 2 < minimum ** 2) return false;
  }
  return true;
}

export function territorySiegeNearestMortar<T extends TerritorySiegeMortarPlacement>(
  x: number,
  z: number,
  mortars: Iterable<T>,
  radius = TERRITORY_SIEGE_MORTAR_INTERACT_RADIUS,
): T | null {
  let nearest: T | null = null;
  let nearestD2 = radius * radius;
  for (const mortar of mortars) {
    const d2 = (x - mortar.x) ** 2 + (z - mortar.z) ** 2;
    if (d2 > nearestD2) continue;
    nearest = mortar;
    nearestD2 = d2;
  }
  return nearest;
}

export function territorySiegeMortarTargetAllowed(
  mortar: Pick<TerritorySiegeMortarPlacement, 'x' | 'z'>,
  x: number,
  z: number,
): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.abs(x) <= TERRITORY_SIEGE_FIELD_HALF_X &&
    Math.abs(z) <= TERRITORY_SIEGE_FIELD_HALF_Z &&
    (x - mortar.x) ** 2 + (z - mortar.z) ** 2 <= TERRITORY_SIEGE_MORTAR_RANGE ** 2
  );
}

export function territorySiegeCatapultPlacementAllowed(
  x: number,
  z: number,
  catapults: Iterable<Pick<TerritorySiegeCatapultPlacement, 'x' | 'z'>>,
  mortars: Iterable<Pick<TerritorySiegeMortarPlacement, 'x' | 'z'>> = [],
  rams: Iterable<Pick<TerritorySiegeRamPlacement, 'x' | 'z'>> = [],
  castleLevel = 3,
): boolean {
  const radius = TERRITORY_SIEGE_CATAPULT_COLLIDER_RADIUS;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    Math.abs(x) > TERRITORY_SIEGE_FIELD_HALF_X - radius ||
    Math.abs(z) > TERRITORY_SIEGE_FIELD_HALF_Z - radius
  ) {
    return false;
  }
  if (
    Math.abs(x) < TERRITORY_SIEGE_GATE_HALF_WIDTH + radius &&
    Math.abs(z - TERRITORY_SIEGE_GATE_Z) < 1.4 + radius
  ) {
    return false;
  }
  if (
    overlapsTerritorySiegeStructureFootprint(x, z, radius, castleLevel) ||
    territorySiegeLocalColliders(castleLevel).some((collider) =>
      circleOverlapsCollider(x, z, radius, collider),
    )
  ) {
    return false;
  }
  for (const catapult of catapults) {
    if ((x - catapult.x) ** 2 + (z - catapult.z) ** 2 < (radius * 2) ** 2) return false;
  }
  for (const mortar of mortars) {
    const minimum = radius + TERRITORY_SIEGE_MORTAR_COLLIDER_RADIUS;
    if ((x - mortar.x) ** 2 + (z - mortar.z) ** 2 < minimum ** 2) return false;
  }
  for (const ram of rams) {
    const minimum = radius + TERRITORY_SIEGE_RAM_COLLIDER_RADIUS;
    if ((x - ram.x) ** 2 + (z - ram.z) ** 2 < minimum ** 2) return false;
  }
  return true;
}

export function territorySiegeNearestCatapult<T extends TerritorySiegeCatapultPlacement>(
  x: number,
  z: number,
  catapults: Iterable<T>,
  radius = TERRITORY_SIEGE_CATAPULT_INTERACT_RADIUS,
): T | null {
  let nearest: T | null = null;
  let nearestD2 = radius * radius;
  for (const catapult of catapults) {
    const d2 = (x - catapult.x) ** 2 + (z - catapult.z) ** 2;
    if (d2 > nearestD2) continue;
    nearest = catapult;
    nearestD2 = d2;
  }
  return nearest;
}

export function territorySiegeCatapultTargetAllowed(
  catapult: Pick<TerritorySiegeCatapultPlacement, 'x' | 'z'>,
  x: number,
  z: number,
): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.abs(x) <= TERRITORY_SIEGE_FIELD_HALF_X &&
    Math.abs(z) <= TERRITORY_SIEGE_FIELD_HALF_Z &&
    (x - catapult.x) ** 2 + (z - catapult.z) ** 2 <= TERRITORY_SIEGE_CATAPULT_RANGE ** 2
  );
}

export function territorySiegeRamDeploymentAreaContains(x: number, z: number): boolean {
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.abs(x) <= TERRITORY_SIEGE_RAM_DEPLOY_HALF_X &&
    z >= TERRITORY_SIEGE_RAM_DEPLOY_MIN_Z &&
    z <= TERRITORY_SIEGE_RAM_DEPLOY_MAX_Z
  );
}

export function territorySiegeRamDeployPlacement(
  deployedCount: number,
): Omit<TerritorySiegeRamPlacement, 'id'> | null {
  return TERRITORY_SIEGE_RAM_FORMATION[Math.max(0, Math.floor(deployedCount))] ?? null;
}

/** The cart must be wholly inside the gate apron and clear of every other cart. */
export function territorySiegeRamPlacementAllowed(
  x: number,
  z: number,
  existing: Iterable<Pick<TerritorySiegeRamPlacement, 'x' | 'z'>>,
): boolean {
  if (!territorySiegeRamDeploymentAreaContains(x, z)) {
    return false;
  }
  const minimumDistance = TERRITORY_SIEGE_RAM_COLLIDER_RADIUS * 2;
  for (const ram of existing) {
    if ((x - ram.x) ** 2 + (z - ram.z) ** 2 < minimumDistance ** 2) return false;
  }
  return true;
}

export function territorySiegeNearestRam<T extends TerritorySiegeRamPlacement>(
  x: number,
  z: number,
  rams: Iterable<T>,
  radius = TERRITORY_SIEGE_RAM_INTERACT_RADIUS,
): T | null {
  let nearest: T | null = null;
  let nearestD2 = radius * radius;
  for (const ram of rams) {
    const d2 = (x - ram.x) ** 2 + (z - ram.z) ** 2;
    if (d2 > nearestD2) continue;
    nearest = ram;
    nearestD2 = d2;
  }
  return nearest;
}

export interface TerritorySiegeWallPlacement {
  run: TerritorySiegeWallRun;
  index: number;
  x: number;
  z: number;
  /** The source wall is two units long on local X, so this is also its half-length. */
  scaleX: number;
  yaw: number;
}

// hex_wall.glb is 0.8 units deep. Match the renderer's 2.25 depth scale.
export const TERRITORY_SIEGE_WALL_SCALE_Z = 2.25;
export const TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH = 0.4 * TERRITORY_SIEGE_WALL_SCALE_Z;

export function territorySiegeWallColliderHalfDepth(castleLevel: number, detailIndex = 0): number {
  if (castleLevel <= 1) return 0.37501 * 2.4;
  if (castleLevel === 2) return 0.39995 * TERRITORY_SIEGE_WALL_SCALE_Z;
  const sourceHalfDepth = detailIndex % 5 === 3 ? 0.75008 : 0.50008;
  return sourceHalfDepth * (castleLevel >= 4 ? 2.05 : 1.8);
}

export function territorySiegeWallColliderHalfLength(
  wall: Pick<TerritorySiegeWallPlacement, 'scaleX'>,
  castleLevel: number,
): number {
  // Tier one uses a six-unit palisade wing scaled by 0.34 on local X. Every
  // stone module resolves to the authored placement half-length exactly.
  return wall.scaleX * (castleLevel <= 1 ? 3 * 0.34 : 1);
}

export function territorySiegeWoodTowerYaw(towerId: 'left' | 'right'): number {
  const inwardDiagonal = Math.PI * 0.8;
  return towerId === 'left' ? inwardDiagonal : -inwardDiagonal;
}

/** Exact OBB of the model displayed for this tower tier. */
export function territorySiegeTowerCollider(
  towerId: 'left' | 'right',
  castleLevel: number,
): Extract<Collider, { type: 'obb' }> {
  const level = Math.max(1, Math.min(4, Math.floor(castleLevel)));
  const family = level === 1 ? 'watchtower' : level === 2 ? 'towerCannon' : 'castle';
  const scale = level === 1 ? 5.4 : level === 2 ? 6 : level === 3 ? 4.15 : 4.75;
  const rot = level === 1 ? territorySiegeWoodTowerYaw(towerId) : level >= 3 ? Math.PI : 0;
  const bounds = hexBuildingBounds(family, scale);
  if (!bounds) throw new Error(`missing measured siege tower footprint: ${family}`);
  const cosine = Math.cos(rot);
  const sine = Math.sin(rot);
  const baseX = towerId === 'left' ? -TERRITORY_SIEGE_TOWER_X : TERRITORY_SIEGE_TOWER_X;
  return {
    type: 'obb',
    x: baseX + bounds.cx * cosine + bounds.cz * sine,
    z: TERRITORY_SIEGE_TOWER_Z - bounds.cx * sine + bounds.cz * cosine,
    hw: bounds.hw,
    hd: bounds.hd,
    rot,
  };
}

/** Compatibility broad-phase radius; precise movement uses the OBB above. */
export function territorySiegeTowerColliderRadius(castleLevel: number): number {
  const collider = territorySiegeTowerCollider('right', castleLevel);
  return Math.hypot(collider.hw, collider.hd);
}

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
    index,
    x: startX + step * (index + 0.5),
    z,
    scaleX: step / 2,
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
    index,
    x,
    z: startZ + step * (index + 0.5),
    scaleX: step / 2,
    yaw,
  }));
}

export function territorySiegeWallSegmentId(
  wall: Pick<TerritorySiegeWallPlacement, 'run' | 'index'>,
): TerritorySiegeWallId {
  return `${wall.run}:${wall.index}`;
}

/** Every visible model is a separately addressable breach, not a decorative collider. */
export function territorySiegeWallSegmentPlacements(
  castleLevel = 3,
): Readonly<Record<TerritorySiegeWallId, TerritorySiegeWallPlacement>> {
  const entries = territorySiegeWallPlacements(castleLevel).map(
    (wall) => [territorySiegeWallSegmentId(wall), wall] as const,
  );
  return Object.fromEntries(entries) as Record<TerritorySiegeWallId, TerritorySiegeWallPlacement>;
}

/**
 * Butt-jointed perimeter: transverse runs own the corners; side runs stop at
 * their inner faces. Extending BOTH runs through a corner creates crossed ends.
 */
export function territorySiegeWallPlacements(
  castleLevel = 3,
): readonly TerritorySiegeWallPlacement[] {
  const outside = TERRITORY_SIEGE_WALL_HALF_X + TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH;
  const outer = [
    ...wallRunZ(
      'left',
      -TERRITORY_SIEGE_WALL_HALF_X,
      TERRITORY_SIEGE_BACK_WALL_Z + TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
      TERRITORY_SIEGE_GATE_Z - TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
      8,
      -Math.PI / 2,
    ),
    ...wallRunZ(
      'right',
      TERRITORY_SIEGE_WALL_HALF_X,
      TERRITORY_SIEGE_BACK_WALL_Z + TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
      TERRITORY_SIEGE_GATE_Z - TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
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
  if (castleLevel < 4) return outer;
  const innerOutside = TERRITORY_SIEGE_INNER_WALL_HALF_X + TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH;
  return [
    ...outer,
    ...wallRunZ(
      'inner_left',
      -TERRITORY_SIEGE_INNER_WALL_HALF_X,
      TERRITORY_SIEGE_INNER_BACK_WALL_Z + TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
      TERRITORY_SIEGE_INNER_FRONT_WALL_Z - TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
      4,
      -Math.PI / 2,
    ),
    ...wallRunZ(
      'inner_right',
      TERRITORY_SIEGE_INNER_WALL_HALF_X,
      TERRITORY_SIEGE_INNER_BACK_WALL_Z + TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
      TERRITORY_SIEGE_INNER_FRONT_WALL_Z - TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
      4,
      Math.PI / 2,
    ),
    ...wallRunX(
      'inner_back',
      TERRITORY_SIEGE_INNER_BACK_WALL_Z,
      -innerOutside,
      innerOutside,
      5,
      Math.PI,
    ),
    ...wallRunX(
      'inner_front_left',
      TERRITORY_SIEGE_INNER_FRONT_WALL_Z,
      -innerOutside,
      -TERRITORY_SIEGE_INNER_GATE_HALF_WIDTH,
      2,
      0,
    ),
    ...wallRunX(
      'inner_front_right',
      TERRITORY_SIEGE_INNER_FRONT_WALL_Z,
      TERRITORY_SIEGE_INNER_GATE_HALF_WIDTH,
      innerOutside,
      2,
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
    {
      x: origin.x - TERRITORY_SIEGE_TOWER_X,
      z: origin.z + TERRITORY_SIEGE_TOWER_Z,
    },
    {
      x: origin.x + TERRITORY_SIEGE_TOWER_X,
      z: origin.z + TERRITORY_SIEGE_TOWER_Z,
    },
  ];
}

export function territorySiegeInTowerRange(slot: number, x: number, z: number): boolean {
  return (['left', 'right'] as const).some((towerId) =>
    territorySiegeInSpecificTowerRange(slot, towerId, x, z),
  );
}

/** Server-authoritative range check for the tower that will actually fire. */
export function territorySiegeInSpecificTowerRange(
  slot: number,
  towerId: 'left' | 'right',
  x: number,
  z: number,
  impactRadius = 0,
): boolean {
  const tower = territorySiegeTowerPositions(slot)[towerId === 'left' ? 0 : 1];
  const effectiveRange = Math.max(0, TERRITORY_SIEGE_TOWER_RANGE - impactRadius);
  return (x - tower.x) ** 2 + (z - tower.z) ** 2 <= effectiveRange ** 2;
}

export function territorySiegeActionPoint(
  slot: number,
  action: TerritorySiegeAction,
): { x: number; z: number; radius: number } {
  const origin = territorySiegeOrigin(slot);
  const local =
    action === 'start_core_channel'
      ? {
          x: 0,
          z: TERRITORY_SIEGE_CORE_Z,
          radius: TERRITORY_SIEGE_CORE_ATTACK_RADIUS,
        }
      : action === 'stop_core_channel'
        ? { x: 0, z: TERRITORY_SIEGE_CORE_Z, radius: Number.POSITIVE_INFINITY }
        : action === 'deploy_ram'
          ? { x: 0, z: 27, radius: 8 }
          : action === 'leave_ram'
            ? { x: 0, z: 23, radius: Number.POSITIVE_INFINITY }
            : { x: 0, z: 23, radius: 5 };
  return { x: origin.x + local.x, z: origin.z + local.z, radius: local.radius };
}

export function territorySiegeRamOperatorPosition(
  slot: number,
  ram: Pick<TerritorySiegeRamPlacement, 'x' | 'z'> & { yaw?: number },
): { x: number; z: number; facing: number } {
  const origin = territorySiegeOrigin(slot);
  const yaw = ram.yaw ?? Math.atan2(ram.x, ram.z - TERRITORY_SIEGE_GATE_Z);
  return {
    x: origin.x + ram.x + Math.sin(yaw) * 0.75,
    z: origin.z + ram.z + Math.cos(yaw) * 0.75,
    facing: Math.PI + yaw,
  };
}

export function territorySiegeMortarOperatorPosition(
  slot: number,
  mortar: Pick<TerritorySiegeMortarPlacement, 'x' | 'z' | 'yaw'>,
): { x: number; z: number; facing: number } {
  const origin = territorySiegeOrigin(slot);
  return {
    x: origin.x + mortar.x - Math.sin(mortar.yaw) * 1.35,
    z: origin.z + mortar.z - Math.cos(mortar.yaw) * 1.35,
    facing: mortar.yaw,
  };
}

export function territorySiegeCatapultOperatorPosition(
  slot: number,
  catapult: Pick<TerritorySiegeCatapultPlacement, 'x' | 'z' | 'yaw'>,
): { x: number; z: number; facing: number } {
  const origin = territorySiegeOrigin(slot);
  return {
    x: origin.x + catapult.x - Math.sin(catapult.yaw) * 2.15,
    z: origin.z + catapult.z - Math.cos(catapult.yaw) * 2.15,
    facing: catapult.yaw,
  };
}

/** Compatibility alias for older callers/tests while single-operator rams migrate. */
export function territorySiegeRamSeat(
  slot: number,
  _seatNo: number,
): { x: number; z: number; facing: number } {
  return territorySiegeRamOperatorPosition(slot, { x: 0, z: 23, yaw: 0 });
}

/** Push a moving player outside every deployed ram's circular server collider. */
export function clampTerritorySiegeRams(
  slot: number,
  rams: Iterable<Pick<TerritorySiegeRamPlacement, 'x' | 'z'>>,
  x: number,
  z: number,
  bodyRadius: number,
): { x: number; z: number } {
  const origin = territorySiegeOrigin(slot);
  const minimum = TERRITORY_SIEGE_RAM_COLLIDER_RADIUS + Math.max(0, bodyRadius);
  let nextX = x;
  let nextZ = z;
  for (const ram of rams) {
    const centerX = origin.x + ram.x;
    const centerZ = origin.z + ram.z;
    const dx = nextX - centerX;
    const dz = nextZ - centerZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minimum * minimum) continue;
    const distance = Math.sqrt(d2);
    if (distance < 0.0001) {
      nextZ = centerZ + minimum;
      continue;
    }
    const scale = minimum / distance;
    nextX = centerX + dx * scale;
    nextZ = centerZ + dz * scale;
  }
  return { x: nextX, z: nextZ };
}

/** Push a non-operator outside every deployed mortar's authoritative collider. */
export function clampTerritorySiegeMortars(
  slot: number,
  mortars: Iterable<Pick<TerritorySiegeMortarPlacement, 'x' | 'z'>>,
  x: number,
  z: number,
  bodyRadius: number,
): { x: number; z: number } {
  const origin = territorySiegeOrigin(slot);
  const minimum = TERRITORY_SIEGE_MORTAR_COLLIDER_RADIUS + Math.max(0, bodyRadius);
  let nextX = x;
  let nextZ = z;
  for (const mortar of mortars) {
    const centerX = origin.x + mortar.x;
    const centerZ = origin.z + mortar.z;
    const dx = nextX - centerX;
    const dz = nextZ - centerZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minimum * minimum) continue;
    const distance = Math.sqrt(d2);
    if (distance < 0.0001) {
      nextZ = centerZ + minimum;
      continue;
    }
    const scale = minimum / distance;
    nextX = centerX + dx * scale;
    nextZ = centerZ + dz * scale;
  }
  return { x: nextX, z: nextZ };
}

export function clampTerritorySiegeCatapults(
  slot: number,
  catapults: Iterable<Pick<TerritorySiegeCatapultPlacement, 'x' | 'z'>>,
  x: number,
  z: number,
  bodyRadius: number,
): { x: number; z: number } {
  const origin = territorySiegeOrigin(slot);
  const minimum = TERRITORY_SIEGE_CATAPULT_COLLIDER_RADIUS + Math.max(0, bodyRadius);
  let nextX = x;
  let nextZ = z;
  for (const catapult of catapults) {
    const centerX = origin.x + catapult.x;
    const centerZ = origin.z + catapult.z;
    const dx = nextX - centerX;
    const dz = nextZ - centerZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minimum * minimum) continue;
    const distance = Math.sqrt(d2);
    if (distance < 0.0001) {
      nextZ = centerZ + minimum;
      continue;
    }
    const scale = minimum / distance;
    nextX = centerX + dx * scale;
    nextZ = centerZ + dz * scale;
  }
  return { x: nextX, z: nextZ };
}

function clampOutsideObb(
  x: number,
  z: number,
  radius: number,
  collider: Extract<Collider, { type: 'obb' }>,
): { x: number; z: number } {
  const cosine = Math.cos(-collider.rot);
  const sine = Math.sin(-collider.rot);
  const dx = x - collider.x;
  const dz = z - collider.z;
  const localX = dx * cosine + dz * sine;
  const localZ = -dx * sine + dz * cosine;
  const limitX = collider.hw + radius;
  const limitZ = collider.hd + radius;
  if (Math.abs(localX) >= limitX || Math.abs(localZ) >= limitZ) return { x, z };
  const pushX = limitX - Math.abs(localX);
  const pushZ = limitZ - Math.abs(localZ);
  const nextLocalX = pushX < pushZ ? Math.sign(localX || 1) * limitX : localX;
  const nextLocalZ = pushX < pushZ ? localZ : Math.sign(localZ || 1) * limitZ;
  const worldCosine = Math.cos(collider.rot);
  const worldSine = Math.sin(collider.rot);
  return {
    x: collider.x + nextLocalX * worldCosine + nextLocalZ * worldSine,
    z: collider.z - nextLocalX * worldSine + nextLocalZ * worldCosine,
  };
}

function clampOutsideCircle(
  x: number,
  z: number,
  radius: number,
  collider: Extract<Collider, { type: 'circle' }>,
): { x: number; z: number } {
  const minimum = collider.r + Math.max(0, radius);
  const dx = x - collider.x;
  const dz = z - collider.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minimum * minimum) return { x, z };
  if (d2 < 0.0001) return { x: collider.x, z: collider.z + minimum };
  const scale = minimum / Math.sqrt(d2);
  return { x: collider.x + dx * scale, z: collider.z + dz * scale };
}

function clampOutsideColliders(
  x: number,
  z: number,
  radius: number,
  colliders: readonly Collider[],
): { x: number; z: number } {
  let next = { x, z };
  for (const collider of colliders) {
    next =
      collider.type === 'circle'
        ? clampOutsideCircle(next.x, next.z, radius, collider)
        : clampOutsideObb(next.x, next.z, radius, collider);
  }
  return next;
}

function resolveSweptClamp(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  clamp: (x: number, z: number) => { x: number; z: number },
): { x: number; z: number } {
  let current = clamp(fromX, fromZ);
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return current;
  const steps = Math.max(1, Math.ceil(distance / 0.15));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let collided = Math.hypot(current.x - fromX, current.z - fromZ) > 1e-7;
  for (let index = 0; index < steps; index += 1) {
    // Apply each small intended displacement from the last valid position.
    // The clamp removes only the component that enters a surface, preserving
    // the tangential component so movement naturally slides along walls and
    // buildings instead of freezing on first contact.
    const intended = { x: current.x + stepX, z: current.z + stepZ };
    const resolved = clamp(intended.x, intended.z);
    if (Math.hypot(resolved.x - intended.x, resolved.z - intended.z) > 1e-7) collided = true;
    current = resolved;
  }
  return collided ? current : { x: toX, z: toZ };
}

function territorySiegeCourtyardColliders(slot: number, castleLevel: number): Collider[] {
  const origin = territorySiegeOrigin(slot);
  return territorySiegeCourtyardFootprints(castleLevel).map(
    (footprint): Collider =>
      footprint.type === 'circle'
        ? {
            type: 'circle',
            x: origin.x + footprint.x,
            z: origin.z + footprint.z,
            r: footprint.r,
          }
        : {
            type: 'obb',
            x: origin.x + footprint.x,
            z: origin.z + footprint.z,
            hw: footprint.hw,
            hd: footprint.hd,
            rot: footprint.yaw,
          },
  );
}

/** Swept movement against the visible courtyard buildings and substantial props. */
export function resolveTerritorySiegeCourtyardStructures(
  slot: number,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  radius: number,
  castleLevel = 3,
): { x: number; z: number } {
  const colliders = territorySiegeCourtyardColliders(slot, castleLevel);
  return resolveSweptClamp(fromX, fromZ, toX, toZ, (x, z) =>
    clampOutsideColliders(x, z, radius, colliders),
  );
}

/** Shared world-space ledge protection for client prediction and the host. */
export function resolveTerritorySiegeCitadelElevationTransition(
  slot: number,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  castleLevel: number,
  fromFeetY?: number,
): { x: number; z: number } {
  if (castleLevel < 4) return { x: toX, z: toZ };
  const origin = territorySiegeOrigin(slot);
  const resolved = resolveTerritorySiegeCitadelElevationTransitionLocal(
    fromX - origin.x,
    fromZ - origin.z,
    toX - origin.x,
    toZ - origin.z,
    castleLevel,
    fromFeetY,
  );
  return { x: origin.x + resolved.x, z: origin.z + resolved.z };
}

/** Dynamic collision for every independently breachable wall segment and defense tower. */
export function clampTerritorySiegeDestructibleStructures(
  slot: number,
  wallAlive: Readonly<Partial<Record<TerritorySiegeWallId, boolean>>> | undefined,
  towerAlive: Readonly<Partial<Record<'left' | 'right', boolean>>> | undefined,
  x: number,
  z: number,
  radius: number,
  castleLevel = 3,
): { x: number; z: number } {
  const origin = territorySiegeOrigin(slot);
  let next = { x, z };
  const placements = territorySiegeWallSegmentPlacements(castleLevel);
  for (const [id, wall] of Object.entries(placements) as [
    TerritorySiegeWallId,
    TerritorySiegeWallPlacement,
  ][]) {
    if (wallAlive?.[id] === false) continue;
    next = clampOutsideObb(next.x, next.z, radius, {
      type: 'obb',
      x: origin.x + wall.x,
      z: origin.z + wall.z,
      hw: territorySiegeWallColliderHalfLength(wall, castleLevel),
      hd: territorySiegeWallColliderHalfDepth(castleLevel, wall.index),
      rot: wall.yaw,
    });
  }
  for (const id of ['left', 'right'] as const) {
    if (towerAlive?.[id] !== true) continue;
    const tower = territorySiegeTowerCollider(id, castleLevel);
    next = clampOutsideObb(next.x, next.z, radius, {
      ...tower,
      x: origin.x + tower.x,
      z: origin.z + tower.z,
    });
  }
  return next;
}

/**
 * Swept movement against the live wall/tower set. Network stalls and forced
 * movement can produce a displacement wider than a wall in one simulation
 * update, so an endpoint-only overlap test is not sufficient here.
 */
export function resolveTerritorySiegeDestructibleStructures(
  slot: number,
  wallAlive: Readonly<Partial<Record<TerritorySiegeWallId, boolean>>> | undefined,
  towerAlive: Readonly<Partial<Record<'left' | 'right', boolean>>> | undefined,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  radius: number,
  castleLevel = 3,
): { x: number; z: number } {
  return resolveSweptClamp(fromX, fromZ, toX, toZ, (x, z) =>
    clampTerritorySiegeDestructibleStructures(
      slot,
      wallAlive,
      towerAlive,
      x,
      z,
      radius,
      castleLevel,
    ),
  );
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

function segmentIntersectsRect(
  from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  let near = 0;
  let far = 1;
  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, minX, maxX],
    [from.z, to.z - from.z, minZ, maxZ],
  ] as const) {
    if (Math.abs(delta) <= 1e-9) {
      if (start < min || start > max) return false;
      continue;
    }
    let entry = (min - start) / delta;
    let exit = (max - start) / delta;
    if (entry > exit) [entry, exit] = [exit, entry];
    near = Math.max(near, entry);
    far = Math.min(far, exit);
    if (near > far) return false;
  }
  return true;
}

/** A closed gate leaf is opaque to aimed, homing, and ballistic projectiles. */
export function territorySiegeProjectilePathClear(
  slot: number,
  gateOpen: boolean,
  from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>,
  radius = 0.05,
): boolean {
  if (gateOpen) return true;
  const origin = territorySiegeOrigin(slot);
  const gateZ = origin.z + TERRITORY_SIEGE_GATE_Z;
  return !segmentIntersectsRect(
    from,
    to,
    origin.x - TERRITORY_SIEGE_GATE_HALF_WIDTH - radius,
    origin.x + TERRITORY_SIEGE_GATE_HALF_WIDTH + radius,
    gateZ - 1.4 - radius,
    gateZ + 1.4 + radius,
  );
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
  breachOpen = false,
): { x: number; z: number } {
  // Once any wall segment has fallen, either side may legitimately be on the
  // opposite side of the still-closed gate. The swept gate leaf still blocks
  // walking through the gate itself; only the stale-position backstop relaxes.
  if (gateOpen || breachOpen) return { x, z };
  const origin = territorySiegeOrigin(slot);
  if (Math.abs(x - origin.x) > TERRITORY_SIEGE_GATE_HALF_WIDTH + radius) return { x, z };
  const gateZ = origin.z + TERRITORY_SIEGE_GATE_Z;
  const front = gateZ + 1.4 + radius;
  if (side === 'attacker' && z < front) return { x, z: front };
  // Defenders may legitimately be on either side after using the closed gate.
  // Ordinary walking is still stopped by clampTerritorySiegeGate's swept leaf;
  // omitting a defender backstop here prevents the next authoritative tick from
  // undoing an intentional F-key transit.
  return { x, z };
}

/**
 * The old arena perimeter was represented by four global static colliders, so
 * defenders were rubber-banded back into the siege field after leaving the
 * keep. Preserve that battlefield limit only for attackers and leave defenders
 * completely unconstrained.
 */
export function clampTerritorySiegeFieldForSide(
  slot: number,
  side: TerritoryWarSide,
  x: number,
  z: number,
  radius: number,
): { x: number; z: number } {
  if (side === 'defender') return { x, z };
  const origin = territorySiegeOrigin(slot);
  const halfX = Math.max(0, TERRITORY_SIEGE_FIELD_HALF_X - 25.5 - radius);
  const halfZ = Math.max(0, TERRITORY_SIEGE_FIELD_HALF_Z - 25.5 - radius);
  return {
    x: origin.x + Math.max(-halfX, Math.min(halfX, x - origin.x)),
    z: origin.z + Math.max(-halfZ, Math.min(halfZ, z - origin.z)),
  };
}

/**
 * Static collision shared by sim and renderer. The gate leaf is dynamic and is
 * enforced by the authoritative movement clamp until gate HP reaches zero.
 */
export function territorySiegeLocalColliders(castleLevel = 3, includeCourtyard = true): Collider[] {
  const y = TERRITORY_SIEGE_FLOOR_Y;
  const scenery: Collider[] = [
    ...TERRITORY_SIEGE_TREES.map(
      (tree): Collider => ({
        type: 'circle',
        x: tree.x,
        z: tree.z,
        r: 1.5,
      }),
    ),
    ...TERRITORY_SIEGE_ROCKS.map(
      (rock): Collider => ({
        type: 'circle',
        x: rock.x,
        z: rock.z,
        r: 1.3,
      }),
    ),
    ...(includeCourtyard
      ? territorySiegeCourtyardFootprints(castleLevel).map(
          (footprint): Collider =>
            footprint.type === 'circle'
              ? {
                  type: 'circle',
                  x: footprint.x,
                  z: footprint.z,
                  r: footprint.r,
                  cameraTopY: y + footprint.height,
                }
              : {
                  type: 'obb',
                  x: footprint.x,
                  z: footprint.z,
                  hw: footprint.hw,
                  hd: footprint.hd,
                  rot: footprint.yaw,
                  cameraTopY: y + footprint.height,
                },
        )
      : []),
  ];
  return [
    {
      type: 'circle',
      x: 0,
      z: TERRITORY_SIEGE_CORE_Z,
      r: TERRITORY_SIEGE_CORE_COLLIDER_RADIUS,
      cameraTopY: y + 6.5,
    },
    ...scenery,
  ];
}

export function territorySiegeBandColliders(): Collider[] {
  // Castle-tier structures are resolved from live siege state so an upgrade
  // never leaves behind invisible collision from the previous courtyard.
  const local = territorySiegeLocalColliders(3, false);
  const out: Collider[] = [];
  for (let slot = 0; slot < 4; slot += 1) {
    const origin = territorySiegeOrigin(slot);
    for (const collider of local) {
      out.push({
        ...collider,
        x: collider.x + origin.x,
        z: collider.z + origin.z,
      });
    }
  }
  return out;
}
