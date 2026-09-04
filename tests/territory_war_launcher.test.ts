// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Input } from '../src/game/input';
import {
  type MobileControlCallbacks,
  MobileControls,
  setInterfaceMode,
} from '../src/game/mobile_controls';
import { territorySiegeActionPoint } from '../src/sim/territory_siege_layout';
import { makeWriterFacet } from '../src/ui/painter_host';
import { TerritoryMapController } from '../src/ui/territory_map_controller';
import type {
  IWorld,
  TerritoryMapState,
  TerritorySiegeView,
  TerritoryWarView,
} from '../src/world_api';

vi.mock('../src/ui/territory_map_painter', () => ({ TerritoryMapPainter: class {} }));
afterEach(() => {
  setInterfaceMode('auto');
  vi.useRealTimers();
});

function fixture(file: string) {
  const markup = readFileSync(file, 'utf8');
  const parsed = new DOMParser().parseFromString(
    markup.replace(/<link\b[^>]*>/gi, ''),
    'text/html',
  );
  const template = parsed.getElementById('game-ui-template') as HTMLTemplateElement;
  document.body.replaceChildren(template.content.cloneNode(true));
  const mobile = parsed.getElementById('mobile-controls');
  if (mobile) document.body.append(mobile.cloneNode(true));
  const mobileExtra = parsed.getElementById('mobile-extra-controls');
  if (!mobileExtra) throw new Error('Missing mobile More menu');
  document.body.append(mobileExtra.cloneNode(true));
  const war: TerritoryWarView = {
    id: 'war-1',
    targetCellId: 8,
    attackerGuildId: 'a',
    attackerGuildName: 'Northwatch',
    defenderGuildId: 'b',
    defenderGuildName: 'Dawnkeepers',
    status: 'forming',
    declaredAt: new Date(Date.now() - 1000).toISOString(),
    startsAt: new Date(Date.now() + 299000).toISOString(),
    endsAt: new Date(Date.now() + 3899000).toISOString(),
    winnerGuildId: null,
    attackerCount: 12,
    defenderCount: 9,
    mySide: 'defender',
    registered: false,
  };
  const state: Pick<TerritoryMapState, 'siege'> &
    Partial<Pick<TerritoryMapState, 'guild' | 'wars'>> = {
    siege: null as TerritorySiegeView | null,
  };
  const world = {
    territoryMap: state,
    territoryWarNotice: war as TerritoryWarView | null,
    territoryOpen: vi.fn(),
    territoryClose: vi.fn(),
    territoryJoinWar: vi.fn(),
    territoryLeaveWar: vi.fn(),
    territorySiegeAction: vi.fn(),
    player: { pos: territorySiegeActionPoint(0, 'deploy_ram') },
  };
  const writes = vi.fn();
  const beginMortarAim = vi.fn();
  const writers = makeWriterFacet(
    new WeakMap(),
    new WeakMap(),
    new WeakMap(),
    new WeakMap(),
    writes,
    () => {},
  );
  const controller = new TerritoryMapController(
    world as unknown as IWorld,
    get<HTMLCanvasElement>('map-canvas'),
    writers,
    () => {},
    () => {},
    beginMortarAim,
  );
  const open = vi.fn(() => {
    get('map-window').style.display = 'block';
    controller.open();
  });
  const close = vi.fn(() => {
    get('map-window').style.display = 'none';
    controller.close();
  });
  controller.bindLaunchers(open, close);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  setInterfaceMode('touch');
  const noops = new Proxy({}, { get: () => () => {} });
  new MobileControls(noops as Input, noops as MobileControlCallbacks).start();
  return { controller, world, state, war, writes, open, close, beginMortarAim };
}
function get<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

