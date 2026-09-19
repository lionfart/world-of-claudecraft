import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createClientPlayerMotionDeps } from '../src/render/client_player_motion';
import { DUNGEON_FLOOR_Y, territorySiegeOrigin } from '../src/sim/data';
import { createPlayer } from '../src/sim/entity';
import { stepPlayerMotion } from '../src/sim/player_motion';
import {
  installTerritorySim,
  type TerritorySimTeam,
  territorySimLocksMovement,
  territorySimProjectilePathClear,
  territorySimResolveGate,
} from '../src/sim/territory_local';
import {
  TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_X,
  TERRITORY_SIEGE_STONE_LANE_HEIGHT,
} from '../src/sim/territory_siege_ground';
import { territorySiegeWallSegmentPlacements } from '../src/sim/territory_siege_layout';
import type { MoveInput } from '../src/sim/types';
import type { TerritoryMapState } from '../src/world_api';

describe('territory local siege controls', () => {
  it('keeps online display prediction active while freely walking in a siege field', () => {
    const main = readFileSync(
      new URL('../src/main.ts', import.meta.url),
      'utf8',
    );
    expect(main).toContain(
      'selfMotionGateArgs.movementFrozen = movementFrozen();',
    );
    expect(main).not.toContain(
      'movementFrozen() || isTerritorySiegePos(pe.pos.x)',
    );
  });

  it('locks movement only while a siege tool or core channel owns the player', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    expect(territorySimLocksMovement(host, 1)).toBe(false);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
    });
    expect(territorySimLocksMovement(host, 1)).toBe(false);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: { kind: 'ram', ramId: 1 },
    });
    expect(territorySimLocksMovement(host, 1)).toBe(true);
  });

  it('mirrors authoritative siege structure collision in client-side prediction', () => {
    const origin = territorySiegeOrigin(0);
    const wall = territorySiegeWallSegmentPlacements()['left:3'];
    const wallX = origin.x + wall.x;
    const z = origin.z + wall.z;
    const player = createPlayer(
      1,
      'warrior',
      { x: wallX - 5, y: DUNGEON_FLOOR_Y, z },
      'Predictor',
    );
    const territoryState = {
      siege: {
        warId: 'war-1',
        mySide: 'attacker',
        gateOpen: false,
        controlledRamId: null,
        controlledMortarId: null,
        controlledCatapultId: null,
        coreChanneling: false,
        rams: [],
        mortars: [],
        catapults: [],
        wallHealth: [{ id: 'left:3', hp: 100, maxHp: 100 }],
        towerHealth: [],
      },
    } as unknown as TerritoryMapState;
    const deps = createClientPlayerMotionDeps(
      7331,
      undefined,
      0,
      () => territoryState,
    );
    const blocked = deps.resolveMove(
      player.pos.x,
      player.pos.z,
      wallX + 5,
      z,
      0.6,
      player,
      false,
    );
    expect(blocked.x).toBeLessThan(wallX);
  });

  it('keeps level-four buildings solid without lifting a player from beneath its raised floor', () => {
    const origin = territorySiegeOrigin(0);
    const buildingX = origin.x + 27;
    const buildingZ = origin.z + 5;
    const player = createPlayer(
      1,
      'warrior',
      { x: buildingX - 12, y: DUNGEON_FLOOR_Y, z: buildingZ },
      'Citadel',
    );
    const territoryState = {
      siege: {
        warId: 'war-1',
        castleLevel: 4,
        mySide: 'defender',
        gateOpen: true,
        controlledRamId: null,
        controlledMortarId: null,
        controlledCatapultId: null,
        coreChanneling: false,
        rams: [],
        mortars: [],
        catapults: [],
        wallHealth: [],
        towerHealth: [],
      },
    } as unknown as TerritoryMapState;
    const deps = createClientPlayerMotionDeps(
      7331,
      undefined,
      0,
      () => territoryState,
    );
    const blocked = deps.resolveMove(
      player.pos.x,
      player.pos.z,
      buildingX,
      buildingZ,
      0.6,
      player,
      false,
    );
    expect(blocked.x).toBeLessThan(buildingX);
    expect(deps.groundHeightAt?.(player, origin.x, origin.z - 46)).toBe(
      DUNGEON_FLOOR_Y + TERRITORY_SIEGE_STONE_LANE_HEIGHT,
    );
    player.pos.y = DUNGEON_FLOOR_Y + TERRITORY_SIEGE_CITADEL_INNER_HEIGHT;
    expect(deps.groundHeightAt?.(player, origin.x, origin.z - 46)).toBe(
      DUNGEON_FLOOR_Y + TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
    );

    player.pos.x =
      origin.x +
      TERRITORY_SIEGE_CITADEL_WALL_WALK_X -
      TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH -
      1.5;
    player.pos.z = origin.z - 43;
    player.pos.y = DUNGEON_FLOOR_Y;
    const underWalk = deps.resolveMove(
      player.pos.x,
      player.pos.z,
      origin.x +
        TERRITORY_SIEGE_CITADEL_WALL_WALK_X +
        TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH -
        0.2,
      player.pos.z,
      0.6,
      player,
      false,
    );
    expect(underWalk.x).toBeGreaterThan(
      origin.x + TERRITORY_SIEGE_CITADEL_WALL_WALK_X,
    );
  });

  it('applies citadel access rules to actual WASD walking', () => {
    const origin = territorySiegeOrigin(0);
    const territoryState = {
      siege: {
        warId: 'war-1',
        castleLevel: 4,
        mySide: 'defender',
        gateOpen: true,
        controlledRamId: null,
        controlledMortarId: null,
        controlledCatapultId: null,
        coreChanneling: false,
        rams: [],
        mortars: [],
        catapults: [],
        wallHealth: [],
        towerHealth: [],
      },
    } as unknown as TerritoryMapState;
    const deps = createClientPlayerMotionDeps(
      7331,
      undefined,
      0,
      () => territoryState,
    );
    const input: MoveInput = {
      forward: true,
      back: false,
      turnLeft: false,
      turnRight: false,
      strafeLeft: false,
      strafeRight: false,
      jump: false,
      dive: false,
      surface: false,
    };

    const underRamp = createPlayer(
      1,
      'warrior',
      {
        x:
          origin.x +
          (TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X +
            TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X) /
            2,
        y: DUNGEON_FLOOR_Y,
        z:
          origin.z +
          TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z +
          TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH +
          1.8,
      },
      'Under ramp',
    );
    underRamp.facing = Math.PI;
    underRamp.onGround = true;
    underRamp.fallStartY = underRamp.pos.y;
    for (let tick = 0; tick < 40; tick += 1) {
      underRamp.prevPos = { ...underRamp.pos };
      stepPlayerMotion(deps, underRamp, input);
    }
    expect(underRamp.pos.z).toBeGreaterThan(
      origin.z +
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z +
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH,
    );
    expect(underRamp.pos.y).toBeLessThan(1);

    const wallStair = createPlayer(
      4,
      'warrior',
      {
        x: origin.x + TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X + 0.4,
        y: DUNGEON_FLOOR_Y,
        z: origin.z + TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
      },
      'Wall stair',
    );
    wallStair.facing = Math.PI / 2;
    wallStair.onGround = true;
    wallStair.fallStartY = wallStair.pos.y;
    for (let tick = 0; tick < 170; tick += 1) {
      wallStair.prevPos = { ...wallStair.pos };
      stepPlayerMotion(deps, wallStair, input);
    }
    expect(wallStair.pos.x).toBeGreaterThan(
      origin.x + TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X - 0.5,
    );
    expect(wallStair.pos.y).toBeCloseTo(
      DUNGEON_FLOOR_Y + TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT,
      4,
    );

    const stairSide = createPlayer(
      3,
      'warrior',
      {
        x: origin.x + TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH + 2,
        y: DUNGEON_FLOOR_Y,
        z:
          origin.z +
          (TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z +
            TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z) /
            2,
      },
      'Stair side',
    );
    stairSide.facing = -Math.PI / 2;
    stairSide.onGround = true;
    stairSide.fallStartY = stairSide.pos.y;
    for (let tick = 0; tick < 40; tick += 1) {
      stairSide.prevPos = { ...stairSide.pos };
      stepPlayerMotion(deps, stairSide, input);
    }
    expect(stairSide.pos.x).toBeGreaterThan(
      origin.x + TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH,
    );
    expect(stairSide.pos.y).toBeLessThan(1);

    const centralStair = createPlayer(
      2,
      'warrior',
      {
        x: origin.x,
        y: DUNGEON_FLOOR_Y + TERRITORY_SIEGE_STONE_LANE_HEIGHT,
        z: origin.z + TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z + 1,
      },
      'Central stair',
    );
    centralStair.facing = 0;
    centralStair.onGround = true;
    centralStair.fallStartY = centralStair.pos.y;
    for (let tick = 0; tick < 120; tick += 1) {
      centralStair.prevPos = { ...centralStair.pos };
      stepPlayerMotion(deps, centralStair, input);
    }
    expect(centralStair.pos.z).toBeGreaterThan(
      origin.z + TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
    );
    expect(centralStair.pos.y).toBeCloseTo(
      DUNGEON_FLOOR_Y + TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
      4,
    );
  });

  it('exposes the live gate state to projectile collision', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    const origin = territorySiegeOrigin(0);
    const from = { x: origin.x, z: origin.z + 26 };
    const to = { x: origin.x, z: origin.z + 10 };

    expect(territorySimProjectilePathClear(host, 1, from, to)).toBe(true);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
    });
    expect(territorySimProjectilePathClear(host, 1, from, to)).toBe(false);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: true,
      control: null,
    });
    expect(territorySimProjectilePathClear(host, 1, from, to)).toBe(true);
  });

  it('keeps ordinary players outside deployed ram colliders but leaves the operator anchored', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    const origin = territorySiegeOrigin(0);
    const ram = { id: 7, x: 0, z: 27 };
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
      rams: [ram],
    });
    const pushed = territorySimResolveGate(
      host,
      1,
      origin.x,
      origin.z + 27,
      { x: origin.x, z: origin.z + 27 },
      0.6,
    );
    expect(
      Math.hypot(pushed.x - origin.x, pushed.z - (origin.z + 27)),
    ).toBeGreaterThan(3.2);

    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: { kind: 'ram', ramId: 7 },
      rams: [ram],
    });
    expect(
      territorySimResolveGate(
        host,
        1,
        origin.x,
        origin.z + 27,
        { x: origin.x, z: origin.z + 27 },
        0.6,
      ),
    ).toEqual({ x: origin.x, z: origin.z + 27 });
  });

  it('sweeps intact wall segments and permits only a destroyed segment as a breach', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    const origin = territorySiegeOrigin(0);
    const wall = territorySiegeWallSegmentPlacements()['left:3'];
    const outsideX = origin.x + wall.x - 5;
    const insideX = origin.x + wall.x + 5;
    const z = origin.z + wall.z;
    const team: TerritorySimTeam = {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
      wallHealth: [{ id: 'left:3', hp: 100 }],
    };
    host.setTerritorySiegeTeam(1, team);
    expect(
      territorySimResolveGate(host, 1, outsideX, z, { x: insideX, z }, 0.6).x,
    ).toBeLessThan(origin.x + wall.x);

    host.setTerritorySiegeTeam(1, {
      ...team,
      wallHealth: [{ id: 'left:3', hp: 0 }],
    });
    const openBreach = territorySimResolveGate(
      host,
      1,
      outsideX,
      z,
      { x: insideX, z },
      0.6,
    );
    expect(openBreach.x).toBeCloseTo(insideX);
    expect(openBreach.z).toBeCloseTo(z);
  });

  it('does not eject an attacker who legitimately entered through a wall breach', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    const origin = territorySiegeOrigin(0);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
      wallHealth: [{ id: 'left:3', hp: 0 }],
    });
    const courtyard = { x: origin.x, z: origin.z - 20 };
    const resolved = territorySimResolveGate(
      host,
      1,
      courtyard.x,
      courtyard.z + 1,
      courtyard,
      0.6,
    );
    expect(resolved.x).toBeCloseTo(courtyard.x);
    expect(resolved.z).toBeCloseTo(courtyard.z);
  });

  it('does not rubber-band a defender who walks beyond the old siege perimeter', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    const origin = territorySiegeOrigin(0);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'defender',
      slot: 0,
      gateOpen: false,
      control: null,
    });
    const outside = { x: origin.x + 210, z: origin.z + 260 };
    const resolved = territorySimResolveGate(
      host,
      1,
      outside.x - 1,
      outside.z - 1,
      outside,
      0.6,
    );
    expect(resolved.x).toBeCloseTo(outside.x);
    expect(resolved.z).toBeCloseTo(outside.z);
  });
});
