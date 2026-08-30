// Canvas painter for the seasonal strategic map. Geometry/culling/hit tests live
// in territory_map_view.ts; this file owns DOM color-token reads and i18n.

import type { TerritoryResourceKind } from '../sim/territory_manifest';
import type { TerritoryMapState } from '../world_api';
import { t } from './i18n';
import {
  type TerritoryMapArt,
  territoryMapArt,
  territoryMapArtKeyForCell,
  territoryMapArtTransformForCell,
  territoryTerrainArtRect,
} from './territory_map_art';
import { TerritoryMapTileComposer } from './territory_map_tile_composer';
import {
  buildTerritoryMapModel,
  type TerritoryMapCenter,
  type TerritoryMapHex,
  type TerritoryMapModel,
} from './territory_map_view';

const TOKENS = {
  parchment: '--color-territory-parchment',
  parchmentLight: '--color-territory-parchment-light',
  parchmentShade: '--color-territory-parchment-shade',
  ink: '--color-territory-ink',
  grid: '--color-territory-grid',
  border: '--color-territory-border',
  hover: '--color-territory-hover',
  selected: '--color-territory-selected',
  war: '--color-territory-war',
  keep: '--color-territory-keep',
  castleRoof: '--color-territory-castle-roof',
  castleShadow: '--color-territory-castle-shadow',
  water: '--color-territory-water',
  road: '--color-territory-road',
  forest: '--color-territory-forest',
  grassland: '--color-territory-grassland',
  highland: '--color-territory-highland',
  marsh: '--color-territory-marsh',
  wastes: '--color-territory-wastes',
  wood: '--color-territory-resource-wood',
  iron: '--color-territory-resource-iron',
  grain: '--color-territory-resource-grain',
  labor: '--color-territory-resource-labor',
  text: '--color-map-label',
  outline: '--color-map-outline',
} as const;

type TerritoryColors = Record<keyof typeof TOKENS, string>;

export interface TerritoryPaintOptions {
  state: TerritoryMapState | null;
  canvasSize: number;
  zoom: number;
  center: TerritoryMapCenter;
  hoveredCellId: number | null;
  selectedCellId: number | null;
}

export class TerritoryMapPainter {
  private readonly tileComposer = new TerritoryMapTileComposer();

  constructor(private readonly onArtReady: () => void = () => undefined) {}

