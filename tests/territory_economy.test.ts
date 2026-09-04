import { describe, expect, it } from 'vitest';
import {
  TERRITORY_SIEGE_RECIPES,
  territoryResourceProductionMultiplier,
} from '../src/sim/territory_economy';

describe('territory economy buildings', () => {
  it('blocks each resource until its matching economy building exists', () => {
    expect(territoryResourceProductionMultiplier('grain', {})).toBe(0);
    expect(territoryResourceProductionMultiplier('wood', { granary: 5 })).toBe(0);
    expect(territoryResourceProductionMultiplier('iron', { mine: 2 })).toBe(2);
    expect(territoryResourceProductionMultiplier('labor', { house: 3 })).toBe(3);
  });

  it('charges every guild resource and personal coin for every siege recipe', () => {
    for (const recipe of Object.values(TERRITORY_SIEGE_RECIPES)) {
      expect(recipe.copper).toBeGreaterThan(0);
      expect(Object.values(recipe.resources).every((cost) => cost > 0)).toBe(true);
    }
  });
});
