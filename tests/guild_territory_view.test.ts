import { describe, expect, it } from 'vitest';
import { guildTerritoryPanelModel } from '../src/ui/guild_territory_view';
import type { TerritoryMapState, TerritoryWarView } from '../src/world_api';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');

function war(overrides: Partial<TerritoryWarView> = {}): TerritoryWarView {
  return {
    id: 'war-1',
    targetCellId: 42,
    attackerGuildId: '7',
    attackerGuildName: 'Seven',
    defenderGuildId: '8',
    defenderGuildName: 'Eight',
    status: 'declared',
    declaredAt: new Date(NOW - 1_000).toISOString(),
    startsAt: new Date(NOW + 60_000).toISOString(),
    endsAt: new Date(NOW + 3_660_000).toISOString(),
    winnerGuildId: null,
    attackerCount: 2,
    defenderCount: 3,
    mySide: 'attacker',
    registered: false,
    ...overrides,
  };
}

function state(rank: 'member' | 'officer' | 'leader', wars: TerritoryWarView[]): TerritoryMapState {
  return {
    season: {
      id: 'season',
      number: 1,
      manifestVersion: 2,
      manifestChecksum: 'checksum',
      radius: 20,
      requirementsEnabled: false,
      startsAt: new Date(NOW - 1_000).toISOString(),
      endsAt: new Date(NOW + 1_000_000).toISOString(),
    },
    revision: 1,
    cells: [],
    structures: [],
    wars,
    guild: {
      id: '7',
      name: 'Seven',
      color: '#f00',
      rank,
      territoryLevel: 1,
      cellCapacity: 12,
      ownedCellCount: 4,
      resources: { wood: 1, iron: 2, grain: 3, labor: 4 },
      resourceCapacity: 100,
      accruedAt: new Date(NOW).toISOString(),
    },
    siege: null,
  };
}

describe('Guild territory command panel model', () => {
  it('allows only attacker officers and leaders to withdraw before battle', () => {
    expect(guildTerritoryPanelModel(state('member', [war()]), NOW)?.wars[0].canCancel).toBe(false);
    expect(guildTerritoryPanelModel(state('officer', [war()]), NOW)?.wars[0].canCancel).toBe(true);
    expect(
      guildTerritoryPanelModel(state('leader', [war({ status: 'active' })]), NOW)?.wars[0]
        .canCancel,
    ).toBe(false);
  });

  it('closes late attacker entry but keeps active defense reinforcement open', () => {
    const lateAttacker = guildTerritoryPanelModel(
      state('member', [war({ status: 'active', mySide: 'attacker' })]),
      NOW,
    )?.wars[0];
    const defenderState = state('member', [
      war({
        attackerGuildId: '8',
        attackerGuildName: 'Eight',
        defenderGuildId: '7',
        defenderGuildName: 'Seven',
        status: 'active',
        mySide: 'defender',
      }),
    ]);
    const defender = guildTerritoryPanelModel(defenderState, NOW)?.wars[0];
    expect(lateAttacker?.canJoin).toBe(false);
    expect(defender?.canJoin).toBe(true);
  });

  it('allows a registered participant to leave while battle is active', () => {
    const active = guildTerritoryPanelModel(
      state('member', [war({ status: 'active', registered: true })]),
      NOW,
    )?.wars[0];
    expect(active?.canLeave).toBe(true);
  });
});
