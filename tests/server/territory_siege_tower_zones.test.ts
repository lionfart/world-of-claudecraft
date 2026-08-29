import { describe, expect, it } from 'vitest';
import { TerritorySiegeTowerZones } from '../../server/territory_siege_tower_zones';

describe('territory siege tower telegraphs', () => {
  it('warns before damage and only hits attackers still inside the marked area', () => {
    const zones = new TerritorySiegeTowerZones();
    zones.queue('war-1', { x: 10, z: 20 }, 14, 1_000);
    expect(zones.view('war-1', 1_000)).toMatchObject([
      { x: 10, z: 20, radius: 5, detonatesIn: 1.8 },
    ]);
    expect(
      zones.detonate(2_799, [{ characterId: 1, warId: 'war-1', x: 10, z: 20, alive: true }]),
    ).toEqual({ hits: [], removed: false });
    expect(
      zones.detonate(2_800, [
        { characterId: 1, warId: 'war-1', x: 16, z: 20, alive: true },
        { characterId: 2, warId: 'war-1', x: 12, z: 20, alive: true },
        { characterId: 3, warId: 'war-2', x: 10, z: 20, alive: true },
      ]),
    ).toEqual({ hits: [{ characterId: 2, damage: 14 }], removed: true });
    expect(zones.view('war-1', 2_800)).toEqual([]);
  });
});
