import { createTerritoryManifest, type TerritoryResourceKind } from '../sim/territory_manifest';
import type {
  IWorld,
  TerritoryStructureKind,
  TerritoryStructureSlot,
  TerritoryStructureView,
} from '../world_api';
import { t } from './i18n';
import type { PainterHostWriters } from './painter_host';
import { TerritoryMapPainter } from './territory_map_painter';
import {
  TERRITORY_MAP_MAX_ZOOM,
  TERRITORY_MAP_OPEN_ZOOM,
  type TerritoryMapCenter,
  type TerritoryMapModel,
  type TerritoryMapView,
  territoryCellAt,
} from './territory_map_view';

type PrimaryAction =
  | { kind: 'place'; cellId: number }
  | { kind: 'claim'; cellId: number }
  | { kind: 'war'; cellId: number }
  | { kind: 'join'; warId: string };
interface TerritoryDrag {
  px: number;
  py: number;
  cx: number;
  cy: number;
}

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`missing territory UI element: ${selector}`);
  return found;
}

/** Cold DOM/canvas adapter for the strategic map and its live siege HUD. */
export class TerritoryMapController {
  private readonly painter = new TerritoryMapPainter();
  private zoom = TERRITORY_MAP_OPEN_ZOOM;
  private center: TerritoryMapCenter = { x: 0, y: 0 };
  private view: TerritoryMapView | null = null;
  private hoverCell: number | null = null;
  private selectedCell: number | null = null;
  private paintKey: string | null = null;
  private paintModel: TerritoryMapModel | null = null;
  private drag: TerritoryDrag | null = null;

  constructor(
    private readonly world: IWorld,
    private readonly canvas: HTMLCanvasElement,
    private readonly writers: PainterHostWriters,
    private readonly repaint: () => void,
    private readonly exitToContinent: () => void,
  ) {
    element('#territory-primary-action').addEventListener('click', () => this.performPrimary());
    element('#territory-build-action').addEventListener('click', () => this.performBuild());
    element('#territory-upgrade-action').addEventListener('click', () => this.performUpgrade());
    const siegeActions = [
      ['#territory-deploy-ram', 'deploy_ram'],
      ['#territory-ram-gate', 'ram_gate'],
      ['#territory-deploy-ramp', 'deploy_ramp'],
      ['#territory-strike-core', 'strike_core'],
    ] as const;
    for (const [selector, action] of siegeActions) {
      element(selector).addEventListener('click', () => this.world.territorySiegeAction(action));
    }
  }

  open(): void {
    this.zoom = TERRITORY_MAP_OPEN_ZOOM;
    this.center = { x: 0, y: 0 };
    this.world.territoryOpen();
  }

  close(): void {
    this.world.territoryClose();
  }
  invalidate(): void {
    this.paintKey = null;
    this.view = null;
  }
  endDrag(): void {
    this.drag = null;
  }

  zoomBy(factor: number): void {
    if (this.zoom <= TERRITORY_MAP_OPEN_ZOOM && factor < 1) {
      this.exitToContinent();
      return;
    }
    this.zoom = Math.max(
      TERRITORY_MAP_OPEN_ZOOM,
      Math.min(TERRITORY_MAP_MAX_ZOOM, this.zoom * factor),
    );
    this.repaint();
  }

  pointerDown(event: PointerEvent, pinching: boolean): void {
    if (pinching || !this.view || this.zoom <= 1) return;
    this.drag = { px: event.clientX, py: event.clientY, cx: this.center.x, cy: this.center.y };
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = 'grabbing';
  }

  pointerMove(event: PointerEvent, pinching: boolean): void {
    if (event.pointerType === 'mouse') this.updateHover(event.clientX, event.clientY);
    if (pinching || !this.drag || !this.view) return;
    const rect = this.canvas.getBoundingClientRect();
    this.center = {
      x: this.drag.cx + (event.clientX - this.drag.px) * (this.view.spanX / rect.width),
      y: this.drag.cy + (event.clientY - this.drag.py) * (this.view.spanY / rect.height),
    };
    this.repaint();
  }

