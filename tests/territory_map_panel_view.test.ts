import { describe, expect, it } from 'vitest';
import {
  territoryCellPanelMode,
  territorySiegeMapLabelKey,
  territorySlotModels,
  territoryWarCountdown,
  territoryWarNoticeModel,
} from '../src/ui/territory_map_panel_view';
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
        slot: 'walls',
        kind: 'walls',
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
  it('labels every biome with its actual siege map set', () => {
    expect(territorySiegeMapLabelKey('temperate')).toBe('siegeBiomeTemperate');
    expect(territorySiegeMapLabelKey('rocky')).toBe('siegeBiomeRocky');
    expect(territorySiegeMapLabelKey('snow')).toBe('siegeBiomeSnow');
    expect(territorySiegeMapLabelKey('desert')).toBe('siegeBiomeDesert');
  });

  it('shows development only for owned land and reduces mountains to a notice', () => {
    expect(territoryCellPanelMode({ claimable: false, owned: false })).toBe('mountain');
    expect(territoryCellPanelMode({ claimable: true, owned: false })).toBe('neutral');
    expect(territoryCellPanelMode({ claimable: true, owned: true })).toBe('owned');
  });

  it('maps an empty clicked card to its exact build slot and kind', () => {
    const granary = territorySlotModels(state(), 9).find((slot) => slot.slot === 'granary');
    expect(granary).toMatchObject({
      state: 'empty',
      action: { kind: 'build', cellId: 9, slot: 'granary', structureKind: 'granary' },
    });
  });

  it('maps a built card to an upgrade of that same slot', () => {
    const walls = territorySlotModels(state(), 9).find((slot) => slot.slot === 'walls');
    expect(walls).toMatchObject({
      level: 3,
      state: 'active',
      action: { kind: 'upgrade', cellId: 9, slot: 'walls' },
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

  it('formats the five-minute registration and one-hour battle clocks without raw seconds', () => {
    expect(territoryWarCountdown(300)).toBe('05:00');
    expect(territoryWarCountdown(3_600)).toBe('1:00:00');
    expect(territoryWarCountdown(3_527)).toBe('58:47');
  });

  it('keeps an active guild siege visible to both sides, including late unregistered attackers', () => {
    const now = Date.parse('2026-01-01T00:15:00.000Z');
    expect(territoryWarNoticeModel({ ...war, status: 'active', mySide: 'defender' }, now)).toEqual({
      visible: true,
      active: true,
      secondsUntilStart: 0,
      secondsRemaining: 3_000,
      automaticTeleport: false,
    });
    expect(
      territoryWarNoticeModel(
        { ...war, status: 'active', mySide: 'attacker', registered: true },
        now,
      ).visible,
    ).toBe(true);
    expect(
      territoryWarNoticeModel(
        { ...war, status: 'active', mySide: 'attacker', registered: false },
        now,
      ).visible,
    ).toBe(true);
  });
});
