import type { TerritoryStructureSlot, TerritoryStructureState } from '../world_api/territory';

export const TERRITORY_CASTLE_MAX_LEVEL = 4;

const LEGACY_SEPARATE_DEFENSE_SLOTS = new Set<TerritoryStructureSlot>(['walls', 'gate', 'wall']);

/** Old wall rows remain readable, but every new defense upgrade goes through the castle level. */
export function territoryStructureSlotBuildable(slot: TerritoryStructureSlot): boolean {
  return slot !== 'keep_core' && !LEGACY_SEPARATE_DEFENSE_SLOTS.has(slot);
}

export function territoryCastleLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(TERRITORY_CASTLE_MAX_LEVEL, Math.floor(level)));
}

/** The keep itself reaches level four; every other building is capped by that active level. */
export function territoryStructureLevelCap(
  slot: TerritoryStructureSlot,
  activeCastleLevel: number,
): number {
  return slot === 'keep_core'
    ? TERRITORY_CASTLE_MAX_LEVEL
    : territoryCastleLevel(activeCastleLevel);
}

export function territoryStructureUpgradeAllowed(
  slot: TerritoryStructureSlot,
  currentLevel: number,
  activeCastleLevel: number,
): boolean {
  if (LEGACY_SEPARATE_DEFENSE_SLOTS.has(slot)) return false;
  return currentLevel < territoryStructureLevelCap(slot, activeCastleLevel);
}

export function territoryActiveCastleLevel(
  input: {
    level: number;
    state: TerritoryStructureState;
  } | null,
): number {
  if (!input) return 1;
  return territoryCastleLevel(input.state === 'building' ? input.level - 1 : input.level);
}
