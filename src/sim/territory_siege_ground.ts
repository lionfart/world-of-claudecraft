export const TERRITORY_SIEGE_FIELD_HALF_X = 160;
export const TERRITORY_SIEGE_FIELD_HALF_Z = 220;
/** Extra rendered terrain behind the impassable mountain ring hides the arena seam. */
export const TERRITORY_SIEGE_VISUAL_MARGIN = 64;
export const TERRITORY_SIEGE_STONE_LANE_HEIGHT = 0.072;
export const TERRITORY_SIEGE_CITADEL_INNER_HEIGHT = 2.4;
export const TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT = 5.45;
/** Raised inner ward fitted just inside the level-four inner curtain. */
export const TERRITORY_SIEGE_CITADEL_INNER_HALF_X = 27.1;
export const TERRITORY_SIEGE_CITADEL_INNER_BACK_Z = -65.1;
export const TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z = -22.9;
/** The central stair is the only walkable transition onto the raised ward. */
export const TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH = 3.75;
/**
 * The walled stair asset's parapets occupy the outer 1.5 yards on each side
 * after scaling. Keep the full visual width for placement, but expose the
 * actual clear tread width separately so collision follows the parapet faces.
 */
export const TERRITORY_SIEGE_CITADEL_INNER_STAIR_CLEAR_HALF_WIDTH = 2.25;
/** A small physical overlap hides the join between the top landing and ward. */
export const TERRITORY_SIEGE_CITADEL_INNER_STAIR_JOIN_OVERLAP = 0.45;
export const TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z =
  TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z -
  TERRITORY_SIEGE_CITADEL_INNER_STAIR_JOIN_OVERLAP;
export const TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z = -11.1;
/** Wall walks overlap the outer curtain instead of floating beside it. */
export const TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X = 39.7;
export const TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH = 3.4;
export const TERRITORY_SIEGE_CITADEL_WALL_ACCESS_BACK_Z = -71.1;
export const TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z = -17.8;
export const TERRITORY_SIEGE_CITADEL_WALL_ACCESS_BOTTOM_Z = -1.8;
export const TERRITORY_SIEGE_CITADEL_MAX_UP_STEP = 0.42;

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Shared, deliberately gentle siege heightfield. The assault road and castle
 * courtyard stay level for objective readability while the outer flanks roll
 * enough to catch light and stop reading as a flat debug plane.
 */
export function territorySiegeTerrainLiftLocal(x: number, z: number): number {
  const edgeDistance = Math.min(
    TERRITORY_SIEGE_FIELD_HALF_X - Math.abs(x),
    TERRITORY_SIEGE_FIELD_HALF_Z - Math.abs(z),
  );
  if (edgeDistance <= -TERRITORY_SIEGE_VISUAL_MARGIN) return 0;

  const edgeFade = smoothstep(0, 12, edgeDistance);
  const assaultRoadFade = z > 14 ? smoothstep(8, 20, Math.abs(x)) : 1;
  const castleX = 1 - smoothstep(42, 50, Math.abs(x));
  const castleZ = smoothstep(-79, -71, z) * (1 - smoothstep(17, 25, z));
  const castleFade = 1 - castleX * castleZ;
  const mask = edgeFade * assaultRoadFade * castleFade;

  const broad = Math.sin(x * 0.046 + z * 0.021) * 0.48;
  const cross = Math.sin(z * 0.071 - x * 0.033 + 1.7) * 0.31;
  const ridge = Math.sin((x + z) * 0.039 - 0.8) * 0.2;
  const detail = Math.sin(x * 0.13 - z * 0.11 + 2.4) * 0.08;
  const gentle = Math.max(
    -0.48,
    Math.min(1.18, (0.24 + broad + cross + ridge + detail) * mask),
  );
  const ridgeInside = 1 - smoothstep(10, 38, edgeDistance);
  const ridgeOutside =
    1 - smoothstep(0, TERRITORY_SIEGE_VISUAL_MARGIN, -edgeDistance);
  const boundaryMask = edgeDistance >= 0 ? ridgeInside : ridgeOutside;
  // One continuous heightfield ridge replaces the old row of enlarged rock
  // props. Broad frequencies shape long shoulders while the rectified crest
  // term varies the skyline without breaking it into repeated round lumps.
  const longShoulder = Math.sin(x * 0.021 + z * 0.013 + 0.4) * 3.6;
  const crossShoulder = Math.sin(z * 0.034 - x * 0.018 + 1.7) * 2.7;
  const crest = Math.max(0, Math.sin(x * 0.061 + z * 0.047 - 0.9)) * 4.8;
  const mountainNoise = 19.5 + longShoulder + crossShoulder + crest;
  return gentle + Math.max(0, mountainNoise * boundaryMask);
}

