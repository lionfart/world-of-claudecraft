import { territorySiegeOriginAt } from '../sim/data';
import { createTerritoryManifest, type TerritoryResourceKind } from '../sim/territory_manifest';
import { territorySiegeActionPoint } from '../sim/territory_siege_layout';
import type { IWorld, TerritoryMapState, TerritoryStructureSlot } from '../world_api';
import { formatDateTime, t } from './i18n';
import type { PainterHostWriters } from './painter_host';
import { TerritoryMapPainter } from './territory_map_painter';
import {
  TERRITORY_SLOT_DESCRIPTORS,
  territorySlotModels,
  territoryWarCountdown,
  territoryWarNoticeModel,
} from './territory_map_panel_view';
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
  | { kind: 'join'; warId: string }
  | { kind: 'leave'; warId: string };
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
  private readonly painter: TerritoryMapPainter;
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
    this.painter = new TerritoryMapPainter(() => {
      this.paintKey = null;
      this.repaint();
    });
    element('#territory-primary-action').addEventListener('click', () => this.performPrimary());
    element('#territory-panel-close').addEventListener('click', () => this.dismissPanel());
    for (const descriptor of TERRITORY_SLOT_DESCRIPTORS) {
      element(`[data-territory-slot="${descriptor.slot}"]`).addEventListener('click', () =>
        this.performSlot(descriptor.slot),
      );
    }
    element('#territory-war-action').addEventListener('click', () => this.performWarNoticeAction());
    element('#territory-deploy-ram').addEventListener('click', () =>
      this.world.territorySiegeAction('deploy_ram'),
    );
    element('#territory-enter-ram').addEventListener('click', () =>
      this.world.territorySiegeAction(
        this.world.territoryMap?.siege?.ramJoined ? 'leave_ram' : 'enter_ram',
      ),
    );
    element('#territory-ram-gate').addEventListener('click', () =>
      this.world.territorySiegeAction('ram_gate'),
    );
    element('#territory-channel-core').addEventListener('click', () =>
      this.world.territorySiegeAction(
        this.world.territoryMap?.siege?.coreChanneling ? 'stop_core_channel' : 'start_core_channel',
      ),
    );
    element('#territory-leave-siege').addEventListener('click', () => {
      const warId = this.world.territoryMap?.siege?.warId;
      if (warId) this.world.territoryLeaveWar(warId);
    });
  }

  open(): void {
    this.zoom = TERRITORY_MAP_OPEN_ZOOM;
    this.center = { x: 0, y: 0 };
    this.selectedCell = null;
    this.writers.setDisplay(element('#territory-panel'), 'none');
    this.world.territoryOpen();
  }

  close(): void {
    this.selectedCell = null;
    this.writers.setDisplay(element('#territory-panel'), 'none');
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

  private dismissPanel(): void {
    this.selectedCell = null;
    this.paintKey = null;
    this.writers.setDisplay(element('#territory-panel'), 'none');
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
    const result = element('#territory-siege-result');
    const resultVisible = !!siege && siege.state === 'ended' && siege.winner !== null;
    this.updateWarNotice(siege !== null);
    this.writers.setDisplay(
      element('#territory-siege-hud'),
      siege && siege.state !== 'ended' ? 'block' : 'none',
    );
    this.writers.setDisplay(result, resultVisible ? 'flex' : 'none');
    document.body.classList.toggle(
      'territory-siege-control-locked',
      !!siege && (siege.ramJoined || siege.coreChanneling),
    );
    if (resultVisible && siege) {
      const victory = siege.mySide === siege.winner;
      result.classList.toggle('is-victory', victory);
      result.classList.toggle('is-defeat', !victory);
      this.writers.setText(
        element('#territory-result-title'),
        t(victory ? 'hudChrome.territoryMap.resultVictory' : 'hudChrome.territoryMap.resultDefeat'),
      );
      this.writers.setText(
        element('#territory-result-detail'),
        t(
          victory
            ? 'hudChrome.territoryMap.resultVictoryDetail'
            : 'hudChrome.territoryMap.resultDefeatDetail',
        ),
      );
      this.writers.setText(
        element('#territory-result-return'),
        t('hudChrome.territoryMap.resultReturn', { seconds: siege.resultReturnIn }),
      );
    }
    if (!siege || siege.state === 'ended') return;
    this.writers.setText(element('#territory-leave-siege'), t('hudChrome.territoryMap.leaveWar'));
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
    this.writers.setDisplay(
      element('.territory-siege-actions'),
      siege.mySide === 'attacker' ? 'grid' : 'none',
    );
    const controlLocked = siege.ramJoined || siege.coreChanneling;
    const siegeSlot = territorySiegeOriginAt(this.world.player.pos.z).slot;
    const inActionRange = (action: 'deploy_ram' | 'enter_ram' | 'start_core_channel') => {
      const point = territorySiegeActionPoint(siegeSlot, action);
      return (
        (this.world.player.pos.x - point.x) ** 2 + (this.world.player.pos.z - point.z) ** 2 <=
        point.radius ** 2
      );
    };
    this.configureSiegeButton(
      '#territory-deploy-ram',
      'deployRam',
      !canAct ||
        controlLocked ||
        siege.ramDeployed ||
        siege.gateOpen ||
        !inActionRange('deploy_ram'),
    );
    this.configureSiegeButton(
      '#territory-enter-ram',
      siege.ramJoined ? 'leaveRam' : 'enterRam',
      !canAct ||
        siege.coreChanneling ||
        (!siege.ramJoined &&
          (!siege.ramDeployed ||
            siege.gateOpen ||
            siege.ramOccupants >= 4 ||
            !inActionRange('enter_ram'))),
    );
    this.configureSiegeButton(
      '#territory-ram-gate',
      'ramGate',
      !canAct || !siege.ramJoined || siege.gateOpen || siege.ramCooldown > 0,
    );
    this.writers.setText(
      element('#territory-ram-gate'),
      `${t('hudChrome.territoryMap.ramGate')} ${siege.ramOccupants}/4${
        siege.ramCooldown > 0 ? ` · ${siege.ramCooldown}s` : ''
      }`,
    );
    this.configureSiegeButton(
      '#territory-channel-core',
      siege.coreChanneling ? 'stopCoreChannel' : 'startCoreChannel',
      !canAct || siege.ramJoined || (!siege.coreChanneling && !siege.gateOpen),
    );
    this.writers.setDisplay(
      element('#territory-channel-core'),
      siege.mySide === 'attacker' &&
        (siege.coreChanneling || (siege.gateOpen && inActionRange('start_core_channel')))
        ? 'block'
        : 'none',
    );
  }

  private updateWarNotice(siegeVisible: boolean): void {
    const war = this.world.territoryWarNotice;
    const model = territoryWarNoticeModel(war, Date.now());
    const root = element('#territory-war-notice');
    this.writers.setDisplay(root, model.visible && !siegeVisible ? 'block' : 'none');
    if (!war || !model.visible || siegeVisible) return;
    this.writers.setText(
      element('#territory-war-kicker'),
      model.active
        ? t('hudChrome.territoryMap.warOngoing')
        : t('hudChrome.territoryMap.warStarting'),
    );
    this.writers.setText(
      element('#territory-war-title'),
      t('hudChrome.territoryMap.warTitle', {
        attacker: war.attackerGuildName,
        defender: war.defenderGuildName,
      }),
    );
    this.writers.setText(
      element('#territory-war-queue'),
      t('hudChrome.territoryMap.warQueue', {
        attackers: war.attackerCount,
        defenders: war.defenderCount,
      }),
    );
    this.writers.setText(
      element('#territory-war-start'),
      model.active
        ? ''
        : t('hudChrome.territoryMap.warStartsAt', {
            time: formatDateTime(new Date(war.startsAt), { timeStyle: 'short' }),
          }),
    );
    this.writers.setText(
      element('#territory-war-countdown'),
      model.active
        ? t('hudChrome.territoryMap.warOngoingCountdown', {
            time: territoryWarCountdown(model.secondsRemaining),
          })
        : t('hudChrome.territoryMap.warStartingCountdown', {
            time: territoryWarCountdown(model.secondsUntilStart),
          }),
    );
    this.writers.setText(
      element('#territory-war-teleport'),
      model.automaticTeleport
        ? `${t('hudChrome.territoryMap.warTeleport', { seconds: model.secondsUntilStart })} · ${t('hudChrome.territoryMap.warTeleportNote')}`
        : '',
    );
    const action = element<HTMLButtonElement>('#territory-war-action');
    this.writers.setText(
      action,
      t(
        !model.active && war.registered
          ? 'hudChrome.territoryMap.leaveWar'
          : 'hudChrome.territoryMap.joinWar',
      ),
    );
    action.disabled = war.mySide === null;
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
    if (war?.mySide) return { kind: war.registered ? 'leave' : 'join', warId: war.id };
    if (state.guild.rank === 'member') return null;
    const owned = state.cells.find((entry) => entry.cellId === cellId);
    const manifestCell = createTerritoryManifest(state.season.radius).byId.get(cellId);
    if (!owned) {
      if (state.guild.ownedCellCount === 0) {
        const firstKeepAllowed =
          !!manifestCell && (!state.season.requirementsEnabled || manifestCell.starter);
        return firstKeepAllowed ? { kind: 'place', cellId } : null;
      }
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
    else if (action.kind === 'join') this.world.territoryJoinWar(action.warId);
    else this.world.territoryLeaveWar(action.warId);
  }

  private performSlot(slot: TerritoryStructureSlot): void {
    const state = this.world.territoryMap;
    if (!state) return;
    const action = territorySlotModels(state, this.selectedCell).find(
      (model) => model.slot === slot,
    )?.action;
    if (action?.kind === 'build')
      this.world.territoryBuild(action.cellId, action.slot, action.structureKind);
    else if (action?.kind === 'upgrade') this.world.territoryUpgrade(action.cellId, action.slot);
  }

  private performWarNoticeAction(): void {
    const war = this.world.territoryWarNotice;
    if (!war?.mySide) return;
    if (war.status === 'active') this.world.territoryJoinWar(war.id);
    else if (war.registered) this.world.territoryLeaveWar(war.id);
    else this.world.territoryJoinWar(war.id);
  }

  private renderPanel(): void {
    const state = this.world.territoryMap;
    const panel = element('#territory-panel');
    const cellId = this.selectedCell;
    const visible = !!state && cellId !== null;
    this.writers.setDisplay(panel, visible ? 'block' : 'none');
    const title = element('#territory-cell-title');
    const detail = element('#territory-cell-detail');
    const economy = element('#territory-economy');
    const primary = element<HTMLButtonElement>('#territory-primary-action');
    if (!state || cellId === null) {
      this.writers.setText(title, t('hudChrome.territoryMap.loading'));
      this.writers.setText(detail, '');
      this.writers.setText(economy, '');
      primary.disabled = true;
      this.renderStructureSlots(null);
      return;
    }
    const manifestCell = createTerritoryManifest(state.season.radius).byId.get(cellId);
    const owned = state.cells.find((entry) => entry.cellId === cellId);
    this.writers.setText(title, t('hudChrome.territoryMap.cell', { cell: cellId }));
    const owner = owned
      ? t('hudChrome.territoryMap.owner', { guild: owned.ownerGuildName })
      : t('hudChrome.territoryMap.neutral');
    const resource = manifestCell?.resource
      ? t('hudChrome.territoryMap.resource', {
          resource: this.resourceLabel(manifestCell.resource),
        })
      : t('hudChrome.territoryMap.noResource');
    this.writers.setText(detail, `${owner} · ${resource}`);
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
            : action?.kind === 'leave'
              ? 'leaveWar'
              : 'joinWar';
    this.writers.setText(primary, t(`hudChrome.territoryMap.${actionKey}`));
    this.renderStructureSlots(state);
    panel.dataset.revision = String(state.revision);
  }

  private renderStructureSlots(state: TerritoryMapState | null): void {
    const models = state ? territorySlotModels(state, this.selectedCell) : [];
    for (const descriptor of TERRITORY_SLOT_DESCRIPTORS) {
      const button = element<HTMLButtonElement>(`[data-territory-slot="${descriptor.slot}"]`);
      const model = models.find((candidate) => candidate.slot === descriptor.slot);
      const status = !model
        ? t('hudChrome.territoryMap.slotUnavailable')
        : model.state === 'locked'
          ? t('hudChrome.territoryMap.slotUnavailable')
          : model.state === 'empty'
            ? t('hudChrome.territoryMap.slotEmpty')
            : model.state === 'building'
              ? t('hudChrome.territoryMap.slotBuilding', { level: model.level })
              : model.state === 'max'
                ? t('hudChrome.territoryMap.slotMax')
                : model.action
                  ? t('hudChrome.territoryMap.slotLevel', { level: model.level })
                  : t('hudChrome.territoryMap.slotLevelReadOnly', { level: model.level });
      this.writers.setText(element(`#territory-slot-${descriptor.slot}-status`), status);
      this.writers.setAttr(
        button,
        'aria-label',
        `${t(`hudChrome.territoryMap.${descriptor.labelKey}`)} · ${status}`,
      );
      this.writers.toggleClass(button, 'is-actionable', model?.action !== null && !!model);
      this.writers.toggleClass(
        button,
        'is-built',
        !!model && model.state !== 'empty' && model.state !== 'locked',
      );
      this.writers.toggleClass(button, 'is-building', model?.state === 'building');
      button.disabled = !model?.action;
    }
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
    key: 'deployRam' | 'enterRam' | 'leaveRam' | 'ramGate' | 'startCoreChannel' | 'stopCoreChannel',
    disabled: boolean,
  ): void {
    const button = element<HTMLButtonElement>(selector);
    this.writers.setText(button, t(`hudChrome.territoryMap.${key}`));
    button.disabled = disabled;
  }
}
