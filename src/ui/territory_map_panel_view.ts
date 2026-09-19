import {
  TERRITORY_CASTLE_MAX_LEVEL,
  territoryActiveCastleLevel,
  territoryStructureLevelCap,
  territoryStructureUpgradeAllowed,
} from '../sim/territory_castle_progression';
import { territoryResourceProductionPerHour } from '../sim/territory_economy';
import type { TerritoryResourceKind } from '../sim/territory_manifest';
import type { TerritorySiegeBiome } from '../sim/territory_siege_biome';
import type {
  TerritoryMapState,
  TerritoryStructureKind,
  TerritoryStructureSlot,
  TerritoryWarView,
} from '../world_api';

export type TerritorySiegeMapLabelKey =
  | 'siegeBiomeTemperate'
  | 'siegeBiomeRocky'
  | 'siegeBiomeSnow'
  | 'siegeBiomeDesert';

/** Stable catalogue key for the battlefield selected by a strategic hex. */
export function territorySiegeMapLabelKey(biome: TerritorySiegeBiome): TerritorySiegeMapLabelKey {
  const labels: Record<TerritorySiegeBiome, TerritorySiegeMapLabelKey> = {
    temperate: 'siegeBiomeTemperate',
    rocky: 'siegeBiomeRocky',
    snow: 'siegeBiomeSnow',
    desert: 'siegeBiomeDesert',
  };
  return labels[biome];
}

export interface TerritorySlotDescriptor {
  slot: TerritoryStructureSlot;
  kind: TerritoryStructureKind;
  labelKey:
    | 'slotKeep'
    | 'slotWalls'
    | 'slotTowers'
    | 'slotGranary'
    | 'slotForester'
    | 'slotMine'
    | 'slotHouse'
    | 'slotStockpile'
    | 'slotSiegeWorkshop';
}

export const TERRITORY_SLOT_DESCRIPTORS: readonly TerritorySlotDescriptor[] = [
  { slot: 'keep_core', kind: 'keep', labelKey: 'slotKeep' },
  { slot: 'towers', kind: 'towers', labelKey: 'slotTowers' },
  { slot: 'granary', kind: 'granary', labelKey: 'slotGranary' },
  { slot: 'forester', kind: 'forester', labelKey: 'slotForester' },
  { slot: 'mine', kind: 'mine', labelKey: 'slotMine' },
  { slot: 'house', kind: 'house', labelKey: 'slotHouse' },
  { slot: 'stockpile', kind: 'stockpile', labelKey: 'slotStockpile' },
  {
    slot: 'siege_workshop',
    kind: 'siege_workshop',
    labelKey: 'slotSiegeWorkshop',
  },
];

export type TerritorySlotAction =
  | {
      kind: 'build';
      cellId: number;
      slot: TerritoryStructureSlot;
      structureKind: TerritoryStructureKind;
    }
  | { kind: 'upgrade'; cellId: number; slot: TerritoryStructureSlot }
  | { kind: 'repair'; cellId: number; slot: TerritoryStructureSlot };

export interface TerritorySlotModel extends TerritorySlotDescriptor {
  level: number;
  state:
    | 'empty'
    | 'building'
    | 'repairing'
    | 'damaged'
    | 'active'
    | 'max'
    | 'locked'
    | 'castle_locked';
  completesAt: string | null;
  requiredCastleLevel: number | null;
  action: TerritorySlotAction | null;
}

const TERRITORY_SLOT_RESOURCE = {
  granary: 'grain',
  forester: 'wood',
  mine: 'iron',
  house: 'labor',
} as const satisfies Partial<Record<TerritoryStructureSlot, TerritoryResourceKind>>;

/** Exact rate shown by a resource-building card and credited by the server. */
export function territoryStructureProduction(
  model: TerritorySlotModel | null,
  naturalResource: { kind: TerritoryResourceKind; yield: number } | null,
): { resource: TerritoryResourceKind; amount: number } | null {
  if (!model || !(model.slot in TERRITORY_SLOT_RESOURCE)) return null;
  const resource = TERRITORY_SLOT_RESOURCE[model.slot as keyof typeof TERRITORY_SLOT_RESOURCE];
  const active = ['active', 'max', 'castle_locked'].includes(model.state);
  return {
    resource,
    amount: active
      ? territoryResourceProductionPerHour(
          resource,
          naturalResource?.kind === resource ? naturalResource.yield : 1,
          { [model.slot]: model.level },
        )
      : 0,
  };
}

