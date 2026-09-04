import { territorySiegeOrigin, territorySiegeOriginAt } from '../sim/data';
import { territoryCellClaimable, territoryResourceProfile } from '../sim/territory_biome';
import { TERRITORY_SIEGE_RECIPES, type TerritorySiegeCraftKind } from '../sim/territory_economy';
import { createTerritoryManifest, type TerritoryResourceKind } from '../sim/territory_manifest';
import { territorySiegeBiomeForCell } from '../sim/territory_siege_biome';
import {
  territorySiegeActionPoint,
  territorySiegeDefenderPortalDestination,
  territorySiegeNearestCatapult,
  territorySiegeNearestMortar,
  territorySiegeNearestRam,
} from '../sim/territory_siege_layout';
import type { IWorld, TerritoryMapState, TerritoryStructureSlot } from '../world_api';
import { formatDateTime, t } from './i18n';
import type { PainterHostWriters } from './painter_host';
import { TerritoryMapPainter } from './territory_map_painter';
import {
  TERRITORY_SLOT_DESCRIPTORS,
  territoryCellPanelMode,
  territorySiegeMapLabelKey,
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
import {
  createTerritoryWarAccess,
  territoryRelatedWar,
  updateTerritoryWarAccess,
} from './territory_war_access_view';

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
  private warNoticeExpanded = true;
  private paintKey: string | null = null;
  private paintModel: TerritoryMapModel | null = null;
  private drag: TerritoryDrag | null = null;
  private readonly access = createTerritoryWarAccess();
  private readonly launchers = [
    ...document.querySelectorAll<HTMLElement>('.territory-war-launcher'),
  ];
  private readonly mobileMore = document.getElementById('mobile-more');
  private readonly warDock = element('#territory-war-dock');

  get isOpen(): boolean {
    return this.access.open;
  }

  constructor(
    private readonly world: IWorld,
    private readonly canvas: HTMLCanvasElement,
    private readonly writers: PainterHostWriters,
    private readonly repaint: () => void,
    private readonly exitToContinent: () => void,
    private readonly beginSiegeAim: (weapon: 'mortar' | 'catapult', slot: number) => void = () =>
      undefined,
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
    for (const kind of ['ram', 'mortar', 'catapult'] as const) {
      element(`#territory-craft-${kind}`).addEventListener('click', () =>
        this.performSiegeCraft(kind),
      );
    }
    element('#territory-war-action').addEventListener('click', () => this.performWarNoticeAction());
    element('#territory-war-notice-toggle').addEventListener('click', () => {
      this.warNoticeExpanded = !this.warNoticeExpanded;
      this.updateWarNotice(false);
    });
    element('#territory-ram-strike').addEventListener('click', () => this.handleRamActionSlot(0));
    element('#territory-ram-power-strike').addEventListener('click', () =>
      this.handleRamActionSlot(1),
    );
    element('#territory-mortar-fire').addEventListener('click', () =>
      this.handleMortarActionSlot(0),
    );
    element('#territory-mortar-frost').addEventListener('click', () =>
      this.handleMortarActionSlot(1),
    );
    element('#territory-mortar-venom').addEventListener('click', () =>
      this.handleMortarActionSlot(2),
    );
    element('#territory-catapult-fire').addEventListener('click', () =>
      this.handleCatapultActionSlot(0),
    );
    element('#territory-catapult-cluster').addEventListener('click', () =>
      this.handleCatapultActionSlot(1),
    );
    element('#territory-leave-siege').addEventListener('click', () => {
      const warId = this.world.territoryMap?.siege?.warId;
      if (warId) this.world.territoryLeaveWar(warId);
    });
  }

  /** Shared keyboard/mobile Interact route for siege-weapon use/exit and the core switch. */
  handleSiegeInteract(): boolean {
    const siege = this.world.territoryMap?.siege;
    if (!siege) return false;
    const catapultAction = this.catapultInteractAction(siege);
    if (catapultAction) {
      this.world.territorySiegeAction(
        catapultAction === 'exit' ? 'leave_catapult' : 'enter_catapult',
      );
      return true;
    }
    const mortarAction = this.mortarInteractAction(siege);
    if (mortarAction) {
      this.world.territorySiegeAction(mortarAction === 'exit' ? 'leave_mortar' : 'enter_mortar');
      return true;
    }
    const ramAction = this.ramInteractAction(siege);
    if (ramAction) {
      this.world.territorySiegeAction(ramAction === 'exit' ? 'leave_ram' : 'enter_ram');
      return true;
    }
    if (this.defenderPortalInteractAvailable(siege)) {
      this.world.territorySiegeAction('defender_portal');
      return true;
    }
    if (!this.coreInteractAvailable(siege)) return false;
    this.world.territorySiegeAction(
      siege.coreChanneling ? 'stop_core_channel' : 'start_core_channel',
    );
    return true;
  }

  isRamOperating(): boolean {
    return !!this.world.territoryMap?.siege?.ramJoined;
  }

  isMortarOperating(): boolean {
    return !!this.world.territoryMap?.siege?.mortarJoined;
  }

  isRangedSiegeOperating(): boolean {
    const siege = this.world.territoryMap?.siege;
    return !!siege && (siege.mortarJoined || siege.controlledCatapultId != null);
  }

  isSiegeWeaponOperating(): boolean {
    const siege = this.world.territoryMap?.siege;
    return !!siege && (siege.ramJoined || siege.mortarJoined || siege.controlledCatapultId != null);
  }

  /** Slots 1/2/3 prepare the mortar's three delayed ground-targeted shells. */
  handleMortarActionSlot(slot: number): boolean {
    const siege = this.world.territoryMap?.siege;
    if (!siege?.mortarJoined) return false;
    const cooldown =
      slot === 0
        ? siege.mortarCooldown
        : slot === 1
          ? siege.mortarFrostCooldown
          : siege.mortarVenomCooldown;
    if (
      siege.state === 'active' &&
      siege.respawnIn === 0 &&
      slot >= 0 &&
      slot <= 2 &&
      cooldown <= 0
    ) {
      this.beginSiegeAim('mortar', slot);
    }
    return true;
  }

  handleCatapultActionSlot(slot: number): boolean {
    const siege = this.world.territoryMap?.siege;
    const controlled = siege?.controlledCatapultId != null;
    if (!siege || !controlled) return false;
    const catapult = siege.catapults?.find(
      (candidate) => candidate.id === siege.controlledCatapultId,
    );
    const cooldown = slot === 0 ? (catapult?.cooldown ?? 0) : (catapult?.clusterCooldown ?? 0);
    if (
      siege.state === 'active' &&
      siege.respawnIn === 0 &&
      slot >= 0 &&
      slot <= 1 &&
      cooldown <= 0
    ) {
      this.beginSiegeAim('catapult', slot);
    }
    return true;
  }

  /** Slots 1/2 replace the ordinary bar while the player operates a ram. */
  handleRamActionSlot(slot: number): boolean {
    const siege = this.world.territoryMap?.siege;
    if (!siege?.ramJoined) return false;
    if (
      siege.state !== 'active' ||
      siege.respawnIn > 0 ||
      siege.gateOpen ||
      (slot === 0 && siege.ramCooldown > 0) ||
      (slot === 1 && siege.ramEmpoweredCooldown > 0)
    ) {
      return true;
    }
    if (slot === 0) this.world.territorySiegeAction('ram_gate');
    else if (slot === 1) this.world.territorySiegeAction('ram_power_slam');
    return true;
  }

  /** Window/focus ownership stays in Hud; both rails share this cold input path. */
  bindLaunchers(openMap: () => void, closeMap: () => void): void {
    for (const launcher of this.launchers) {
      // The More tray proxies the desktop action through MobileControls.bindButton.
      if (launcher.closest('#mobile-extra-controls')) continue;
      launcher.addEventListener('click', () => {
        if (this.isOpen) closeMap();
        else openMap();
      });
    }
  }

  open(): void {
    this.access.open = true;
    this.zoom = TERRITORY_MAP_OPEN_ZOOM;
    this.center = { x: 0, y: 0 };
    this.selectedCell = null;
    this.writers.setDisplay(element('#territory-panel'), 'none');
    this.world.territoryOpen();
    this.updateSiegeHud();
  }

  close(): void {
    this.access.open = false;
    this.selectedCell = null;
    this.writers.setDisplay(element('#territory-panel'), 'none');
    this.world.territoryClose();
    this.updateSiegeHud();
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
    const war = territoryRelatedWar(this.world.territoryWarNotice, this.world.territoryMap);
    updateTerritoryWarAccess(
      this.access,
      siege && siege.state !== 'ended' ? { id: siege.warId, status: siege.state } : war,
    );
    const phase = siege?.state ?? war?.status;
    const hasGuildWar =
      (!!siege && siege.state !== 'ended') ||
      (!!war && ['declared', 'forming', 'active'].includes(war.status));
    const label = this.access.unread
      ? `${t('hudChrome.territoryMap.title')} · ${t(phase === 'active' ? 'hudChrome.territoryMap.warOngoing' : 'hudChrome.territoryMap.warStarting')}`
      : t('hudChrome.territoryMap.title');
    for (const launcher of this.launchers) {
      this.writers.toggleClass(launcher, 'has-war-alert', this.access.unread);
      this.writers.toggleClass(launcher, 'has-guild-war', hasGuildWar);
      this.writers.toggleClass(launcher, 'active', this.access.open);
      this.writers.setAttr(launcher, 'aria-expanded', String(this.access.open));
      this.writers.setAttr(launcher, 'aria-label', label);
      this.writers.setAttr(launcher, 'title', label);
    }
    if (this.mobileMore) {
      this.writers.toggleClass(this.mobileMore, 'has-war-alert', this.access.unread);
      this.writers.toggleClass(this.mobileMore, 'has-guild-war', hasGuildWar);
    }
    const result = element('#territory-siege-result');
    const resultVisible = !!siege && siege.state === 'ended' && siege.winner !== null;
    const liveSiege = !!siege && siege.state !== 'ended';
    this.writers.setDisplay(this.warDock, this.access.open && !liveSiege ? 'block' : 'none');
    this.updateWarNotice(siege !== null);
    this.writers.setDisplay(element('#territory-siege-hud'), liveSiege ? 'block' : 'none');
    const interact = element('#territory-siege-interact');
    const catapultInteractAction = siege ? this.catapultInteractAction(siege) : null;
    const mortarInteractAction =
      siege && !catapultInteractAction ? this.mortarInteractAction(siege) : null;
    const ramInteractAction =
      siege && !catapultInteractAction && !mortarInteractAction
        ? this.ramInteractAction(siege)
        : null;
    const coreInteractVisible =
      !!siege &&
      !catapultInteractAction &&
      !mortarInteractAction &&
      !ramInteractAction &&
      !this.defenderPortalInteractAvailable(siege) &&
      this.coreInteractAvailable(siege);
    const defenderPortalVisible =
      !!siege &&
      !catapultInteractAction &&
      !mortarInteractAction &&
      !ramInteractAction &&
      this.defenderPortalInteractAvailable(siege);
    const interactVisible =
      !!catapultInteractAction ||
      !!mortarInteractAction ||
      !!ramInteractAction ||
      defenderPortalVisible ||
      coreInteractVisible;
    this.writers.setDisplay(interact, interactVisible ? 'flex' : 'none');
    if (interactVisible && siege) {
      this.writers.setText(
        element('#territory-siege-interact-label'),
        t(
          catapultInteractAction === 'exit'
            ? 'hudChrome.territoryMap.catapultInteractExit'
            : catapultInteractAction === 'enter'
              ? 'hudChrome.territoryMap.catapultInteractUse'
              : mortarInteractAction === 'exit'
                ? 'hudChrome.territoryMap.mortarInteractExit'
                : mortarInteractAction === 'enter'
                  ? 'hudChrome.territoryMap.mortarInteractUse'
                  : ramInteractAction === 'exit'
                    ? 'hudChrome.territoryMap.ramInteractExit'
                    : ramInteractAction === 'enter'
                      ? 'hudChrome.territoryMap.ramInteractUse'
                      : defenderPortalVisible
                        ? this.siegeLocalPlayerPosition().z > 18
                          ? 'hudChrome.territoryMap.defenderPortalEnter'
                          : 'hudChrome.territoryMap.defenderPortalExit'
                        : siege.coreChanneling
                          ? 'hudChrome.territoryMap.coreLaserStop'
                          : 'hudChrome.territoryMap.coreLaserStart',
        ),
      );
    }
    this.writers.setDisplay(result, resultVisible ? 'flex' : 'none');
    document.body.classList.toggle('territory-siege-control-locked', !!siege?.coreChanneling);
    document.body.classList.toggle('territory-ram-operating', !!siege?.ramJoined);
    document.body.classList.toggle('territory-mortar-operating', !!siege?.mortarJoined);
    document.body.classList.toggle(
      'territory-catapult-operating',
      siege?.controlledCatapultId != null,
    );
    this.updateRamActionbar(siege);
    this.updateMortarActionbar(siege);
    this.updateCatapultActionbar(siege);
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
  }

  private ramInteractAction(
    siege: NonNullable<TerritoryMapState['siege']>,
  ): 'enter' | 'exit' | null {
    if (siege.ramJoined) return 'exit';
    if (
      siege.state !== 'active' ||
      siege.mySide !== 'attacker' ||
      siege.respawnIn > 0 ||
      siege.gateOpen ||
      siege.coreChanneling
    ) {
      return null;
    }
    const siegeSlot = territorySiegeOriginAt(this.world.player.pos.z).slot;
    const origin = territorySiegeOrigin(siegeSlot);
    const localPosition = {
      x: this.world.player.pos.x - origin.x,
      z: this.world.player.pos.z - origin.z,
    };
    const rams =
      siege.rams ??
      (siege.ramDeployed
        ? [
            {
              id: 0,
              x: 0,
              z: 23,
              yaw: 0,
              occupied: siege.ramOccupants > 0,
              cooldown: 0,
              empoweredCooldown: 0,
            },
          ]
        : []);
    return territorySiegeNearestRam(
      localPosition.x,
      localPosition.z,
      rams.filter((ram) => !ram.occupied),
    )
      ? 'enter'
      : null;
  }

  private mortarInteractAction(
    siege: NonNullable<TerritoryMapState['siege']>,
  ): 'enter' | 'exit' | null {
    if (siege.mortarJoined) return 'exit';
    if (
      siege.state !== 'active' ||
      siege.respawnIn > 0 ||
      siege.ramJoined ||
      siege.controlledCatapultId != null ||
      siege.coreChanneling
    ) {
      return null;
    }
    const siegeSlot = territorySiegeOriginAt(this.world.player.pos.z).slot;
    const origin = territorySiegeOrigin(siegeSlot);
    return territorySiegeNearestMortar(
      this.world.player.pos.x - origin.x,
      this.world.player.pos.z - origin.z,
      siege.mortars.filter((mortar) => mortar.side === siege.mySide && !mortar.occupied),
    )
      ? 'enter'
      : null;
  }

  private catapultInteractAction(
    siege: NonNullable<TerritoryMapState['siege']>,
  ): 'enter' | 'exit' | null {
    if (siege.controlledCatapultId != null) return 'exit';
    if (
      siege.state !== 'active' ||
      siege.respawnIn > 0 ||
      siege.ramJoined ||
      siege.mortarJoined ||
      siege.coreChanneling
    ) {
      return null;
    }
    const slot = territorySiegeOriginAt(this.world.player.pos.z).slot;
    const origin = territorySiegeOrigin(slot);
    return territorySiegeNearestCatapult(
      this.world.player.pos.x - origin.x,
      this.world.player.pos.z - origin.z,
      (siege.catapults ?? []).filter(
        (catapult) => catapult.side === siege.mySide && !catapult.occupied,
      ),
    )
      ? 'enter'
      : null;
  }

  private updateRamActionbar(siege: TerritoryMapState['siege']): void {
    const root = element('#territory-ram-actionbar');
    const visible = !!siege?.ramJoined && siege.state !== 'ended';
    this.writers.setDisplay(root, visible ? 'flex' : 'none');
    if (!visible || !siege) return;
    const normal = element<HTMLButtonElement>('#territory-ram-strike');
    const power = element<HTMLButtonElement>('#territory-ram-power-strike');
    normal.disabled = siege.gateOpen || siege.respawnIn > 0 || siege.ramCooldown > 0;
    power.disabled = siege.gateOpen || siege.respawnIn > 0 || siege.ramEmpoweredCooldown > 0;
    this.writers.setText(
      element('#territory-ram-strike-cooldown'),
      siege.ramCooldown > 0 ? `${siege.ramCooldown}` : '',
    );
    this.writers.setText(
      element('#territory-ram-power-strike-cooldown'),
      siege.ramEmpoweredCooldown > 0 ? `${siege.ramEmpoweredCooldown}` : '',
    );
    const normalLabel = t('hudChrome.territoryMap.ramStrike');
    const powerLabel = t('hudChrome.territoryMap.ramPowerStrike');
    this.writers.setAttr(normal, 'aria-label', normalLabel);
    this.writers.setAttr(normal, 'title', normalLabel);
    this.writers.setAttr(power, 'aria-label', powerLabel);
    this.writers.setAttr(power, 'title', powerLabel);
  }

  private updateMortarActionbar(siege: TerritoryMapState['siege']): void {
    const root = element('#territory-mortar-actionbar');
    const visible = !!siege?.mortarJoined && siege.state !== 'ended';
    this.writers.setDisplay(root, visible ? 'flex' : 'none');
    if (!visible || !siege) return;
    const buttons = [
      {
        element: element<HTMLButtonElement>('#territory-mortar-fire'),
        cooldown: siege.mortarCooldown,
        cooldownElement: element('#territory-mortar-fire-cooldown'),
        label: t('hudChrome.territoryMap.mortarFire'),
      },
      {
        element: element<HTMLButtonElement>('#territory-mortar-frost'),
        cooldown: siege.mortarFrostCooldown,
        cooldownElement: element('#territory-mortar-frost-cooldown'),
        label: t('hudChrome.territoryMap.mortarFrost'),
      },
      {
        element: element<HTMLButtonElement>('#territory-mortar-venom'),
        cooldown: siege.mortarVenomCooldown,
        cooldownElement: element('#territory-mortar-venom-cooldown'),
        label: t('hudChrome.territoryMap.mortarVenom'),
      },
    ];
    for (const button of buttons) {
      button.element.disabled = siege.respawnIn > 0 || button.cooldown > 0;
      this.writers.setText(button.cooldownElement, button.cooldown > 0 ? `${button.cooldown}` : '');
      this.writers.setAttr(button.element, 'aria-label', button.label);
      this.writers.setAttr(button.element, 'title', button.label);
    }
  }

  private updateCatapultActionbar(siege: TerritoryMapState['siege']): void {
    const root = element('#territory-catapult-actionbar');
    const catapult = siege?.catapults?.find(
      (candidate) => candidate.id === siege.controlledCatapultId,
    );
    const visible = !!siege && !!catapult && siege.state !== 'ended';
    this.writers.setDisplay(root, visible ? 'flex' : 'none');
    if (!visible || !siege || !catapult) return;
    const buttons = [
      {
        element: element<HTMLButtonElement>('#territory-catapult-fire'),
        cooldown: catapult.cooldown,
        cooldownElement: element('#territory-catapult-fire-cooldown'),
        label: t('hudChrome.territoryMap.catapultFire'),
      },
      {
        element: element<HTMLButtonElement>('#territory-catapult-cluster'),
        cooldown: catapult.clusterCooldown,
        cooldownElement: element('#territory-catapult-cluster-cooldown'),
        label: t('hudChrome.territoryMap.catapultCluster'),
      },
    ];
    for (const button of buttons) {
      button.element.disabled = siege.respawnIn > 0 || button.cooldown > 0;
      this.writers.setText(button.cooldownElement, button.cooldown > 0 ? `${button.cooldown}` : '');
      this.writers.setAttr(button.element, 'aria-label', button.label);
      this.writers.setAttr(button.element, 'title', button.label);
    }
  }

  private coreInteractAvailable(siege: NonNullable<TerritoryMapState['siege']>): boolean {
    if (
      siege.state !== 'active' ||
      siege.mySide !== 'attacker' ||
      siege.respawnIn > 0 ||
      (!siege.gateOpen && !siege.wallHealth?.some((wall) => wall.hp <= 0)) ||
      siege.ramJoined ||
      siege.mortarJoined ||
      siege.controlledCatapultId != null
    ) {
      return false;
    }
    if (siege.coreChanneling) return true;
    const slot = territorySiegeOriginAt(this.world.player.pos.z).slot;
    const point = territorySiegeActionPoint(slot, 'start_core_channel');
    return (
      (this.world.player.pos.x - point.x) ** 2 + (this.world.player.pos.z - point.z) ** 2 <=
      point.radius ** 2
    );
  }

  private siegeLocalPlayerPosition(): { x: number; z: number } {
    const slot = territorySiegeOriginAt(this.world.player.pos.z).slot;
    const origin = territorySiegeOrigin(slot);
    return { x: this.world.player.pos.x - origin.x, z: this.world.player.pos.z - origin.z };
  }

  private defenderPortalInteractAvailable(siege: NonNullable<TerritoryMapState['siege']>): boolean {
    if (
      siege.state !== 'active' ||
      siege.mySide !== 'defender' ||
      siege.respawnIn > 0 ||
      this.isSiegeWeaponOperating() ||
      siege.coreChanneling
    ) {
      return false;
    }
    const position = this.siegeLocalPlayerPosition();
    return territorySiegeDefenderPortalDestination(position.x, position.z) !== null;
  }

  private updateWarNotice(siegeVisible: boolean): void {
    const war = territoryRelatedWar(this.world.territoryWarNotice, this.world.territoryMap);
    const model = territoryWarNoticeModel(war, Date.now());
    const root = element('#territory-war-notice');
    const visible = this.access.open && !siegeVisible;
    this.writers.setDisplay(root, visible ? 'block' : 'none');
    if (!visible) return;
    const empty = !war || !model.visible;
    this.writers.toggleClass(root, 'is-empty', empty);
    this.writers.toggleClass(root, 'is-collapsed', !empty && !this.warNoticeExpanded);
    const toggle = element<HTMLButtonElement>('#territory-war-notice-toggle');
    this.writers.setDisplay(toggle, empty ? 'none' : 'inline-flex');
    this.writers.setAttr(toggle, 'aria-expanded', String(this.warNoticeExpanded));
    this.writers.setText(
      toggle,
      t(
        this.warNoticeExpanded
          ? 'hudChrome.territoryMap.noticeHide'
          : 'hudChrome.territoryMap.noticeShow',
      ),
    );
    if (empty) {
      this.writers.setText(element('#territory-war-kicker'), t('hudChrome.territoryMap.title'));
      this.writers.setText(element('#territory-war-title'), t('hudChrome.guildTerritory.noWars'));
      return;
    }
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
    action.disabled =
      war.mySide === null ||
      (war.status === 'active' && war.mySide === 'attacker' && !war.registered);
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
      if (!territoryCellClaimable(manifestCell, state.season.radius)) return null;
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

  private performSiegeCraft(kind: TerritorySiegeCraftKind): void {
    this.world.territoryCraftSiege(kind);
  }

  private performWarNoticeAction(): void {
    const war = territoryRelatedWar(this.world.territoryWarNotice, this.world.territoryMap);
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
    const battlefield = element('#territory-cell-battlefield');
    const economy = element('#territory-economy');
    const primary = element<HTMLButtonElement>('#territory-primary-action');
    const actions = element<HTMLElement>('#territory-panel .territory-actions');
    const structures = element<HTMLElement>('#territory-structure-section');
    if (!state || cellId === null) {
      panel.dataset.mode = 'loading';
      this.writers.setText(title, t('hudChrome.territoryMap.loading'));
      this.writers.setText(detail, '');
      this.writers.setText(battlefield, '');
      this.writers.setDisplay(battlefield, 'none');
      this.writers.setText(economy, '');
      this.writers.setDisplay(economy, 'none');
      this.writers.setDisplay(actions, 'none');
      this.writers.setDisplay(structures, 'none');
      this.writers.setDisplay(element('#territory-workshop-crafting'), 'none');
      primary.disabled = true;
      this.renderStructureSlots(null);
      return;
    }
    const manifestCell = createTerritoryManifest(state.season.radius).byId.get(cellId);
    const owned = state.cells.find((entry) => entry.cellId === cellId);
    const claimable = territoryCellClaimable(manifestCell, state.season.radius);
    const mode = territoryCellPanelMode({ claimable, owned: !!owned });
    panel.dataset.mode = mode;
    if (mode === 'mountain') {
      this.writers.setText(title, t('hudChrome.territoryMap.impassableMountain'));
      this.writers.setText(detail, t('hudChrome.territoryMap.mountainNotice'));
      this.writers.setText(battlefield, '');
      this.writers.setDisplay(battlefield, 'none');
      this.writers.setText(economy, '');
      this.writers.setDisplay(economy, 'none');
      this.writers.setDisplay(actions, 'none');
      this.writers.setDisplay(structures, 'none');
      this.writers.setDisplay(element('#territory-workshop-crafting'), 'none');
      primary.disabled = true;
      this.renderStructureSlots(null);
      panel.dataset.revision = String(state.revision);
      return;
    }
    const owner = owned
      ? t('hudChrome.territoryMap.owner', { guild: owned.ownerGuildName })
      : t('hudChrome.territoryMap.neutral');
    this.writers.setText(title, owner);
    const resourceProfile = manifestCell
      ? territoryResourceProfile(manifestCell, state.season.radius)
      : null;
    const resource = resourceProfile
      ? t('hudChrome.territoryMap.resource', {
          resource: `${this.resourceLabel(resourceProfile.kind)} ×${resourceProfile.yield}`,
        })
      : t('hudChrome.territoryMap.noResource');
    this.writers.setText(detail, resource);
    const siegeBiome = territorySiegeBiomeForCell(manifestCell, state.season.radius);
    this.writers.setText(
      battlefield,
      t('hudChrome.territoryMap.siegeMap', {
        biome: t(`hudChrome.territoryMap.${territorySiegeMapLabelKey(siegeBiome)}`),
      }),
    );
    this.writers.setDisplay(battlefield, 'block');
    this.writers.setText(
      economy,
      state.guild
        ? t('hudChrome.territoryMap.resources', state.guild.resources)
        : t('hudChrome.territoryMap.noGuild'),
    );
    this.writers.setDisplay(economy, 'block');
    const action = this.primaryAction();
    primary.disabled = !action;
    this.writers.setDisplay(actions, action ? 'flex' : 'none');
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
    this.writers.setDisplay(structures, owned ? 'block' : 'none');
    this.renderStructureSlots(owned ? state : null);
    this.renderWorkshopCrafting(owned ? state : null, cellId);
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

  private renderWorkshopCrafting(state: TerritoryMapState | null, cellId: number): void {
    const root = element('#territory-workshop-crafting');
    const guild = state?.guild ?? null;
    const ownsKeep = !!state?.cells.find(
      (cell) => cell.cellId === cellId && cell.keepRoot && cell.ownerGuildId === guild?.id,
    );
    const workshop = state?.structures.find(
      (structure) =>
        structure.cellId === cellId &&
        structure.slot === 'siege_workshop' &&
        structure.state === 'active',
    );
    const visible = ownsKeep && !!workshop && !!guild;
    this.writers.setDisplay(root, visible ? 'block' : 'none');
    for (const kind of ['ram', 'mortar', 'catapult'] as const) {
      const button = element<HTMLButtonElement>(`#territory-craft-${kind}`);
      const recipe = TERRITORY_SIEGE_RECIPES[kind];
      button.disabled =
        !visible ||
        !guild ||
        this.world.copper < recipe.copper ||
        Object.entries(recipe.resources).some(
          ([resource, cost]) => guild.resources[resource as TerritoryResourceKind] < cost,
        );
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
}
