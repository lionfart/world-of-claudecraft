import { DUNGEON_FLOOR_Y, isTerritorySiegePos, territorySiegeOriginAt } from '../sim/data';
import { territorySiegeGroundLiftForCastleLocal } from '../sim/territory_siege_ground';

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
