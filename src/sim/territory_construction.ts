import type { TerritoryStructureKind } from '../world_api';

const KIND_TIME_WEIGHT: Readonly<Record<TerritoryStructureKind, number>> = {
  keep: 5,
  walls: 3,
  towers: 4,
  granary: 2,
  forester: 2,
  mine: 2,
  house: 2,
  stockpile: 2,
  gate: 3,
  wall: 3,
  defense_tower: 4,
  storehouse: 2,
  construction_workshop: 2,
  siege_workshop: 3,
};

/**
 * Calculates a build/upgrade deadline without consulting a clock. Each active
 * construction-workshop level removes 10%, capped at 50%. Stale zero presets
 * are clamped to one second so a build always has a real server deadline.
 */
export function territoryConstructionDurationMs(
  kind: TerritoryStructureKind,
  targetLevel: number,
  activeWorkshopLevels: number,
  baseSeconds: number,
): number {
  const level = Math.max(1, Math.min(5, Math.floor(targetLevel)));
  const workshop = Math.max(0, Math.floor(activeWorkshopLevels));
  const speedMultiplier = Math.max(0.5, 1 - workshop * 0.1);
  const safeBaseSeconds = Number.isFinite(baseSeconds) ? Math.max(1, baseSeconds) : 1;
  return Math.max(
    1_000,
    Math.ceil(safeBaseSeconds * KIND_TIME_WEIGHT[kind] * level * speedMultiplier * 1_000),
  );
}

export function territoryRepairDurationMs(
  kind: TerritoryStructureKind,
  level: number,
  activeWorkshopLevels: number,
  baseSeconds: number,
): number {
  return Math.max(
    1_000,
    Math.ceil(territoryConstructionDurationMs(kind, level, activeWorkshopLevels, baseSeconds) / 2),
  );
}

/** A live battle blocks construction; a notice window only permits work that finishes in time. */
export function territoryConstructionFitsWarWindow(
  nowMs: number,
  durationMs: number,
  war: { status: 'declared' | 'forming' | 'active'; startsAtMs: number } | null,
): boolean {
  if (!war) return true;
  if (war.status === 'active' || nowMs >= war.startsAtMs) return false;
  return nowMs + Math.max(0, durationMs) <= war.startsAtMs;
}
