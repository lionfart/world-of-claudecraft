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

/**
 * Leaving the battlefield is not the same as withdrawing from an active
 * attacking roster. The locked pre-start seat remains durable so a voluntary
 * exit, link loss, or process restart can all re-enter through the same policy.
 */
export function territoryWarLeaveKeepsRegistration(
  status: TerritoryWarStatus,
  side: TerritoryWarSide,
  registeredBeforeStart: boolean,
): boolean {
  return status === 'active' && side === 'attacker' && registeredBeforeStart;
}

/**
 * A roster seat can remain reserved without placing its owner in the live arena.
 * `disconnectedAt` is set by an explicit Leave siege and cleared by Join siege.
 */
export function territoryWarParticipantBattleActive(
  leftAt: Date | string | null,
  disconnectedAt: Date | string | null,
): boolean {
  return leftAt === null && disconnectedAt === null;
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
