import { describe, expect, it } from 'vitest';
import {
  territorySiegeBiomeForCell,
  territorySiegeBiomeForVisualBiome,
} from '../src/sim/territory_siege_biome';

describe('territory siege biome routing', () => {
  it('routes strategic geography to the four shared battlefield sets', () => {
    expect(territorySiegeBiomeForVisualBiome('grassland')).toBe('temperate');
    expect(territorySiegeBiomeForVisualBiome('forest')).toBe('temperate');
    expect(territorySiegeBiomeForVisualBiome('highland')).toBe('rocky');
    expect(territorySiegeBiomeForVisualBiome('mountain')).toBe('rocky');
    expect(territorySiegeBiomeForVisualBiome('snowfield')).toBe('snow');
    expect(territorySiegeBiomeForVisualBiome('snowForest')).toBe('snow');
    expect(territorySiegeBiomeForVisualBiome('desert')).toBe('desert');
    expect(territorySiegeBiomeForVisualBiome('desertMesa')).toBe('desert');
    expect(territorySiegeBiomeForVisualBiome('wastes')).toBe('desert');
  });

  it('falls back to the established temperate field for a missing target cell', () => {
    expect(territorySiegeBiomeForCell(undefined, 20)).toBe('temperate');
  });
});
