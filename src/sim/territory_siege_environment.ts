import type { TerritoryStructureSlot, TerritoryStructureView } from '../world_api';
import { hexBuildingBounds } from './hex_building_dims';
import {
  TERRITORY_SIEGE_CITADEL_INNER_BACK_Z,
  TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z,
  TERRITORY_SIEGE_CITADEL_INNER_HALF_X,
  TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_CLEAR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT,
} from './territory_siege_ground';

export interface TerritorySiegeSceneryPlacement {
  x: number;
  z: number;
  scale: number;
  yaw: number;
}

export interface TerritorySiegeBuildingPlacement extends TerritorySiegeSceneryPlacement {
  kind: 'homeA' | 'homeB';
}

export type TerritorySiegeCourtyardFootprint =
  | {
      id: string;
      type: 'circle';
      x: number;
      z: number;
      r: number;
      height: number;
    }
  | {
      id: string;
      type: 'obb';
      x: number;
      z: number;
      hw: number;
      hd: number;
      yaw: number;
      height: number;
    };

function measuredObb(
  id: string,
  family: string,
  x: number,
  z: number,
  scale: number,
  yaw: number,
  height: number,
): TerritorySiegeCourtyardFootprint {
  const bounds = hexBuildingBounds(family, scale);
  if (!bounds) throw new Error(`missing measured siege footprint: ${family}`);
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return {
    id,
    type: 'obb',
    x: x + bounds.cx * cosine + bounds.cz * sine,
    z: z - bounds.cx * sine + bounds.cz * cosine,
    hw: bounds.hw,
    hd: bounds.hd,
    yaw,
    height,
  };
}

/**
 * Hand-authored cover clusters leave the central assault road and castle gate
 * readable while breaking up the large field into natural combat lanes.
 */
export const TERRITORY_SIEGE_TREES: readonly TerritorySiegeSceneryPlacement[] = [
  { x: -112, z: -151, scale: 8.1, yaw: 0.9 },
  { x: 109, z: -146, scale: 7.4, yaw: 2.2 },
  { x: -111, z: -112, scale: 6.9, yaw: 1.5 },
  { x: 113, z: -83, scale: 8.3, yaw: 0.35 },
  { x: -110, z: -35, scale: 7.6, yaw: 2.7 },
  { x: 111, z: 8, scale: 7.1, yaw: 1.1 },
  { x: -113, z: 51, scale: 8.5, yaw: 0.4 },
  { x: 110, z: 79, scale: 7.8, yaw: 2.45 },
  { x: -109, z: 119, scale: 7.2, yaw: 1.9 },
  { x: 112, z: 145, scale: 8.2, yaw: 0.7 },
  { x: -76, z: 153, scale: 7.7, yaw: 2.25 },
  { x: 72, z: 156, scale: 6.8, yaw: 1.25 },
  { x: -88, z: -119, scale: 8.6, yaw: 2.5 },
  { x: 87, z: -114, scale: 7.2, yaw: 0.4 },
  { x: -72, z: -101, scale: 8.2, yaw: 0.2 },
  { x: -58, z: -94, scale: 6.8, yaw: 1.1 },
  { x: 61, z: -100, scale: 7.6, yaw: 2.3 },
  { x: 74, z: -88, scale: 6.5, yaw: 0.8 },
  { x: -90, z: -81, scale: 7.1, yaw: 1.7 },
  { x: 89, z: -69, scale: 8.4, yaw: 2.1 },
  { x: -70, z: -70, scale: 7.4, yaw: 2.8 },
  { x: 69, z: -62, scale: 8, yaw: 1.7 },
  { x: -65, z: -42, scale: 6.4, yaw: 0.5 },
  { x: 61, z: -35, scale: 7.2, yaw: 2.1 },
  { x: -71, z: -12, scale: 8.4, yaw: 1.4 },
  { x: 72, z: -4, scale: 6.7, yaw: 0.1 },
  { x: -89, z: -18, scale: 8.1, yaw: 0.9 },
  { x: 90, z: 8, scale: 7.4, yaw: 2.6 },
  { x: -65, z: 19, scale: 7.5, yaw: 2.5 },
  { x: 66, z: 26, scale: 8.1, yaw: 1 },
  { x: -72, z: 48, scale: 6.6, yaw: 0.6 },
  { x: 70, z: 52, scale: 7.7, yaw: 2.7 },
  { x: -90, z: 43, scale: 7.5, yaw: 1.3 },
  { x: 89, z: 61, scale: 8.5, yaw: 0.5 },
  { x: -61, z: 72, scale: 8, yaw: 1.8 },
  { x: 62, z: 78, scale: 6.9, yaw: 0.3 },
  { x: -73, z: 101, scale: 7.8, yaw: 2.2 },
  { x: -51, z: 106, scale: 6.3, yaw: 1.2 },
  { x: 52, z: 103, scale: 7.1, yaw: 0.7 },
  { x: 74, z: 96, scale: 8.3, yaw: 2.9 },
  { x: -88, z: 113, scale: 7.9, yaw: 2 },
  { x: 88, z: 119, scale: 7.3, yaw: 1 },
  { x: -70, z: 127, scale: 6.8, yaw: 0.35 },
  { x: 68, z: 128, scale: 8.2, yaw: 2.75 },
];