/**
 * The castle's stone modules are deliberately flattened to a seven-centimetre
 * profile. This matching walk surface keeps feet on the paving instead of
 * letting characters sink through its decorative mesh.
 */
export function territorySiegeStoneLaneLiftLocal(x: number, z: number): number {
  const vertical =
    z >= -69 && z <= 17 ? 1 - smoothstep(3.55, 4.05, Math.abs(x)) : 0;
  const horizontal =
    x >= -38 && x <= 38 ? 1 - smoothstep(3.55, 4.05, Math.abs(z + 24)) : 0;
  return Math.max(vertical, horizontal) * TERRITORY_SIEGE_STONE_LANE_HEIGHT;
}

function insideRange(value: number, minimum: number, maximum: number): boolean {
  return value >= minimum && value <= maximum;
}

function territorySiegeCitadelWallWalkContainsLocal(
  x: number,
  z: number,
): boolean {
  const absoluteX = Math.abs(x);
  return (
    insideRange(
      absoluteX,
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X -
        TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH,
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X +
        TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH,
    ) &&
    insideRange(
      z,
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_BACK_Z,
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z,
    )
  );
}

/**
 * Level-four traversal surface. The rear inner ward is a raised platform with
 * a broad central ramp. Two side ramps reach a continuous walk along the
 * inside edge of the outer side and rear curtains, clear of the destructible
 * wall footprints so the ordinary swept wall solver stays authoritative.
 */
export function territorySiegeCitadelLiftLocal(x: number, z: number): number {
  let lift = 0;
  if (
    Math.abs(x) <= TERRITORY_SIEGE_CITADEL_INNER_HALF_X &&
    insideRange(
      z,
      TERRITORY_SIEGE_CITADEL_INNER_BACK_Z,
      TERRITORY_SIEGE_CITADEL_INNER_FRONT_Z,
    )
  ) {
    lift = TERRITORY_SIEGE_CITADEL_INNER_HEIGHT;
  }
  if (
    Math.abs(x) <= TERRITORY_SIEGE_CITADEL_INNER_STAIR_HALF_WIDTH &&
    insideRange(
      z,
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z,
      TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z,
    )
  ) {
    const progress = Math.max(
      0,
      Math.min(
        1,
        (TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z - z) /
          (TERRITORY_SIEGE_CITADEL_INNER_STAIR_BOTTOM_Z -
            TERRITORY_SIEGE_CITADEL_INNER_STAIR_TOP_Z),
      ),
    );
    lift = Math.max(lift, progress * TERRITORY_SIEGE_CITADEL_INNER_HEIGHT);
  }

  const absoluteX = Math.abs(x);
  const accessMinimumX =
    TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X -
    TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH;
  const accessMaximumX =
    TERRITORY_SIEGE_CITADEL_WALL_ACCESS_X +
    TERRITORY_SIEGE_CITADEL_WALL_ACCESS_HALF_WIDTH;
  // The playable deck is broad enough for two characters to pass and remains
  // between the inner curtain and the outer wall collider.
  const onSideWalk = territorySiegeCitadelWallWalkContainsLocal(x, z);
  if (onSideWalk) lift = TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT;

  if (
    insideRange(absoluteX, accessMinimumX, accessMaximumX) &&
    insideRange(
      z,
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z,
      TERRITORY_SIEGE_CITADEL_WALL_ACCESS_BOTTOM_Z,
    )
  ) {
    const progress = Math.max(
      0,
      Math.min(
        1,
        (TERRITORY_SIEGE_CITADEL_WALL_ACCESS_BOTTOM_Z - z) /
          (TERRITORY_SIEGE_CITADEL_WALL_ACCESS_BOTTOM_Z -
            TERRITORY_SIEGE_CITADEL_WALL_ACCESS_TOP_Z),
      ),
    );
    lift = Math.max(lift, progress * TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT);
  }
  return lift;
}

