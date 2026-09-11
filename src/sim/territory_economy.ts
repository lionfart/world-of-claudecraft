import type { TerritoryStructureKind } from '../world_api/territory';
import { TERRITORY_CASTLE_MAX_LEVEL } from './territory_castle_progression';
import type { TerritoryResourceKind } from './territory_manifest';

export type TerritorySiegeCraftKind = 'ram' | 'mortar' | 'catapult';

export interface TerritorySiegeRecipe {
  itemId: string;
  resources: Readonly<Record<TerritoryResourceKind, number>>;
  copper: number;
}

export interface TerritoryStructureCost {
  resources: Readonly<Record<TerritoryResourceKind, number>>;
  /** Main-game purse cost, stored in copper (100 copper = 1 silver). */
  copper: number;
}

export const TERRITORY_CLAIM_COST = { wood: 10, iron: 5, grain: 10, labor: 5 } as const;
export const TERRITORY_WAR_COST = { wood: 50, iron: 75, grain: 50, labor: 50 } as const;

/**
 * Territory production is credited in authoritative one-hour slices. Opening
 * the map, reconnecting, or refreshing the UI never accelerates the economy.
 */
export const TERRITORY_RESOURCE_TICK_MS = 60 * 60_000;
export const TERRITORY_RESOURCE_TICKS_PER_HOUR = (60 * 60_000) / TERRITORY_RESOURCE_TICK_MS;

const TERRITORY_STOCKPILE_CAPACITY = [0, 500, 1_000, 2_000, 4_000] as const;

/** Storage contributed by one active city Stockpile. */
export function territoryStockpileCapacity(level: number): number {
  const normalized = Number.isFinite(level)
    ? Math.max(1, Math.min(TERRITORY_CASTLE_MAX_LEVEL, Math.floor(level)))
    : 1;
  return TERRITORY_STOCKPILE_CAPACITY[normalized];
}

/**
 * Shared authoritative/UI structure price ladder.
 *
 * A level-one building is paid entirely from the builder's normal purse. From
 * level two onward the guild also supplies territory materials, while coin
 * remains part of every upgrade. The castle is deliberately the heaviest
 * upgrade because it raises the level ceiling of every other building.
 */
export function territoryStructureCost(
  kind: TerritoryStructureKind,
  nextLevel: number,
): TerritoryStructureCost {
  const level = Math.max(1, Math.min(TERRITORY_CASTLE_MAX_LEVEL, Math.floor(nextLevel)));
  const weight =
    kind === 'keep'
      ? 5
      : kind === 'gate' || kind === 'wall' || kind === 'walls'
        ? 3
        : kind === 'defense_tower' || kind === 'towers'
          ? 4
          : 2;
  const resources =
    level === 1
      ? { wood: 0, iron: 0, grain: 0, labor: 0 }
      : {
          wood: weight * level * 12,
          iron: weight * level * 10,
          grain: weight * level * 5,
          labor: weight * level * 8,
        };
  return {
    resources,
    copper: weight * level * 250,
  };
}

export const TERRITORY_RESOURCE_STRUCTURE = {
  wood: 'forester',
  iron: 'mine',
  grain: 'granary',
  labor: 'house',
} as const;

export const TERRITORY_SIEGE_RECIPES: Readonly<
  Record<TerritorySiegeCraftKind, TerritorySiegeRecipe>
> = {
  ram: {
    itemId: 'territory_battering_ram',
    resources: { wood: 80, iron: 35, grain: 15, labor: 30 },
    copper: 500,
  },
  mortar: {
    itemId: 'territory_field_mortar',
    resources: { wood: 30, iron: 80, grain: 20, labor: 35 },
    copper: 1_000,
  },
  catapult: {
    itemId: 'territory_catapult',
    resources: { wood: 100, iron: 50, grain: 25, labor: 45 },
    copper: 1_500,
  },
};

export function territoryResourceProductionMultiplier(
  kind: TerritoryResourceKind,
  structureLevels: Readonly<Partial<Record<'granary' | 'forester' | 'mine' | 'house', number>>>,
): number {
  return Math.max(0, Math.floor(structureLevels[TERRITORY_RESOURCE_STRUCTURE[kind]] ?? 0));
}

/**
 * Production for one claimed hex. A natural deposit supplies the hex yield
 * (x1-x3), and only the matching active building in that same city supplies
 * the level multiplier (x1-x4). An absent building therefore produces zero.
 */
export function territoryResourceProductionPerTick(
  kind: TerritoryResourceKind,
  naturalYield: number,
  structureLevels: Readonly<Partial<Record<'granary' | 'forester' | 'mine' | 'house', number>>>,
): number {
  const yieldMultiplier = Number.isFinite(naturalYield) ? Math.max(0, Math.floor(naturalYield)) : 0;
  return yieldMultiplier * territoryResourceProductionMultiplier(kind, structureLevels);
}

/** Player-facing hourly rate for one claimed hex. */
export function territoryResourceProductionPerHour(
  kind: TerritoryResourceKind,
  naturalYield: number,
  structureLevels: Readonly<Partial<Record<'granary' | 'forester' | 'mine' | 'house', number>>>,
): number {
  return (
    territoryResourceProductionPerTick(kind, naturalYield, structureLevels) *
    TERRITORY_RESOURCE_TICKS_PER_HOUR
  );
}
