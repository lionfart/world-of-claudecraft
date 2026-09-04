import { playerAttackResolution } from '../../../sim/combat/directional_attack';
import type { AbilityDef, AbilityEffect, Entity } from '../../../sim/types';
import { MELEE_RANGE } from '../../../sim/types';
import { isSelfOnlyAbility } from './ability_self_only';

export interface AimPoint {
  x: number;
  z: number;
}

export interface GroundAimState {
  activeAbilityId: string | null;
  activeSlot: number | null;
}

export const DEFAULT_GROUND_AOE_RADIUS = 6;

/** Aim-slot sentinel for an ability arranged only on the cross hotbar: no bar
 * slot can equal it, so re-press commit resolves by ability id instead. */
export const XHB_ONLY_AIM_SLOT = -1;

export type AbilityPreviewKind = 'circle' | 'area' | 'meleeCone' | 'directionLine';

/** Visual geometry keyed from the same resolver category the server applies. */
export function abilityPreviewKind(ability: AbilityDef): AbilityPreviewKind {
  const resolution = playerAttackResolution(ability);
  if (resolution === 'meleeCone') return 'meleeCone';
  if (resolution === 'ballisticProjectile' || resolution === 'directionalHitscan') {
    return 'directionLine';
  }
  if (resolution === 'selfArea') return 'area';
  return 'circle';
}

/** Melee follows character facing; ranged guides follow the live combat aim. */
export function abilityPreviewAngle(
  kind: AbilityPreviewKind,
  caster: Pick<Entity, 'pos' | 'facing'>,
  aim: AimPoint | null,
): number {
  if (kind === 'meleeCone' || !aim) return caster.facing;
  const dx = aim.x - caster.pos.x;
  const dz = aim.z - caster.pos.z;
  return Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : caster.facing;
}

/** Touch uses the dedicated precise-targeting preference. Desktop remains
 * governed by the player's ground-reticle preference. */
export function shouldUseGroundAim(
  mobileTouch: boolean,
  desktopPreference: boolean,
  touchPrecise: boolean,
): boolean {
  return mobileTouch ? touchPrecise : desktopPreference;
}

/** Desktop combat skills enter a confirmable prepared state. Touch keeps its
 * existing direct-cast controls, apart from authored ground placement. */
export function shouldPrepareAbility(
  ability: AbilityDef,
  mobileTouch: boolean,
  groundPlacementEnabled: boolean,
): boolean {
  // A spell whose only meaningful origin is the caster has nothing for a
  // second press to choose. This covers authored self buffs and hostile
  // player-centred areas (plus special targetless actions such as conjures),
  // while friendly/entity, melee and directional ranged abilities remain
  // confirmable below.
  if (isSelfOnlyAbility(ability) || playerAttackResolution(ability) === 'selfArea') return false;
  if (mobileTouch) {
    return ability.targetMode === 'position' && !ability.selfCentered && groundPlacementEnabled;
  }
  if (ability.targetMode === 'position' && !ability.selfCentered) {
    return groundPlacementEnabled;
  }
  return true;
}

export function createGroundAimState(): GroundAimState {
  return { activeAbilityId: null, activeSlot: null };
}

export function enterGroundAim(
  state: GroundAimState,
  abilityId: string,
  slot: number,
): GroundAimState {
  return { ...state, activeAbilityId: abilityId, activeSlot: slot };
}

export function cancelGroundAim(state: GroundAimState): GroundAimState {
  if (state.activeAbilityId === null && state.activeSlot === null) return state;
  return { ...state, activeAbilityId: null, activeSlot: null };
}

export function commitGroundAim(state: GroundAimState): {
  state: GroundAimState;
  abilityId: string | null;
} {
  const abilityId = state.activeAbilityId;
  return { state: cancelGroundAim(state), abilityId };
}