export type TerritoryStructureStatusKey =
  | 'hudChrome.territoryMap.slotUnavailable'
  | 'hudChrome.territoryMap.slotEmpty'
  | 'hudChrome.territoryMap.slotBuilding'
  | 'hudChrome.territoryMap.slotRepairing'
  | 'hudChrome.territoryMap.slotDamaged'
  | 'hudChrome.territoryMap.slotCastleRequired'
  | 'hudChrome.territoryMap.slotMax'
  | 'hudChrome.territoryMap.slotLevel'
  | 'hudChrome.territoryMap.slotLevelReadOnly';

export interface TerritoryStructureStatusPart {
  key: TerritoryStructureStatusKey;
  values?: Readonly<Record<string, string | number>>;
}

/** Keeps the current level visible even when the next upgrade is castle-gated. */
export function territoryStructureStatusParts(
  model: TerritorySlotModel | null,
): TerritoryStructureStatusPart[] {
  if (!model || model.state === 'locked')
    return [{ key: 'hudChrome.territoryMap.slotUnavailable' }];
  if (model.state === 'empty') return [{ key: 'hudChrome.territoryMap.slotEmpty' }];
  if (model.state === 'building')
    return [{ key: 'hudChrome.territoryMap.slotBuilding', values: { level: model.level } }];
  if (model.state === 'repairing')
    return [{ key: 'hudChrome.territoryMap.slotRepairing', values: { level: model.level } }];
  if (model.state === 'damaged')
    return [{ key: 'hudChrome.territoryMap.slotDamaged', values: { level: model.level } }];
  if (model.state === 'castle_locked') {
    return [
      { key: 'hudChrome.territoryMap.slotLevelReadOnly', values: { level: model.level } },
      {
        key: 'hudChrome.territoryMap.slotCastleRequired',
        values: { level: model.requiredCastleLevel ?? model.level + 1 },
      },
    ];
  }
  if (model.state === 'max')
    return [{ key: 'hudChrome.territoryMap.slotMax', values: { level: model.level } }];
  return [
    {
      key: model.action
        ? 'hudChrome.territoryMap.slotLevel'
        : 'hudChrome.territoryMap.slotLevelReadOnly',
      values: { level: model.level },
    },
  ];
}

export type TerritoryCellPanelMode = 'mountain' | 'neutral' | 'owned';

/** Keeps the map popup content aligned with the selected cell's real capabilities. */
export function territoryCellPanelMode(input: {
  claimable: boolean;
  owned: boolean;
}): TerritoryCellPanelMode {
  if (!input.claimable) return 'mountain';
  return input.owned ? 'owned' : 'neutral';
}

