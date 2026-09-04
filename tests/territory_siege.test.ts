import { describe, expect, it } from 'vitest';
import {
  createTerritorySiege,
  TERRITORY_SIEGE_CATAPULT_MAX_HP,
  TERRITORY_SIEGE_MORTAR_MAX_HP,
  TERRITORY_SIEGE_RAM_MAX_HP,
  type TerritorySiegeRules,
  territorySiegeApplyAction,
  territorySiegeApplyCatapultStructureImpact,
  territorySiegeConsumeRespawn,
  territorySiegeControlFor,
  territorySiegeDisconnect,
  territorySiegeDrainLaunchedCatapultImpacts,
  territorySiegeDrainLaunchedMortarImpacts,
  territorySiegeJoin,
  territorySiegeMarkResolved,
  territorySiegeRecordDeath,
  territorySiegeTick,
  territorySiegeTowerShot,
  territorySiegeViewFor,
} from '../src/sim/territory_siege';
import {
  TERRITORY_SIEGE_TOWER_X,
  TERRITORY_SIEGE_TOWER_Z,
  territorySiegeWallSegmentPlacements,
} from '../src/sim/territory_siege_layout';

const rules: TerritorySiegeRules = {
  teamSize: 2,
  disconnectGraceMs: 120_000,
  respawnWaveMs: 15_000,
  attackerForfeitMs: 600_000,
  actionCooldownMs: 500,
};

function match(gateLevel = 1) {
  return createTerritorySiege({
    warId: 'war-1',
    warVersion: 1,
    biome: 'temperate',
    startsAtMs: 1_000,
    endsAtMs: 3_601_000,
    gateLevel,
    coreLevel: 1,
    attackerHasSiegeWorkshop: true,
  });
}

