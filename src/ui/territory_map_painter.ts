// Canvas painter for the seasonal strategic map. Geometry/culling/hit tests live
// in territory_map_view.ts; this file owns DOM color-token reads and i18n.

import type { TerritoryResourceKind } from '../sim/territory_manifest';
import type { TerritoryMapState } from '../world_api';
import { t } from './i18n';
import {
  buildTerritoryMapModel,
  type TerritoryMapCenter,
  type TerritoryMapHex,
  type TerritoryMapModel,
} from './territory_map_view';

const TOKENS = {
  parchment: '--color-territory-parchment',
  parchmentShade: '--color-territory-parchment-shade',
  grid: '--color-territory-grid',
  border: '--color-territory-border',
  hover: '--color-territory-hover',
  selected: '--color-territory-selected',
  war: '--color-territory-war',
  keep: '--color-territory-keep',
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
    this.drawCells(ctx, model, colors);
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
  }

  private hexPath(ctx: CanvasRenderingContext2D, cell: TerritoryMapHex, inset = 0): void {
    const radius = Math.max(0.3, cell.radiusPx - inset);
    ctx.moveTo(cell.mx + radius, cell.my);
    for (let i = 1; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i;
      ctx.lineTo(cell.mx + Math.cos(angle) * radius, cell.my + Math.sin(angle) * radius);
    }
    ctx.closePath();
  }

  private drawCells(
    ctx: CanvasRenderingContext2D,
    model: TerritoryMapModel,
    colors: TerritoryColors,
  ): void {
    if ((model.visibleCells[0]?.radiusPx ?? 0) < 2.5) {
      const groups = new Map<string, { color: string; alpha: number; cells: TerritoryMapHex[] }>();
      for (const cell of model.visibleCells) {
        const color = cell.ownerColor ?? colors[cell.terrain];
        const key = `${cell.ownerColor ? 'owned' : 'neutral'}:${color}`;
        const group = groups.get(key);
        if (group) group.cells.push(cell);
        else groups.set(key, { color, alpha: cell.ownerColor ? 0.82 : 0.58, cells: [cell] });
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
      return;
    }
    for (const cell of model.visibleCells) {
      ctx.beginPath();
      this.hexPath(ctx, cell, 0.16);
      ctx.fillStyle = cell.ownerColor ?? colors[cell.terrain];
      ctx.globalAlpha = cell.ownerColor ? 0.82 : 0.58;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (cell.radiusPx >= 1.1) {
        ctx.strokeStyle = cell.ownerColor ? colors.border : colors.grid;
        ctx.lineWidth = cell.ownerColor ? Math.min(2.4, Math.max(0.8, cell.radiusPx * 0.12)) : 0.45;
        ctx.stroke();
      }
      if (cell.resource && cell.radiusPx >= 4) this.resource(ctx, cell, cell.resource, colors);
      if (cell.keepRoot) this.keep(ctx, cell, colors);
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

  private resource(
    ctx: CanvasRenderingContext2D,
    cell: TerritoryMapHex,
    resource: TerritoryResourceKind,
    colors: TerritoryColors,
  ): void {
    const size = Math.max(2, Math.min(7, cell.radiusPx * 0.32));
    ctx.save();
    ctx.translate(cell.mx, cell.my + cell.radiusPx * 0.2);
    ctx.strokeStyle = colors.outline;
    ctx.fillStyle = colors[resource];
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (resource === 'iron') {
      ctx.moveTo(0, -size);
      ctx.lineTo(size, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size, 0);
      ctx.closePath();
    } else if (resource === 'wood') {
      ctx.arc(0, -size * 0.2, size, 0, Math.PI * 2);
      ctx.moveTo(-size * 0.3, size * 0.4);
      ctx.lineTo(-size * 0.3, size * 1.25);
      ctx.lineTo(size * 0.3, size * 1.25);
      ctx.lineTo(size * 0.3, size * 0.4);
    } else if (resource === 'grain') {
      ctx.moveTo(0, size);
      ctx.lineTo(0, -size);
      ctx.moveTo(0, -size * 0.25);
      ctx.lineTo(-size * 0.65, -size * 0.75);
      ctx.moveTo(0, size * 0.2);
      ctx.lineTo(size * 0.65, -size * 0.3);
    } else {
      ctx.rect(-size * 0.75, -size * 0.75, size * 1.5, size * 1.5);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private keep(
    ctx: CanvasRenderingContext2D,
    cell: TerritoryMapHex,
    colors: TerritoryColors,
  ): void {
    const size = Math.max(2.5, Math.min(12, cell.radiusPx * 0.55));
    ctx.fillStyle = colors.keep;
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(cell.mx - size, cell.my - size * 0.35, size * 2, size * 1.2);
    ctx.rect(cell.mx - size, cell.my - size, size * 0.55, size * 0.75);
    ctx.rect(cell.mx + size * 0.45, cell.my - size, size * 0.55, size * 0.75);
    ctx.fill();
    ctx.stroke();
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
    ctx.font = 'bold 16px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.outline;
    ctx.fillStyle = colors.text;
    const title = t('hudChrome.territoryMap.title');
    ctx.strokeText(title, size / 2, 12);
    ctx.fillText(title, size / 2, 12);
  }
}
