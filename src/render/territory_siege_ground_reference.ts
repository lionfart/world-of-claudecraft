import { DUNGEON_FLOOR_Y, isTerritorySiegePos, territorySiegeOriginAt } from '../sim/data';
import { territorySiegeGroundLiftForCastleLocal } from '../sim/territory_siege_ground';
import { groundHeight } from '../sim/world';

/** Raised siege floors are not part of the ordinary world terrain sampler. */
export function territorySiegeRaisedGroundHeight(
  x: number,
  z: number,
  castleLevel: number,
): number | null {
  if (castleLevel < 4 || !isTerritorySiegePos(x)) return null;
  const origin = territorySiegeOriginAt(z);
  return (
    DUNGEON_FLOOR_Y +
    territorySiegeGroundLiftForCastleLocal(x - origin.x, z - origin.z, castleLevel)
  );
}

/** Renderer-facing ground truth for ground-bound ability effects. Unlike
 * character traversal this intentionally chooses the visible top surface:
 * projectiles such as Frostglobe may cross a wall, but must never render
 * underneath the raised inner-keep floor. */
export function territoryAwareGroundHeight(
  seed: number,
  castleLevel: number | null | undefined,
  x: number,
  z: number,
): number {
  const raised = territorySiegeRaisedGroundHeight(x, z, castleLevel ?? 1);
  return raised ?? groundHeight(x, z, seed);
}
