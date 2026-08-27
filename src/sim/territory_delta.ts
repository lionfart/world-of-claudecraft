import type {
  TerritoryMapState,
  TerritoryOwnedCellView,
  TerritoryStructureView,
  TerritoryWarView,
} from '../world_api';

export interface TerritoryDelta {
  revision: number;
  /** The committed change was intentionally compacted and requires a fresh snapshot. */
  resetRequired?: true;
  cellsUpsert?: TerritoryOwnedCellView[];
  cellsRemove?: number[];
  structuresUpsert?: TerritoryStructureView[];
  structuresRemove?: Array<{ cellId: number; slot: TerritoryStructureView['slot'] }>;
  warsUpsert?: TerritoryWarView[];
  warsRemove?: string[];
  guild?: TerritoryMapState['guild'];
  siege?: TerritoryMapState['siege'];
}

function replaceByKey<T>(
  current: readonly T[],
  upsert: readonly T[],
  key: (value: T) => string,
): T[] {
  const next = new Map(current.map((value) => [key(value), value]));
  for (const value of upsert) next.set(key(value), value);
  return [...next.values()];
}

export function applyTerritoryDelta(
  current: TerritoryMapState,
  delta: TerritoryDelta,
): TerritoryMapState | null {
  if (delta.resetRequired) return null;
  if (!Number.isSafeInteger(delta.revision) || delta.revision !== current.revision + 1) return null;
  const removedCells = new Set(delta.cellsRemove ?? []);
  const removedStructures = new Set(
    (delta.structuresRemove ?? []).map((value) => `${value.cellId}:${value.slot}`),
  );
  const removedWars = new Set(delta.warsRemove ?? []);
  return {
    ...current,
    revision: delta.revision,
    cells: replaceByKey(
      current.cells.filter((value) => !removedCells.has(value.cellId)),
      delta.cellsUpsert ?? [],
      (value) => String(value.cellId),
    ),
    structures: replaceByKey(
      current.structures.filter((value) => !removedStructures.has(`${value.cellId}:${value.slot}`)),
      delta.structuresUpsert ?? [],
      (value) => `${value.cellId}:${value.slot}`,
    ),
    wars: replaceByKey(
      current.wars.filter((value) => !removedWars.has(value.id)),
      delta.warsUpsert ?? [],
      (value) => value.id,
    ),
    guild: delta.guild === undefined ? current.guild : delta.guild,
    siege: delta.siege === undefined ? current.siege : delta.siege,
  };
}
