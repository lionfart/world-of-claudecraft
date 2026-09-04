import { describe, expect, it } from 'vitest';
import { territorySiegeGrassPlacements } from '../src/render/territory_siege_grass_core';
import { territorySiegeTerrainLiftLocal } from '../src/sim/territory_siege_ground';

describe('siege grass placement', () => {
  it('buries the green roots of snowy tufts without burying their tips', () => {
    const grass = territorySiegeGrassPlacements('snow');
    expect(grass.length).toBeGreaterThan(100);
    for (const tuft of grass) {
      const ground = territorySiegeTerrainLiftLocal(tuft.x, tuft.z);
      expect((ground - tuft.y) / tuft.scale).toBeCloseTo(0.38);
      expect(tuft.y + 0.96 * tuft.scale).toBeGreaterThan(ground + 0.4);
    }
  });

  it('modestly increases snow density, stays deterministic and keeps roads clear', () => {
    const grass = territorySiegeGrassPlacements('snow');
    expect(grass).toEqual(territorySiegeGrassPlacements('snow'));
    expect(grass).toHaveLength(104);
    for (const tuft of grass) {
      expect(tuft.z >= 16 && Math.abs(tuft.x) < 9.5).toBe(false);
    }
  });

  it('buries desert roots like snow while reducing the number of arid tufts', () => {
    const desert = territorySiegeGrassPlacements('desert');
    expect(desert.length).toBeLessThan(300);
    expect(desert.length).toBeGreaterThan(100);
    for (const tuft of desert) {
      const ground = territorySiegeTerrainLiftLocal(tuft.x, tuft.z);
      expect((ground - tuft.y) / tuft.scale).toBeCloseTo(0.38);
      expect(tuft.y + 0.96 * tuft.scale).toBeGreaterThan(ground + 0.35);
    }
  });

  it('keeps temperate and rocky roots seated at their existing ground offset', () => {
    for (const biome of ['temperate', 'rocky'] as const) {
      for (const tuft of territorySiegeGrassPlacements(biome)) {
        expect(tuft.y - territorySiegeTerrainLiftLocal(tuft.x, tuft.z)).toBeCloseTo(0.015);
      }
    }
  });
});
