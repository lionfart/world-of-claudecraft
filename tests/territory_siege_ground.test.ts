import { describe, expect, it } from 'vitest';
import { DUNGEON_FLOOR_Y, territorySiegeOrigin } from '../src/sim/data';
import {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  TERRITORY_SIEGE_STONE_LANE_HEIGHT,
  territorySiegeGroundLiftLocal,
  territorySiegeStoneLaneLiftLocal,
  territorySiegeTerrainLiftLocal,
} from '../src/sim/territory_siege_ground';
import { groundHeight } from '../src/sim/world';

describe('territory siege shared ground', () => {
  it('keeps the playable interior gently rolling while reserving cliffs for the boundary', () => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (
      let z = -TERRITORY_SIEGE_FIELD_HALF_Z + 40;
      z <= TERRITORY_SIEGE_FIELD_HALF_Z - 40;
      z += 2
    ) {
      for (
        let x = -TERRITORY_SIEGE_FIELD_HALF_X + 40;
        x <= TERRITORY_SIEGE_FIELD_HALF_X - 40;
        x += 2
      ) {
        const height = territorySiegeGroundLiftLocal(x, z);
        minimum = Math.min(minimum, height);
        maximum = Math.max(maximum, height);
      }
    }
    expect(minimum).toBeGreaterThanOrEqual(-0.48);
    expect(maximum).toBeLessThanOrEqual(1.18);
    expect(maximum - minimum).toBeGreaterThan(0.9);
  });

  it('keeps the assault road and courtyard level', () => {
    for (const point of [
      { x: 0, z: 178 },
      { x: 5, z: 48 },
      { x: 0, z: -42 },
      { x: 30, z: -24 },
    ]) {
      expect(territorySiegeTerrainLiftLocal(point.x, point.z)).toBeCloseTo(0, 5);
    }
  });

  it('raises a natural ridge before the impassable arena boundary', () => {
    const side = territorySiegeTerrainLiftLocal(TERRITORY_SIEGE_FIELD_HALF_X - 20, 0);
    const end = territorySiegeTerrainLiftLocal(0, TERRITORY_SIEGE_FIELD_HALF_Z);
    expect(side).toBeGreaterThan(8);
    expect(end).toBeGreaterThan(14);
    expect(Math.abs(side - end)).toBeGreaterThan(1);
  });

  it('matches the flattened castle paving with a low authoritative walk surface', () => {
    expect(territorySiegeStoneLaneLiftLocal(0, -42)).toBeCloseTo(
      TERRITORY_SIEGE_STONE_LANE_HEIGHT,
      6,
    );
    expect(territorySiegeStoneLaneLiftLocal(30, -24)).toBeCloseTo(
      TERRITORY_SIEGE_STONE_LANE_HEIGHT,
      6,
    );
    expect(territorySiegeGroundLiftLocal(0, -42)).toBeCloseTo(TERRITORY_SIEGE_STONE_LANE_HEIGHT, 6);
    expect(territorySiegeStoneLaneLiftLocal(8, -42)).toBe(0);
  });

  it('feeds the same relief into authoritative world height sampling', () => {
    const origin = territorySiegeOrigin(0);
    for (const point of [
      { x: 58, z: 67 },
      { x: -63, z: -8 },
      { x: 0, z: 96 },
    ]) {
      expect(groundHeight(origin.x + point.x, origin.z + point.z, 123)).toBeCloseTo(
        DUNGEON_FLOOR_Y + territorySiegeGroundLiftLocal(point.x, point.z),
        6,
      );
    }
  });
});
