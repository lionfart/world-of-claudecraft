import type {
  TerritoryMapState,
  TerritoryStructureKind,
  TerritoryStructureSlot,
  TerritoryWarView,
} from '../world_api';

export interface TerritorySlotDescriptor {
  slot: TerritoryStructureSlot;
  kind: TerritoryStructureKind;
  labelKey:
    | 'slotKeep'
    | 'slotGate'
    | 'slotWall'
    | 'slotTowerNorth'
    | 'slotTowerSouth'
    | 'slotStorehouse'
    | 'slotConstructionWorkshop'
    | 'slotSiegeWorkshop';
}

export const TERRITORY_SLOT_DESCRIPTORS: readonly TerritorySlotDescriptor[] = [
  { slot: 'keep_core', kind: 'keep', labelKey: 'slotKeep' },
  { slot: 'gate', kind: 'gate', labelKey: 'slotGate' },
  { slot: 'wall', kind: 'wall', labelKey: 'slotWall' },
  { slot: 'tower_north', kind: 'defense_tower', labelKey: 'slotTowerNorth' },
  { slot: 'tower_south', kind: 'defense_tower', labelKey: 'slotTowerSouth' },
  { slot: 'storehouse', kind: 'storehouse', labelKey: 'slotStorehouse' },
  {
    slot: 'construction_workshop',
    kind: 'construction_workshop',
    labelKey: 'slotConstructionWorkshop',
  },
  { slot: 'siege_workshop', kind: 'siege_workshop', labelKey: 'slotSiegeWorkshop' },
];

export type TerritorySlotAction =
  | {
      kind: 'build';
      cellId: number;
      slot: TerritoryStructureSlot;
      structureKind: TerritoryStructureKind;
    }
  | { kind: 'upgrade'; cellId: number; slot: TerritoryStructureSlot };

export interface TerritorySlotModel extends TerritorySlotDescriptor {
  level: number;
  state: 'empty' | 'building' | 'active' | 'max' | 'locked';
  action: TerritorySlotAction | null;
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
  return TERRITORY_SLOT_DESCRIPTORS.map((descriptor) => {
    const structure =
      selectedCellId === null
        ? null
        : (state.structures.find(
            (entry) => entry.cellId === selectedCellId && entry.slot === descriptor.slot,
          ) ?? null);
    if (!ownsKeep) return { ...descriptor, level: 0, state: 'locked', action: null };
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
      return { ...descriptor, level: 0, state: 'empty', action };
    }
    if (structure.state === 'building') {
      return { ...descriptor, level: structure.level, state: 'building', action: null };
    }
    if (structure.level >= 5) {
      return { ...descriptor, level: structure.level, state: 'max', action: null };
    }
    return {
      ...descriptor,
      level: structure.level,
      state: 'active',
      action: canManage
        ? { kind: 'upgrade', cellId: selectedCellId as number, slot: descriptor.slot }
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

export function territoryWarNoticeModel(
  war: TerritoryWarView | null,
  nowMs: number,
): TerritoryWarNoticeModel {
  const startsAtMs = war ? new Date(war.startsAt).getTime() : Number.NaN;
  const endsAtMs = war ? new Date(war.endsAt).getTime() : Number.NaN;
  const active =
    war?.status === 'active' &&
    (war.mySide === 'defender' || (war.mySide === 'attacker' && war.registered));
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
