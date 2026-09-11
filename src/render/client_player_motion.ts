import { moverHeight, resolveMovement } from '../sim/colliders';
import { DUNGEON_FLOOR_Y, isTerritorySiegePos, territorySiegeOriginAt } from '../sim/data';
import { moveSpeedMult, type PlayerMotionDeps } from '../sim/player_motion';
import { resolveTerritorySiegeTeamMovement, type TerritorySimTeam } from '../sim/territory_local';
import { territorySiegeGroundLiftForCastleLocal } from '../sim/territory_siege_ground';
import type { Entity } from '../sim/types';
import { groundHeight } from '../sim/world';
import type { TerritoryMapState, TerritorySiegeView } from '../world_api';

function territoryControlForView(siege: TerritorySiegeView): TerritorySimTeam['control'] {
  if (siege.controlledRamId != null) return { kind: 'ram', ramId: siege.controlledRamId };
  if (siege.controlledMortarId != null)
    return { kind: 'mortar', mortarId: siege.controlledMortarId };
  if (siege.controlledCatapultId != null)
    return { kind: 'catapult', catapultId: siege.controlledCatapultId };
  return siege.coreChanneling ? { kind: 'core_channel' } : null;
}

function territoryTeamForPrediction(
  state: TerritoryMapState | null,
  z: number,
): TerritorySimTeam | null {
  const capture = state?.capture;
  if (capture?.inField) {
    return {
      warId: capture.id,
      side: 'attacker',
      slot: capture.slot,
      capture: true,
      gateOpen: true,
      control: null,
    };
  }
  const siege = state?.siege;
  if (!siege) return null;
  return {
    warId: siege.warId,
    side: siege.mySide,
    slot: territorySiegeOriginAt(z).slot,
    castleLevel: siege.castleLevel,
    gateOpen: siege.gateOpen,
    control: territoryControlForView(siege),
    rams: siege.rams,
    mortars: siege.mortars,
    catapults: siege.catapults,
    wallHealth: siege.wallHealth,
    towerHealth: siege.towerHealth,
  };
}

export function createClientPlayerMotionDeps(
  seed: number,
  speedMult: (entity: Entity) => number = (entity) => moveSpeedMult(entity, 0),
  riftCollisionToken = 0,
  territoryState: () => TerritoryMapState | null = () => null,
): PlayerMotionDeps {
  return {
    seed,
    groundHeightAt: (_entity, x, z) => {
      const base = groundHeight(x, z, seed);
      if (!isTerritorySiegePos(x)) return base;
      const team = territoryTeamForPrediction(territoryState(), z);
      if (!team || (team.castleLevel ?? 1) < 4) return base;
      const origin = territorySiegeOriginAt(z);
      return (
        DUNGEON_FLOOR_Y +
        territorySiegeGroundLiftForCastleLocal(
          x - origin.x,
          z - origin.z,
          team.castleLevel ?? 1,
          _entity.pos.y - DUNGEON_FLOOR_Y,
        )
      );
    },
    moveSpeedMult: speedMult,
    resolveMove: (fromX, fromZ, nx, nz, radius, entity, ignoreFences) => {
      const resolved = resolveMovement(
        seed,
        fromX,
        fromZ,
        nx,
        nz,
        radius,
        ignoreFences,
        undefined,
        moverHeight(entity),
        riftCollisionToken,
      );
      if (!isTerritorySiegePos(fromX) && !isTerritorySiegePos(resolved.x)) return resolved;
      const team = territoryTeamForPrediction(territoryState(), fromZ);
      return team
        ? resolveTerritorySiegeTeamMovement(
            team,
            fromX,
            fromZ,
            resolved,
            radius,
            entity.pos.y - DUNGEON_FLOOR_Y,
          )
        : resolved;
    },
    resolvedAbility: () => null,
    cancelCast: () => {},
    standUp: () => {},
    dealDamage: () => {},
  };
}
