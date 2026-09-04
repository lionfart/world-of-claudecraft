import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/data';
import type { AbilityEffect, Entity } from '../src/sim/types';
import {
  abilityAoeRadius,
  abilityGroundAreaRadius,
  abilityPreviewAngle,
  abilityPreviewKind,
  abilityPreviewRange,
  cancelGroundAim,
  clampAimToRange,
  commitGroundAim,
  createGroundAimState,
  DEFAULT_GROUND_AOE_RADIUS,
  enterGroundAim,
  explicitAbilityAoeRadius,
  shouldPrepareAbility,
  shouldUseGroundAim,
  smartSeedPoint,
  withinMinRange,
} from '../src/ui/hud/action_bar/ground_aim';

function casterAt(x: number, z: number): Pick<Entity, 'pos'> {
  return { pos: { x, y: 0, z } };
}

describe('ground_aim', () => {
  it('uses the precise touch preference for every mobile ground cast', () => {
    expect(shouldUseGroundAim(true, false, true)).toBe(true);
    expect(shouldUseGroundAim(true, true, true)).toBe(true);
    expect(shouldUseGroundAim(true, true, false)).toBe(false);
    expect(shouldUseGroundAim(true, false, false)).toBe(false);
  });

  it('keeps desktop ground placement controlled by its preference', () => {
    expect(shouldUseGroundAim(false, true, false)).toBe(true);
    expect(shouldUseGroundAim(false, false, true)).toBe(false);
    expect(shouldUseGroundAim(false, true, false)).toBe(true);
  });

  it('prepares aimed desktop skills while self-only skills cast immediately', () => {
    expect(shouldPrepareAbility(ABILITIES.fireball, false, true)).toBe(true);
    expect(shouldPrepareAbility(ABILITIES.fireball, true, true)).toBe(false);
    expect(shouldPrepareAbility(ABILITIES.flamestrike, true, true)).toBe(true);
    expect(shouldPrepareAbility(ABILITIES.flamestrike, false, false)).toBe(false);
    expect(shouldPrepareAbility(ABILITIES.frost_armor, false, true)).toBe(false);
    expect(shouldPrepareAbility(ABILITIES.arcane_explosion, false, true)).toBe(false);
    expect(shouldPrepareAbility(ABILITIES.conjure_water, false, true)).toBe(false);
  });

  it('passes through points inside range', () => {
    const aim = clampAimToRange(casterAt(10, -4), { x: 16, z: -4 }, 8);
    expect(aim).toEqual({ point: { x: 16, z: -4 }, clamped: false });
  });

  it('clamps beyond range with the same math as the sim cast path', () => {
    const aim = clampAimToRange(casterAt(10, -4), { x: 20, z: 20 }, 13);
    const dx = aim.point.x - 10;
    const dz = aim.point.z + 4;
    expect(aim.clamped).toBe(true);
    expect(Math.hypot(dx, dz)).toBeCloseTo(13, 6);
    expect(aim.point.x).toBeCloseTo(15, 6);
    expect(aim.point.z).toBeCloseTo(8, 6);
  });

  it('clamps a selected target seed to the ability range', () => {
    const seed = smartSeedPoint({ pos: { x: 10, y: 0, z: -4 }, facing: 0 }, { x: 60, z: -4 }, 30);

    expect(seed).toEqual({ x: 40, z: -4 });
  });

  it('seeds halfway forward when no target is selected', () => {
    const seed = smartSeedPoint({ pos: { x: 10, y: 0, z: -4 }, facing: 0 }, null, 30);

    expect(seed).toEqual({ x: 10, z: 11 });
    expect(seed).not.toEqual({ x: 10, z: -4 });
  });

  it('uses a five yard effective range when the authored range is not positive', () => {
    const seed = smartSeedPoint({ pos: { x: 10, y: 0, z: -4 }, facing: 0 }, null, 0);

    expect(seed).toEqual({ x: 10, z: -1.5 });
  });

  it('uses the player motion sin and cos facing basis', () => {
    const facing = Math.PI / 3;
    const seed = smartSeedPoint({ pos: { x: 2, y: 0, z: 5 }, facing }, null, 20);

    expect(seed.x).toBeCloseTo(2 + Math.sin(facing) * 10, 6);
    expect(seed.z).toBeCloseTo(5 + Math.cos(facing) * 10, 6);
  });

  it('recognizes only points inside an authored minimum range', () => {
    const caster = casterAt(10, -4);

    expect(withinMinRange(caster, { x: 13, z: 0 }, 6)).toBe(true);
    expect(withinMinRange(caster, { x: 16, z: -4 }, 6)).toBe(false);
    expect(withinMinRange(caster, { x: 10, z: -4 }, undefined)).toBe(false);
  });

  it('resolves radius from the first aoeDamage, groundAoE, or channel pulse effect', () => {
    const aoeDamage: AbilityEffect[] = [{ type: 'aoeDamage', min: 1, max: 2, radius: 7 }];
    const groundAoE: AbilityEffect[] = [
      { type: 'groundAoE', min: 1, max: 2, radius: 8, duration: 4, interval: 1 },
    ];
    const channelPulse: AbilityEffect[] = [{ type: 'aoeDamage', min: 1, max: 2, radius: 9 }];

    expect(abilityAoeRadius({ effects: aoeDamage })).toBe(7);
    expect(abilityAoeRadius({ effects: groundAoE })).toBe(8);
    expect(abilityAoeRadius({ effects: channelPulse })).toBe(9);
  });

  it('falls back when no area radius is present', () => {
    expect(abilityAoeRadius({ effects: [{ type: 'directDamage', min: 1, max: 2 }] })).toBe(
      DEFAULT_GROUND_AOE_RADIUS,
    );
  });

  it('shows a ground circle only for genuine area-capable abilities', () => {
    expect(
      abilityGroundAreaRadius({ def: ABILITIES.fireball, effects: ABILITIES.fireball.effects }),
    ).toBeNull();
    expect(
      abilityGroundAreaRadius({
        def: ABILITIES.flamestrike,
        effects: ABILITIES.flamestrike.effects,
      }),
    ).toBeGreaterThan(0);
    expect(
      abilityGroundAreaRadius({ def: ABILITIES.meteor, effects: ABILITIES.meteor.effects }),
    ).toBe(8);
  });

  it('builds maximum-range guides from authored range, area, or melee reach', () => {
    expect(
      abilityPreviewRange({
        def: { range: 35, requiresTarget: true },
        effects: [{ type: 'directDamage', min: 1, max: 2 }],
      }),
    ).toBe(35);
    expect(
      abilityPreviewRange({
        def: { range: 0, requiresTarget: false, selfCentered: true },
        effects: [{ type: 'aoeDamage', min: 1, max: 2, radius: 6 }],
      }),
    ).toBe(6);
    expect(
      abilityPreviewRange({
        def: { range: 0, requiresTarget: true },
        effects: [{ type: 'directDamage', min: 1, max: 2 }],
      }),
    ).toBeGreaterThan(0);
    expect(
      explicitAbilityAoeRadius({ effects: [{ type: 'directDamage', min: 1, max: 2 }] }),
    ).toBeNull();
  });

  it('maps preview geometry from the authoritative player attack resolver', () => {
    expect(abilityPreviewKind(ABILITIES.sinister_strike)).toBe('meleeCone');
    expect(abilityPreviewKind(ABILITIES.fireball)).toBe('directionLine');
    expect(abilityPreviewKind(ABILITIES.whirlwind)).toBe('area');
    expect(abilityPreviewKind(ABILITIES.flamestrike)).toBe('circle');
    expect(abilityPreviewKind(ABILITIES.charge)).toBe('circle');
  });

  it('keeps melee on facing while ranged guides follow live combat aim', () => {
    const caster = { pos: { x: 10, y: 0, z: 20 }, facing: -Math.PI / 4 };
    const cursor = { x: 30, z: 20 };
    expect(abilityPreviewAngle('meleeCone', caster, cursor)).toBe(caster.facing);
    expect(abilityPreviewAngle('directionLine', caster, cursor)).toBeCloseTo(Math.PI / 2, 8);
    expect(abilityPreviewAngle('directionLine', caster, null)).toBe(caster.facing);
    expect(abilityPreviewAngle('directionLine', caster, { x: 10, z: 20 })).toBe(caster.facing);
  });

  it('uses Meteor actual 8-yard impact radius', () => {
    expect(abilityAoeRadius(ABILITIES.meteor)).toBe(8);
  });

  it('uses the Hourglass capture radius for its compact ground reticle', () => {
    expect(
      abilityAoeRadius({
        effects: [
          {
            type: 'temporalHourglass',
            duration: 5,
            hostilePveDuration: 60,
            hostilePvpDuration: 10,
            groundDuration: 30,
            selfRadius: 1.5,
            captureRadius: 1.75,
            healMaxHpPct: 0.3,
            selfCooldownRate: 2,
            allyCooldownRate: 1.75,
          },
        ],
      }),
    ).toBe(1.75);
  });

  it('transitions enter to cancel to commit', () => {
    const idle = createGroundAimState();
    const active = enterGroundAim(idle, 'flamestrike', 11);
    expect(active).toEqual({ activeAbilityId: 'flamestrike', activeSlot: 11 });
    expect(cancelGroundAim(active)).toEqual({ activeAbilityId: null, activeSlot: null });

    const second = enterGroundAim(idle, 'earthquake', 3);
    expect(commitGroundAim(second)).toEqual({
      abilityId: 'earthquake',
      state: { activeAbilityId: null, activeSlot: null },
    });
  });
});
