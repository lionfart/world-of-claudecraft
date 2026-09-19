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
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X,
  TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
  TERRITORY_SIEGE_CITADEL_WALL_WALKS,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_BACK_Z,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH,
  TERRITORY_SIEGE_CITADEL_WALL_WALK_X,
  TERRITORY_SIEGE_STONE_LANE_HEIGHT,
  territorySiegeGroundLiftForCastleLocal,
  territorySiegeTerrainLiftLocal,
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

  it('provides a compact inner stair and two reachable outer-wall walks', () => {
    const rampBottom = territorySiegeGroundLiftForCastleLocal(
      0,
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
      4,
    );
    const rampMiddle = territorySiegeGroundLiftForCastleLocal(
      0,
      (TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z +
        TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z) /
        2,
      4,
    );
    const rampTop = territorySiegeGroundLiftForCastleLocal(
      0,
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
      4,
    );
    expect(rampBottom).toBeLessThan(rampMiddle);
    expect(rampMiddle).toBeLessThan(rampTop);
    expect(rampTop).toBe(TERRITORY_SIEGE_CITADEL_INNER_HEIGHT);
    expect(
      territorySiegeGroundLiftForCastleLocal(
        -TERRITORY_SIEGE_CITADEL_WALL_WALK_X,
        -43,
        4,
      ),
    ).toBe(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
    expect(
      territorySiegeGroundLiftForCastleLocal(
        TERRITORY_SIEGE_CITADEL_WALL_WALK_X,
        -43,
        4,
      ),
    ).toBe(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
    const rearWalk = TERRITORY_SIEGE_CITADEL_WALL_WALKS.find(
      (walk) => walk.id === 'back',
    );
    const frontWalk = TERRITORY_SIEGE_CITADEL_WALL_WALKS.find(
      (walk) => walk.id === 'front_left',
    );
    if (!rearWalk || !frontWalk)
      throw new Error('complete outer wall walk missing');
    expect(
      territorySiegeGroundLiftForCastleLocal(rearWalk.x, rearWalk.z, 4),
    ).toBe(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
    expect(
      territorySiegeGroundLiftForCastleLocal(frontWalk.x, frontWalk.z, 4),
    ).toBe(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
    expect(
      TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH * 2,
    ).toBeLessThanOrEqual(4.5);
    expect(
      territorySiegeGroundLiftForCastleLocal(
        TERRITORY_SIEGE_CITADEL_WALL_WALK_X -
          TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH +
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
      territorySiegeGroundLiftForCastleLocal(
        0,
        -46,
        4,
        TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
      ),
    ).toBe(TERRITORY_SIEGE_CITADEL_INNER_HEIGHT);
    expect(
      territorySiegeGroundLiftForCastleLocal(
        TERRITORY_SIEGE_CITADEL_WALL_WALK_X,
        -43,
        4,
        0,
      ),
    ).toBe(
      territorySiegeGroundLiftForCastleLocal(
        TERRITORY_SIEGE_CITADEL_WALL_WALK_X,
        -43,
        3,
      ),
    );
    expect(
      territorySiegeGroundLiftForCastleLocal(
        TERRITORY_SIEGE_CITADEL_WALL_WALK_X,
        -43,
        4,
        TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT,
      ),
    ).toBe(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
  });

  it('fits the inner paving and wall walks tightly against their curtains', () => {
    expect(TERRITORY_SIEGE_CITADEL_INNER_HALF_X).toBeGreaterThan(34);
    expect(TERRITORY_SIEGE_CITADEL_INNER_BACK_Z).toBeLessThan(-90);
    expect(TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z).toBeGreaterThan(-22);
    expect(
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z -
        TERRITORY_SIEGE_CITADEL_INNER_BACK_Z,
    ).toBeCloseTo(TERRITORY_SIEGE_CITADEL_INNER_STAIR_JOIN_OVERLAP, 8);
    expect(
      TERRITORY_SIEGE_CITADEL_WALL_WALK_X +
        TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH,
    ).toBeGreaterThanOrEqual(69);
    expect(TERRITORY_SIEGE_CITADEL_WALL_WALK_BACK_Z).toBeLessThanOrEqual(-131);
    expect(
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z -
        TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
    ).toBeLessThan(11);
    expect(territorySiegeTerrainLiftLocal(0, -125)).toBe(0);
    expect(territorySiegeTerrainLiftLocal(65, -120)).toBe(0);
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
      (TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z +
        TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z) /
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

    expect(
      resolveTerritorySiegeCitadelElevationTransitionLocal(
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X,
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X,
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
        4,
      ),
    ).toEqual({
      x: TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X,
      z: TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
    });

    const wallRampMidX =
      (TERRITORY_SIEGE_CITADEL_WALL_STAIR_BOTTOM_X +
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_TOP_X) /
      2;
    const blockedRampSide =
      resolveTerritorySiegeCitadelElevationTransitionLocal(
        wallRampMidX,
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z +
          TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH +
          2,
        wallRampMidX,
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z,
        4,
        0,
      );
    expect(blockedRampSide.z).toBeGreaterThan(
      TERRITORY_SIEGE_CITADEL_WALL_STAIR_Z +
        TERRITORY_SIEGE_CITADEL_WALL_STAIR_HALF_WIDTH,
    );

    const underWallWalk = resolveTerritorySiegeCitadelElevationTransitionLocal(
      TERRITORY_SIEGE_CITADEL_WALL_WALK_X -
        TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH -
        2,
      -43,
      TERRITORY_SIEGE_CITADEL_WALL_WALK_X +
        TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH +
        2,
      -43,
      4,
      0,
    );
    expect(underWallWalk.x).toBeCloseTo(
      TERRITORY_SIEGE_CITADEL_WALL_WALK_X +
        TERRITORY_SIEGE_CITADEL_WALL_WALK_HALF_WIDTH +
        2,
    );
    expect(
      territorySiegeGroundLiftForCastleLocal(
        TERRITORY_SIEGE_CITADEL_WALL_WALK_X,
        underWallWalk.z,
        4,
        0,
      ),
    ).toBeLessThan(TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
  });
});
