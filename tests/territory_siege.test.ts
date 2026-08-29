import { describe, expect, it } from 'vitest';
import {
  createTerritorySiege,
  type TerritorySiegeRules,
  territorySiegeApplyAction,
  territorySiegeConsumeRespawn,
  territorySiegeDisconnect,
  territorySiegeJoin,
  territorySiegeMarkResolved,
  territorySiegeRecordDeath,
  territorySiegeTick,
  territorySiegeTowerShot,
  territorySiegeViewFor,
} from '../src/sim/territory_siege';

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
    startsAtMs: 1_000,
    endsAtMs: 3_601_000,
    gateLevel,
    coreLevel: 1,
    attackerHasSiegeWorkshop: true,
  });
}

describe('territory siege', () => {
  it('fills first-come seats and preserves a disconnected seat for 120 seconds', () => {
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
    expect(territorySiegeJoin(state, 12, 'attacker', 242_000, rules)).toMatchObject({
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
      reason: 'ram_required',
    });
    expect(territorySiegeApplyAction(state, 10, 'deploy_ram', 2_000, rules)).toEqual({
      ok: true,
      ended: false,
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

  it('caps the ram at four occupants and scales shared damage and cadence', () => {
    const largeRules = { ...rules, teamSize: 5 };
    const state = match();
    for (let characterId = 10; characterId <= 14; characterId += 1) {
      territorySiegeJoin(state, characterId, 'attacker', 1_000, largeRules);
    }
    territorySiegeApplyAction(state, 10, 'deploy_ram', 2_000, largeRules);
    for (let characterId = 10; characterId <= 13; characterId += 1) {
      expect(
        territorySiegeApplyAction(state, characterId, 'enter_ram', 3_000 + characterId, largeRules)
          .ok,
      ).toBe(true);
    }
    expect(territorySiegeApplyAction(state, 14, 'enter_ram', 3_100, largeRules)).toEqual({
      ok: false,
      reason: 'ram_full',
    });
    const before = state.gateHp;
    expect(territorySiegeApplyAction(state, 10, 'ram_gate', 4_000, largeRules).ok).toBe(true);
    expect(before - state.gateHp).toBe(44);
    expect(territorySiegeApplyAction(state, 11, 'ram_gate', 5_399, largeRules)).toEqual({
      ok: false,
      reason: 'ram_cooldown',
    });
    expect(territorySiegeApplyAction(state, 11, 'ram_gate', 5_400, largeRules).ok).toBe(true);
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
    expect(territorySiegeTowerShot(state, 1_000)).toEqual({ characterId: 10, damage: 14 });
    expect(territorySiegeTowerShot(state, 1_001)).toBeNull();
    expect(territorySiegeTowerShot(state, 4_500)).toEqual({ characterId: 11, damage: 14 });
  });

  it('skips attackers outside the authoritative tower radius', () => {
    const state = createTerritorySiege({ ...match().definition, defenseTowerLevel: 2 });
    territorySiegeJoin(state, 10, 'attacker', 1_000, rules);
    territorySiegeJoin(state, 11, 'attacker', 1_000, rules);
    expect(territorySiegeTowerShot(state, 1_000, (characterId) => characterId === 11)).toEqual({
      characterId: 11,
      damage: 14,
    });
  });
});