export const TERRITORY_SIEGE_ROCKS: readonly TerritorySiegeSceneryPlacement[] = [
  { x: -108, z: 142, scale: 3.6, yaw: 0.8 },
  { x: 105, z: 151, scale: 3.1, yaw: 2.2 },
  { x: -105, z: 88, scale: 2.9, yaw: 1.3 },
  { x: 110, z: 38, scale: 3.5, yaw: 0.4 },
  { x: -109, z: -48, scale: 3.2, yaw: 2.6 },
  { x: 106, z: -126, scale: 3.8, yaw: 1.7 },
  { x: -86, z: 121, scale: 3.4, yaw: 1.8 },
  { x: 84, z: 112, scale: 3.7, yaw: 0.2 },
  { x: -53, z: 91, scale: 3.8, yaw: 0.4 },
  { x: 46, z: 92, scale: 3.1, yaw: 2.4 },
  { x: -59, z: 61, scale: 2.7, yaw: 1.2 },
  { x: 55, z: 58, scale: 3.6, yaw: 0.2 },
  { x: -70, z: 34, scale: 3.2, yaw: 2.8 },
  { x: 72, z: 16, scale: 2.8, yaw: 1.5 },
  { x: -61, z: -24, scale: 3.7, yaw: 0.9 },
  { x: 62, z: -48, scale: 3.4, yaw: 2.1 },
  { x: -69, z: -82, scale: 2.9, yaw: 1.7 },
  { x: 57, z: -88, scale: 3.8, yaw: 0.6 },
  { x: -36, z: 78, scale: 2.5, yaw: 2.5 },
  { x: 35, z: 72, scale: 2.6, yaw: 1.1 },
  { x: -87, z: 19, scale: 3, yaw: 2.2 },
  { x: 88, z: -29, scale: 3.5, yaw: 0.85 },
  { x: -83, z: -107, scale: 2.8, yaw: 0.4 },
  { x: 81, z: -120, scale: 3.1, yaw: 2.6 },
];

export const TERRITORY_SIEGE_BUSHES: readonly TerritorySiegeSceneryPlacement[] = [
  { x: -106, z: 151, scale: 2.7, yaw: 1.1 },
  { x: 108, z: 143, scale: 2.4, yaw: 2.6 },
  { x: -109, z: 96, scale: 2.5, yaw: 0.3 },
  { x: 107, z: 57, scale: 2.8, yaw: 1.8 },
  { x: -107, z: -11, scale: 2.3, yaw: 2.2 },
  { x: 109, z: -74, scale: 2.6, yaw: 0.7 },
  { x: -105, z: -132, scale: 2.7, yaw: 1.5 },
  { x: 104, z: -151, scale: 2.4, yaw: 2.9 },
  { x: -83, z: 124, scale: 2.6, yaw: 0.7 },
  { x: 81, z: 121, scale: 2.3, yaw: 2.1 },
  { x: -49, z: 104, scale: 2.8, yaw: 0.2 },
  { x: 56, z: 97, scale: 2.4, yaw: 1.2 },
  { x: -43, z: 86, scale: 2.1, yaw: 2.3 },
  { x: 42, z: 80, scale: 2.7, yaw: 0.7 },
  { x: -67, z: 62, scale: 2.5, yaw: 1.7 },
  { x: 65, z: 68, scale: 2.2, yaw: 2.8 },
  { x: -55, z: 43, scale: 2.7, yaw: 0.5 },
  { x: 58, z: 39, scale: 2.4, yaw: 1.9 },
  { x: -70, z: 3, scale: 2.2, yaw: 2.5 },
  { x: 68, z: -17, scale: 2.8, yaw: 0.8 },
  { x: -59, z: -55, scale: 2.3, yaw: 1.4 },
  { x: 57, z: -70, scale: 2.6, yaw: 2.2 },
  { x: -84, z: 72, scale: 2.7, yaw: 1.2 },
  { x: 86, z: 82, scale: 2.5, yaw: 2.4 },
  { x: -87, z: 23, scale: 2.2, yaw: 0.35 },
  { x: 85, z: -35, scale: 2.8, yaw: 1.55 },
  { x: -82, z: -93, scale: 2.4, yaw: 2.8 },
  { x: 84, z: -111, scale: 2.6, yaw: 0.15 },
];

