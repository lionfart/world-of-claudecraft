import { describe, expect, it } from 'vitest';
import { territorySiegeOrigin } from '../src/sim/data';
import { hexBuildingBounds } from '../src/sim/hex_building_dims';
import {
  TERRITORY_SIEGE_CITADEL_INNER_BACK_Z,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_CLEAR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z,
  TERRITORY_SIEGE_CITADEL_INNER_HALF_X,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
  TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z,
  TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X,
} from '../src/sim/territory_siege_ground';
import {
  TERRITORY_SIEGE_COURTYARD_FOOTPRINTS,
  territorySiegeCourtyardFootprints,
} from '../src/sim/territory_siege_environment';
import {
  clampTerritorySiegeDestructibleStructures,
  clampTerritorySiegeFieldForSide,
  clampTerritorySiegeGate,
  resolveTerritorySiegeCourtyardStructures,
  resolveTerritorySiegeDestructibleStructures,
  sealTerritorySiegeGateForSide,
  TERRITORY_SIEGE_CORE_ATTACK_RADIUS,
  TERRITORY_SIEGE_DEFENDER_GATE_TRANSIT_OFFSET,
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  TERRITORY_SIEGE_GATE_HALF_WIDTH,
  TERRITORY_SIEGE_GATE_Z,
  TERRITORY_SIEGE_MORTAR_RANGE,
  TERRITORY_SIEGE_RAM_COLLIDER_RADIUS,
  TERRITORY_SIEGE_RAM_FORMATION,
  TERRITORY_SIEGE_TOWER_RANGE,
  TERRITORY_SIEGE_TOWER_X,
  territorySiegeActionPoint,
  territorySiegeBandColliders,
  territorySiegeCatapultDeployPlacement,
  territorySiegeCatapultPlacementAllowed,
  territorySiegeDefenderGateDestination,
  territorySiegeInSpecificTowerRange,
  territorySiegeInTowerRange,
  territorySiegeLocalColliders,
  territorySiegeMortarDeployPlacement,
  territorySiegeMortarPlacementAllowed,
  territorySiegeProjectilePathClear,
  territorySiegeSpawn,
  territorySiegeTowerPositions,
  territorySiegeWallPlacements,
  territorySiegeWallColliderHalfDepth,
  territorySiegeWallSegmentPlacements,
} from '../src/sim/territory_siege_layout';