/** Pure structure-card projection shared by mouse, touch, and keyboard actions. */
export function territorySlotModels(
  state: TerritoryMapState,
  selectedCellId: number | null,
): TerritorySlotModel[] {
  const guild = state.guild;
  const site =
    selectedCellId === null
      ? null
      : (state.cells.find((cell) => cell.cellId === selectedCellId) ?? null);
  const ownsKeep = !!guild && site?.ownerGuildId === guild.id && site.keepRoot;
  const canManage = ownsKeep && guild.rank !== 'member';
  const castle =
    selectedCellId === null
      ? null
      : (state.structures.find(
          (entry) => entry.cellId === selectedCellId && entry.slot === 'keep_core',
        ) ?? null);
  const activeCastleLevel = territoryActiveCastleLevel(castle);
  return TERRITORY_SLOT_DESCRIPTORS.map((descriptor) => {
    const structure =
      selectedCellId === null
        ? null
        : (state.structures.find(
            (entry) => entry.cellId === selectedCellId && entry.slot === descriptor.slot,
          ) ?? null);
    if (!ownsKeep)
      return {
        ...descriptor,
        level: 0,
        state: 'locked',
        completesAt: null,
        requiredCastleLevel: null,
        action: null,
      };
    if (!structure) {
      const action =
        canManage && descriptor.slot !== 'keep_core'
          ? {
              kind: 'build' as const,
              cellId: selectedCellId as number,
              slot: descriptor.slot,
              structureKind: descriptor.kind,
            }
          : null;
      return {
        ...descriptor,
        level: 0,
        state: 'empty',
        completesAt: null,
        requiredCastleLevel: null,
        action,
      };
    }
    if (structure.state === 'building') {
      return {
        ...descriptor,
        level: structure.level,
        state: 'building',
        completesAt: structure.completesAt,
        requiredCastleLevel: null,
        action: null,
      };
    }
    if (structure.state === 'repairing') {
      return {
        ...descriptor,
        level: structure.level,
        state: 'repairing',
        completesAt: structure.completesAt,
        requiredCastleLevel: null,
        action: null,
      };
    }
    if (structure.state === 'damaged') {
      return {
        ...descriptor,
        level: structure.level,
        state: 'damaged',
        completesAt: null,
        requiredCastleLevel: null,
        action: canManage
          ? {
              kind: 'repair',
              cellId: selectedCellId as number,
              slot: descriptor.slot,
            }
          : null,
      };
    }
    const cap = territoryStructureLevelCap(descriptor.slot, activeCastleLevel);
    if (structure.level >= TERRITORY_CASTLE_MAX_LEVEL) {
      return {
        ...descriptor,
        level: structure.level,
        state: 'max',
        completesAt: null,
        requiredCastleLevel: null,
        action: null,
      };
    }
    if (
      descriptor.slot !== 'keep_core' &&
      !territoryStructureUpgradeAllowed(descriptor.slot, structure.level, activeCastleLevel)
    ) {
      return {
        ...descriptor,
        level: structure.level,
        state: 'castle_locked',
        completesAt: null,
        requiredCastleLevel: Math.min(
          TERRITORY_CASTLE_MAX_LEVEL,
          Math.max(structure.level + 1, cap + 1),
        ),
        action: null,
      };
    }
    return {
      ...descriptor,
      level: structure.level,
      state: 'active',
      completesAt: null,
      requiredCastleLevel: null,
      action: canManage
        ? {
            kind: 'upgrade',
            cellId: selectedCellId as number,
            slot: descriptor.slot,
          }
        : null,
    };
  });
}

export interface TerritoryWarNoticeModel {
  visible: boolean;
  active: boolean;
  secondsUntilStart: number;
  secondsRemaining: number;
  automaticTeleport: boolean;
}

/** Stable HUD clock: registration uses MM:SS, the one-hour battle uses H:MM:SS. */
export function territoryWarCountdown(totalSeconds: number): string {
  const total = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${tail}` : tail;
}

/** Remaining construction time for a live structure button, or null once complete. */
export function territoryStructureCountdown(
  completesAt: string | null,
  nowMs: number,
): string | null {
  if (!completesAt) return null;
  const deadline = Date.parse(completesAt);
  if (!Number.isFinite(deadline) || deadline <= nowMs) return null;
  return territoryWarCountdown((deadline - nowMs) / 1_000);
}

export function territoryWarNoticeModel(
  war: TerritoryWarView | null,
  nowMs: number,
): TerritoryWarNoticeModel {
  const startsAtMs = war ? new Date(war.startsAt).getTime() : Number.NaN;
  const endsAtMs = war ? new Date(war.endsAt).getTime() : Number.NaN;
  const active = war?.status === 'active';
  return {
    visible: !!war && (war.status === 'declared' || war.status === 'forming' || active),
    active,
    secondsUntilStart: Number.isFinite(startsAtMs)
      ? Math.max(0, Math.ceil((startsAtMs - nowMs) / 1_000))
      : 0,
    secondsRemaining: Number.isFinite(endsAtMs)
      ? Math.max(0, Math.ceil((endsAtMs - nowMs) / 1_000))
      : 0,
    automaticTeleport: !active && war?.registered === true,
  };
}
