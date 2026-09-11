import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import {
  createTerritoryCaptureState,
  TERRITORY_CAPTURE_HOLD_MS,
  TERRITORY_CAPTURE_RADIUS,
  type TerritoryCaptureState,
  territoryCaptureAdmission,
  territoryCaptureCreatureId,
  territoryCaptureDifficulty,
  territoryCaptureTick,
} from '../src/sim/territory_capture';

describe('neutral territory capture', () => {
  it('keeps the camp locked until every initial guard is dead', () => {
    const state = createTerritoryCaptureState(1_000);
    const blocked = territoryCaptureTick(state, {
      nowMs: 2_000,
      initialGuardsAlive: 1,
      reinforcementsAlive: 0,
      occupants: 1,
    });
    expect(blocked.state.phase).toBe('guards');
    expect(blocked.state.progressMs).toBe(0);
    expect(blocked.spawnReinforcements).toBe(0);

    const opened = territoryCaptureTick(blocked.state, {
      nowMs: 3_000,
      initialGuardsAlive: 0,
      reinforcementsAlive: 0,
      occupants: 1,
    });
    expect(opened.state.phase).toBe('capturing');
    expect(opened.state.progressMs).toBe(0);
    expect(opened.spawnReinforcements).toBe(3);
  });

  it('advances only while a living participant holds the camp and completes at the hold time', () => {
    let state: TerritoryCaptureState = {
      ...createTerritoryCaptureState(0),
      phase: 'capturing' as const,
      nextWaveAtMs: Number.POSITIVE_INFINITY,
    };
    state = territoryCaptureTick(state, {
      nowMs: 1_000,
      initialGuardsAlive: 0,
      reinforcementsAlive: 3,
      occupants: 0,
    }).state;
    expect(state.progressMs).toBe(0);

    for (let nowMs = 2_000; nowMs <= TERRITORY_CAPTURE_HOLD_MS + 1_000; nowMs += 1_000) {
      const tick = territoryCaptureTick(state, {
        nowMs,
        initialGuardsAlive: 0,
        reinforcementsAlive: 3,
        occupants: 2,
      });
      state = tick.state;
      if (nowMs < TERRITORY_CAPTURE_HOLD_MS + 1_000) expect(tick.completed).toBe(false);
      else expect(tick.completed).toBe(true);
    }
  });

  it('uses an existing creature roster for every battlefield biome', () => {
    const firstByBiome = {
      temperate: 'forest_wolf',
      rocky: 'tunnel_rat',
      snow: 'snowdrift_wolf',
      desert: 'ashbone_raider',
    } as const;
    for (const [biome, expected] of Object.entries(firstByBiome)) {
      const first = territoryCaptureCreatureId(biome as keyof typeof firstByBiome, 0, 0);
      const second = territoryCaptureCreatureId(biome as keyof typeof firstByBiome, 1, 0);
      expect(first).toBe(expected);
      expect(MOBS[first]).toBeDefined();
      expect(MOBS[second]).toBeDefined();
    }
  });

  it('raises level, power, and creature tier monotonically from rim to centre', () => {
    const rim = territoryCaptureDifficulty(20, 0, 20);
    const middle = territoryCaptureDifficulty(10, 0, 20);
    const core = territoryCaptureDifficulty(0, 0, 20);
    expect(rim).toEqual({ tier: 1, level: 3, powerMultiplier: 1 });
    expect(middle.tier).toBeGreaterThan(rim.tier);
    expect(core.tier).toBe(4);
    expect(core.level).toBeGreaterThan(middle.level);
    expect(core.powerMultiplier).toBeGreaterThan(middle.powerMultiplier);
    expect(territoryCaptureCreatureId('snow', 0, 0, rim.tier)).toBe('snowdrift_wolf');
    expect(territoryCaptureCreatureId('snow', 0, 0, core.tier)).toBe('terrace_howler');
  });

  it('uses a larger camp-wide capture radius', () => {
    expect(TERRITORY_CAPTURE_RADIUS).toBeGreaterThanOrEqual(18);
  });

  it('requires an officer, a claimable adjacent empty cell, and free capacity', () => {
    expect(
      territoryCaptureAdmission({
        rank: 'member',
        claimable: true,
        alreadyOwned: false,
        adjacent: true,
        ownedCount: 1,
        capacity: 2,
      }),
    ).toBe('forbidden');
    expect(
      territoryCaptureAdmission({
        rank: 'officer',
        claimable: true,
        alreadyOwned: false,
        adjacent: true,
        ownedCount: 1,
        capacity: 2,
      }),
    ).toBeNull();
  });
});