export const TERRITORY_SIEGE_HOMES: readonly TerritorySiegeBuildingPlacement[] = [
  { kind: 'homeA', x: -27, z: -5, scale: 8.2, yaw: 0.35 },
  { kind: 'homeB', x: 27, z: -7, scale: 8, yaw: -0.3 },
  { kind: 'homeB', x: -27, z: -37, scale: 7.6, yaw: 0.15 },
  { kind: 'homeA', x: 27, z: -39, scale: 7.8, yaw: -0.2 },
];

/**
 * A restrained level-four residential cluster. Two homes occupy each side
 * bailey, leaving the central gate road, wall stairs, and rear inner-ward
 * approach as deliberate negative space.
 */
export const TERRITORY_SIEGE_CITADEL_OUTER_HOMES: readonly TerritorySiegeBuildingPlacement[] = [
  { kind: 'homeB', x: -49, z: -45, scale: 5.8, yaw: Math.PI / 2 - 0.08 },
  { kind: 'homeA', x: 49, z: -48, scale: 5.6, yaw: -Math.PI / 2 + 0.12 },
  { kind: 'homeA', x: -50, z: -112, scale: 5.4, yaw: Math.PI / 2 + 0.14 },
  { kind: 'homeB', x: 50, z: -111, scale: 5.2, yaw: -Math.PI / 2 - 0.1 },
];

const RESOURCE_BUILDING_SLOTS = new Set<TerritoryStructureSlot>([
  'granary',
  'forester',
  'mine',
  'house',
]);

export function territorySiegeResourceStructureFamily(
  slot: TerritoryStructureSlot,
  levelValue: number,
): string | null {
  if (!RESOURCE_BUILDING_SLOTS.has(slot)) return null;
  const level = Math.max(1, Math.min(4, Math.floor(levelValue)));
  if (level === 1) return 'tent';
  if (level === 2) {
    if (slot === 'mine') return 'blacksmith';
    return slot === 'forester' ? 'homeB' : 'homeA';
  }
  if (slot === 'granary') return 'townhall';
  if (slot === 'forester') return 'homeA';
  if (slot === 'mine') return 'blacksmith';
  return 'homeB';
}

export function territorySiegeResourceBuildingPlacement(
  slot: TerritoryStructureSlot,
  castleLevel: number,
): TerritorySiegeSceneryPlacement {
  const index = ['granary', 'forester', 'mine', 'house'].indexOf(slot);
  if (castleLevel >= 4) {
    return [
      { x: -27, z: 7, yaw: 0.22, scale: 5.35 },
      { x: 27, z: 5, yaw: -0.2, scale: 7.0 },
      { x: -53, z: -15, yaw: Math.PI / 3, scale: 5.2 },
      { x: 53, z: -17, yaw: -0.2, scale: 7.0 },
    ][Math.max(0, index)];
  }
  const placement = [
    { x: -27, z: -5, yaw: 0.35 },
    { x: 27, z: -7, yaw: -0.3 },
    { x: -27, z: -37, yaw: 0.15 },
    { x: 27, z: -39, yaw: -0.2 },
  ][Math.max(0, index)];
  const scale =
    (castleLevel === 1
      ? [4.8, 4.7, 4.5, 4.6]
      : castleLevel === 2
        ? [8.2, 8, 4.4, 7.8]
        : [5.1, 8.2, 5.4, 7.2])[Math.max(0, index)] ?? 5.1;
  return { ...placement, scale };
}

function territorySiegeResourceFootprints(
  structures: readonly TerritoryStructureView[],
  castleLevel: number,
): TerritorySiegeCourtyardFootprint[] {
  return structures.flatMap((structure) => {
    const family = territorySiegeResourceStructureFamily(structure.slot, structure.level);
    if (!family) return [];
    const placement = territorySiegeResourceBuildingPlacement(structure.slot, castleLevel);
    const height =
      family === 'tent' ? 4.5 : family === 'blacksmith' ? 8 : family === 'townhall' ? 12 : 11;
    return [
      measuredObb(
        `resource:${structure.slot}:level:${structure.level}`,
        family,
        placement.x,
        placement.z,
        placement.scale,
        placement.yaw,
        height,
      ),
    ];
  });
}