describe.each(['index.html', 'play.html'])('%s territory war launcher', (file) => {
  it('keeps the red guild-war badge when only the public map mirror contains the declaration', () => {
    const { controller, world, state, war } = fixture(file);
    world.territoryWarNotice = null;
    state.guild = {
      id: war.defenderGuildId,
      name: war.defenderGuildName,
      color: '#41c7bd',
      rank: 'member',
      territoryLevel: 1,
      cellCapacity: 5,
      ownedCellCount: 1,
      resources: { wood: 0, iron: 0, grain: 0, labor: 0 },
      resourceCapacity: 1_000,
      accruedAt: new Date().toISOString(),
    };
    state.wars = [{ ...war, mySide: null }];

    controller.updateSiegeHud();
    expect(get('mm-territory').classList.contains('has-war-alert')).toBe(true);
    expect(get('mm-territory').classList.contains('has-guild-war')).toBe(true);
    get('mm-territory').click();
    expect(get('territory-war-title').textContent).toContain(war.defenderGuildName);
    get('territory-war-action').click();
    expect(world.territoryJoinWar).toHaveBeenCalledWith(war.id);
  });

  it('shows unread alerts without opening; both rails toggle the map and notice together', () => {
    const { controller, world, war, writes, open, close } = fixture(file);
    expect(get('map-window').contains(get('territory-war-dock'))).toBe(true);
    expect(get('territory-war-dock').contains(get('territory-siege-hud'))).toBe(false);
    expect(get('map-window').contains(get('territory-siege-result'))).toBe(false);
    expect(get('mm-territory').dataset.icon).toBe('territory');
    expect(get('mm-territory').nextElementSibling?.id).toBe('mm-social');
    expect(document.getElementById('mm-music')).toBeNull();
    expect(get('mobile-territory').nextElementSibling?.id).toBe('mobile-haptics');
    expect(document.getElementById('mobile-music')).toBeNull();
    controller.updateSiegeHud();
    expect(controller.isOpen).toBe(false);
    expect(get('territory-war-dock').style.display).toBe('none');
    expect(get('mm-territory').classList.contains('has-war-alert')).toBe(true);
    expect(get('mobile-more').classList.contains('has-war-alert')).toBe(true);
    expect(get('mm-territory').classList.contains('has-guild-war')).toBe(true);
    writes.mockClear();
    controller.updateSiegeHud();
    expect(writes).not.toHaveBeenCalled();
    get('mm-territory').click();
    expect(open).toHaveBeenCalledOnce();
    expect(world.territoryOpen).toHaveBeenCalledOnce();
    expect(get('territory-war-dock').style.display).toBe('block');
    expect(get('territory-war-notice').style.display).toBe('block');
    expect(get('mm-territory').getAttribute('aria-expanded')).toBe('true');
    expect(get('mm-territory').classList.contains('has-war-alert')).toBe(false);
    expect(get('mm-territory').classList.contains('has-guild-war')).toBe(true);
    expect(get('territory-war-countdown').textContent).toContain('04:59');
    expect(get('territory-war-notice-toggle').getAttribute('aria-expanded')).toBe('true');
    get('territory-war-notice-toggle').click();
    expect(get('territory-war-notice').classList.contains('is-collapsed')).toBe(true);
    expect(get('territory-war-notice-toggle').getAttribute('aria-expanded')).toBe('false');
    expect(get('map-window').style.display).toBe('block');
    get('territory-war-notice-toggle').click();
    expect(get('territory-war-notice').classList.contains('is-collapsed')).toBe(false);
    get('territory-war-action').click();
    expect(world.territoryJoinWar).toHaveBeenCalledWith('war-1');
    document.body.classList.add('mobile-more-open');
    get('mobile-controls').classList.add('expanded');
    get('mobile-territory').click();
    expect(close).toHaveBeenCalledOnce();
    expect(controller.isOpen).toBe(false);
    expect(get('territory-war-notice').style.display).toBe('none');
    expect(document.body.classList.contains('mobile-more-open')).toBe(false);
    expect(get('mobile-controls').classList.contains('expanded')).toBe(false);
    war.status = 'active';
    controller.updateSiegeHud();
    expect(get('mm-territory').classList.contains('has-war-alert')).toBe(true);
    expect(get('mm-territory').getAttribute('aria-label')).toContain('War in progress');
    get('mobile-territory').click();
    expect(get('territory-war-kicker').textContent).toContain('War in progress');
    expect(get('territory-war-countdown').textContent).toContain('1:04:59');
    world.territoryWarNotice = null;
    controller.updateSiegeHud();
    expect(get('mm-territory').classList.contains('has-guild-war')).toBe(false);
    expect(get('territory-war-notice').classList.contains('is-empty')).toBe(true);
    expect(get('territory-war-notice-toggle').style.display).toBe('none');
    expect(get('territory-war-title').textContent).toBeTruthy();
  });

  it('keeps live siege actions and voluntary exit on the main HUD while the map toggles independently', () => {
    const { controller, world, state } = fixture(file);
    state.siege = {
      warId: 'war-1',
      biome: 'snow',
      state: 'active',
      mySide: 'attacker',
      attackerCount: 12,
      defenderCount: 9,
      gateProgress: 0.8,
      coreProgress: 1,
      gateOpen: false,
      ramDeployed: false,
      ramOccupants: 0,
      ramJoined: false,
      ramCooldown: 0,
      ramEmpoweredCooldown: 0,
      mortarDeployed: 0,
      mortarJoined: false,
      mortarCooldown: 0,
      mortarFrostCooldown: 0,
      mortarVenomCooldown: 0,
      mortars: [],
      controlledMortarId: null,
      mortarZones: [],
      rams: [
        {
          id: 1,
          x: 0,
          z: 27,
          yaw: 0,
          occupied: false,
          cooldown: 0,
          empoweredCooldown: 0,
        },
      ],
      coreChanneling: false,
      coreChannelProgress: 0,
      coreChannels: [],
      defenseTowerLevel: 0,
      towerZones: [],
      respawnIn: 0,
      timeLeft: 3200,
      winner: null,
      resultReturnIn: 0,
    };
    controller.updateSiegeHud();
    expect(get('map-window').contains(get('territory-siege-hud'))).toBe(false);
    expect(get('territory-siege-hud').style.display).toBe('block');
    expect(document.getElementById('territory-deploy-ram')).toBeNull();
    expect(document.getElementById('territory-ram-stock')).toBeNull();
    expect(document.getElementById('territory-enter-ram')).toBeNull();
    expect(document.getElementById('territory-ram-gate')).toBeNull();
    expect(get('territory-siege-interact').style.display).toBe('flex');
    expect(get('territory-siege-interact-label').textContent).toContain('Use battering ram');
    expect(controller.handleSiegeInteract()).toBe(true);
    expect(world.territorySiegeAction).toHaveBeenLastCalledWith('enter_ram');
    get('mm-territory').click();
    expect(get('territory-war-notice').style.display).toBe('none');
    expect(get('territory-siege-hud').style.display).toBe('block');
    get('territory-leave-siege').click();
    expect(world.territoryLeaveWar).toHaveBeenCalledWith('war-1');
    const liveSiege = state.siege;
    liveSiege.ramJoined = true;
    controller.close();
    expect(get('territory-siege-hud').style.display).toBe('block');
    expect(document.body.classList.contains('territory-ram-operating')).toBe(true);
    expect(document.body.classList.contains('territory-siege-control-locked')).toBe(false);
    expect(get('territory-ram-actionbar').style.display).toBe('flex');
    expect(controller.handleRamActionSlot(0)).toBe(true);
    expect(world.territorySiegeAction).toHaveBeenLastCalledWith('ram_gate');
    expect(controller.handleRamActionSlot(1)).toBe(true);
    expect(world.territorySiegeAction).toHaveBeenLastCalledWith('ram_power_slam');
    expect(controller.handleSiegeInteract()).toBe(true);
    expect(world.territorySiegeAction).toHaveBeenLastCalledWith('leave_ram');
    liveSiege.ramJoined = false;
    liveSiege.controlledRamId = null;
    liveSiege.rams = [];
    liveSiege.wallHealth = [{ id: 'left:3', hp: 0, maxHp: 100 }];
    world.player.pos = territorySiegeActionPoint(0, 'start_core_channel');
    controller.updateSiegeHud();
    expect(get('territory-siege-interact').style.display).toBe('flex');
    expect(get('territory-siege-interact-label').textContent).toContain('Activate core laser');
    expect(controller.handleSiegeInteract()).toBe(true);
    expect(world.territorySiegeAction).toHaveBeenLastCalledWith('start_core_channel');
    liveSiege.state = 'ended';
    liveSiege.winner = 'attacker';
    controller.updateSiegeHud();
    expect(get('territory-siege-result').style.display).toBe('flex');
    expect(get('territory-war-dock').style.display).toBe('none');
  });

  it('accepts a non-primary touch tap once and closes More before opening the map', () => {
    const { open } = fixture(file);
    document.body.classList.add('mobile-more-open');
    get('mobile-controls').classList.add('expanded');
    const button = get('mobile-territory');
    const pointer = {
      pointerType: 'touch',
      pointerId: 7,
      isPrimary: false,
      clientX: 20,
      clientY: 20,
    };
    button.dispatchEvent(new PointerEvent('pointerdown', pointer));
    button.dispatchEvent(new PointerEvent('pointerup', pointer));
    button.click();
    expect(open).toHaveBeenCalledOnce();
    expect(document.body.classList.contains('mobile-more-open')).toBe(false);
    expect(get('mobile-controls').classList.contains('expanded')).toBe(false);
    expect(get('territory-war-dock').style.display).toBe('block');
  });

  it('uses F to enter a friendly mortar and replaces the hotbar with three aimed shells', () => {
    const { controller, world, state, beginMortarAim } = fixture(file);
    state.siege = {
      warId: 'war-1',
      biome: 'temperate',
      state: 'active',
      mySide: 'defender',
      attackerCount: 1,
      defenderCount: 1,
      gateProgress: 0,
      coreProgress: 0,
      gateOpen: false,
      ramDeployed: false,
      ramOccupants: 0,
      ramJoined: false,
      ramCooldown: 0,
      ramEmpoweredCooldown: 0,
      rams: [],
      mortarDeployed: 1,
      mortarJoined: false,
      mortarCooldown: 0,
      mortarFrostCooldown: 0,
      mortarVenomCooldown: 0,
      mortars: [
        {
          id: 1,
          x: 0,
          z: 27,
          yaw: Math.PI,
          side: 'defender',
          occupied: false,
          cooldown: 0,
          frostCooldown: 0,
          venomCooldown: 0,
        },
      ],
      controlledMortarId: null,
      mortarZones: [],
      coreChanneling: false,
      coreChannelProgress: 0,
      coreChannels: [],
      defenseTowerLevel: 0,
      towerZones: [],
      respawnIn: 0,
      timeLeft: 3_200,
      winner: null,
      resultReturnIn: 0,
    };
    controller.updateSiegeHud();
    expect(get('territory-siege-interact-label').textContent).toContain('Use field mortar');
    expect(controller.handleSiegeInteract()).toBe(true);
    expect(world.territorySiegeAction).toHaveBeenLastCalledWith('enter_mortar');
    state.siege.mortarJoined = true;
    state.siege.controlledMortarId = 1;
    state.siege.mortars[0].occupied = true;
    controller.updateSiegeHud();
    expect(document.body.classList.contains('territory-mortar-operating')).toBe(true);
    expect(get('territory-mortar-actionbar').style.display).toBe('flex');
    expect(controller.handleMortarActionSlot(0)).toBe(true);
    expect(controller.handleMortarActionSlot(1)).toBe(true);
    expect(controller.handleMortarActionSlot(2)).toBe(true);
    expect(beginMortarAim.mock.calls).toEqual([
      ['mortar', 0],
      ['mortar', 1],
      ['mortar', 2],
    ]);
    expect(controller.handleSiegeInteract()).toBe(true);
    expect(world.territorySiegeAction).toHaveBeenLastCalledWith('leave_mortar');

    state.siege.mortarJoined = false;
    state.siege.controlledMortarId = null;
    state.siege.mortarDeployed = 0;
    state.siege.mortars = [];
    state.siege.catapults = [
      {
        id: 2,
        x: 0,
        z: 27,
        yaw: 0.4,
        side: 'defender',
        occupied: false,
        cooldown: 0,
        clusterCooldown: 0,
      },
    ];
    state.siege.controlledCatapultId = null;
    controller.updateSiegeHud();
    expect(get('territory-siege-interact-label').textContent).toContain('Use field catapult');
    expect(controller.handleSiegeInteract()).toBe(true);
    expect(world.territorySiegeAction).toHaveBeenLastCalledWith('enter_catapult');
    state.siege.catapults[0].occupied = true;
    state.siege.controlledCatapultId = 2;
    controller.updateSiegeHud();
    expect(document.body.classList.contains('territory-catapult-operating')).toBe(true);
    expect(get('territory-catapult-actionbar').style.display).toBe('flex');
    expect(controller.handleCatapultActionSlot(0)).toBe(true);
    expect(controller.handleCatapultActionSlot(1)).toBe(true);
    expect(beginMortarAim.mock.calls.slice(-2)).toEqual([
      ['catapult', 0],
      ['catapult', 1],
    ]);
    expect(controller.handleSiegeInteract()).toBe(true);
    expect(world.territorySiegeAction).toHaveBeenLastCalledWith('leave_catapult');
  });
});