  paint(ctx: CanvasRenderingContext2D, options: TerritoryPaintOptions): TerritoryMapModel | null {
    const colors = this.colors();
    this.backdrop(ctx, options.canvasSize, colors);
    if (!options.state) {
      ctx.fillStyle = colors.text;
      ctx.font = 'bold 18px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(
        t('hudChrome.territoryMap.loading'),
        options.canvasSize / 2,
        options.canvasSize / 2,
      );
      return null;
    }
    const model = buildTerritoryMapModel({
      state: options.state,
      canvasSize: options.canvasSize,
      zoom: options.zoom,
      center: options.center,
      hoveredCellId: options.hoveredCellId,
      selectedCellId: options.selectedCellId,
    });
    this.drawCells(ctx, model, colors, territoryMapArt(this.onArtReady));
    this.title(ctx, model, options.canvasSize, colors);
    return model;
  }

  private colors(): TerritoryColors {
    const style = getComputedStyle(document.documentElement);
    const colors = {} as TerritoryColors;
    for (const key of Object.keys(TOKENS) as Array<keyof typeof TOKENS>) {
      colors[key] = style.getPropertyValue(TOKENS[key]).trim();
    }
    return colors;
  }

  private backdrop(ctx: CanvasRenderingContext2D, size: number, colors: TerritoryColors): void {
    ctx.fillStyle = colors.parchment;
    ctx.fillRect(0, 0, size, size);
    const light = ctx.createLinearGradient(0, 0, size, size);
    light.addColorStop(0, colors.parchmentLight);
    light.addColorStop(0.46, 'transparent');
    light.addColorStop(1, colors.parchmentShade);
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.34;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;

    ctx.fillStyle = colors.ink;
    ctx.globalAlpha = 0.08;
    const grainStep = Math.max(15, Math.round(size / 28));
    for (let y = grainStep; y < size; y += grainStep) {
      for (let x = grainStep; x < size; x += grainStep) {
        const grain = ((x * 17 + y * 29) >>> 2) % 7;
        ctx.fillRect(x + grain, y - grain / 2, grain % 2 === 0 ? 1.4 : 0.8, 0.8);
      }
    }
    ctx.globalAlpha = 1;
    const shade = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.1,
      size / 2,
      size / 2,
      size * 0.72,
    );
    shade.addColorStop(0, 'transparent');
    shade.addColorStop(1, colors.parchmentShade);
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, size, size);

    const frameInset = Math.max(7, size * 0.018);
    ctx.strokeStyle = colors.ink;
    ctx.globalAlpha = 0.82;
    ctx.lineWidth = Math.max(2, size * 0.007);
    ctx.strokeRect(frameInset, frameInset, size - frameInset * 2, size - frameInset * 2);
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      frameInset * 1.55,
      frameInset * 1.55,
      size - frameInset * 3.1,
      size - frameInset * 3.1,
    );
    ctx.globalAlpha = 1;
    this.cornerFlourishes(ctx, size, frameInset, colors);
  }

  private cornerFlourishes(
    ctx: CanvasRenderingContext2D,
    size: number,
    inset: number,
    colors: TerritoryColors,
  ): void {
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.62;
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      const x = sx > 0 ? inset * 1.8 : size - inset * 1.8;
      const y = sy > 0 ? inset * 1.8 : size - inset * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y + sy * inset * 2.2);
      ctx.quadraticCurveTo(x, y, x + sx * inset * 2.2, y);
      ctx.moveTo(x + sx * inset * 0.55, y + sy * inset * 0.55);
      ctx.lineTo(x + sx * inset * 1.35, y + sy * inset * 1.35);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private hexPath(ctx: CanvasRenderingContext2D, cell: TerritoryMapHex, inset = 0): void {
    const radius = Math.max(0.3, cell.radiusPx - inset);
    ctx.moveTo(cell.mx, cell.my - radius);
    for (let i = 1; i < 6; i += 1) {
      const angle = -Math.PI / 2 + (Math.PI / 3) * i;
      ctx.lineTo(cell.mx + Math.cos(angle) * radius, cell.my + Math.sin(angle) * radius);
    }
    ctx.closePath();
  }

  private drawCells(
    ctx: CanvasRenderingContext2D,
    model: TerritoryMapModel,
    colors: TerritoryColors,
    art: TerritoryMapArt,
  ): void {
    if ((model.visibleCells[0]?.radiusPx ?? 0) < 2.5) {
      const groups = new Map<string, { color: string; alpha: number; cells: TerritoryMapHex[] }>();
      for (const cell of model.visibleCells) {
        const color = cell.ownerColor ?? colors[cell.terrain];
        const key = `${cell.ownerColor ? 'owned' : 'neutral'}:${color}`;
        const group = groups.get(key);
        if (group) group.cells.push(cell);
        else groups.set(key, { color, alpha: cell.ownerColor ? 0.78 : 0.58, cells: [cell] });
      }
      for (const group of groups.values()) {
        ctx.beginPath();
        for (const cell of group.cells) this.hexPath(ctx, cell, 0.1);
        ctx.fillStyle = group.color;
        ctx.globalAlpha = group.alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const cell of model.visibleCells) {
        if (cell.keepRoot) this.keep(ctx, cell, colors);
        if (cell.atWar) this.war(ctx, cell, colors);
        if (!cell.hovered && !cell.selected) continue;
        ctx.beginPath();
        this.hexPath(ctx, cell, cell.selected ? 0.8 : 0.45);
        ctx.strokeStyle = cell.selected ? colors.selected : colors.hover;
        ctx.lineWidth = cell.selected ? 3 : 1.8;
        ctx.stroke();
      }
      this.territoryBorders(ctx, model.visibleCells, colors);
      return;
    }
    const useArt = (model.visibleCells[0]?.radiusPx ?? 0) >= 4.5 && Object.keys(art).length > 0;
    for (const cell of model.visibleCells) {
      ctx.beginPath();
      this.hexPath(ctx, cell, 0.16);
      ctx.fillStyle = cell.ownerColor ?? colors[cell.terrain];
      ctx.globalAlpha = cell.ownerColor ? 0.82 : 0.58;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!useArt && cell.radiusPx >= 1.1) {
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = cell.ownerColor ? 0.7 : 0.45;
        ctx.stroke();
      }
      if (!useArt && !cell.resource && cell.radiusPx >= 6.5) this.terrainDetail(ctx, cell, colors);
    }
    if (useArt) {
      this.artTiles(ctx, model.visibleCells, art);
      for (const cell of model.visibleCells) {
        if (cell.ownerColor) {
          ctx.beginPath();
          this.hexPath(ctx, cell, 0.16);
          ctx.fillStyle = cell.ownerColor;
          // Ownership is a translucent heraldic wash: strong enough to group
          // a realm at a glance without obscuring the authored biome art.
          ctx.globalAlpha = 0.22;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        this.hexPath(ctx, cell, 0.16);
        ctx.strokeStyle = colors.grid;
        ctx.lineWidth = cell.ownerColor ? 0.8 : 0.5;
        ctx.stroke();
      }
    }
    this.territoryBorders(ctx, model.visibleCells, colors);
    for (const cell of model.visibleCells) {
      const hasArt = useArt && !!this.artForCell(cell, art);
      if (!hasArt && cell.resource && cell.radiusPx >= 4)
        this.resource(ctx, cell, cell.resource, colors);
      if (cell.keepRoot) {
        if (!hasArt) this.keep(ctx, cell, colors);
        else this.keepLabel(ctx, cell, colors);
      }
      if (cell.atWar) this.war(ctx, cell, colors);
      if (cell.hovered || cell.selected) {
        ctx.beginPath();
        this.hexPath(ctx, cell, cell.selected ? 0.8 : 0.45);
        ctx.strokeStyle = cell.selected ? colors.selected : colors.hover;
        ctx.lineWidth = cell.selected ? 3 : 1.8;
        ctx.stroke();
      }
    }
  }

  private artTiles(
    ctx: CanvasRenderingContext2D,
    cells: readonly TerritoryMapHex[],
    art: TerritoryMapArt,
  ): void {
    const sorted = [...cells].sort((a, b) => a.my - b.my || a.mx - b.mx);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Every cross-biome neighbor combination resolves to one cached, composed
    // tile image. No generic overlay bands are painted into the final map.
    for (const cell of sorted) {
      const key = territoryMapArtKeyForCell(cell);
      const image = art[key];
      if (!image) continue;
      const rect = territoryTerrainArtRect(cell.mx, cell.my, cell.radiusPx);
      const composite = this.tileComposer.compose(cell, art);
      if (composite) {
        ctx.drawImage(composite, rect.x, rect.y, rect.width, rect.height);
        continue;
      }
      const transform = territoryMapArtTransformForCell(cell, key);
      ctx.save();
      if (transform.rotationSteps) {
        ctx.beginPath();
        this.hexPath(ctx, cell, 0.05);
        ctx.clip();
      }
      ctx.translate(cell.mx, cell.my);
      if (transform.rotationSteps) ctx.rotate((transform.rotationSteps * Math.PI) / 3);
      if (transform.mirrorX) ctx.scale(-1, 1);
      ctx.drawImage(image, rect.x - cell.mx, rect.y - cell.my, rect.width, rect.height);
      ctx.restore();
    }
  }

  private artForCell(cell: TerritoryMapHex, art: TerritoryMapArt): HTMLImageElement | undefined {
    return art[territoryMapArtKeyForCell(cell)];
  }

  private territoryBorders(
    ctx: CanvasRenderingContext2D,
    cells: readonly TerritoryMapHex[],
    colors: TerritoryColors,
  ): void {
    const baseWidth = Math.min(3.8, Math.max(1.35, (cells[0]?.radiusPx ?? 1) * 0.2));
    for (const cell of cells) {
      if (!cell.ownerGuildId || !cell.ownerColor) continue;
      // Pull each coloured frontier slightly inside its own cell. At a border
      // shared by two guilds this creates two slim parallel ribbons, preserving
      // both identities instead of allowing the later-painted colour to win.
      const inset = Math.min(1.7, Math.max(0.45, cell.radiusPx * 0.075));
      const radius = Math.max(0.3, cell.radiusPx - inset);
      for (let side = 0; side < 6; side += 1) {
        if (!cell.borderSides[side]) continue;
        const start = -Math.PI / 6 - (Math.PI / 3) * side;
        const x1 = cell.mx + Math.cos(start) * radius;
        const y1 = cell.my + Math.sin(start) * radius;
        const x2 = cell.mx + Math.cos(start + Math.PI / 3) * radius;
        const y2 = cell.my + Math.sin(start + Math.PI / 3) * radius;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = baseWidth + 2;
        ctx.globalAlpha = 0.72;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = cell.ownerColor;
        ctx.lineWidth = baseWidth;
        ctx.globalAlpha = 0.98;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private terrainDetail(
    ctx: CanvasRenderingContext2D,
    cell: TerritoryMapHex,
    colors: TerritoryColors,
  ): void {
    const size = Math.min(4.5, cell.radiusPx * 0.34);
    const seed = Math.abs(Math.imul(cell.q + 47, 1_103_515_245) ^ Math.imul(cell.r - 19, 12_345));
    const ox = ((seed % 7) - 3) * cell.radiusPx * 0.055;
    const oy = (((seed >>> 4) % 5) - 2) * cell.radiusPx * 0.055;
    ctx.save();
    ctx.translate(cell.mx + ox, cell.my + oy);
    ctx.strokeStyle = colors.ink;
    ctx.fillStyle = colors.ink;
    ctx.lineWidth = Math.max(0.55, cell.radiusPx * 0.055);
    ctx.globalAlpha = cell.ownerColor ? 0.34 : 0.47;
    if (cell.terrain === 'forest') {
      this.tree(ctx, -size * 0.62, size * 0.2, size * 0.72);
      this.tree(ctx, size * 0.48, size * 0.38, size * 0.9);
      this.tree(ctx, 0, -size * 0.28, size);
    } else if (cell.terrain === 'highland') {
      ctx.beginPath();
      ctx.moveTo(-size * 1.2, size * 0.65);
      ctx.lineTo(-size * 0.35, -size * 0.7);
      ctx.lineTo(size * 0.1, size * 0.04);
      ctx.lineTo(size * 0.52, -size * 0.55);
      ctx.lineTo(size * 1.25, size * 0.65);
      ctx.stroke();
    } else if (cell.terrain === 'marsh') {
      ctx.strokeStyle = colors.water;
      for (let row = -1; row <= 1; row += 1) {
        ctx.beginPath();
        ctx.moveTo(-size, row * size * 0.46);
        ctx.quadraticCurveTo(-size * 0.5, row * size * 0.46 - size * 0.25, 0, row * size * 0.46);
        ctx.quadraticCurveTo(size * 0.5, row * size * 0.46 + size * 0.25, size, row * size * 0.46);
        ctx.stroke();
      }
    } else if (cell.terrain === 'wastes') {
      ctx.beginPath();
      ctx.moveTo(-size, -size * 0.35);
      ctx.lineTo(-size * 0.25, 0);
      ctx.lineTo(-size * 0.62, size * 0.72);
      ctx.moveTo(size * 0.55, -size * 0.65);
      ctx.lineTo(size * 0.1, size * 0.12);
      ctx.lineTo(size * 0.85, size * 0.52);
      ctx.stroke();
    } else {
      ctx.strokeStyle = colors.road;
      ctx.beginPath();
      ctx.moveTo(-size * 0.8, size * 0.55);
      ctx.quadraticCurveTo(-size * 0.48, -size * 0.35, -size * 0.18, size * 0.45);
      ctx.moveTo(size * 0.05, size * 0.5);
      ctx.quadraticCurveTo(size * 0.32, -size * 0.5, size * 0.72, size * 0.42);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private tree(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size * 0.64, y + size * 0.36);
    ctx.lineTo(x + size * 0.64, y + size * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - size * 0.12, y + size * 0.28, size * 0.24, size * 0.55);
  }

  private resource(
    ctx: CanvasRenderingContext2D,
    cell: TerritoryMapHex,
    resource: TerritoryResourceKind,
    colors: TerritoryColors,
  ): void {
    const size = Math.max(2.4, Math.min(8.5, cell.radiusPx * 0.44));
    ctx.save();
    ctx.translate(cell.mx, cell.my + cell.radiusPx * 0.08);
    ctx.strokeStyle = colors.outline;
    ctx.fillStyle = colors[resource];
    ctx.lineWidth = Math.max(0.8, size * 0.14);
    if (resource === 'iron') {
      ctx.beginPath();
      ctx.moveTo(-size, size * 0.62);
      ctx.lineTo(-size * 0.58, -size * 0.34);
      ctx.lineTo(0, -size * 0.78);
      ctx.lineTo(size * 0.62, -size * 0.2);
      ctx.lineTo(size, size * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = colors.parchmentLight;
      ctx.beginPath();
      ctx.moveTo(-size * 0.54, size * 0.26);
      ctx.lineTo(-size * 0.12, -size * 0.35);
      ctx.lineTo(size * 0.2, size * 0.06);
      ctx.lineTo(size * 0.55, -size * 0.16);
      ctx.stroke();
    } else if (resource === 'wood') {
      this.tree(ctx, -size * 0.48, size * 0.22, size * 0.78);
      this.tree(ctx, size * 0.48, size * 0.3, size * 0.72);
      this.tree(ctx, 0, -size * 0.1, size);
      ctx.stroke();
    } else if (resource === 'grain') {
      ctx.beginPath();
      for (let stalk = -1; stalk <= 1; stalk += 1) {
        const x = stalk * size * 0.34;
        ctx.moveTo(x, size);
        ctx.lineTo(x * 0.45, -size);
        ctx.moveTo(x * 0.7, -size * 0.55);
        ctx.lineTo(x - size * 0.26, -size * 0.78);
        ctx.moveTo(x * 0.58, -size * 0.16);
        ctx.lineTo(x + size * 0.28, -size * 0.44);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.rect(-size, size * 0.12, size * 2, size * 0.72);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-size * 0.52, size * 0.12);
      ctx.lineTo(size * 0.38, -size * 0.88);
      ctx.moveTo(size * 0.12, -size * 0.72);
      ctx.lineTo(size * 0.72, -size * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }

  private keep(
    ctx: CanvasRenderingContext2D,
    cell: TerritoryMapHex,
    colors: TerritoryColors,
  ): void {
    const size = Math.max(3.2, Math.min(18, cell.radiusPx * 0.76));
    const baseY = cell.my + size * 0.35;
    ctx.save();
    ctx.fillStyle = colors.castleShadow;
    ctx.globalAlpha = 0.34;
    ctx.beginPath();
    ctx.ellipse(cell.mx, baseY + size * 0.46, size * 1.22, size * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = Math.max(0.8, size * 0.09);

    ctx.fillStyle = colors.keep;
    ctx.beginPath();
    ctx.rect(cell.mx - size, baseY - size * 0.62, size * 2, size * 0.92);
    ctx.rect(cell.mx - size * 1.05, baseY - size * 1.16, size * 0.54, size * 1.42);
    ctx.rect(cell.mx + size * 0.51, baseY - size * 1.16, size * 0.54, size * 1.42);
    ctx.fill();
    ctx.stroke();

    const merlon = size * 0.18;
    ctx.fillStyle = colors.keep;
    for (let side = -1; side <= 1; side += 2) {
      const towerX = cell.mx + side * size * 0.78;
      for (let i = -1; i <= 1; i += 1) {
        ctx.fillRect(towerX + i * merlon * 1.25 - merlon / 2, baseY - size * 1.33, merlon, merlon);
      }
    }

    ctx.fillStyle = colors.castleRoof;
    ctx.beginPath();
    ctx.moveTo(cell.mx - size * 0.56, baseY - size * 0.62);
    ctx.lineTo(cell.mx, baseY - size * 1.42);
    ctx.lineTo(cell.mx + size * 0.56, baseY - size * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colors.castleShadow;
    ctx.beginPath();
    ctx.rect(cell.mx - size * 0.15, baseY - size * 0.18, size * 0.3, size * 0.48);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    this.keepLabel(ctx, cell, colors, baseY + size * 0.52);
  }

  private keepLabel(
    ctx: CanvasRenderingContext2D,
    cell: TerritoryMapHex,
    colors: TerritoryColors,
    labelY = cell.my + cell.radiusPx * 0.82,
  ): void {
    if (cell.ownerGuildName && cell.radiusPx >= 13) {
      ctx.font = `bold ${Math.max(9, Math.min(13, cell.radiusPx * 0.42))}px Georgia`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.outline;
      ctx.fillStyle = colors.text;
      ctx.strokeText(cell.ownerGuildName, cell.mx, labelY);
      ctx.fillText(cell.ownerGuildName, cell.mx, labelY);
    }
  }

  private war(ctx: CanvasRenderingContext2D, cell: TerritoryMapHex, colors: TerritoryColors): void {
    const size = Math.max(4, Math.min(14, cell.radiusPx * 0.7));
    ctx.strokeStyle = colors.war;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cell.mx - size, cell.my - size);
    ctx.lineTo(cell.mx + size, cell.my + size);
    ctx.moveTo(cell.mx + size, cell.my - size);
    ctx.lineTo(cell.mx - size, cell.my + size);
    ctx.stroke();
  }

  private title(
    ctx: CanvasRenderingContext2D,
    _model: TerritoryMapModel,
    size: number,
    colors: TerritoryColors,
  ): void {
    const width = Math.min(size * 0.42, 230);
    const height = Math.max(25, size * 0.052);
    const top = Math.max(8, size * 0.014);
    ctx.fillStyle = colors.parchmentShade;
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(size / 2 - width / 2, top);
    ctx.lineTo(size / 2 + width / 2, top);
    ctx.lineTo(size / 2 + width / 2 - height * 0.36, top + height);
    ctx.lineTo(size / 2 - width / 2 + height * 0.36, top + height);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.font = `bold ${Math.max(14, Math.min(18, size * 0.032))}px Georgia`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.outline;
    ctx.fillStyle = colors.text;
    const title = t('hudChrome.territoryMap.title');
    ctx.strokeText(title, size / 2, top + height * 0.52);
    ctx.fillText(title, size / 2, top + height * 0.52);
  }
}