  click(canvasX: number, canvasY: number): void {
    const state = this.world.territoryMap;
    if (!state || !this.view) return;
    this.selectedCell = territoryCellAt(
      createTerritoryManifest(state.season.radius),
      this.view,
      this.canvas.width,
      canvasX,
      canvasY,
    );
    this.repaint();
  }

  pointerLeave(): void {
    if (this.hoverCell === null) return;
    this.hoverCell = null;
    this.repaint();
  }

  paint(context: CanvasRenderingContext2D, canvasSize: number): { summary: string; title: string } {
    const state = this.world.territoryMap;
    const title = t('hudChrome.territoryMap.title');
    const key = [
      state?.season.id ?? 'loading',
      state?.revision ?? 0,
      canvasSize,
      this.zoom,
      this.center.x,
      this.center.y,
      this.hoverCell ?? 0,
      this.selectedCell ?? 0,
      title,
    ].join(':');
    if (key !== this.paintKey) {
      this.paintModel = this.painter.paint(context, {
        state,
        canvasSize,
        zoom: this.zoom,
        center: this.center,
        hoveredCellId: this.hoverCell,
        selectedCellId: this.selectedCell,
      });
      this.paintKey = key;
    }
    this.view = this.paintModel?.view ?? null;
    if (!this.drag) this.canvas.style.cursor = this.hoverCell ? 'pointer' : 'grab';
    this.renderPanel();
    return {
      title,
      summary: state
        ? t('hudChrome.territoryMap.summary', {
            season: state.season.number,
            owned: state.cells.length,
            total: this.paintModel?.totalCells ?? 0,
          })
        : t('hudChrome.territoryMap.loading'),
    };
  }

  updateSiegeHud(): void {
    const siege = this.world.territoryMap?.siege ?? null;
    this.writers.setDisplay(
      element('#territory-siege-hud'),
      siege && siege.state !== 'ended' ? 'block' : 'none',
    );
    if (!siege || siege.state === 'ended') return;
    this.writers.setText(
      element('#territory-siege-title'),
      t('hudChrome.territoryMap.siegeTitle', {
        attackers: siege.attackerCount,
        defenders: siege.defenderCount,
      }),
    );
    this.writers.setText(
      element('#territory-siege-timer'),
      siege.respawnIn > 0
        ? t('hudChrome.territoryMap.siegeRespawn', { seconds: siege.respawnIn })
        : t('hudChrome.territoryMap.siegeTimer', { seconds: siege.timeLeft }),
    );
    const gatePercent = Math.round(siege.gateProgress * 100);
    const corePercent = Math.round(siege.coreProgress * 100);
    const gate = element('#territory-gate-progress');
    const core = element('#territory-core-progress');
    this.writers.setText(gate, t('hudChrome.territoryMap.siegeGate', { percent: gatePercent }));
    this.writers.setText(core, t('hudChrome.territoryMap.siegeCore', { percent: corePercent }));
    this.writers.setStyleProp(gate, 'width', `${gatePercent}%`);
    this.writers.setStyleProp(core, 'width', `${corePercent}%`);
    const canAct = siege.mySide === 'attacker' && siege.state === 'active' && siege.respawnIn === 0;
    this.configureSiegeButton('#territory-deploy-ram', 'deployRam', !canAct || siege.ramDeployed);
    this.configureSiegeButton(
      '#territory-ram-gate',
      'ramGate',
      !canAct || !siege.ramDeployed || siege.gateOpen,
    );
    this.configureSiegeButton(
      '#territory-deploy-ramp',
      'deployRamp',
      !canAct || siege.rampDeployed,
    );
    this.configureSiegeButton('#territory-strike-core', 'strikeCore', !canAct || !siege.gateOpen);
  }

