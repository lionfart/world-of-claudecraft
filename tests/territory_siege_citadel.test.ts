import { describe, expect, it } from 'vitest';
import {
  resolveTerritorySiegeCitadelElevationTransitionLocal,
  TERRITORY_SIEGE_CITADEL_INNER_BACK_Z,
  TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z,
  TERRITORY_SIEGE_CITADEL_INNER_HALF_X,
  TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_JOIN_OVERLAP,
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
  TERRITORY_SIEGE_CITADEL_WALL_ACCESS_BACK_Z,
  TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z,
  TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT,
  TERRITORY_SIEGE_STONE_LANE_HEIGHT,
  territorySiegeGroundLiftForCastleLocal,
} from '../src/sim/territory_siege_ground';

describe('territory siege level-four citadel traversal', () => {
  it('keeps lower tiers flat while raising the inner ward at level four', () => {
    expect(territorySiegeGroundLiftForCastleLocal(0, -46, 3)).toBe(
      TERRITORY_SIEGE_STONE_LANE_HEIGHT,
    );
    expect(territorySiegeGroundLiftForCastleLocal(0, -46, 4)).toBe(
      TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
    );
  });

  it('provides a broad inner ramp and two reachable outer-wall walks', () => {
    const rampBottom = territorySiegeGroundLiftForCastleLocal(
      0,
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
      4,
    );
    const rampMiddle = territorySiegeGroundLiftForCastleLocal(0, -20, 4);
    const rampTop = territorySiegeGroundLiftForCastleLocal(
      0,
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
      4,
    );
    expect(rampBottom).toBeLessThan(rampMiddle);
    expect(rampMiddle).toBeLessThan(rampTop);
    expect(rampTop).toBe(TERRITORY_SIEGE_CITADEL_INNER_HEIGHT);
    expect(
      territorySiegeGroundLiftForCastleLocal(-TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X, -43, 4),
    ).toBe(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
    expect(
      territorySiegeGroundLiftForCastleLocal(TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X, -43, 4),
    ).toBe(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
    expect(TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH * 2).toBeGreaterThanOrEqual(5.5);
    expect(
      territorySiegeGroundLiftForCastleLocal(
        TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X -
          TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH +
          0.1,
        -43,
        4,
      ),
    ).toBe(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
  });

  it('does not adopt an overhead citadel surface from the lower floor', () => {
    expect(territorySiegeGroundLiftForCastleLocal(0, -46, 4, 0)).toBe(
      TERRITORY_SIEGE_STONE_LANE_HEIGHT,
    );
    expect(
      territorySiegeGroundLiftForCastleLocal(0, -46, 4, TERRITORY_SIEGE_CITADEL_INNER_HEIGHT),
    ).toBe(TERRITORY_SIEGE_CITADEL_INNER_HEIGHT);
    expect(
      territorySiegeGroundLiftForCastleLocal(TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X, -43, 4, 0),
    ).toBe(territorySiegeGroundLiftForCastleLocal(TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X, -43, 3));
    expect(
      territorySiegeGroundLiftForCastleLocal(
        TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X,
        -43,
        4,
        TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT,
      ),
    ).toBe(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
  });

  it('fits the inner paving and wall walks tightly against their curtains', () => {
    expect(TERRITORY_SIEGE_CITADEL_INNER_HALF_X).toBeGreaterThan(26.5);
    expect(TERRITORY_SIEGE_CITADEL_INNER_BACK_Z).toBeLessThan(-64.5);
    expect(TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z).toBeGreaterThan(-23.5);
    expect(
      TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z - TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
    ).toBeCloseTo(TERRITORY_SIEGE_CITADEL_INNER_STAIR_JOIN_OVERLAP, 8);
    expect(
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X + TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH,
    ).toBeGreaterThanOrEqual(42.7);
    expect(TERRITORY_SIEGE_CITADEL_WALL_ACCESS_BACK_Z).toBeLessThanOrEqual(-71);
    expect(TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z).toBeGreaterThanOrEqual(-18);
  });

  it('allows gradual stair travel but rejects climbing a platform from its side', () => {
    expect(
      resolveTerritorySiegeCitadelElevationTransitionLocal(
        0,
        TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
        0,
        TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
        4,
      ),
    ).toEqual({ x: 0, z: TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z });

    const stairMidZ =
      (TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z + TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z) /
      2;
    const blocked = resolveTerritorySiegeCitadelElevationTransitionLocal(
      6,
      stairMidZ,
      0,
      stairMidZ,
      4,
      0,
    );
    expect(blocked.x).toBeGreaterThan(3.75);

    const underWallRamp = resolveTerritorySiegeCitadelElevationTransitionLocal(
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X,
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z + 1.8,
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X,
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z - 1,
      4,
      0,
    );
    expect(underWallRamp.z).toBeGreaterThan(TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z);
  });
});
