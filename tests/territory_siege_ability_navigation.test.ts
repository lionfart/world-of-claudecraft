import { describe, expect, it } from 'vitest';
import { FROZEN_ORB_SPEED } from '../src/sim/combat/frozen_orb';
import { DUNGEON_FLOOR_Y, territorySiegeOrigin } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { TerritorySimTeam } from '../src/sim/territory_local';
import {
  TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
} from '../src/sim/territory_siege_ground';
import {
  territorySiegeCastleBounds,
  territorySiegeWallSegmentPlacements,
} from '../src/sim/territory_siege_layout';
import { type Entity, MAX_LEVEL } from '../src/sim/types';
import { EMPTY_TEST_WORLD } from './sim_shared';

type TerritoryTestSim = Sim & {
  setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
};

function makeMage(): { sim: TerritoryTestSim; player: Entity } {
  const sim = new Sim({
    seed: 60601,
    playerClass: 'mage',
    autoEquip: true,
    world: EMPTY_TEST_WORLD,
  }) as TerritoryTestSim;
  sim.setPlayerLevel(MAX_LEVEL);
  expect(sim.setSpec('frost')).toBe(true);
  sim.tick();
  return { sim, player: sim.player };
}

function levelFourTeam(overrides: Partial<TerritorySimTeam> = {}): TerritorySimTeam {
  return {
    warId: 'war-navigation',
    side: 'attacker',
    slot: 0,
    castleLevel: 4,
    gateOpen: false,
    control: null,
    ...overrides,
  };
}

function armTeam(sim: TerritoryTestSim, team: TerritorySimTeam): void {
  sim.setTerritorySiegeTeam(sim.player.id, team);
}

function blink(sim: TerritoryTestSim, player: Entity): void {
  player.gcdRemaining = 0;
  sim.castAbility('blink', player.id);
}

describe('territory siege ground-following abilities', () => {
  it('stops Flitstep at a closed gate instead of teleporting into the castle', () => {
    const { sim, player } = makeMage();
    const origin = territorySiegeOrigin(0);
    const gateZ = origin.z + territorySiegeCastleBounds(4).gateZ;
    armTeam(sim, levelFourTeam());
    player.pos = { x: origin.x, y: DUNGEON_FLOOR_Y, z: gateZ + 4 };
    player.facing = Math.PI;

    blink(sim, player);

    expect(player.pos.z).toBeGreaterThan(gateZ);
  });

  it('stops Flitstep at an intact wall but permits the exact destroyed segment as a breach', () => {
    const intactRun = makeMage();
    const origin = territorySiegeOrigin(0);
    const wall = territorySiegeWallSegmentPlacements(4)['left:3'];
    const wallX = origin.x + wall.x;
    const z = origin.z + wall.z;
    armTeam(intactRun.sim, levelFourTeam({ wallHealth: [{ id: 'left:3', hp: 100 }] }));
    intactRun.player.pos = { x: wallX - 4, y: DUNGEON_FLOOR_Y, z };
    intactRun.player.facing = Math.PI / 2;

    blink(intactRun.sim, intactRun.player);
    expect(intactRun.player.pos.x).toBeLessThan(wallX);

    const breachRun = makeMage();
    armTeam(breachRun.sim, levelFourTeam({ wallHealth: [{ id: 'left:3', hp: 0 }] }));
    breachRun.player.pos = { x: wallX - 4, y: DUNGEON_FLOOR_Y, z };
    breachRun.player.facing = Math.PI / 2;

    blink(breachRun.sim, breachRun.player);
    expect(breachRun.player.pos.x).toBeGreaterThan(wallX);
  });

  it('seats Flitstep on the raised inner ward after it follows the authored rear stair', () => {
    const { sim, player } = makeMage();
    const origin = territorySiegeOrigin(0);
    armTeam(sim, levelFourTeam({ side: 'defender', gateOpen: true }));
    player.pos = {
      x: origin.x,
      y: DUNGEON_FLOOR_Y,
      z: origin.z + TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z - 0.5,
    };
    player.facing = 0;

    blink(sim, player);

    expect(player.pos.z).toBeGreaterThan(origin.z + TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z);
    expect(player.pos.y).toBeCloseTo(DUNGEON_FLOOR_Y + TERRITORY_SIEGE_CITADEL_INNER_HEIGHT, 4);
  });

  it('raises Frostglobe along the rear stair instead of letting it travel under the inner floor', () => {
    const { sim, player } = makeMage();
    const origin = territorySiegeOrigin(0);
    armTeam(sim, levelFourTeam({ side: 'defender', gateOpen: true }));
    player.pos = {
      x: origin.x,
      y: DUNGEON_FLOOR_Y,
      z: origin.z + TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z - 0.5,
    };
    player.facing = 0;
    player.resource = player.maxResource;
    sim.castAbility('frozen_orb');

    const travelSeconds =
      (TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z -
        TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z +
        2) /
      FROZEN_ORB_SPEED;
    for (let tick = 0; tick < Math.ceil(travelSeconds * 20); tick += 1) sim.tick();
    const orb = sim.ctx.frozenOrbs[0];

    expect(orb.z).toBeGreaterThan(origin.z + TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z);
    expect(orb.y).toBeCloseTo(DUNGEON_FLOOR_Y + TERRITORY_SIEGE_CITADEL_INNER_HEIGHT, 4);
  });
});