  private updateHover(clientX: number, clientY: number): void {
    const state = this.world.territoryMap;
    const rect = this.canvas.getBoundingClientRect();
    const next =
      state && this.view
        ? territoryCellAt(
            createTerritoryManifest(state.season.radius),
            this.view,
            this.canvas.width,
            (clientX - rect.left) * (this.canvas.width / rect.width),
            (clientY - rect.top) * (this.canvas.height / rect.height),
          )
        : null;
    if (next === this.hoverCell) return;
    this.hoverCell = next;
    this.repaint();
  }

  private primaryAction(): PrimaryAction | null {
    const state = this.world.territoryMap;
    const cellId = this.selectedCell;
    if (!state?.guild || cellId === null) return null;
    const war = state.wars.find(
      (entry) =>
        entry.targetCellId === cellId && ['declared', 'forming', 'active'].includes(entry.status),
    );
    if (war?.mySide) return { kind: 'join', warId: war.id };
    if (state.guild.rank === 'member') return null;
    const owned = state.cells.find((entry) => entry.cellId === cellId);
    const manifestCell = createTerritoryManifest(state.season.radius).byId.get(cellId);
    if (!owned) {
      if (state.guild.ownedCellCount === 0)
        return manifestCell?.starter ? { kind: 'place', cellId } : null;
      if (state.guild.ownedCellCount >= state.guild.cellCapacity || !manifestCell) return null;
      return this.adjacentToGuild(manifestCell.neighbors) ? { kind: 'claim', cellId } : null;
    }
    if (owned.ownerGuildId !== state.guild.id && manifestCell) {
      return this.adjacentToGuild(manifestCell.neighbors) ? { kind: 'war', cellId } : null;
    }
    return null;
  }

  private adjacentToGuild(neighbors: readonly number[]): boolean {
    const state = this.world.territoryMap;
    return (
      !!state?.guild &&
      neighbors.some((neighbor) =>
        state.cells.some(
          (cell) => cell.cellId === neighbor && cell.ownerGuildId === state.guild?.id,
        ),
      )
    );
  }

  private performPrimary(): void {
    const action = this.primaryAction();
    if (!action) return;
    if (action.kind === 'place') this.world.territoryPlaceKeep(action.cellId);
    else if (action.kind === 'claim') this.world.territoryClaim(action.cellId);
    else if (action.kind === 'war') this.world.territoryDeclareWar(action.cellId);
    else this.world.territoryJoinWar(action.warId);
  }

  private buildCandidate(): {
    cellId: number;
    slot: TerritoryStructureSlot;
    kind: TerritoryStructureKind;
  } | null {
    const state = this.world.territoryMap;
    const cellId = this.selectedCell;
    if (!state?.guild || cellId === null || state.guild.rank === 'member') return null;
    if (
      !state.cells.some(
        (cell) => cell.cellId === cellId && cell.ownerGuildId === state.guild?.id && cell.keepRoot,
      )
    )
      return null;
    const occupied = new Set(
      state.structures.filter((entry) => entry.cellId === cellId).map((entry) => entry.slot),
    );
    const sequence = [
      ['gate', 'gate'],
      ['wall', 'wall'],
      ['tower_north', 'defense_tower'],
      ['tower_south', 'defense_tower'],
      ['storehouse', 'storehouse'],
      ['construction_workshop', 'construction_workshop'],
      ['siege_workshop', 'siege_workshop'],
    ] as const;
    const next = sequence.find(([slot]) => !occupied.has(slot));
    return next ? { cellId, slot: next[0], kind: next[1] } : null;
  }

  private performBuild(): void {
    const build = this.buildCandidate();
    if (build) this.world.territoryBuild(build.cellId, build.slot, build.kind);
  }

  private upgradeCandidate(): TerritoryStructureView | null {
    const state = this.world.territoryMap;
    const cellId = this.selectedCell;
    if (!state?.guild || cellId === null || state.guild.rank === 'member') return null;
    if (
      !state.cells.some((cell) => cell.cellId === cellId && cell.ownerGuildId === state.guild?.id)
    )
      return null;
    return (
      state.structures
        .filter(
          (structure) =>
            structure.cellId === cellId && structure.state === 'active' && structure.level < 5,
        )
        .sort((a, b) => a.level - b.level || a.slot.localeCompare(b.slot))[0] ?? null
    );
  }

