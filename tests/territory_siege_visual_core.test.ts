import { describe, expect, it } from 'vitest';
import {
  TERRITORY_SIEGE_CORE_CRYSTAL_SCALE,
  TERRITORY_SIEGE_GATE_VISUAL_HEIGHT,
  TERRITORY_SIEGE_GATE_VISUAL_WIDTH,
  territorySiegeVisualState,
} from '../src/render/territory_siege_visual_core';
import { TERRITORY_SIEGE_GATE_HALF_WIDTH } from '../src/sim/territory_siege_layout';
import type { TerritorySiegeView } from '../src/world_api';

const siege: TerritorySiegeView = {
  warId: 'war',
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
  coreChanneling: true,
  coreChannelProgress: 0.5,
  defenseTowerLevel: 1,
  towerZones: [],
  respawnIn: 0,
  timeLeft: 100,
  winner: null,
};

describe('territory siege prototype visual state', () => {
  it('mirrors objective and siege-tool state without mutating gameplay', () => {
    const state = territorySiegeVisualState(siege, 0.2);
    expect(state.gateScaleY).toBe(1);
    expect(state.coreScaleY).toBeLessThan(1);
    expect(state.ramVisible).toBe(true);
    expect(state.coreChannelVisible).toBe(true);
    expect(state.coreChannelPulse).toBeGreaterThanOrEqual(0);
    expect(state.coreChannelPulse).toBeLessThanOrEqual(1);
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
});
