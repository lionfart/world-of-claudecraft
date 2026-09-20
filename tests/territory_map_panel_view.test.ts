import { describe, expect, it } from 'vitest';
import type { TranslationKey } from '../src/ui/i18n.catalog';
import { hudChromeStrings } from '../src/ui/i18n.catalog/hud_chrome';
import { tr_TR } from '../src/ui/i18n.locales/tr_TR';
import {
  territoryCellPanelMode,
  territorySiegeMapLabelKey,
  territorySlotModels,
  territoryStructureCountdown,
  territoryStructureProduction,
  territoryStructureStatusParts,
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
        slot: 'granary',
        kind: 'granary',
        level: 1,
        state: 'active',
        completesAt: null,
      },
      {
        cellId: 9,
        slot: 'stockpile',
        kind: 'stockpile',
        level: 1,
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
  it('keeps every Territory War label translated for Turkish release entry', () => {
    const missing = Object.keys(hudChromeStrings.territoryMap)
      .map((leaf) => `hudChrome.territoryMap.${leaf}` as TranslationKey)
      .filter((key) => typeof tr_TR[key] !== 'string');

    expect(missing).toEqual([]);
  });

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
    const forester = territorySlotModels(state(), 9).find((slot) => slot.slot === 'forester');
    expect(forester).toMatchObject({
      state: 'empty',
      action: {
        kind: 'build',
        cellId: 9,
        slot: 'forester',
        structureKind: 'forester',
      },
    });
  });

  it('maps a built card to an upgrade of that same slot below the castle cap', () => {
    const granary = territorySlotModels(state(), 9).find((slot) => slot.slot === 'granary');
    expect(granary).toMatchObject({
      level: 1,
      state: 'active',
      action: { kind: 'upgrade', cellId: 9, slot: 'granary' },
    });
  });

  it('uses one castle card and locks dependent upgrades above the active castle level', () => {
    const capped = state();
    const castle = capped.structures.find((structure) => structure.slot === 'keep_core');
    const granary = capped.structures.find((structure) => structure.slot === 'granary');
    if (!castle || !granary) throw new Error('castle fixture incomplete');
    castle.level = 2;
    castle.state = 'building';
    granary.level = 1;
    const cards = territorySlotModels(capped, 9);
    expect(cards.find((card) => card.slot === 'walls')).toBeUndefined();
    expect(cards.find((card) => card.slot === 'keep_core')).toMatchObject({
      state: 'building',
      level: 2,
      completesAt: null,
    });
    expect(cards.find((card) => card.slot === 'granary')).toMatchObject({
      state: 'castle_locked',
      requiredCastleLevel: 2,
      action: null,
    });
  });

  it('keeps a castle-gated tower current level visible in its UI status', () => {
    const capped = state();
    const castle = capped.structures.find((structure) => structure.slot === 'keep_core');
    if (!castle) throw new Error('castle fixture incomplete');
    castle.level = 3;
    capped.structures.push({
      cellId: 9,
      slot: 'towers',
      kind: 'towers',
      level: 3,
      state: 'active',
      completesAt: null,
    });

    const tower = territorySlotModels(capped, 9).find((card) => card.slot === 'towers') ?? null;
    expect(territoryStructureStatusParts(tower)).toEqual([
      { key: 'hudChrome.territoryMap.slotLevelReadOnly', values: { level: 3 } },
      { key: 'hudChrome.territoryMap.slotCastleRequired', values: { level: 4 } },
    ]);
  });

  it('projects a live construction deadline for the same building button', () => {
    const building = state();
    const granary = building.structures.find((structure) => structure.slot === 'granary');
    if (!granary) throw new Error('granary fixture incomplete');
    granary.level = 2;
    granary.state = 'building';
    granary.completesAt = '2026-01-01T00:01:31.000Z';
    expect(territorySlotModels(building, 9).find((card) => card.slot === 'granary')).toMatchObject({
      state: 'building',
      completesAt: granary.completesAt,
    });
    expect(
      territoryStructureCountdown(granary.completesAt, Date.parse('2026-01-01T00:00:01.000Z')),
    ).toBe('01:30');
  });

  it('shows base production for an active resource building on a hex without a deposit', () => {
    const built = state();
    built.structures.push({
      cellId: 9,
      slot: 'mine',
      kind: 'mine',
      level: 2,
      state: 'active',
      completesAt: null,
    });
    const mine = territorySlotModels(built, 9).find((card) => card.slot === 'mine') ?? null;
    expect(territoryStructureProduction(mine, null)).toEqual({ resource: 'iron', amount: 2 });
    expect(territoryStructureProduction(mine, { kind: 'iron', yield: 3 })).toEqual({
      resource: 'iron',
      amount: 6,
    });
  });

  it('keeps all cards visible but non-actionable for ordinary members', () => {
    const cards = territorySlotModels(state('member'), 9);
    expect(cards).toHaveLength(8);
    expect(cards.every((card) => card.action === null)).toBe(true);
  });

  it('shows the claimed city stockpile as an upgradeable castle-capped building', () => {
    const stockpile = territorySlotModels(state(), 9).find((slot) => slot.slot === 'stockpile');
    expect(stockpile).toMatchObject({
      kind: 'stockpile',
      level: 1,
      state: 'active',
      action: { kind: 'upgrade', cellId: 9, slot: 'stockpile' },
    });
  });

  it('offers level-preserving repairs to officers and shows the repair countdown in place', () => {
    const damaged = state('officer');
    const granary = damaged.structures.find((structure) => structure.slot === 'granary');
    if (!granary) throw new Error('granary fixture incomplete');
    granary.level = 3;
    granary.state = 'damaged';
    expect(territorySlotModels(damaged, 9).find((card) => card.slot === 'granary')).toMatchObject({
      level: 3,
      state: 'damaged',
      action: { kind: 'repair', cellId: 9, slot: 'granary' },
    });

    granary.state = 'repairing';
    granary.completesAt = '2026-01-01T00:02:00.000Z';
    expect(territorySlotModels(damaged, 9).find((card) => card.slot === 'granary')).toMatchObject({
      level: 3,
      state: 'repairing',
      completesAt: granary.completesAt,
      action: null,
    });
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
