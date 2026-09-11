import { describe, expect, it } from 'vitest';
import {
  TERRITORY_RESOURCE_ITEM_IDS,
  territoryResourceCostEntries,
} from '../src/sim/territory_resources';

describe('territory resource items', () => {
  it('maps every produced territory resource to a distinct bag item', () => {
    expect(TERRITORY_RESOURCE_ITEM_IDS).toEqual({
      wood: 'territory_wood',
      iron: 'territory_iron',
      grain: 'territory_grain',
      labor: 'territory_labor',
    });
  });

  it('drops zero-cost entries before inventory validation and consumption', () => {
    expect(territoryResourceCostEntries({ wood: 80, iron: 0, grain: 15, labor: 30 })).toEqual([
      ['territory_wood', 80],
      ['territory_grain', 15],
      ['territory_labor', 30],
    ]);
  });
});
