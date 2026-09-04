import type { TerritoryResourceKind } from './territory_manifest';

export type TerritorySiegeCraftKind = 'ram' | 'mortar' | 'catapult';

export interface TerritorySiegeRecipe {
  itemId: string;
  resources: Readonly<Record<TerritoryResourceKind, number>>;
  copper: number;
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
