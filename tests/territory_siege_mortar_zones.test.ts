import { describe, expect, it } from 'vitest';
import { TerritorySiegeMortarZones } from '../server/territory_siege_mortar_zones';

describe('territory siege mortar zones', () => {
  it('waits for alignment, then flies and hits only enemy participant players', () => {
    const zones = new TerritorySiegeMortarZones();
    zones.queue(
      {
        warId: 'war-1',
        sourceCharacterId: 20,
        mortarId: 1,
        kind: 'frost',
        side: 'defender',
        fromX: 0,
        fromZ: -18,
        x: 0,
        z: 20,
        radius: 7,
        damage: 16,
        launchDelayMs: 1_000,
        delayMs: 2_200,
        slow: { multiplier: 0.5, duration: 5 },
      },
      { fromX: 100, fromZ: 162, x: 100, z: 200 },
      1_000,
    );
    expect(zones.view('war-1', 1_600)).toEqual([
      expect.objectContaining({
        mortarId: 1,
        fromX: 100,
        fromZ: 162,
        x: 100,
        z: 200,
        kind: 'frost',
        duration: 2.2,
        launchesIn: 0.4,
        detonatesIn: 2.6,
      }),
    ]);
    const targets = [
      { characterId: 10, warId: 'war-1', side: 'attacker' as const, x: 102, z: 200, alive: true },
      { characterId: 21, warId: 'war-1', side: 'defender' as const, x: 102, z: 200, alive: true },
      { characterId: 11, warId: 'war-1', side: 'attacker' as const, x: 120, z: 200, alive: true },
    ];
    expect(zones.detonate(4_199, targets).hits).toEqual([]);
    expect(zones.detonate(4_200, targets).hits).toEqual([
      expect.objectContaining({
        sourceCharacterId: 20,
        targetCharacterId: 10,
        kind: 'frost',
        damage: 16,
      }),
    ]);
    expect(zones.view('war-1', 4_200)).toEqual([]);
  });
});
