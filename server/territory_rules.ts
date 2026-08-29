import type { TerritoryWarSide, TerritoryWarStatus } from '../src/world_api';

const LEVEL_CAPACITY = [0, 24, 36, 48, 64, 80] as const;

/**
 * Attack rosters lock when combat begins. A pre-registered attacker may return
 * for the full battle, while defenders may fill any free seat until resolution.
 */
export function territoryWarJoinAllowed(
  status: TerritoryWarStatus,
  side: TerritoryWarSide,
  registeredBeforeStart: boolean,
): boolean {
  if (status === 'declared' || status === 'forming') return true;
  if (status !== 'active') return false;
  return side === 'defender' || registeredBeforeStart;
}

export function territoryFirstKeepAllowed(
  cell: { starter: boolean } | null | undefined,
  requirementsEnabled: boolean,
): boolean {
  return !!cell && (!requirementsEnabled || cell.starter);
}

export function territoryCellCapacity(
  territoryLevel: number,
  manifestCellCount: number,
  requirementsEnabled: boolean,
): number {
  if (!requirementsEnabled) return manifestCellCount;
  return LEVEL_CAPACITY[territoryLevel] ?? LEVEL_CAPACITY[1];
}

export function territoryRequiresSpend(requirementsEnabled: boolean): boolean {
  return requirementsEnabled;
}