/**
 * Rejects a movement segment that climbs a vertical ledge. Legitimate stair
 * travel changes height gradually; walking into the side of a ramp, inner ward
 * or wall walk creates a discontinuity and stops at the last valid sample.
 */
export function resolveTerritorySiegeCitadelElevationTransitionLocal(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  castleLevel: number,
  fromFeetY?: number,
): { x: number; z: number } {
  if (castleLevel < 4) return { x: toX, z: toZ };
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-6) return { x: toX, z: toZ };
  const steps = Math.max(1, Math.ceil(distance / 0.15));
  let current = { x: fromX, z: fromZ };
  // A body beneath a platform must remain on the lower navigation layer.
  // Reading only the authored X/Z surface here treats that body as already on
  // top and lets the next vertical pass snap it upward. Live callers therefore
  // provide the actual feet height; the geometric fallback keeps pure layout
  // tools and older callers deterministic.
  let currentLift =
    typeof fromFeetY === 'number' && Number.isFinite(fromFeetY)
      ? fromFeetY
      : territorySiegeCitadelLiftLocal(fromX, fromZ);
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const next = { x: fromX + dx * progress, z: fromZ + dz * progress };
    const nextLift = territorySiegeCitadelLiftLocal(next.x, next.z);
    const belowWallWalk =
      currentLift + TERRITORY_SIEGE_CITADEL_MAX_UP_STEP <
        TERRITORY_SIEGE_CITADEL_WALL_WALK_HEIGHT &&
      territorySiegeCitadelWallWalkContainsLocal(next.x, next.z);
    if (
      nextLift - currentLift > TERRITORY_SIEGE_CITADEL_MAX_UP_STEP &&
      !belowWallWalk
    )
      return current;
    current = next;
    if (!belowWallWalk) currentLift = nextLift;
  }
  return current;
}

/** Castle-aware authoritative player surface for a siege slot. */
export function territorySiegeGroundLiftForCastleLocal(
  x: number,
  z: number,
  castleLevel: number,
  feetY?: number,
): number {
  const base = territorySiegeGroundLiftLocal(x, z);
  if (castleLevel < 4) return base;
  const citadel = territorySiegeCitadelLiftLocal(x, z);
  if (feetY === undefined || !Number.isFinite(feetY))
    return Math.max(base, citadel);
  // Runtime movement may adopt a raised surface only when it is no more than
  // one authored stair step above the character's current feet. This preserves
  // gradual stair travel but makes the upper face of a ramp, wall walk or inner
  // ward invisible to support/landing while the character is underneath it.
  return citadel <= feetY + TERRITORY_SIEGE_CITADEL_MAX_UP_STEP
    ? Math.max(base, citadel)
    : base;
}

/** Authoritative player surface, including the low castle paving. */
export function territorySiegeGroundLiftLocal(x: number, z: number): number {
  return Math.max(
    territorySiegeTerrainLiftLocal(x, z),
    territorySiegeStoneLaneLiftLocal(x, z),
  );
}
