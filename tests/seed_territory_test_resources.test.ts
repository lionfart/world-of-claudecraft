import { describe, expect, it } from 'vitest';
import {
  TERRITORY_TEST_COPPER,
  TERRITORY_TEST_ITEMS,
  seedTerritoryTestState,
} from '../scripts/seed_territory_test_resources.mjs';

describe('territory test-resource seed', () => {
  it('preserves character data and grants every territory stack plus 10,000 silver', () => {
    const seeded = seedTerritoryTestState({
      name: 'Keeper',
      copper: 25,
      inventory: [{ itemId: 'territory_wood', count: 40 }],
    });
    expect(seeded.name).toBe('Keeper');
    expect(seeded.copper).toBe(TERRITORY_TEST_COPPER);
    for (const itemId of TERRITORY_TEST_ITEMS) {
      expect(
        seeded.inventory
          .filter((slot: { itemId: string }) => slot.itemId === itemId)
          .reduce((total: number, slot: { count: number }) => total + slot.count, 0),
      ).toBe(10_000);
    }
  });

  it('is idempotent and never reduces a larger existing purse or stack', () => {
    const once = seedTerritoryTestState({
      copper: TERRITORY_TEST_COPPER + 7,
      inventory: [{ itemId: 'territory_iron', count: 12_000 }],
    });
    expect(seedTerritoryTestState(once)).toEqual(once);
  });
});
