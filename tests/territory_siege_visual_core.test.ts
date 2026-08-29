import { describe, expect, it } from 'vitest';
import { territorySiegeVisualState } from '../src/render/territory_siege_visual_core';
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
  });
});