describe('territory siege instance layout', () => {
  it('keeps all four collider copies isolated', () => {
    const colliders = territorySiegeBandColliders();
    expect(colliders.length).toBeGreaterThan(20);
    expect(territorySiegeOrigin(1).z - territorySiegeOrigin(0).z).toBe(700);
  });

  it('keeps every substantial courtyard building and prop out of player space', () => {
    const origin = territorySiegeOrigin(0);
    const local = territorySiegeLocalColliders();
    for (const footprint of TERRITORY_SIEGE_COURTYARD_FOOTPRINTS) {
      expect(
        local.some(
          (collider) =>
            collider.x === footprint.x &&
            collider.z === footprint.z &&
            collider.type === footprint.type,
        ),
        footprint.id,
      ).toBe(true);
      const worldX = origin.x + footprint.x;
      const worldZ = origin.z + footprint.z;
      const resolved = resolveTerritorySiegeCourtyardStructures(
        0,
        worldX - 10,
        worldZ,
        worldX,
        worldZ,
        0.6,
        3,
      );
      expect(
        Math.hypot(resolved.x - worldX, resolved.z - worldZ),
        footprint.id,
      ).toBeGreaterThan(0.1);
    }
  });

  it('sweeps player movement against the visible courtyard tier without tunnelling', () => {
    const origin = territorySiegeOrigin(0);
    for (const level of [1, 2, 3, 4]) {
      for (const footprint of territorySiegeCourtyardFootprints(level)) {
        const from = {
          x: origin.x + footprint.x - 12,
          z: origin.z + footprint.z,
        };
        const to = {
          x: origin.x + footprint.x + 12,
          z: origin.z + footprint.z,
        };
        const resolved = resolveTerritorySiegeCourtyardStructures(
          0,
          from.x,
          from.z,
          to.x,
          to.z,
          0.6,
          level,
        );
        expect(resolved.x, `${level}:${footprint.id}`).toBeLessThan(to.x);
      }
    }
  });

  it('uses tier-matched footprints for every visible interior building set', () => {
    const tierIds = [1, 2, 3, 4].map((level) =>
      territorySiegeCourtyardFootprints(level).map((footprint) => footprint.id),
    );
    expect(tierIds[0]).toContain('frontier-watchtower');
    expect(tierIds[1]).toContain('workshop');
    expect(tierIds[2]).toContain('barracks');
    expect(tierIds[3]).toContain('citadel-home:0');
    expect(new Set(tierIds.map((ids) => ids.join('|'))).size).toBe(4);
  });

  it('matches building and wall collision to the measured model footprint', () => {
    for (const level of [1, 2, 3, 4]) {
      const buildings = territorySiegeCourtyardFootprints(level).filter(
        (footprint) =>
          !footprint.id.includes('flag') && !footprint.id.includes('hay'),
      );
      expect(buildings.length, `tier ${level}`).toBeGreaterThanOrEqual(7);
    }
    const levelTwoHome = territorySiegeCourtyardFootprints(2).find(
      (footprint) => footprint.id === 'home:0',
    );
    const measuredHome = hexBuildingBounds('homeA', 8.2);
    expect(levelTwoHome).toMatchObject({
      type: 'obb',
      hw: measuredHome?.hw,
      hd: measuredHome?.hd,
    });
    expect(territorySiegeWallColliderHalfDepth(1)).toBeCloseTo(0.37501 * 2.4);
    expect(territorySiegeWallColliderHalfDepth(2)).toBeCloseTo(0.39995 * 2.25);
    expect(territorySiegeWallColliderHalfDepth(3)).toBeCloseTo(0.50008 * 1.8);
    expect(territorySiegeWallColliderHalfDepth(3, 3)).toBeCloseTo(
      0.75008 * 1.8,
    );
    expect(territorySiegeWallColliderHalfDepth(4)).toBeCloseTo(0.50008 * 2.05);
  });

  it('slides along a building face instead of cancelling the whole movement', () => {
    const origin = territorySiegeOrigin(0);
    const keep = territorySiegeCourtyardFootprints(2).find(
      (footprint) => footprint.id === 'keep' && footprint.type === 'obb',
    );
    if (!keep || keep.type !== 'obb') throw new Error('missing keep footprint');
    const radius = 0.6;
    const start = {
      x: origin.x + keep.x,
      z: origin.z + keep.z + keep.hd + radius + 0.05,
    };
    const resolved = resolveTerritorySiegeCourtyardStructures(
      0,
      start.x,
      start.z,
      start.x + 4,
      start.z - 4,
      radius,
      2,
    );
    expect(resolved.x).toBeGreaterThan(start.x + 2);
    expect(resolved.z).toBeGreaterThanOrEqual(
      origin.z + keep.z + keep.hd + radius - 0.001,
    );
  });

  it('blocks entering level-four staircases from either side', () => {
    const origin = territorySiegeOrigin(0);
    const sideStairZ = -9.8;
    const sideStairX = TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X;
    const blockedSide = resolveTerritorySiegeCourtyardStructures(
      0,
      origin.x +
        sideStairX -
        TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH -
        2,
      origin.z + sideStairZ,
      origin.x + sideStairX,
      origin.z + sideStairZ,
      0.6,
      4,
    );
    expect(blockedSide.x).toBeLessThan(
      origin.x + sideStairX - TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH,
    );

    const innerStairZ =
      (TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z +
        TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z) /
      2;
    const blockedInner = resolveTerritorySiegeCourtyardStructures(
      0,
      origin.x + 7,
      origin.z + innerStairZ,
      origin.x,
      origin.z + innerStairZ,
      0.6,
      4,
    );
    expect(blockedInner.x).toBeGreaterThan(origin.x + 3.75);

    const rail = territorySiegeCourtyardFootprints(4).find(
      (footprint) => footprint.id === 'citadel-inner-stair-rail:1',
    );
    expect(rail).toMatchObject({
      type: 'obb',
      x:
        (TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH +
          TERRITORY_SIEGE_CITADEL_INNER_STAIR_CLEAR_HALF_WIDTH) /
        2,
      hw:
        (TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH -
          TERRITORY_SIEGE_CITADEL_INNER_STAIR_CLEAR_HALF_WIDTH) /
        2,
    });
    const treadSide = resolveTerritorySiegeCourtyardStructures(
      0,
      origin.x,
      origin.z + innerStairZ,
      origin.x + 3,
      origin.z + innerStairZ,
      0.6,
      4,
    );
    expect(treadSide.x).toBeLessThanOrEqual(
      origin.x + TERRITORY_SIEGE_CITADEL_INNER_STAIR_CLEAR_HALF_WIDTH - 0.6,
    );
  });

  it('seals the solid raised ward but leaves elevated wall walks open underneath', () => {
    const origin = territorySiegeOrigin(0);
    const resolve = (
      fromLocalX: number,
      fromLocalZ: number,
      toLocalX: number,
      toLocalZ: number,
    ) =>
      resolveTerritorySiegeCourtyardStructures(
        0,
        origin.x + fromLocalX,
        origin.z + fromLocalZ,
        origin.x + toLocalX,
        origin.z + toLocalZ,
        0.6,
        4,
      );

    const wardMidZ =
      (TERRITORY_SIEGE_CITADEL_INNER_BACK_Z +
        TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z) /
      2;
    const wardSide = resolve(
      TERRITORY_SIEGE_CITADEL_INNER_HALF_X + 3,
      wardMidZ,
      TERRITORY_SIEGE_CITADEL_INNER_HALF_X - 3,
      wardMidZ,
    );
    expect(wardSide.x).toBeGreaterThan(
      origin.x + TERRITORY_SIEGE_CITADEL_INNER_HALF_X,
    );

    const wardBack = resolve(
      0,
      TERRITORY_SIEGE_CITADEL_INNER_BACK_Z - 3,
      0,
      TERRITORY_SIEGE_CITADEL_INNER_BACK_Z + 3,
    );
    expect(wardBack.z).toBeLessThan(
      origin.z + TERRITORY_SIEGE_CITADEL_INNER_BACK_Z,
    );

    const wardFront = resolve(
      18,
      TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z + 3,
      18,
      TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z - 3,
    );
    expect(wardFront.z).toBeGreaterThan(
      origin.z + TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z,
    );

    const walkMidZ = -30;
    for (const side of [-1, 1]) {
      const walkX = side * TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X;
      const belowWalk = resolve(
        walkX - side * (TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH + 3),
        walkMidZ,
        walkX + side * (TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH + 3),
        walkMidZ,
      );
      expect(belowWalk.x).toBeCloseTo(
        origin.x +
          walkX +
          side * (TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH + 3),
      );
    }

    const centralStair = resolve(
      0,
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
      0,
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
    );
    expect(centralStair).toEqual({
      x: origin.x,
      z: origin.z + TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
    });

    for (const side of [-1, 1]) {
      const stairX = side * TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X;
      const wallStair = resolve(
        stairX,
        TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z + 16,
        stairX,
        TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z,
      );
      expect(wallStair).toEqual({
        x: origin.x + stairX,
        z: origin.z + TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z,
      });
    }
  });

  it('places both twenty-player teams inside the enlarged interest field', () => {
    for (let seat = 1; seat <= 20; seat += 1) {
      for (const side of ['attacker', 'defender'] as const) {
        const spawn = territorySiegeSpawn(0, side, seat);
        expect(Math.abs(spawn.x - territorySiegeOrigin(0).x)).toBeLessThan(
          TERRITORY_SIEGE_FIELD_HALF_X,
        );
      }
    }
    expect(
      TERRITORY_SIEGE_FIELD_HALF_X * TERRITORY_SIEGE_FIELD_HALF_Z * 4,
    ).toBeGreaterThan(130_000);
    expect(
      territorySiegeSpawn(0, 'attacker', 1).z - territorySiegeOrigin(0).z,
    ).toBeGreaterThan(170);
  });

  it('snaps every wall run shut and faces opposing runs outwards', () => {
    const placements = territorySiegeWallPlacements();
    expect(placements).toHaveLength(30);
    expect(placements.find((wall) => wall.run === 'left')?.yaw).toBe(
      -Math.PI / 2,
    );
    expect(placements.find((wall) => wall.run === 'right')?.yaw).toBe(
      Math.PI / 2,
    );
    expect(placements.find((wall) => wall.run === 'back')?.yaw).toBe(Math.PI);
    expect(placements.find((wall) => wall.run === 'front_left')?.yaw).toBe(0);

    for (const run of [
      'left',
      'right',
      'back',
      'front_left',
      'front_right',
    ] as const) {
      const alongZ = run === 'left' || run === 'right';
      const pieces = placements
        .filter((wall) => wall.run === run)
        .sort((a, b) => (alongZ ? a.z - b.z : a.x - b.x));
      for (let index = 1; index < pieces.length; index += 1) {
        const previous = pieces[index - 1];
        const current = pieces[index];
        const previousCenter = alongZ ? previous.z : previous.x;
        const currentCenter = alongZ ? current.z : current.x;
        expect(currentCenter - current.scaleX).toBeCloseTo(
          previousCenter + previous.scaleX,
          8,
        );
      }
    }
  });

  it('adds an independently destructible inner curtain only at castle level four', () => {
    const levelThree = territorySiegeWallPlacements(3);
    const levelFour = territorySiegeWallPlacements(4);
    expect(levelThree.some((wall) => wall.run.startsWith('inner_'))).toBe(
      false,
    );
    expect(levelFour.length).toBeGreaterThan(levelThree.length);
    expect(levelFour.some((wall) => wall.run === 'inner_left')).toBe(true);
    expect(levelFour.some((wall) => wall.run === 'inner_right')).toBe(true);
    expect(levelFour.some((wall) => wall.run === 'inner_back')).toBe(true);

    const innerWall = levelFour.find((wall) => wall.run === 'inner_left');
    if (!innerWall) throw new Error('level-four inner wall missing');
    const origin = territorySiegeOrigin(0);
    const blocked = resolveTerritorySiegeDestructibleStructures(
      0,
      Object.fromEntries(
        levelFour.map((wall) => [`${wall.run}:${wall.index}`, true]),
      ),
      undefined,
      origin.x + innerWall.x - 3,
      origin.z + innerWall.z,
      origin.x + innerWall.x + 3,
      origin.z + innerWall.z,
      0.5,
      4,
    );
    expect(blocked.x).toBeLessThan(origin.x + innerWall.x);

    const sideWalk = { x: origin.x + 37.375, z: origin.z - 43 };
    expect(
      clampTerritorySiegeDestructibleStructures(
        0,
        Object.fromEntries(
          levelFour.map((wall) => [`${wall.run}:${wall.index}`, true]),
        ),
        undefined,
        sideWalk.x,
        sideWalk.z,
        0.5,
        4,
      ),
    ).toEqual(sideWalk);
  });

  it('restricts ram construction to the marked gate apron', () => {
    const point = territorySiegeActionPoint(0, 'deploy_ram');
    const origin = territorySiegeOrigin(0);
    expect((origin.z + 25 - point.z) ** 2).toBeLessThanOrEqual(
      point.radius ** 2,
    );
    expect((origin.z + 46 - point.z) ** 2).toBeGreaterThan(point.radius ** 2);
  });

  it('lays all three rams abreast on one crescent and pivots every nose at the gate', () => {
    expect(TERRITORY_SIEGE_RAM_FORMATION).toHaveLength(3);
    for (const ram of TERRITORY_SIEGE_RAM_FORMATION) {
      expect(Math.hypot(ram.x, ram.z - TERRITORY_SIEGE_GATE_Z)).toBeCloseTo(
        9.5,
        8,
      );
      expect(ram.yaw).toBeCloseTo(
        Math.atan2(ram.x, ram.z - TERRITORY_SIEGE_GATE_Z),
        8,
      );
    }
    for (
      let index = 1;
      index < TERRITORY_SIEGE_RAM_FORMATION.length;
      index += 1
    ) {
      const previous = TERRITORY_SIEGE_RAM_FORMATION[index - 1];
      const current = TERRITORY_SIEGE_RAM_FORMATION[index];
      expect(
        Math.hypot(current.x - previous.x, current.z - previous.z),
      ).toBeGreaterThan(TERRITORY_SIEGE_RAM_COLLIDER_RADIUS * 2);
    }
  });

  it('allows free mortar placement while rejecting physical overlaps', () => {
    expect(territorySiegeMortarDeployPlacement('defender', 12, -18)).toEqual({
      x: 12,
      z: -18,
      yaw: Math.PI,
      side: 'defender',
    });
    expect(territorySiegeMortarPlacementAllowed(0, -18, [])).toBe(true);
    expect(territorySiegeMortarPlacementAllowed(24, 50, [])).toBe(true);
    expect(territorySiegeMortarPlacementAllowed(0, 18, [])).toBe(false);
    expect(
      territorySiegeMortarPlacementAllowed(0, -18, [{ x: 1, z: -18 }]),
    ).toBe(false);
    expect(
      territorySiegeMortarPlacementAllowed(0, -18, [], [{ x: 1, z: -18 }]),
    ).toBe(false);
    expect(
      territorySiegeMortarPlacementAllowed(0, -18, [], [], [{ x: 1, z: -18 }]),
    ).toBe(false);
    const wall = territorySiegeWallSegmentPlacements()['back:3'];
    expect(territorySiegeMortarPlacementAllowed(wall.x, wall.z, [])).toBe(
      false,
    );
    expect(TERRITORY_SIEGE_MORTAR_RANGE).toBeGreaterThan(50);
    expect(TERRITORY_SIEGE_MORTAR_RANGE).toBeLessThan(
      TERRITORY_SIEGE_FIELD_HALF_Z * 2,
    );
  });

  it('deploys catapults at clear free positions with the player facing', () => {
    expect(
      territorySiegeCatapultDeployPlacement('attacker', 20, 52, 1.25),
    ).toEqual({
      x: 20,
      z: 52,
      yaw: 1.25,
      side: 'attacker',
    });
    expect(territorySiegeCatapultPlacementAllowed(20, 52, [])).toBe(true);
    expect(
      territorySiegeCatapultPlacementAllowed(20, 52, [{ x: 21, z: 52 }]),
    ).toBe(false);
    expect(territorySiegeCatapultPlacementAllowed(0, 18, [])).toBe(false);
    const wall = territorySiegeWallSegmentPlacements()['left:3'];
    expect(territorySiegeCatapultPlacementAllowed(wall.x, wall.z, [])).toBe(
      false,
    );
    expect(
      territorySiegeCatapultPlacementAllowed(
        TERRITORY_SIEGE_TOWER_X,
        TERRITORY_SIEGE_GATE_Z,
        [],
      ),
    ).toBe(false);
  });

  it('removes collision only from the individual wall segment and tower whose health reached zero', () => {
    const origin = territorySiegeOrigin(0);
    const wall = territorySiegeWallSegmentPlacements()['left:3'];
    const wallPoint = { x: origin.x + wall.x, z: origin.z + wall.z };
    expect(
      clampTerritorySiegeDestructibleStructures(
        0,
        { 'left:3': true },
        undefined,
        wallPoint.x,
        wallPoint.z,
        0.5,
      ),
    ).not.toEqual(wallPoint);
    expect(
      clampTerritorySiegeDestructibleStructures(
        0,
        { 'left:3': false },
        undefined,
        wallPoint.x,
        wallPoint.z,
        0.5,
      ),
    ).toEqual(wallPoint);

    const towerPoint = {
      x: origin.x + TERRITORY_SIEGE_TOWER_X - 3,
      z: origin.z + TERRITORY_SIEGE_GATE_Z - 3,
    };
    expect(
      clampTerritorySiegeDestructibleStructures(
        0,
        undefined,
        { right: true },
        towerPoint.x,
        towerPoint.z,
        0.5,
      ),
    ).not.toEqual(towerPoint);
    expect(
      clampTerritorySiegeDestructibleStructures(
        0,
        undefined,
        { right: false },
        towerPoint.x,
        towerPoint.z,
        0.5,
      ),
    ).toEqual(towerPoint);
  });

  it('sweeps long movement across intact wall segments without tunnelling through them', () => {
    const origin = territorySiegeOrigin(0);
    const wall = territorySiegeWallSegmentPlacements()['left:3'];
    const outsideX = origin.x + wall.x - 5;
    const insideX = origin.x + wall.x + 5;
    const z = origin.z + wall.z;
    const blocked = resolveTerritorySiegeDestructibleStructures(
      0,
      { 'left:3': true },
      undefined,
      outsideX,
      z,
      insideX,
      z,
      0.5,
    );
    expect(blocked.x).toBeLessThan(origin.x + wall.x);

    expect(
      resolveTerritorySiegeDestructibleStructures(
        0,
        { 'left:3': false },
        undefined,
        outsideX,
        z,
        insideX,
        z,
        0.5,
      ),
    ).toMatchObject({ x: expect.closeTo(insideX, 6), z: expect.closeTo(z, 6) });
  });

  it('joins real wall footprints without crossing perpendicular runs or overlapping seams', () => {
    // The shipped wall spans [-1,1] on X and [-0.4,0.4] on Z, scaled 2.25 deep.
    const boxes = territorySiegeWallPlacements().map((wall) => {
      const alongZ = wall.run === 'left' || wall.run === 'right';
      return {
        x: wall.x,
        z: wall.z,
        hx: alongZ ? 0.9 : wall.scaleX,
        hz: alongZ ? wall.scaleX : 0.9,
      };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (const b of boxes.slice(i + 1)) {
        const a = boxes[i];
        const overlapX =
          Math.min(a.x + a.hx, b.x + b.hx) - Math.max(a.x - a.hx, b.x - b.hx);
        const overlapZ =
          Math.min(a.z + a.hz, b.z + b.hz) - Math.max(a.z - a.hz, b.z - b.hz);
        expect(Math.min(overlapX, overlapZ)).toBeLessThanOrEqual(0.00001);
      }
    }
    const side = boxes[0];
    expect(side.z - side.hz).toBeCloseTo(-71.1);
    expect(boxes[7].z + boxes[7].hz).toBeCloseTo(17.1);
  });

  it('gives the core channel a readable combat-sized attack area', () => {
    const point = territorySiegeActionPoint(0, 'start_core_channel');
    expect(point.radius).toBe(TERRITORY_SIEGE_CORE_ATTACK_RADIUS);
    expect(point.radius).toBeGreaterThanOrEqual(12);
  });

  it('blocks the gate crossing until the gate is destroyed', () => {
    const origin = territorySiegeOrigin(0);
    const blocked = clampTerritorySiegeGate(
      0,
      false,
      origin.z + 23,
      origin.x,
      origin.z + 15,
      0.6,
    );
    expect(blocked.z).toBeGreaterThan(origin.z + 18);
    expect(
      clampTerritorySiegeGate(
        0,
        true,
        origin.z + 23,
        origin.x,
        origin.z + 15,
        0.6,
      ).z,
    ).toBe(origin.z + 15);
  });

  it('seals attackers behind a closed gate without ejecting defenders who used it', () => {
    const origin = territorySiegeOrigin(0);
    const attacker = sealTerritorySiegeGateForSide(
      0,
      'attacker',
      false,
      origin.x,
      origin.z + 10,
      0.5,
    );
    const defender = sealTerritorySiegeGateForSide(
      0,
      'defender',
      false,
      origin.x,
      origin.z + 28,
      0.5,
    );
    expect(attacker.z).toBeGreaterThan(origin.z + TERRITORY_SIEGE_GATE_Z);
    expect(defender.z).toBe(origin.z + 28);
    expect(
      sealTerritorySiegeGateForSide(
        0,
        'attacker',
        true,
        origin.x,
        origin.z + 10,
        0.5,
      ).z,
    ).toBe(origin.z + 10);
    expect(
      sealTerritorySiegeGateForSide(
        0,
        'attacker',
        false,
        origin.x + TERRITORY_SIEGE_GATE_HALF_WIDTH + 2,
        origin.z + 10,
        0.5,
      ).z,
    ).toBe(origin.z + 10);
    expect(
      sealTerritorySiegeGateForSide(
        0,
        'attacker',
        false,
        origin.x,
        origin.z + 10,
        0.5,
        true,
      ).z,
    ).toBe(origin.z + 10);
  });

  it('blocks projectile segments through the gate leaf until it opens', () => {
    const origin = territorySiegeOrigin(0);
    const outside = { x: origin.x, z: origin.z + TERRITORY_SIEGE_GATE_Z + 8 };
    const courtyard = { x: origin.x, z: origin.z + TERRITORY_SIEGE_GATE_Z - 8 };
    expect(
      territorySiegeProjectilePathClear(0, false, outside, courtyard),
    ).toBe(false);
    expect(territorySiegeProjectilePathClear(0, true, outside, courtyard)).toBe(
      true,
    );
    expect(
      territorySiegeProjectilePathClear(
        0,
        false,
        { ...outside, x: origin.x + TERRITORY_SIEGE_GATE_HALF_WIDTH + 4 },
        { ...courtyard, x: origin.x + TERRITORY_SIEGE_GATE_HALF_WIDTH + 4 },
      ),
    ).toBe(true);
  });

  it('seals the complete twenty-unit opening between the front wall segments', () => {
    const frontWallInnerEdges = territorySiegeWallPlacements().flatMap(
      (wall) =>
        wall.run === 'front_left' || wall.run === 'front_right'
          ? [Math.abs(wall.x) - wall.scaleX]
          : [],
    );
    expect(Math.min(...frontWallInnerEdges)).toBeCloseTo(
      TERRITORY_SIEGE_GATE_HALF_WIDTH,
    );
    expect(TERRITORY_SIEGE_GATE_HALF_WIDTH).toBe(10);
  });

  it('gives each defense tower a radius that covers the gate approach but not spawn', () => {
    const origin = territorySiegeOrigin(0);
    const towers = territorySiegeTowerPositions(0);
    expect(towers).toHaveLength(2);
    expect(TERRITORY_SIEGE_TOWER_RANGE).toBeGreaterThan(
      TERRITORY_SIEGE_TOWER_X,
    );
    for (const tower of towers) {
      expect(
        Math.hypot(
          tower.x - origin.x,
          tower.z - (origin.z + TERRITORY_SIEGE_GATE_Z),
        ),
      ).toBeLessThan(TERRITORY_SIEGE_TOWER_RANGE);
    }
    expect(
      territorySiegeInTowerRange(
        0,
        origin.x,
        origin.z + TERRITORY_SIEGE_GATE_Z,
      ),
    ).toBe(true);
    expect(territorySiegeInTowerRange(0, origin.x, origin.z + 50)).toBe(true);
    expect(territorySiegeInTowerRange(0, origin.x, origin.z + 96)).toBe(false);
    expect(
      territorySiegeInSpecificTowerRange(0, 'left', towers[0].x, towers[0].z),
    ).toBe(true);
    expect(
      territorySiegeInSpecificTowerRange(0, 'right', towers[0].x, towers[0].z),
    ).toBe(false);
  });

  it('moves a nearby defender through the castle gate but rejects distant use', () => {
    expect(
      territorySiegeDefenderGateDestination(3, TERRITORY_SIEGE_GATE_Z + 1),
    ).toEqual({
      x: 3,
      z: TERRITORY_SIEGE_GATE_Z - TERRITORY_SIEGE_DEFENDER_GATE_TRANSIT_OFFSET,
    });
    expect(
      territorySiegeDefenderGateDestination(0, TERRITORY_SIEGE_GATE_Z - 1),
    ).toEqual({
      x: 0,
      z: TERRITORY_SIEGE_GATE_Z + TERRITORY_SIEGE_DEFENDER_GATE_TRANSIT_OFFSET,
    });
    expect(territorySiegeDefenderGateDestination(30, 30)).toBeNull();
  });

  it('lets defenders leave the battlefield while retaining the attacker perimeter', () => {
    const origin = territorySiegeOrigin(0);
    const farOutside = {
      x: origin.x + TERRITORY_SIEGE_FIELD_HALF_X + 80,
      z: origin.z + TERRITORY_SIEGE_FIELD_HALF_Z + 80,
    };
    expect(
      clampTerritorySiegeFieldForSide(
        0,
        'defender',
        farOutside.x,
        farOutside.z,
        0.6,
      ),
    ).toEqual(farOutside);
    const attacker = clampTerritorySiegeFieldForSide(
      0,
      'attacker',
      farOutside.x,
      farOutside.z,
      0.6,
    );
    expect(attacker.x).toBeLessThan(origin.x + TERRITORY_SIEGE_FIELD_HALF_X);
    expect(attacker.z).toBeLessThan(origin.z + TERRITORY_SIEGE_FIELD_HALF_Z);
  });
});
