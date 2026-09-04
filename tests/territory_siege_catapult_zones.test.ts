import { describe, expect, it } from 'vitest';
import { TerritorySiegeCatapultZones } from '../server/territory_siege_catapult_zones';

describe('territory siege catapult zones', () => {
  it('waits for alignment, then replicates an arc and lands on enemy players', () => {
    const zones = new TerritorySiegeCatapultZones();
    zones.queue(
      {
        warId: 'war-1',
        sourceCharacterId: 10,
        catapultId: 4,
        kind: 'cluster',
        side: 'attacker',
        fromX: 20,
        fromZ: 52,
        x: 0,
        z: 18,
        radius: 10,
        damage: 14,
        structureDamage: 18,
        launchDelayMs: 1_000,
        delayMs: 2_400,
        slow: { multiplier: 0.58, duration: 4 },
      },
      { fromX: 120, fromZ: 252, x: 100, z: 218 },
      1_000,
    );
    expect(zones.view('war-1', 1_600)).toEqual([
      expect.objectContaining({
        catapultId: 4,
        fromX: 120,
        fromZ: 252,
        x: 100,
        z: 218,
        kind: 'cluster',
        duration: 2.4,
        launchesIn: 0.4,
        detonatesIn: 2.8,
      }),
    ]);
    const targets = [
      { characterId: 20, warId: 'war-1', side: 'defender' as const, x: 104, z: 218, alive: true },
      { characterId: 11, warId: 'war-1', side: 'attacker' as const, x: 104, z: 218, alive: true },
      { characterId: 21, warId: 'war-1', side: 'defender' as const, x: 120, z: 218, alive: true },
    ];
    expect(zones.detonate(4_399, targets).hits).toEqual([]);
    expect(zones.detonate(4_400, targets).hits).toEqual([
      expect.objectContaining({
        sourceCharacterId: 10,
        targetCharacterId: 20,
        damage: 14,
        kind: 'cluster',
        slow: { multiplier: 0.58, duration: 4 },
      }),
    ]);
    expect(zones.view('war-1', 4_400)).toEqual([]);
  });
});
