import { describe, expect, it } from 'vitest';
import {
  TERRITORY_SIEGE_CORE_CRYSTAL_SCALE,
  TERRITORY_SIEGE_GATE_VISUAL_HEIGHT,
  TERRITORY_SIEGE_GATE_VISUAL_WIDTH,
  TERRITORY_SIEGE_RAM_SUPPORT_X,
  TERRITORY_SIEGE_RAM_SUPPORT_Z,
  territorySiegeVisualState,
} from '../src/render/territory_siege_visual_core';
import { TERRITORY_SIEGE_GATE_HALF_WIDTH } from '../src/sim/territory_siege_layout';
import type { TerritorySiegeView } from '../src/world_api';

const siege: TerritorySiegeView = {
  warId: 'war',
  biome: 'temperate',
  state: 'active',
  mySide: 'attacker',
  attackerCount: 1,
  defenderCount: 1,
  gateProgress: 0.5,
  coreProgress: 0.25,
  gateOpen: false,
  ramDeployed: true,
  ramOccupants: 2,
  ramJoined: true,
  ramCooldown: 1,
  ramEmpoweredCooldown: 10,
  mortarDeployed: 0,
  mortarJoined: false,
  mortarCooldown: 0,
  mortarFrostCooldown: 0,
  mortarVenomCooldown: 0,
  mortars: [],
  controlledMortarId: null,
  mortarZones: [],
  coreChanneling: true,
  coreChannelProgress: 0.5,
  coreChannels: [{ x: 10, z: 20 }],
  defenseTowerLevel: 1,
  towerZones: [],
  respawnIn: 0,
  timeLeft: 100,
  winner: null,
  resultReturnIn: 0,
};

describe('territory siege prototype visual state', () => {
  it('mirrors objective and siege-tool state without mutating gameplay', () => {
    const state = territorySiegeVisualState(siege, 0.2);
    expect(state.gateScaleY).toBe(1);
    expect(state.coreScaleY).toBeLessThan(1);
    expect(state.ramVisible).toBe(true);
    expect(Math.abs(state.ramThrust)).toBeGreaterThan(0);
    expect(state.coreChannelVisible).toBe(true);
    expect(state.coreChannelPulse).toBeGreaterThanOrEqual(0);
    expect(state.coreChannelPulse).toBeLessThanOrEqual(1);
  });

  it('keeps the four ram supports tight to the cart and drives the head longitudinally', () => {
    expect(TERRITORY_SIEGE_RAM_SUPPORT_X).toBeLessThanOrEqual(1.2);
    expect(TERRITORY_SIEGE_RAM_SUPPORT_Z).toBeLessThanOrEqual(0.9);
    expect(territorySiegeVisualState({ ...siege, ramCooldown: 0 }, 0.2).ramThrust).toBe(0);
    expect(territorySiegeVisualState(siege, 0.2).ramThrust).not.toBe(
      territorySiegeVisualState(siege, 0.4).ramThrust,
    );
  });

  it('fits the closed gate leaf exactly into the front-wall opening', () => {
    expect(TERRITORY_SIEGE_GATE_VISUAL_WIDTH).toBeGreaterThanOrEqual(
      TERRITORY_SIEGE_GATE_HALF_WIDTH * 2,
    );
    expect(TERRITORY_SIEGE_GATE_VISUAL_WIDTH).toBeLessThanOrEqual(21);
    expect(TERRITORY_SIEGE_GATE_VISUAL_HEIGHT).toBeGreaterThanOrEqual(5.5);
  });

  it('keeps the replacement core crystal compact', () => {
    expect(TERRITORY_SIEGE_CORE_CRYSTAL_SCALE).toBeLessThanOrEqual(3);
  });

  it('shows core health after either a gate or wall breach', () => {
    expect(territorySiegeVisualState(siege, 0).coreHealthVisible).toBe(false);
    expect(territorySiegeVisualState({ ...siege, gateOpen: true }, 0).coreHealthVisible).toBe(true);
    expect(
      territorySiegeVisualState({ ...siege, wallHealth: [{ id: 'left:3', hp: 0, maxHp: 100 }] }, 0)
        .coreHealthVisible,
    ).toBe(true);
  });
});