const hayFootprints: readonly TerritorySiegeCourtyardFootprint[] = [
  measuredObb('hay:0', 'hay', -17, -19, 3.2, 0.5, 1),
  measuredObb('hay:1', 'hay', -20, -22, 2.8, 1.8, 1),
];

const TERRITORY_SIEGE_FRONTIER_FOOTPRINTS: readonly TerritorySiegeCourtyardFootprint[] = [
  ...TERRITORY_SIEGE_HOMES.map((home, index) =>
    measuredObb(`frontier-tent:${index}`, 'tent', home.x, home.z, home.scale * 0.59, home.yaw, 4.5),
  ),
  measuredObb('frontier-watchtower', 'watchtower', 0, -63, 5.8, Math.PI, 7),
  measuredObb('frontier-workshop-tent', 'tent', -35, -52, 4.6, Math.PI / 5, 4),
  measuredObb('frontier-well', 'well', 16, -25, 5.4, 0.2, 5),
  ...hayFootprints,
];

const TERRITORY_SIEGE_CURRENT_FOOTPRINTS: readonly TerritorySiegeCourtyardFootprint[] = [
  ...TERRITORY_SIEGE_HOMES.map((home, index) =>
    measuredObb(`home:${index}`, home.kind, home.x, home.z, home.scale, home.yaw, 11),
  ),
  measuredObb('keep', 'castle', 0, -63, 5.3, Math.PI, 18),
  measuredObb('workshop', 'blacksmith', -35, -52, 4.4, Math.PI / 5, 8),
  measuredObb('well', 'well', 16, -25, 7.2, 0.2, 6),
  ...hayFootprints,
];

/** Level-three footprints remain the default for compatibility with static camera colliders. */
export const TERRITORY_SIEGE_COURTYARD_FOOTPRINTS: readonly TerritorySiegeCourtyardFootprint[] = [
  measuredObb('drakelands-home:0', 'homeA', -27, -5, 8.2, 0.35, 11),
  measuredObb('drakelands-home:1', 'homeB', 27, -7, 7.2, -0.3, 11),
  measuredObb('barracks', 'barracks', -27, -37, 5.1, 0.15, 12),
  measuredObb('townhall', 'townhall', 27, -39, 5.1, -0.2, 12),
  measuredObb('drakelands-keep', 'castle', 0, -63, 4.6, Math.PI, 20),
  measuredObb('drakelands-workshop', 'blacksmith', -35, -52, 5.4, Math.PI / 5, 8),
  measuredObb('drakelands-well', 'well', 16, -25, 7.2, 0.2, 6),
];

const CITADEL_WALL_STAIR_EDGE_HALF_THICKNESS = 0.12;
const CITADEL_WARD_EDGE_HALF_THICKNESS = 0.16;

