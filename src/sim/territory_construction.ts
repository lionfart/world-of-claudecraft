import type { TerritoryStructureKind } from '../world_api';

const KIND_TIME_WEIGHT: Readonly<Record<TerritoryStructureKind, number>> = {
  keep: 5,
  walls: 3,
  towers: 4,
  granary: 2,
  forester: 2,
  mine: 2,
  house: 2,
  gate: 3,
  wall: 3,
  defense_tower: 4,
  storehouse: 2,
  construction_workshop: 2,
  siege_workshop: 3,
};

/**
 * Calculates a build/upgrade deadline without consulting a clock. Each active
 * construction-workshop level removes 10%, capped at 50%, so the workshop can
 * never make a queued mutation complete synchronously.
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
  return Math.max(
    1_000,
    Math.ceil(Math.max(1, baseSeconds) * KIND_TIME_WEIGHT[kind] * level * speedMultiplier * 1_000),
  );
}