  private performUpgrade(): void {
    const structure = this.upgradeCandidate();
    if (structure) this.world.territoryUpgrade(structure.cellId, structure.slot);
  }

  private renderPanel(): void {
    const state = this.world.territoryMap;
    const title = element('#territory-cell-title');
    const detail = element('#territory-cell-detail');
    const economy = element('#territory-economy');
    const primary = element<HTMLButtonElement>('#territory-primary-action');
    const build = element<HTMLButtonElement>('#territory-build-action');
    const upgrade = element<HTMLButtonElement>('#territory-upgrade-action');
    if (!state) {
      this.writers.setText(title, t('hudChrome.territoryMap.loading'));
      this.writers.setText(detail, '');
      this.writers.setText(economy, '');
      primary.disabled = true;
      build.disabled = true;
      upgrade.disabled = true;
      return;
    }
    if (this.selectedCell === null) {
      this.writers.setText(title, t('hudChrome.territoryMap.selectCell'));
      this.writers.setText(
        detail,
        state.guild
          ? t('hudChrome.territoryMap.capacity', {
              owned: state.guild.ownedCellCount,
              capacity: state.guild.cellCapacity,
            })
          : t('hudChrome.territoryMap.noGuild'),
      );
    } else {
      const manifestCell = createTerritoryManifest(state.season.radius).byId.get(this.selectedCell);
      const owned = state.cells.find((entry) => entry.cellId === this.selectedCell);
      this.writers.setText(title, t('hudChrome.territoryMap.cell', { cell: this.selectedCell }));
      const owner = owned
        ? t('hudChrome.territoryMap.owner', { guild: owned.ownerGuildName })
        : t('hudChrome.territoryMap.neutral');
      const resource = manifestCell?.resource
        ? t('hudChrome.territoryMap.resource', {
            resource: this.resourceLabel(manifestCell.resource),
          })
        : t('hudChrome.territoryMap.noResource');
      this.writers.setText(detail, `${owner} · ${resource}`);
    }
    this.writers.setText(
      economy,
      state.guild
        ? t('hudChrome.territoryMap.resources', state.guild.resources)
        : t('hudChrome.territoryMap.noGuild'),
    );
    const action = this.primaryAction();
    primary.disabled = !action;
    const actionKey =
      action?.kind === 'place'
        ? 'placeKeep'
        : action?.kind === 'claim'
          ? 'claim'
          : action?.kind === 'war'
            ? 'declareWar'
            : 'joinWar';
    this.writers.setText(primary, t(`hudChrome.territoryMap.${actionKey}`));
    build.disabled = this.buildCandidate() === null;
    upgrade.disabled = this.upgradeCandidate() === null;
    this.writers.setText(build, t('hudChrome.territoryMap.build'));
    this.writers.setText(upgrade, t('hudChrome.territoryMap.upgrade'));
    element('#territory-panel').dataset.revision = String(state.revision);
  }

  private resourceLabel(resource: TerritoryResourceKind): string {
    const keys = {
      wood: 'hudChrome.territoryMap.resourceWood',
      iron: 'hudChrome.territoryMap.resourceIron',
      grain: 'hudChrome.territoryMap.resourceGrain',
      labor: 'hudChrome.territoryMap.resourceLabor',
    } as const;
    return t(keys[resource]);
  }

  private configureSiegeButton(
    selector: string,
    key: 'deployRam' | 'ramGate' | 'deployRamp' | 'strikeCore',
    disabled: boolean,
  ): void {
    const button = element<HTMLButtonElement>(selector);
    this.writers.setText(button, t(`hudChrome.territoryMap.${key}`));
    button.disabled = disabled;
  }
}
