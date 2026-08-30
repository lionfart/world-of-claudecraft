// Pure projection and hit-testing for the seasonal strategic map. The painter
// receives only visible cells; it never scans the full manifest itself.

import {
  type TerritoryVisualBiome,
  territoryResourceProfile,
  territoryVisualBiome,
} from '../sim/territory_biome';
import {
  axialKey,
  axialToWorld,
  createTerritoryManifest,
  TERRITORY_AXIAL_DIRECTIONS,
  type TerritoryManifest,
  type TerritoryResourceKind,
  type TerritoryTerrain,
} from '../sim/territory_manifest';
import type { TerritoryMapState } from '../world_api';

export const TERRITORY_MAP_MAX_ZOOM = 18;
export const TERRITORY_MAP_OPEN_ZOOM = 1;

export interface TerritoryMapCenter {
  x: number;
  y: number;
}

export interface TerritoryMapView {
  center: TerritoryMapCenter;
  spanX: number;
  spanY: number;
  pixelsPerUnit: number;
}

export interface TerritoryMapHex {
  cellId: number;
  q: number;
  r: number;
  mx: number;
  my: number;
  radiusPx: number;
  terrain: TerritoryTerrain;
  biome: TerritoryVisualBiome;
  resource: TerritoryResourceKind | null;
  resourceYield: number;
  ownerGuildId: string | null;
  ownerGuildName: string | null;
  ownerColor: string | null;
  keepRoot: boolean;
  structureLevel: number;
  atWar: boolean;
  hovered: boolean;
  selected: boolean;
  borderSides: readonly boolean[];
}

export interface TerritoryMapModel {
  view: TerritoryMapView;
  visibleCells: TerritoryMapHex[];
  totalCells: number;
  ownedCells: number;
  revision: number;
}

function fullSpan(manifest: TerritoryManifest): { x: number; y: number } {
  return {
    x: Math.sqrt(3) * (manifest.radius * 2 + 1),
    y: manifest.radius * 3 + 2,
  };
}

export function clampTerritoryMapZoom(zoom: number): number {
  return Math.max(TERRITORY_MAP_OPEN_ZOOM, Math.min(TERRITORY_MAP_MAX_ZOOM, zoom));
}

export function clampTerritoryMapCenter(
  manifest: TerritoryManifest,
  zoom: number,
  center: TerritoryMapCenter,
): TerritoryMapCenter {
  const full = fullSpan(manifest);
  const safeZoom = clampTerritoryMapZoom(zoom);
  const halfX = full.x / safeZoom / 2;
  const halfY = full.y / safeZoom / 2;
  return {
    x: Math.max(-full.x / 2 + halfX, Math.min(full.x / 2 - halfX, center.x)),
    y: Math.max(-full.y / 2 + halfY, Math.min(full.y / 2 - halfY, center.y)),
  };
}

export function buildTerritoryMapModel(input: {
  state: TerritoryMapState;
  canvasSize: number;
  zoom: number;
  center: TerritoryMapCenter;
  hoveredCellId: number | null;
  selectedCellId: number | null;
}): TerritoryMapModel {
  const manifest = createTerritoryManifest(input.state.season.radius);
  const zoom = clampTerritoryMapZoom(input.zoom);
  const center = clampTerritoryMapCenter(manifest, zoom, input.center);
  const full = fullSpan(manifest);
  const spanX = full.x / zoom;
  const spanY = full.y / zoom;
  const pixelsPerUnit = Math.min(input.canvasSize / spanX, input.canvasSize / spanY);
  const view: TerritoryMapView = { center, spanX, spanY, pixelsPerUnit };
  const owned = new Map(input.state.cells.map((cell) => [cell.cellId, cell]));
  const structureLevel = new Map<number, number>();
  for (const structure of input.state.structures) {
    structureLevel.set(
      structure.cellId,
      Math.max(structureLevel.get(structure.cellId) ?? 0, structure.level),
    );
  }
  const warCells = new Set(
    input.state.wars
      .filter(
        (war) => war.status === 'declared' || war.status === 'forming' || war.status === 'active',
      )
      .map((war) => war.targetCellId),
  );

  const margin = 2;
  const minX = center.x - spanX / 2 - margin;
  const maxX = center.x + spanX / 2 + margin;
  const minY = center.y - spanY / 2 - margin;
  const maxY = center.y + spanY / 2 + margin;
  const visibleCells: TerritoryMapHex[] = [];
  const rMin = Math.floor(minY / 1.5) - 2;
  const rMax = Math.ceil(maxY / 1.5) + 2;
  for (let r = rMin; r <= rMax; r += 1) {
    const qMin = Math.floor(minX / Math.sqrt(3) - r / 2) - 2;
    const qMax = Math.ceil(maxX / Math.sqrt(3) - r / 2) + 2;
    for (let q = qMin; q <= qMax; q += 1) {
      const cell = manifest.byAxial.get(axialKey(q, r));
      if (!cell) continue;
      const point = axialToWorld(q, r);
      if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue;
      const owner = owned.get(cell.id);
      const biome = territoryVisualBiome(cell, manifest.radius);
      const resource = territoryResourceProfile(cell, manifest.radius);
      visibleCells.push({
        cellId: cell.id,
        q,
        r,
        mx: (point.x - center.x) * pixelsPerUnit + input.canvasSize / 2,
        my: (point.y - center.y) * pixelsPerUnit + input.canvasSize / 2,
        radiusPx: pixelsPerUnit,
        terrain: cell.terrain,
        biome,
        resource: resource?.kind ?? null,
        resourceYield: resource?.yield ?? 0,
        ownerGuildId: owner?.ownerGuildId ?? null,
        ownerGuildName: owner?.ownerGuildName ?? null,
        ownerColor: owner?.ownerColor ?? null,
        keepRoot: owner?.keepRoot ?? false,
        structureLevel: structureLevel.get(cell.id) ?? 0,
        atWar: warCells.has(cell.id),
        hovered: cell.id === input.hoveredCellId,
        selected: cell.id === input.selectedCellId,
        borderSides: TERRITORY_AXIAL_DIRECTIONS.map(([dq, dr]) => {
          if (!owner) return false;
          const neighbor = manifest.byAxial.get(axialKey(q + dq, r + dr));
          return !neighbor || owned.get(neighbor.id)?.ownerGuildId !== owner.ownerGuildId;
        }),
      });
    }
  }
  return {
    view,
    visibleCells,
    totalCells: manifest.cells.length,
    ownedCells: input.state.cells.length,
    revision: input.state.revision,
  };
}

function axialRound(q: number, r: number): { q: number; r: number } {
  const x = q;
  const z = r;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

export function territoryCellAt(
  manifest: TerritoryManifest,
  view: TerritoryMapView,
  canvasSize: number,
  mx: number,
  my: number,
): number | null {
  const x = (mx - canvasSize / 2) / view.pixelsPerUnit + view.center.x;
  const y = (my - canvasSize / 2) / view.pixelsPerUnit + view.center.y;
  const axial = axialRound(x / Math.sqrt(3) - y / 3, (2 / 3) * y);
  return manifest.byAxial.get(axialKey(axial.q, axial.r))?.id ?? null;
}
