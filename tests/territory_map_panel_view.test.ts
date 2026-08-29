import { describe, expect, it } from 'vitest';
import { territorySlotModels, territoryWarNoticeModel } from '../src/ui/territory_map_panel_view';
import type { TerritoryMapState, TerritoryWarView } from '../src/world_api';

function state(rank: 'member' | 'officer' | 'leader' = 'leader'): TerritoryMapState {
  return {
    season: {
      id: 'season',
      number: 1,
      manifestVersion: 1,
      manifestChecksum: 'test',
      radius: 20,
      requirementsEnabled: false,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-04-01T00:00:00.000Z',
    },
    revision: 4,
    cells: [
      {
        cellId: 9,
        ownerGuildId: '7',
        ownerGuildName: 'Seven',
        ownerColor: '#9f6a32',
        keepRoot: true,
        terrain: 'grassland',
        resource: null,
      },
    ],
    structures: [
      {
        cellId: 9,
        slot: 'keep_core',
        kind: 'keep',
        level: 2,
        state: 'active',
        completesAt: null,
      },
      {
        cellId: 9,
        slot: 'wall',
        kind: 'wall',
        level: 3,
        state: 'active',
        completesAt: null,
      },
    ],
    wars: [],
    guild: {
      id: '7',
      name: 'Seven',
      color: '#9f6a32',
      rank,
      territoryLevel: 1,
      cellCapacity: 120,
      ownedCellCount: 1,
      resources: { wood: 250, iron: 250, grain: 250, labor: 250 },
      resourceCapacity: 2_000,
      accruedAt: '2026-01-01T00:00:00.000Z',
    },
    siege: null,
  };
}

describe('territory structure slot cards', () => {
  it('maps an empty clicked card to its exact build slot and kind', () => {
    const gate = territorySlotModels(state(), 9).find((slot) => slot.slot === 'gate');
    expect(gate).toMatchObject({
      state: 'empty',
      action: { kind: 'build', cellId: 9, slot: 'gate', structureKind: 'gate' },
    });
  });

  it('maps a built card to an upgrade of that same slot', () => {
    const wall = territorySlotModels(state(), 9).find((slot) => slot.slot === 'wall');
    expect(wall).toMatchObject({
      level: 3,
      state: 'active',
      action: { kind: 'upgrade', cellId: 9, slot: 'wall' },
    });
  });

  it('keeps all cards visible but non-actionable for ordinary members', () => {
    const cards = territorySlotModels(state('member'), 9);
    expect(cards).toHaveLength(8);
    expect(cards.every((card) => card.action === null)).toBe(true);
  });
});

describe('territory pre-war notice', () => {
  const war: TerritoryWarView = {
    id: 'war',
    targetCellId: 9,
    attackerGuildId: '7',
    attackerGuildName: 'Seven',
    defenderGuildId: '8',
    defenderGuildName: 'Eight',
    status: 'declared',
    declaredAt: '2026-01-01T00:00:00.000Z',
    startsAt: '2026-01-01T00:05:00.000Z',
    endsAt: '2026-01-01T01:05:00.000Z',
    winnerGuildId: null,
    attackerCount: 6,
    defenderCount: 4,
    mySide: 'attacker',
    registered: true,
  };

  it('projects a deterministic countdown and automatic teleport state', () => {
    expect(territoryWarNoticeModel(war, Date.parse('2026-01-01T00:04:11.100Z'))).toEqual({
      visible: true,
      active: false,
      secondsUntilStart: 49,
      secondsRemaining: 3_649,
      automaticTeleport: true,
    });
  });

  it('keeps an active siege visible for late defenders but not attackers', () => {
    const now = Date.parse('2026-01-01T00:15:00.000Z');
    expect(territoryWarNoticeModel({ ...war, status: 'active', mySide: 'defender' }, now)).toEqual({
      visible: true,
      active: true,
      secondsUntilStart: 0,
      secondsRemaining: 3_000,
      automaticTeleport: false,
    });
    expect(
      territoryWarNoticeModel({ ...war, status: 'active', mySide: 'attacker' }, now).visible,
    ).toBe(false);
  });
});
