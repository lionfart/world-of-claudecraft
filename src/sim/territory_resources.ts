import type { TerritoryResourceKind } from './territory_manifest';

export const TERRITORY_RESOURCE_ITEM_IDS: Readonly<Record<TerritoryResourceKind, string>> = {
  wood: 'territory_wood',
  iron: 'territory_iron',
  grain: 'territory_grain',
  labor: 'territory_labor',
};

export type TerritoryResourceCost = Readonly<Record<TerritoryResourceKind, number>>;

export function territoryResourceCostEntries(
  cost: TerritoryResourceCost,
): Array<readonly [itemId: string, amount: number]> {
  return (Object.keys(TERRITORY_RESOURCE_ITEM_IDS) as TerritoryResourceKind[]).flatMap((kind) => {
    const amount = Math.max(0, Math.floor(cost[kind]));
    return amount > 0 ? [[TERRITORY_RESOURCE_ITEM_IDS[kind], amount] as const] : [];
  });
}
