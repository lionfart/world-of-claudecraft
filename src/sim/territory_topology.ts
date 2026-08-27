import type { TerritoryManifest } from './territory_manifest';

export interface TerritoryConnectivityResult {
  readonly connected: ReadonlySet<number>;
  readonly disconnected: readonly number[];
}

/**
 * Finds defender cells that remain connected to any surviving keep root after
 * a capture.  The function is pure and deterministic so the DB transaction can
 * read ownership once, compute once, then bulk-apply the result atomically.
 */
export function territoryConnectivityAfterCapture(
  manifest: TerritoryManifest,
  defenderOwned: ReadonlySet<number>,
  capturedCellId: number,
  keepRoots: ReadonlySet<number>,
): TerritoryConnectivityResult {
  const remaining = new Set<number>();
  for (const cellId of defenderOwned) {
    if (cellId !== capturedCellId && manifest.byId.has(cellId)) remaining.add(cellId);
  }

  const connected = new Set<number>();
  const queue: number[] = [];
  for (const root of keepRoots) {
    if (!remaining.has(root)) continue;
    connected.add(root);
    queue.push(root);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = manifest.byId.get(queue[cursor]);
    if (!cell) continue;
    for (const neighbor of cell.neighbors) {
      if (!remaining.has(neighbor) || connected.has(neighbor)) continue;
      connected.add(neighbor);
      queue.push(neighbor);
    }
  }

  const disconnected: number[] = [];
  for (const cellId of remaining) {
    if (!connected.has(cellId)) disconnected.push(cellId);
  }
  disconnected.sort((a, b) => a - b);
  return { connected, disconnected };
}

export function isTerritoryClaimAdjacent(
  manifest: TerritoryManifest,
  owned: ReadonlySet<number>,
  targetCellId: number,
): boolean {
  const target = manifest.byId.get(targetCellId);
  if (!target || owned.has(targetCellId)) return false;
  return target.neighbors.some((neighbor) => owned.has(neighbor));
}