describe('territory siege', () => {
  it('keeps a registered attacker seat reconnectable for the entire battle', () => {
    const state = match();
    expect(territorySiegeJoin(state, 10, 'attacker', 0, rules)).toMatchObject({ ok: true });
    expect(territorySiegeJoin(state, 11, 'attacker', 0, rules)).toMatchObject({ ok: true });
    expect(territorySiegeJoin(state, 12, 'attacker', 0, rules)).toEqual({
      ok: false,
      reason: 'team_full',
    });
    territorySiegeDisconnect(state, 10, 2_000, rules);
    territorySiegeTick(state, 121_999, rules);
    expect(territorySiegeJoin(state, 12, 'attacker', 121_999, rules)).toEqual({
      ok: false,
      reason: 'team_full',
    });
    expect(territorySiegeJoin(state, 10, 'attacker', 121_999, rules)).toMatchObject({
      ok: true,
      reconnected: true,
    });
    territorySiegeDisconnect(state, 10, 122_000, rules);
    territorySiegeTick(state, 242_000, rules);
    expect(territorySiegeJoin(state, 12, 'attacker', 242_000, rules)).toEqual({
      ok: false,
      reason: 'team_full',
    });
    expect(territorySiegeJoin(state, 10, 'attacker', 242_000, rules)).toMatchObject({
      ok: true,
      seat: { seatNo: 1 },
      reconnected: true,
    });
  });

  it('releases a disconnected defender seat after the ordinary grace period', () => {
    const state = match();
    territorySiegeJoin(state, 20, 'defender', 0, rules);
    territorySiegeJoin(state, 21, 'defender', 0, rules);
    territorySiegeDisconnect(state, 20, 2_000, rules);
    territorySiegeTick(state, 122_000, rules);
    expect(territorySiegeJoin(state, 22, 'defender', 122_000, rules)).toMatchObject({
      ok: true,
      seat: { seatNo: 1 },
    });
  });

  it('respawns dead participants on the next shared 15 second wave', () => {
    const state = match(0);
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    expect(territorySiegeRecordDeath(state, 10, 7_000, rules)).toBe(16_000);
    expect(territorySiegeViewFor(state, 10, 7_000)?.respawnIn).toBe(9);
    territorySiegeTick(state, 15_999, rules);
    expect(territorySiegeViewFor(state, 10, 15_999)?.respawnIn).toBe(1);
    territorySiegeTick(state, 16_000, rules);
    expect(territorySiegeViewFor(state, 10, 16_000)?.respawnIn).toBe(0);
    expect(territorySiegeConsumeRespawn(state, 10, 16_000)).toBe(true);
  });

  it('requires an occupied ram and the gate before a core channel can begin', () => {
    const state = match();
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    expect(territorySiegeApplyAction(state, 10, 'start_core_channel', 2_000, rules)).toEqual({
      ok: false,
      reason: 'gate_locked_core',
    });
    expect(territorySiegeApplyAction(state, 10, 'ram_gate', 2_000, rules)).toEqual({
      ok: false,
      reason: 'ram_not_occupied',
    });
    expect(territorySiegeApplyAction(state, 10, 'deploy_ram', 2_000, rules)).toMatchObject({
      ok: true,
      ended: false,
      consumeRam: true,
    });
    expect(territorySiegeApplyAction(state, 10, 'enter_ram', 3_000, rules).ok).toBe(true);
    for (let now = 4_000; state.gateHp > 0; now += 3_000) {
      expect(territorySiegeApplyAction(state, 10, 'ram_gate', now, rules).ok).toBe(true);
    }
    expect(state.gateHp).toBe(0);
    expect(territorySiegeApplyAction(state, 10, 'start_core_channel', 30_000, rules).ok).toBe(true);
  });

  it('provisions a sealed base gate when the territory has no built gate', () => {
    const state = match(0);
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    expect(state.gateMaxHp).toBe(125);
    expect(territorySiegeViewFor(state, 10, 1_000)?.gateOpen).toBe(false);
    expect(territorySiegeApplyAction(state, 10, 'start_core_channel', 2_000, rules)).toEqual({
      ok: false,
      reason: 'gate_locked_core',
    });
  });

  it('allows the core channel after breaching a wall while the gate remains intact', () => {
    const state = match();
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    state.wallHp['left:3'] = 0;
    expect(state.gateHp).toBeGreaterThan(0);
    expect(territorySiegeApplyAction(state, 10, 'start_core_channel', 2_000, rules)).toMatchObject({
      ok: true,
      ended: false,
    });
    expect(state.coreChannels.has(10)).toBe(true);
    const coreBefore = state.coreHp;
    territorySiegeTick(state, 4_000, rules);
    expect(state.coreChannels.has(10)).toBe(true);
    expect(state.coreHp).toBeLessThan(coreBefore);
  });

  it('resolves core destruction exactly once after the base gate falls', () => {
    const state = match(0);
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    state.gateHp = 0;
    territorySiegeApplyAction(state, 10, 'start_core_channel', 2_000, rules);
    territorySiegeTick(state, 30_000, rules);
    expect(state.winner).toBe('attacker');
    expect(state.resultReason).toBe('core_destroyed');
    expect(territorySiegeMarkResolved(state)).toBe(true);
    expect(territorySiegeMarkResolved(state)).toBe(false);
  });

  it('makes every ram a single-player weapon with fixed damage and cadence', () => {
    const largeRules = { ...rules, teamSize: 2 };
    const state = match();
    for (let characterId = 10; characterId <= 11; characterId += 1) {
      territorySiegeJoin(state, characterId, 'attacker', 1_000, largeRules);
    }
    territorySiegeApplyAction(state, 10, 'deploy_ram', 2_000, largeRules);
    expect(territorySiegeApplyAction(state, 10, 'enter_ram', 3_000, largeRules).ok).toBe(true);
    expect(territorySiegeApplyAction(state, 11, 'enter_ram', 3_100, largeRules)).toEqual({
      ok: false,
      reason: 'ram_full',
    });
    const before = state.gateHp;
    expect(territorySiegeApplyAction(state, 10, 'ram_gate', 4_000, largeRules).ok).toBe(true);
    expect(before - state.gateHp).toBe(20);
    expect(territorySiegeApplyAction(state, 10, 'ram_gate', 6_399, largeRules)).toEqual({
      ok: false,
      reason: 'ram_cooldown',
    });
    expect(territorySiegeApplyAction(state, 10, 'ram_gate', 6_400, largeRules).ok).toBe(true);
    const beforePower = state.gateHp;
    const power = territorySiegeApplyAction(state, 10, 'ram_power_slam', 6_900, largeRules);
    expect(power).toMatchObject({
      ok: true,
      ramImpact: { radius: 9, damage: 28, knockback: 7 },
    });
    expect(beforePower - state.gateHp).toBe(48);
    expect(territorySiegeApplyAction(state, 10, 'ram_power_slam', 7_500, largeRules)).toEqual({
      ok: false,
      reason: 'ram_power_cooldown',
    });
  });

  it('consumes inventory only in the gate apron and snaps up to three rams into formation', () => {
    const largeRules = { ...rules, teamSize: 5 };
    const state = match();
    for (let characterId = 10; characterId <= 14; characterId += 1) {
      territorySiegeJoin(state, characterId, 'attacker', 1_000, largeRules);
    }
    expect(
      territorySiegeApplyAction(state, 10, 'deploy_ram', 2_000, largeRules, {
        x: -6,
        z: 27,
        hasRamItem: false,
      }),
    ).toEqual({ ok: false, reason: 'ram_item_required' });
    expect(
      territorySiegeApplyAction(state, 10, 'deploy_ram', 2_500, largeRules, {
        x: -6,
        z: 27,
        hasRamItem: true,
      }),
    ).toMatchObject({ ok: true, consumeRam: true });
    expect(
      territorySiegeApplyAction(state, 11, 'deploy_ram', 2_500, largeRules, {
        x: 9,
        z: 27,
        hasRamItem: true,
      }),
    ).toEqual({ ok: false, reason: 'ram_out_of_zone' });
    expect(
      territorySiegeApplyAction(state, 11, 'deploy_ram', 2_500, largeRules, {
        x: -4,
        z: 27,
        hasRamItem: true,
      }).ok,
    ).toBe(true);
    expect(
      territorySiegeApplyAction(state, 12, 'deploy_ram', 3_000, largeRules, {
        x: 0,
        z: 27,
        hasRamItem: true,
      }).ok,
    ).toBe(true);
    expect(
      territorySiegeApplyAction(state, 13, 'deploy_ram', 3_000, largeRules, {
        x: 0,
        z: 40,
        hasRamItem: true,
      }),
    ).toEqual({ ok: false, reason: 'ram_limit' });
    expect([...state.rams.values()].map(({ x, z, yaw }) => ({ x, z, yaw }))).toEqual([
      expect.objectContaining({ yaw: -0.6 }),
      expect.objectContaining({ yaw: 0 }),
      expect.objectContaining({ yaw: 0.6 }),
    ]);
    expect(
      territorySiegeApplyAction(state, 14, 'deploy_ram', 3_000, largeRules, {
        x: 9,
        z: 27,
        hasRamItem: true,
      }),
    ).toEqual({ ok: false, reason: 'ram_limit' });
    expect(state.rams).toHaveLength(3);
  });

  it('lets either side operate mortars while never damaging castle objectives', () => {
    const state = match();
    territorySiegeJoin(state, 20, 'defender', 1_000, rules);
    const gateBefore = state.gateHp;
    const coreBefore = state.coreHp;
    expect(
      territorySiegeApplyAction(state, 20, 'deploy_mortar', 2_000, rules, {
        x: 0,
        z: -18,
        hasMortarItem: true,
      }),
    ).toMatchObject({ ok: true, consumeMortar: true });
    expect(
      territorySiegeApplyAction(state, 20, 'enter_mortar', 2_500, rules, { x: 0, z: -18 }).ok,
    ).toBe(true);
    const shot = territorySiegeApplyAction(state, 20, 'mortar_fire', 3_000, rules, {
      aimX: 0,
      aimZ: 20,
    });
    expect(shot).toMatchObject({
      ok: true,
      ended: false,
    });
    expect(state.pendingMortarShots).toHaveLength(1);
    expect(territorySiegeViewFor(state, 20, 3_000)?.mortars[0]).toMatchObject({
      yaw: Math.PI,
      targetYaw: 0,
    });
    expect(territorySiegeViewFor(state, 20, 4_500)?.mortars[0].yaw).toBeCloseTo(Math.PI / 2);
    territorySiegeTick(state, 5_999, rules);
    expect(territorySiegeDrainLaunchedMortarImpacts(state)).toEqual([]);
    territorySiegeTick(state, 6_000, rules);
    expect(territorySiegeDrainLaunchedMortarImpacts(state)).toMatchObject([
      {
        sourceCharacterId: 20,
        impact: {
          kind: 'normal',
          side: 'defender',
          fromX: 0,
          fromZ: -18,
          damage: 34,
          launchDelayMs: 0,
          delayMs: 2_200,
        },
      },
    ]);
    expect(state.gateHp).toBe(gateBefore);
    expect(state.coreHp).toBe(coreBefore);
    expect(
      territorySiegeApplyAction(state, 20, 'mortar_frost', 4_000, rules, {
        aimX: 4,
        aimZ: 20,
      }),
    ).toEqual({ ok: false, reason: 'mortar_cooldown' });
  });

  it('deploys a mortar at an arbitrary clear battlefield position', () => {
    const state = match();
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    expect(
      territorySiegeApplyAction(state, 10, 'deploy_mortar', 2_000, rules, {
        x: 24,
        z: 50,
        hasMortarItem: true,
      }),
    ).toMatchObject({ ok: true, consumeMortar: true });
    expect([...state.mortars.values()][0]).toMatchObject({
      x: 24,
      z: 50,
      side: 'attacker',
    });
  });

  it('deploys a facing-aware catapult and queues both aimed rock attacks', () => {
    const state = match();
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    expect(
      territorySiegeApplyAction(state, 10, 'deploy_catapult', 2_000, rules, {
        x: 20,
        z: 52,
        facing: 1.25,
        hasCatapultItem: true,
      }),
    ).toMatchObject({ ok: true, consumeCatapult: true });
    expect([...state.catapults.values()][0]).toMatchObject({ x: 20, z: 52, yaw: 1.25 });
    expect(
      territorySiegeApplyAction(state, 10, 'enter_catapult', 2_500, rules, {
        x: 20,
        z: 52,
      }).ok,
    ).toBe(true);
    const normal = territorySiegeApplyAction(state, 10, 'catapult_fire', 3_000, rules, {
      aimX: 0,
      aimZ: 18,
    });
    expect(normal).toEqual({ ok: true, ended: false });
    const catapult = [...state.catapults.values()][0];
    const firstLaunchAt = catapult.nextLaunchAtMs;
    expect(catapult.yaw).toBeCloseTo(Math.atan2(-20, -34));
    expect(territorySiegeViewFor(state, 10, 3_000)?.catapults?.[0].yaw).toBeCloseTo(1.25);
    expect(territorySiegeViewFor(state, 10, 3_000)?.catapults?.[0].targetYaw).toBeCloseTo(
      Math.atan2(-20, -34),
    );
    expect(
      territorySiegeApplyAction(state, 10, 'catapult_cluster', 4_000, rules, {
        aimX: 4,
        aimZ: 20,
      }),
    ).toEqual({ ok: false, reason: 'catapult_cooldown' });
    territorySiegeTick(state, firstLaunchAt - 1, rules);
    expect(territorySiegeDrainLaunchedCatapultImpacts(state)).toEqual([]);
    territorySiegeTick(state, firstLaunchAt, rules);
    expect(territorySiegeDrainLaunchedCatapultImpacts(state)).toMatchObject([
      {
        sourceCharacterId: 10,
        impact: {
          kind: 'normal',
          side: 'attacker',
          x: 0,
          z: 18,
          damage: 30,
          structureDamage: 36,
          launchDelayMs: 0,
          delayMs: 2_400,
        },
      },
    ]);
    const clusterAt = firstLaunchAt + 500;
    expect(
      territorySiegeApplyAction(state, 10, 'catapult_cluster', clusterAt, rules, {
        aimX: 4,
        aimZ: 20,
      }),
    ).toEqual({ ok: true, ended: false });
    territorySiegeTick(state, catapult.nextLaunchAtMs, rules);
    expect(territorySiegeDrainLaunchedCatapultImpacts(state)).toMatchObject([
      {
        sourceCharacterId: 10,
        impact: {
          kind: 'cluster',
          radius: 10,
          damage: 14,
          structureDamage: 18,
          slow: { multiplier: 0.58, duration: 4 },
        },
      },
    ]);
  });

  it('lets attacker catapult landings damage individual wall segments and built towers', () => {
    const state = createTerritorySiege({ ...match().definition, defenseTowerLevel: 2 });
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    const gateBefore = state.gateHp;
    expect(
      territorySiegeApplyCatapultStructureImpact(state, {
        side: 'attacker',
        x: 0,
        z: 18,
        radius: 2,
        structureDamage: 36,
      }),
    ).toBe(true);
    expect(state.gateHp).toBe(gateBefore - 36);

    const wall = territorySiegeWallSegmentPlacements()['left:3'];
    expect(Object.keys(state.wallHp)).toHaveLength(30);
    const wallBefore = state.wallHp['left:3'];
    const neighborBefore = state.wallHp['left:2'];
    territorySiegeApplyCatapultStructureImpact(state, {
      side: 'attacker',
      x: wall.x,
      z: wall.z,
      radius: 2,
      structureDamage: 36,
    });
    expect(state.wallHp['left:3']).toBe(wallBefore - 36);
    expect(state.wallHp['left:2']).toBe(neighborBefore);

    const towerBefore = state.towerHp.right;
    territorySiegeApplyCatapultStructureImpact(state, {
      side: 'attacker',
      x: TERRITORY_SIEGE_TOWER_X,
      z: TERRITORY_SIEGE_TOWER_Z,
      radius: 2,
      structureDamage: 36,
    });
    expect(state.towerHp.right).toBe(towerBefore - 36);
    expect(
      territorySiegeApplyCatapultStructureImpact(state, {
        side: 'defender',
        x: TERRITORY_SIEGE_TOWER_X,
        z: TERRITORY_SIEGE_TOWER_Z,
        radius: 10,
        structureDamage: 999,
      }),
    ).toBe(false);
    expect(state.towerHp.right).toBe(towerBefore - 36);
  });

  it('gives every field weapon health and destroys only hostile weapons caught by catapult fire', () => {
    const state = match();
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    territorySiegeJoin(state, 20, 'defender', 1_000, rules);
    state.rams.set(1, {
      id: 1,
      x: 0,
      z: 27,
      yaw: 0,
      operatorCharacterId: 10,
      nextSwingAtMs: 0,
      nextPowerSwingAtMs: 0,
      hp: TERRITORY_SIEGE_RAM_MAX_HP,
      maxHp: TERRITORY_SIEGE_RAM_MAX_HP,
    });
    state.mortars.set(1, {
      id: 1,
      x: 16,
      z: -20,
      yaw: Math.PI,
      side: 'defender',
      operatorCharacterId: 20,
      nextLaunchAtMs: 0,
      nextShotAtMs: 0,
      nextFrostAtMs: 0,
      nextVenomAtMs: 0,
      hp: TERRITORY_SIEGE_MORTAR_MAX_HP,
      maxHp: TERRITORY_SIEGE_MORTAR_MAX_HP,
    });
    state.catapults.set(1, {
      id: 1,
      x: 20,
      z: 52,
      yaw: 0,
      side: 'attacker',
      operatorCharacterId: null,
      nextLaunchAtMs: 0,
      nextShotAtMs: 0,
      nextClusterAtMs: 0,
      hp: TERRITORY_SIEGE_CATAPULT_MAX_HP,
      maxHp: TERRITORY_SIEGE_CATAPULT_MAX_HP,
    });

    expect(
      territorySiegeApplyCatapultStructureImpact(state, {
        side: 'defender',
        x: 0,
        z: 27,
        radius: 2,
        structureDamage: 999,
      }),
    ).toBe(true);
    expect(state.rams.has(1)).toBe(false);
    expect(territorySiegeControlFor(state, 10)).toBeNull();

    territorySiegeApplyCatapultStructureImpact(state, {
      side: 'attacker',
      x: 16,
      z: -20,
      radius: 2,
      structureDamage: 999,
    });
    expect(state.mortars.has(1)).toBe(false);
    expect(territorySiegeControlFor(state, 20)).toBeNull();

    territorySiegeApplyCatapultStructureImpact(state, {
      side: 'attacker',
      x: 20,
      z: 52,
      radius: 8,
      structureDamage: 999,
    });
    expect(state.catapults.get(1)?.hp).toBe(TERRITORY_SIEGE_CATAPULT_MAX_HP);
    territorySiegeApplyCatapultStructureImpact(state, {
      side: 'defender',
      x: 20,
      z: 52,
      radius: 2,
      structureDamage: 999,
    });
    expect(state.catapults.has(1)).toBe(false);
  });

  it('awards no-show and timeout victories to the defender', () => {
    const noShow = match();
    territorySiegeTick(noShow, 601_000, rules);
    expect(noShow).toMatchObject({
      phase: 'ended',
      winner: 'defender',
      resultReason: 'attacker_no_show',
    });

    const timeout = match();
    territorySiegeJoin(timeout, 10, 'attacker', 500, rules);
    territorySiegeTick(timeout, 3_601_000, rules);
    expect(timeout).toMatchObject({
      phase: 'ended',
      winner: 'defender',
      resultReason: 'timeout',
    });
  });

  it('rotates deterministic defense-tower shots across live attackers', () => {
    const state = createTerritorySiege({ ...match().definition, defenseTowerLevel: 2 });
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    territorySiegeJoin(state, 11, 'attacker', 1_000, rules);
    expect(territorySiegeTowerShot(state, 1_000)).toEqual({
      characterId: 10,
      damage: 14,
      towerId: 'left',
    });
    expect(territorySiegeTowerShot(state, 1_001)).toBeNull();
    expect(territorySiegeTowerShot(state, 4_500)).toEqual({
      characterId: 11,
      damage: 14,
      towerId: 'right',
    });
  });

  it('skips attackers outside the authoritative tower radius', () => {
    const state = createTerritorySiege({ ...match().definition, defenseTowerLevel: 2 });
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    territorySiegeJoin(state, 11, 'attacker', 1_000, rules);
    expect(territorySiegeTowerShot(state, 1_000, (characterId) => characterId === 11)).toEqual({
      characterId: 11,
      damage: 14,
      towerId: 'left',
    });
  });
});
