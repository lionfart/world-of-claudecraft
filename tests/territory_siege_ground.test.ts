import { describe, expect, it } from 'vitest';
import { DUNGEON_FLOOR_Y, territorySiegeOrigin } from '../src/sim/data';
import {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  territorySiegeGroundLiftLocal,
} from '../src/sim/territory_siege_ground';
import { groundHeight } from '../src/sim/world';

describe('territory siege shared ground', () => {
  it('adds restrained natural relief without unsafe cliffs', () => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let z = -TERRITORY_SIEGE_FIELD_HALF_Z; z <= TERRITORY_SIEGE_FIELD_HALF_Z; z += 2) {
      for (let x = -TERRITORY_SIEGE_FIELD_HALF_X; x <= TERRITORY_SIEGE_FIELD_HALF_X; x += 2) {
        const height = territorySiegeGroundLiftLocal(x, z);
        minimum = Math.min(minimum, height);
        maximum = Math.max(maximum, height);
      }
    }
    expect(minimum).toBeGreaterThanOrEqual(-0.28);
    expect(maximum).toBeLessThanOrEqual(0.62);
    expect(maximum - minimum).toBeGreaterThan(0.45);
  });

  it('keeps the assault road, courtyard and arena edge level', () => {
    for (const point of [
      { x: 0, z: 96 },
      { x: 5, z: 48 },
      { x: 0, z: -42 },
      { x: 30, z: -24 },
      { x: TERRITORY_SIEGE_FIELD_HALF_X, z: 0 },
      { x: 0, z: TERRITORY_SIEGE_FIELD_HALF_Z },
    ]) {
      expect(territorySiegeGroundLiftLocal(point.x, point.z)).toBeCloseTo(0, 5);
    }
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