const TERRITORY_SIEGE_CITADEL_FOOTPRINTS: readonly TerritorySiegeCourtyardFootprint[] = [
  // The broad lower bailey keeps both side routes to the rear inner gate open.
  measuredObb('citadel-home:0', 'homeA', -27, 7, 7.8, 0.22, 11),
  measuredObb('citadel-home:1', 'homeB', 27, 5, 7, -0.2, 11),
  measuredObb('citadel-workshop', 'blacksmith', -53, -15, 5.2, Math.PI / 3, 8),
  measuredObb('citadel-well', 'well', 53, -17, 7.2, -0.2, 6),
  ...TERRITORY_SIEGE_CITADEL_OUTER_HOMES.map((home, index) =>
    measuredObb(`citadel-outer-home:${index}`, home.kind, home.x, home.z, home.scale, home.yaw, 9),
  ),
  // The enlarged inner ward keeps the core's twelve-yard combat circle free.
  // The keep anchors the rear vista and the two civic buildings flank it.
  measuredObb('citadel-barracks', 'barracks', -24, -59, 5.35, 0.08, 12),
  measuredObb('citadel-townhall', 'townhall', 24, -59, 5.35, -0.08, 12),
  measuredObb('citadel-keep', 'castle', 0, -76, 5.1, 0, 20),
  ...[-1, 1].flatMap((side): TerritorySiegeCourtyardFootprint[] => {
    const stairCenterX =
      side *
      ((TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X + TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X) /
        2);
    const halfLength =
      (TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X - TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X) / 2;
    return [-1, 1].map((edge) => ({
      id: `citadel-wall-stair-rail:${side}:${edge}`,
      type: 'obb',
      x: stairCenterX,
      z:
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z +
        edge *
          (TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH - CITADEL_WALL_STAIR_EDGE_HALF_THICKNESS),
      hw: halfLength,
      hd: CITADEL_WALL_STAIR_EDGE_HALF_THICKNESS,
      yaw: 0,
      height: TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT,
    }));
  }),
  ...[-1, 1].map(
    (side): TerritorySiegeCourtyardFootprint => ({
      id: `citadel-inner-stair-rail:${side}`,
      type: 'obb',
      x:
        side *
        ((TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH +
          TERRITORY_SIEGE_CITADEL_INNER_STAIR_CLEAR_HALF_WIDTH) /
          2),
      z:
        (TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z + TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z) /
        2,
      hw:
        (TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH -
          TERRITORY_SIEGE_CITADEL_INNER_STAIR_CLEAR_HALF_WIDTH) /
        2,
      hd:
        Math.abs(
          TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z - TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
        ) / 2,
      yaw: 0,
      height: TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
    }),
  ),
  // The former front opening is sealed. Entry is on the opposite, rear edge.
  {
    id: 'citadel-inner-ward-front-skirt',
    type: 'obb',
    x: 0,
    z: TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z - CITADEL_WARD_EDGE_HALF_THICKNESS,
    hw: TERRITORY_SIEGE_CITADEL_INNER_HALF_X,
    hd: CITADEL_WARD_EDGE_HALF_THICKNESS,
    yaw: 0,
    height: TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
  },
  ...[-1, 1].map(
    (side): TerritorySiegeCourtyardFootprint => ({
      id: `citadel-inner-ward-side-skirt:${side}`,
      type: 'obb',
      x: side * (TERRITORY_SIEGE_CITADEL_INNER_HALF_X - CITADEL_WARD_EDGE_HALF_THICKNESS),
      z: (TERRITORY_SIEGE_CITADEL_INNER_BACK_Z + TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z) / 2,
      hw: CITADEL_WARD_EDGE_HALF_THICKNESS,
      hd: (TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z - TERRITORY_SIEGE_CITADEL_INNER_BACK_Z) / 2,
      yaw: 0,
      height: TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
    }),
  ),
  ...[-1, 1].map(
    (side): TerritorySiegeCourtyardFootprint => ({
      id: `citadel-inner-ward-back-skirt:${side}`,
      type: 'obb',
      x:
        side *
        ((TERRITORY_SIEGE_CITADEL_INNER_HALF_X + TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH) /
          2),
      z: TERRITORY_SIEGE_CITADEL_INNER_BACK_Z + CITADEL_WARD_EDGE_HALF_THICKNESS,
      hw:
        (TERRITORY_SIEGE_CITADEL_INNER_HALF_X - TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH) / 2,
      hd: CITADEL_WARD_EDGE_HALF_THICKNESS,
      yaw: 0,
      height: TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
    }),
  ),
  // The outer wall-walk deck is a thin elevated slab, not a column down to
  // the courtyard. It deliberately has no ground-level skirt collider, so a
  // character can walk beneath it without meeting an invisible wall. Height
  // adoption remains gated by the character's actual feet in the ground
  // solver, preventing the old upward snap.
];

/** Exact solid dressing for the visible castle tier. */
export function territorySiegeCourtyardFootprints(
  castleLevel: number,
  structures?: readonly TerritoryStructureView[],
): readonly TerritorySiegeCourtyardFootprint[] {
  const tier =
    castleLevel <= 1
      ? TERRITORY_SIEGE_FRONTIER_FOOTPRINTS
      : castleLevel === 2
        ? TERRITORY_SIEGE_CURRENT_FOOTPRINTS
        : castleLevel >= 4
          ? TERRITORY_SIEGE_CITADEL_FOOTPRINTS
          : TERRITORY_SIEGE_COURTYARD_FOOTPRINTS;
  // Callers without a durable structure snapshot retain the conservative
  // legacy footprint set. Live movement passes an array (including empty), so
  // absent city buildings cannot leave invisible collision behind.
  if (structures === undefined) return tier;
  const fixed = tier.filter((footprint) => {
    if (castleLevel <= 1) return !footprint.id.startsWith('frontier-tent:');
    if (castleLevel === 2) return !footprint.id.startsWith('home:');
    if (castleLevel === 3) {
      return (
        !footprint.id.startsWith('drakelands-home:') &&
        footprint.id !== 'barracks' &&
        footprint.id !== 'townhall'
      );
    }
    return !['citadel-home:0', 'citadel-home:1', 'citadel-workshop', 'citadel-well'].includes(
      footprint.id,
    );
  });
  return [...fixed, ...territorySiegeResourceFootprints(structures, castleLevel)];
}
