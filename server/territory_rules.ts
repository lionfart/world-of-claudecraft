const LEVEL_CAPACITY = [0, 24, 36, 48, 64, 80] as const;

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