export function clampAimToRange(
  caster: Pick<Entity, 'pos'>,
  point: AimPoint,
  range: number,
): {
  point: AimPoint;
  clamped: boolean;
} {
  const maxRange = range > 0 ? range : 5;
  const dx = point.x - caster.pos.x;
  const dz = point.z - caster.pos.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxRange || d === 0) return { point: { x: point.x, z: point.z }, clamped: false };
  return {
    point: {
      x: caster.pos.x + (dx / d) * maxRange,
      z: caster.pos.z + (dz / d) * maxRange,
    },
    clamped: true,
  };
}

export function smartSeedPoint(
  caster: Pick<Entity, 'pos' | 'facing'>,
  targetPoint: AimPoint | null,
  range: number,
): AimPoint {
  if (targetPoint) return clampAimToRange(caster, targetPoint, range).point;
  const effectiveRange = range > 0 ? range : 5;
  const distance = effectiveRange / 2;
  return {
    x: caster.pos.x + Math.sin(caster.facing) * distance,
    z: caster.pos.z + Math.cos(caster.facing) * distance,
  };
}

/** The point a QUICK (no-reticle) cast submits. */
export function quickAimPoint(
  caster: Pick<Entity, 'pos' | 'facing'>,
  targetPoint: AimPoint | null,
  classicPoint: AimPoint,
  range: number,
  minRange: number | undefined,
  preferSeed = false,
): AimPoint {
  const preferred = preferSeed ? smartSeedPoint(caster, targetPoint, range) : classicPoint;
  if (!withinMinRange(caster, preferred, minRange)) return preferred;
  const seed = smartSeedPoint(caster, targetPoint, range);
  if (!withinMinRange(caster, seed, minRange)) return seed;
  const effectiveRange = range > 0 ? range : 5;
  const distance = Math.min(Math.max(effectiveRange / 2, (minRange ?? 0) + 0.5), effectiveRange);
  return {
    x: caster.pos.x + Math.sin(caster.facing) * distance,
    z: caster.pos.z + Math.cos(caster.facing) * distance,
  };
}

export function withinMinRange(
  caster: Pick<Entity, 'pos'>,
  point: AimPoint,
  minRange: number | undefined,
): boolean {
  return !!minRange && Math.hypot(point.x - caster.pos.x, point.z - caster.pos.z) < minRange;
}

export function abilityAoeRadius(res: {
  def?: Pick<AbilityDef, 'impactArea'>;
  effects: readonly AbilityEffect[];
}): number {
  return explicitAbilityAoeRadius(res) ?? DEFAULT_GROUND_AOE_RADIUS;
}

/** Radius of a genuine impact/placement area. A direct strike or projectile
 * deliberately returns null: its prepared state still paints the range/aim
 * guide, but must not masquerade as a six-yard ground spell. */
export function abilityGroundAreaRadius(res: {
  def: Pick<AbilityDef, 'targetMode' | 'selfCentered' | 'impactArea'>;
  effects: readonly AbilityEffect[];
}): number | null {
  const authored = explicitAbilityAoeRadius(res);
  if (authored !== null) return authored;
  return res.def.targetMode === 'position' && !res.def.selfCentered
    ? DEFAULT_GROUND_AOE_RADIUS
    : null;
}

export function explicitAbilityAoeRadius(res: {
  def?: Pick<AbilityDef, 'impactArea'>;
  effects: readonly AbilityEffect[];
}): number | null {
  if (res.def?.impactArea) return res.def.impactArea.radius;
  const effect = res.effects.find(
    (eff) =>
      eff.type === 'aoeDamage' || eff.type === 'groundAoE' || eff.type === 'temporalHourglass',
  );
  if (effect?.type === 'temporalHourglass') return effect.captureRadius;
  return effect && 'radius' in effect ? effect.radius : null;
}

/** Radius of the player-centered maximum-range guide for a prepared skill. */
export function abilityPreviewRange(res: {
  def: Pick<AbilityDef, 'range' | 'requiresTarget' | 'selfCentered' | 'impactArea'>;
  effects: readonly AbilityEffect[];
}): number {
  if (res.def.range > 0) return res.def.range;
  const authoredArea = explicitAbilityAoeRadius(res);
  if (authoredArea !== null) return authoredArea;
  return res.def.requiresTarget ? MELEE_RANGE : 0;
}
