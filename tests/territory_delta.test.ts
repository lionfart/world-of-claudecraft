import { describe, expect, it } from 'vitest';
import { applyTerritoryDelta } from '../src/sim/territory_delta';
import type { TerritoryMapState } from '../src/world_api';

function state(): TerritoryMapState {
  return {
    season: {
      id: 'season',
      number: 1,
      manifestVersion: 1,
      manifestChecksum: 'checksum',
      radius: 63,
      requirementsEnabled: false,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-03-26T00:00:00.000Z',
    },
    revision: 4,
    cells: [
      {
        cellId: 1,
        ownerGuildId: 'a',
        ownerGuildName: 'A',
        ownerColor: '#fff',
        keepRoot: true,
        terrain: 'grassland',
        resource: null,
      },
    ],
    structures: [],
    wars: [],
    guild: null,
    siege: null,
  };
}

describe('territory delta mirror', () => {
  it('applies exactly the next revision', () => {
    const next = applyTerritoryDelta(state(), {
      revision: 5,
      cellsRemove: [1],
    });
    expect(next?.revision).toBe(5);
    expect(next?.cells).toEqual([]);
  });

  it('requires a resync after a revision gap', () => {
    expect(applyTerritoryDelta(state(), { revision: 7 })).toBeNull();
  });

  it('requires a resync for an intentionally compacted cascade', () => {
    expect(applyTerritoryDelta(state(), { revision: 5, resetRequired: true })).toBeNull();
  });

  it('keeps every guild-related war joinable when public deltas overlap attack and defense', () => {
    const current = state();
    current.guild = {
      id: '7',
      name: 'Seven',
      color: '#fff',
      rank: 'member',
      territoryLevel: 1,
      cellCapacity: 24,
      ownedCellCount: 1,
      resources: { wood: 0, iron: 0, grain: 0, labor: 0 },
      resourceCapacity: 2_000,
      accruedAt: '2026-01-01T00:00:00.000Z',
    };
    current.wars = [
      {
        id: 'defense',
        targetCellId: 10,
        attackerGuildId: '8',
        attackerGuildName: 'Eight',
        defenderGuildId: '7',
        defenderGuildName: 'Seven',
        status: 'declared',
        declaredAt: '2026-01-01T00:00:00.000Z',
        startsAt: '2026-01-01T00:05:00.000Z',
        endsAt: '2026-01-01T01:05:00.000Z',
        winnerGuildId: null,
        attackerCount: 0,
        defenderCount: 0,
        mySide: 'defender',
        registered: false,
      },
    ];
    const next = applyTerritoryDelta(current, {
      revision: 5,
      warsUpsert: [
        {
          id: 'offense',
          targetCellId: 11,
          attackerGuildId: '7',
          attackerGuildName: 'Seven',
          defenderGuildId: '9',
          defenderGuildName: 'Nine',
          status: 'declared',
          declaredAt: '2026-01-01T00:01:00.000Z',
          startsAt: '2026-01-01T00:06:00.000Z',
          endsAt: '2026-01-01T01:06:00.000Z',
          winnerGuildId: null,
          attackerCount: 0,
          defenderCount: 0,
          mySide: null,
          registered: false,
        },
      ],
    });

    expect(next?.wars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'defense', mySide: 'defender' }),
        expect.objectContaining({ id: 'offense', mySide: 'attacker' }),
      ]),
    );
  });
});
