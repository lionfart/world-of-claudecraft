import { TERRITORY_AXIAL_DIRECTIONS } from '../sim/territory_manifest';
import {
  type TerritoryMapArt,
  type TerritoryMapArtKey,
  type TerritoryMapArtTransform,
  territoryMapArtKeyForCell,
  territoryMapArtTransformForCell,
  territoryTransitionArtKey,
} from './territory_map_art';
import type { TerritoryMapHex } from './territory_map_view';

export const TERRITORY_COMPOSITE_WIDTH = 226;
export const TERRITORY_COMPOSITE_HEIGHT = 384;
export const TERRITORY_COMPOSITE_PIVOT_X = TERRITORY_COMPOSITE_WIDTH / 2;
export const TERRITORY_COMPOSITE_PIVOT_Y = 123 + 261 / 2;

const FOOTPRINT_TOP = 123;
const FOOTPRINT_BOTTOM = 384;
const FOOTPRINT_RADIUS_Y = (FOOTPRINT_BOTTOM - FOOTPRINT_TOP) / 2;
const FOOTPRINT_RADIUS_X = TERRITORY_COMPOSITE_WIDTH / Math.sqrt(3);
const HEX_APOTHEM = Math.sqrt(3) / 2;
const MAX_CACHE_ENTRIES = 128;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Calculates an irregular, deterministic material connection for one side of a
 * tile. Coordinates are in the normalized 226x384 composition canvas. Noise is
 * sampled in world space, so the contour remains stable while panning/zooming.
 */
export function territoryConnectionAlpha(
  q: number,
  r: number,
  side: number,
  x: number,
  y: number,
): number {
  const dx = (x - TERRITORY_COMPOSITE_PIVOT_X) / FOOTPRINT_RADIUS_X;
  const dy = (y - TERRITORY_COMPOSITE_PIVOT_Y) / FOOTPRINT_RADIUS_Y;
  const angle = -(Math.PI / 3) * side;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const inwardDistance = HEX_APOTHEM - (dx * nx + dy * ny);
  if (inwardDistance < -0.015 || inwardDistance > 0.48) return 0;

  const worldX = Math.sqrt(3) * (q + r / 2) + dx;
  const worldY = 1.5 * r + dy;
  const broad = Math.sin(worldX * 5.73 + worldY * 4.11) * 0.045;
  const fine = Math.sin(worldX * 12.17 - worldY * 9.37 + side * 0.71) * 0.018;
  const connectionDepth = 0.34 + broad + fine;
  return (1 - smoothstep(0.015, connectionDepth, inwardDistance)) * 0.5;
}

function compositeHexPath(ctx: CanvasRenderingContext2D): void {
  ctx.moveTo(TERRITORY_COMPOSITE_PIVOT_X, FOOTPRINT_TOP);
  ctx.lineTo(TERRITORY_COMPOSITE_WIDTH, FOOTPRINT_TOP + FOOTPRINT_RADIUS_Y / 2);
  ctx.lineTo(TERRITORY_COMPOSITE_WIDTH, FOOTPRINT_BOTTOM - FOOTPRINT_RADIUS_Y / 2);
  ctx.lineTo(TERRITORY_COMPOSITE_PIVOT_X, FOOTPRINT_BOTTOM);
  ctx.lineTo(0, FOOTPRINT_BOTTOM - FOOTPRINT_RADIUS_Y / 2);
  ctx.lineTo(0, FOOTPRINT_TOP + FOOTPRINT_RADIUS_Y / 2);
  ctx.closePath();
}

function drawArt(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  transform: TerritoryMapArtTransform,
  clipToFootprint: boolean,
): void {
  ctx.save();
  if (clipToFootprint) {
    ctx.beginPath();
    compositeHexPath(ctx);
    ctx.clip();
  }
  ctx.translate(TERRITORY_COMPOSITE_PIVOT_X, TERRITORY_COMPOSITE_PIVOT_Y);
  if (transform.rotationSteps) ctx.rotate((transform.rotationSteps * Math.PI) / 3);
  if (transform.mirrorX) ctx.scale(-1, 1);
  ctx.drawImage(
    image,
    -TERRITORY_COMPOSITE_PIVOT_X,
    -TERRITORY_COMPOSITE_PIVOT_Y,
    TERRITORY_COMPOSITE_WIDTH,
    TERRITORY_COMPOSITE_HEIGHT,
  );
  ctx.restore();
}

function connectionMask(cell: TerritoryMapHex, side: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TERRITORY_COMPOSITE_WIDTH;
  canvas.height = TERRITORY_COMPOSITE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const mask = ctx.createImageData(canvas.width, canvas.height);
  for (let y = FOOTPRINT_TOP; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = territoryConnectionAlpha(cell.q, cell.r, side, x + 0.5, y + 0.5);
      if (alpha <= 0) continue;
      mask.data[(y * canvas.width + x) * 4 + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(mask, 0, 0);
  return canvas;
}

function connectionSignature(cell: TerritoryMapHex, baseKey: TerritoryMapArtKey): string {
  return `${cell.q},${cell.r}:${baseKey}:${cell.neighborBiomes
    .map((biome) => biome ?? '-')
    .join(',')}`;
}

/**
 * Produces one final image per neighbor combination instead of painting generic
 * bands over the visible map. Only cross-biome sides need a connection layer;
 * same-biome authored tiles already share one palette and remain crisp.
 */
export class TerritoryMapTileComposer {
  private readonly cache = new Map<string, HTMLCanvasElement>();

  compose(cell: TerritoryMapHex, art: TerritoryMapArt): HTMLCanvasElement | null {
    const baseKey = territoryMapArtKeyForCell(cell);
    const baseImage = art[baseKey];
    if (!baseImage) return null;
    const connections = cell.neighborBiomes.map((neighborBiome, side) => {
      if (!neighborBiome || neighborBiome === cell.biome) return null;
      const key = territoryTransitionArtKey(neighborBiome, cell.q, cell.r, side);
      const image = art[key];
      if (!image) return undefined;
      const [dq, dr] = TERRITORY_AXIAL_DIRECTIONS[side];
      return {
        image,
        transform: territoryMapArtTransformForCell({ q: cell.q + dq, r: cell.r + dr }, key),
        side,
      };
    });
    if (connections.some((connection) => connection === undefined)) return null;
    if (connections.every((connection) => connection === null)) return null;

    const signature = connectionSignature(cell, baseKey);
    const cached = this.cache.get(signature);
    if (cached) {
      this.cache.delete(signature);
      this.cache.set(signature, cached);
      return cached;
    }

    const canvas = document.createElement('canvas');
    canvas.width = TERRITORY_COMPOSITE_WIDTH;
    canvas.height = TERRITORY_COMPOSITE_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const baseTransform = territoryMapArtTransformForCell(cell, baseKey);
    drawArt(ctx, baseImage, baseTransform, baseTransform.rotationSteps !== 0);

    for (const connection of connections) {
      if (!connection) continue;
      const layer = document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
      const layerCtx = layer.getContext('2d');
      if (!layerCtx) continue;
      layerCtx.imageSmoothingEnabled = true;
      layerCtx.imageSmoothingQuality = 'high';
      drawArt(layerCtx, connection.image, connection.transform, true);
      layerCtx.globalCompositeOperation = 'destination-in';
      layerCtx.drawImage(connectionMask(cell, connection.side), 0, 0);
      ctx.drawImage(layer, 0, 0);
    }

    this.cache.set(signature, canvas);
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    return canvas;
  }
}
