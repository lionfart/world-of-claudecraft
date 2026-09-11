import { territoryCastleLevel } from '../sim/territory_castle_progression';

export type TerritoryCastleCourtyardStyle = 'dirt' | 'current' | 'drakelands' | 'citadel';

export interface TerritoryCastleVisualStyle {
  level: number;
  wallAsset: 'palisadeWall' | 'wall' | 'drakelandsWall';
  wallScale: readonly [number, number, number];
  wallYawOffset: number;
  courtyard: TerritoryCastleCourtyardStyle;
  gateFrame: 'timber' | 'stone' | 'drakelands' | 'citadel';
}

export interface TerritoryDefenseTowerVisualStyle {
  level: number;
  towerAsset: 'towerWood' | 'towerStone' | 'drakelandsBastion';
  towerScale: readonly [number, number, number];
}

const CASTLE_STYLES: readonly TerritoryCastleVisualStyle[] = [
  {
    level: 1,
    wallAsset: 'palisadeWall',
    // The Fenbridge wing is authored at roughly three times the old hex-wall
    // width and already has full-height timber posts.
    wallScale: [0.34, 1.5, 2.4],
    // The authored palisade's braced/interior face points along its opposite
    // local normal. Flip only the timber tier so braces face the courtyard.
    wallYawOffset: Math.PI,
    courtyard: 'dirt',
    gateFrame: 'timber',
  },
  {
    level: 2,
    wallAsset: 'wall',
    wallScale: [1, 4.55, 2.25],
    wallYawOffset: 0,
    courtyard: 'current',
    gateFrame: 'stone',
  },
  {
    level: 3,
    wallAsset: 'drakelandsWall',
    wallScale: [0.5, 1.45, 1.8],
    wallYawOffset: 0,
    courtyard: 'drakelands',
    gateFrame: 'drakelands',
  },
  {
    level: 4,
    // Logical composite: the outer curtain and raised inner ward reuse the
    // shipped Drakelands modular kit, with no unique level-four mesh required.
    wallAsset: 'drakelandsWall',
    wallScale: [0.5, 1.6, 2.1],
    wallYawOffset: 0,
    courtyard: 'citadel',
    gateFrame: 'citadel',
  },
] as const;

const DEFENSE_TOWER_STYLES: readonly TerritoryDefenseTowerVisualStyle[] = [
  {
    level: 1,
    towerAsset: 'towerWood',
    towerScale: [5.4, 6.8, 5.4],
  },
  {
    level: 2,
    towerAsset: 'towerStone',
    // The old pavilion read as a stretched roof. The shipped cannon tower has
    // a compact stone silhouette, a visible weapon, and the level-two palette.
    towerScale: [6, 6, 6],
  },
  {
    level: 3,
    // This is a logical composite assembled from the same KayKit Dungeon
    // modules as the Last Keep. It deliberately replaces the generic green
    // pavilion that was previously enlarged into a supposed level-three tower.
    towerAsset: 'drakelandsBastion',
    towerScale: [1, 1, 1],
  },
  {
    level: 4,
    towerAsset: 'drakelandsBastion',
    towerScale: [1, 1, 1],
  },
] as const;

export function territoryCastleVisualStyle(level: number): TerritoryCastleVisualStyle {
  return CASTLE_STYLES[territoryCastleLevel(level) - 1];
}

export function territoryDefenseTowerVisualStyle(level: number): TerritoryDefenseTowerVisualStyle {
  return DEFENSE_TOWER_STYLES[territoryCastleLevel(level) - 1];
}

export function territoryDefenseTowerVisualLevel(aggregateDefenseTowerLevel: number): number {
  if (!Number.isFinite(aggregateDefenseTowerLevel) || aggregateDefenseTowerLevel <= 0) return 0;
  // The server exposes the combined level of the two defensive towers. Convert
  // its 2/4/6/8 progression back to the visual building tier 1/2/3/4.
  return territoryCastleLevel(Math.ceil(aggregateDefenseTowerLevel / 2));
}

/**
 * The timber tower's ladder is authored on local +Z. Aim it diagonally into
 * the courtyard so it neither faces attackers nor disappears into the wall.
 */
export function territoryWoodTowerYaw(towerId: 'left' | 'right'): number {
  const inwardDiagonal = Math.PI * 0.8;
  return towerId === 'left' ? inwardDiagonal : -inwardDiagonal;
}

export function showTerritoryCastleTier(
  tierGroups: readonly { visible: boolean }[],
  level: number,
): void {
  const activeIndex = territoryCastleLevel(level) - 1;
  tierGroups.forEach((group, index) => {
    group.visible = index === activeIndex;
  });
}
