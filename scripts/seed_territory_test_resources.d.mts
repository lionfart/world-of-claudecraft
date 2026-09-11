export const TERRITORY_TEST_ITEMS: readonly string[];
export const TERRITORY_TEST_ITEM_COUNT: number;
export const TERRITORY_TEST_COPPER: number;

export function seedTerritoryTestState<T extends Record<string, unknown>>(
  input: T,
): T & { copper: number; inventory: Array<{ itemId: string; count: number }> };
