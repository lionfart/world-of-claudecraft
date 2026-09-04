import { describe, expect, it } from 'vitest';
import { territorySiegeOrigin } from '../src/sim/data';
import {
  clampTerritorySiegeDestructibleStructures,
  clampTerritorySiegeGate,
  resolveTerritorySiegeDestructibleStructures,
  sealTerritorySiegeGateForSide,
  TERRITORY_SIEGE_CORE_ATTACK_RADIUS,
  TERRITORY_SIEGE_DEFENDER_PORTAL_X,
  TERRITORY_SIEGE_DEFENDER_PORTAL_Z,
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
  territorySiegeDefenderPortalDestination,
  territorySiegeInTowerRange,
  territorySiegeMortarDeployPlacement,
  territorySiegeMortarPlacementAllowed,
  territorySiegeProjectilePathClear,
  territorySiegeSpawn,
  territorySiegeTowerPositions,
  territorySiegeWallPlacements,
  territorySiegeWallSegmentPlacements,
} from '../src/sim/territory_siege_layout';

describe('territory siege instance layout', () => {
  it('keeps all four collider copies isolated', () => {
    const colliders = territorySiegeBandColliders();
    expect(colliders.length).toBeGreaterThan(20);
    expect(territorySiegeOrigin(1).z - territorySiegeOrigin(0).z).toBe(700);
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
    expect(TERRITORY_SIEGE_FIELD_HALF_X * TERRITORY_SIEGE_FIELD_HALF_Z * 4).toBeGreaterThan(
      130_000,
    );
    expect(territorySiegeSpawn(0, 'attacker', 1).z - territorySiegeOrigin(0).z).toBeGreaterThan(
      170,
    );
  });

  it('snaps every wall run shut and faces opposing runs outwards', () => {
    const placements = territorySiegeWallPlacements();
    expect(placements).toHaveLength(30);
    expect(placements.find((wall) => wall.run === 'left')?.yaw).toBe(-Math.PI / 2);
    expect(placements.find((wall) => wall.run === 'right')?.yaw).toBe(Math.PI / 2);
    expect(placements.find((wall) => wall.run === 'back')?.yaw).toBe(Math.PI);
    expect(placements.find((wall) => wall.run === 'front_left')?.yaw).toBe(0);

    for (const run of ['left', 'right', 'back', 'front_left', 'front_right'] as const) {
      const alongZ = run === 'left' || run === 'right';
      const pieces = placements
        .filter((wall) => wall.run === run)
        .sort((a, b) => (alongZ ? a.z - b.z : a.x - b.x));
      for (let index = 1; index < pieces.length; index += 1) {
        const previous = pieces[index - 1];
        const current = pieces[index];
        const previousCenter = alongZ ? previous.z : previous.x;
        const currentCenter = alongZ ? current.z : current.x;
        expect(currentCenter - current.scaleX).toBeCloseTo(previousCenter + previous.scaleX, 8);
      }
    }
  });

  it('restricts ram construction to the marked gate apron', () => {
    const point = territorySiegeActionPoint(0, 'deploy_ram');
    const origin = territorySiegeOrigin(0);
    expect((origin.z + 25 - point.z) ** 2).toBeLessThanOrEqual(point.radius ** 2);
    expect((origin.z + 46 - point.z) ** 2).toBeGreaterThan(point.radius ** 2);
  });

  it('lays all three rams abreast on one crescent and pivots every nose at the gate', () => {
    expect(TERRITORY_SIEGE_RAM_FORMATION).toHaveLength(3);
    for (const ram of TERRITORY_SIEGE_RAM_FORMATION) {
      expect(Math.hypot(ram.x, ram.z - TERRITORY_SIEGE_GATE_Z)).toBeCloseTo(9.5, 8);
      expect(ram.yaw).toBeCloseTo(Math.atan2(ram.x, ram.z - TERRITORY_SIEGE_GATE_Z), 8);
    }
    for (let index = 1; index < TERRITORY_SIEGE_RAM_FORMATION.length; index += 1) {
      const previous = TERRITORY_SIEGE_RAM_FORMATION[index - 1];
      const current = TERRITORY_SIEGE_RAM_FORMATION[index];
      expect(Math.hypot(current.x - previous.x, current.z - previous.z)).toBeGreaterThan(
        TERRITORY_SIEGE_RAM_COLLIDER_RADIUS * 2,
      );
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
    expect(territorySiegeMortarPlacementAllowed(0, -18, [{ x: 1, z: -18 }])).toBe(false);
    expect(territorySiegeMortarPlacementAllowed(0, -18, [], [{ x: 1, z: -18 }])).toBe(false);
    expect(territorySiegeMortarPlacementAllowed(0, -18, [], [], [{ x: 1, z: -18 }])).toBe(false);
    const wall = territorySiegeWallSegmentPlacements()['back:3'];
    expect(territorySiegeMortarPlacementAllowed(wall.x, wall.z, [])).toBe(false);
    expect(TERRITORY_SIEGE_MORTAR_RANGE).toBeGreaterThan(50);
    expect(TERRITORY_SIEGE_MORTAR_RANGE).toBeLessThan(TERRITORY_SIEGE_FIELD_HALF_Z * 2);
  });

  it('deploys catapults at clear free positions with the player facing', () => {
    expect(territorySiegeCatapultDeployPlacement('attacker', 20, 52, 1.25)).toEqual({
      x: 20,
      z: 52,
      yaw: 1.25,
      side: 'attacker',
    });
    expect(territorySiegeCatapultPlacementAllowed(20, 52, [])).toBe(true);
    expect(territorySiegeCatapultPlacementAllowed(20, 52, [{ x: 21, z: 52 }])).toBe(false);
    expect(territorySiegeCatapultPlacementAllowed(0, 18, [])).toBe(false);
    const wall = territorySiegeWallSegmentPlacements()['left:3'];
    expect(territorySiegeCatapultPlacementAllowed(wall.x, wall.z, [])).toBe(false);
    expect(
      territorySiegeCatapultPlacementAllowed(TERRITORY_SIEGE_TOWER_X, TERRITORY_SIEGE_GATE_Z, []),
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
    ).toEqual({ x: insideX, z });
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
        const overlapX = Math.min(a.x + a.hx, b.x + b.hx) - Math.max(a.x - a.hx, b.x - b.hx);
        const overlapZ = Math.min(a.z + a.hz, b.z + b.hz) - Math.max(a.z - a.hz, b.z - b.hz);
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
    const blocked = clampTerritorySiegeGate(0, false, origin.z + 23, origin.x, origin.z + 15, 0.6);
    expect(blocked.z).toBeGreaterThan(origin.z + 18);
    expect(clampTerritorySiegeGate(0, true, origin.z + 23, origin.x, origin.z + 15, 0.6).z).toBe(
      origin.z + 15,
    );
  });

  it('authoritatively seals both sides of a closed gate after reconciliation', () => {
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
    expect(defender.z).toBeLessThan(origin.z + TERRITORY_SIEGE_GATE_Z);
    expect(sealTerritorySiegeGateForSide(0, 'attacker', true, origin.x, origin.z + 10, 0.5).z).toBe(
      origin.z + 10,
    );
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
      sealTerritorySiegeGateForSide(0, 'attacker', false, origin.x, origin.z + 10, 0.5, true).z,
    ).toBe(origin.z + 10);
  });

  it('blocks projectile segments through the gate leaf until it opens', () => {
    const origin = territorySiegeOrigin(0);
    const outside = { x: origin.x, z: origin.z + TERRITORY_SIEGE_GATE_Z + 8 };
    const courtyard = { x: origin.x, z: origin.z + TERRITORY_SIEGE_GATE_Z - 8 };
    expect(territorySiegeProjectilePathClear(0, false, outside, courtyard)).toBe(false);
    expect(territorySiegeProjectilePathClear(0, true, outside, courtyard)).toBe(true);
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
    const frontWallInnerEdges = territorySiegeWallPlacements().flatMap((wall) =>
      wall.run === 'front_left' || wall.run === 'front_right'
        ? [Math.abs(wall.x) - wall.scaleX]
        : [],
    );
    expect(Math.min(...frontWallInnerEdges)).toBeCloseTo(TERRITORY_SIEGE_GATE_HALF_WIDTH);
    expect(TERRITORY_SIEGE_GATE_HALF_WIDTH).toBe(10);
  });

  it('gives each defense tower a radius that covers the gate approach but not spawn', () => {
    const origin = territorySiegeOrigin(0);
    const towers = territorySiegeTowerPositions(0);
    expect(towers).toHaveLength(2);
    expect(TERRITORY_SIEGE_TOWER_RANGE).toBeGreaterThan(TERRITORY_SIEGE_TOWER_X);
    for (const tower of towers) {
      expect(
        Math.hypot(tower.x - origin.x, tower.z - (origin.z + TERRITORY_SIEGE_GATE_Z)),
      ).toBeLessThan(TERRITORY_SIEGE_TOWER_RANGE);
    }
    expect(territorySiegeInTowerRange(0, origin.x, origin.z + TERRITORY_SIEGE_GATE_Z)).toBe(true);
    expect(territorySiegeInTowerRange(0, origin.x, origin.z + 50)).toBe(true);
    expect(territorySiegeInTowerRange(0, origin.x, origin.z + 96)).toBe(false);
  });

  it('moves a nearby defender across the front wall but rejects distant use', () => {
    expect(
      territorySiegeDefenderPortalDestination(
        TERRITORY_SIEGE_DEFENDER_PORTAL_X,
        TERRITORY_SIEGE_DEFENDER_PORTAL_Z + 1,
      ),
    ).toEqual({
      x: TERRITORY_SIEGE_DEFENDER_PORTAL_X,
      z: TERRITORY_SIEGE_DEFENDER_PORTAL_Z - 4.25,
    });
    expect(territorySiegeDefenderPortalDestination(30, 30)).toBeNull();
  });
});
