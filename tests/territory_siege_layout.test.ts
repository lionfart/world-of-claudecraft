import { describe, expect, it } from 'vitest';
import { territorySiegeOrigin } from '../src/sim/data';
import {
  clampTerritorySiegeGate,
  sealTerritorySiegeGateForSide,
  TERRITORY_SIEGE_CORE_ATTACK_RADIUS,
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  TERRITORY_SIEGE_GATE_HALF_WIDTH,
  TERRITORY_SIEGE_GATE_Z,
  TERRITORY_SIEGE_TOWER_RANGE,
  TERRITORY_SIEGE_TOWER_X,
  territorySiegeActionPoint,
  territorySiegeBandColliders,
  territorySiegeInTowerRange,
  territorySiegeLocalColliders,
  territorySiegeSpawn,
  territorySiegeTowerPositions,
} from '../src/sim/territory_siege_layout';

describe('territory siege instance layout', () => {
  it('keeps all four collider copies isolated', () => {
    const colliders = territorySiegeBandColliders();
    expect(colliders.length).toBeGreaterThan(20);
    expect(territorySiegeOrigin(1).z - territorySiegeOrigin(0).z).toBe(700);
  });

  it('places both twenty-player teams inside the enlarged interest field', () => {
    for (let seat = 1; seat <= 20; seat += 1) {
      for (const side of ['attacker', 'defender'] as const) {
        const spawn = territorySiegeSpawn(0, side, seat);
        expect(Math.abs(spawn.x - territorySiegeOrigin(0).x)).toBeLessThan(
          TERRITORY_SIEGE_FIELD_HALF_X,
        );
      }
    }
    expect(TERRITORY_SIEGE_FIELD_HALF_X * TERRITORY_SIEGE_FIELD_HALF_Z * 4).toBeGreaterThan(80_000);
    expect(territorySiegeSpawn(0, 'attacker', 1).z - territorySiegeOrigin(0).z).toBeGreaterThan(
      120,
    );
  });

  it('restricts ram construction to the marked gate apron', () => {
    const point = territorySiegeActionPoint(0, 'deploy_ram');
    const origin = territorySiegeOrigin(0);
    expect((origin.z + 25 - point.z) ** 2).toBeLessThanOrEqual(point.radius ** 2);
    expect((origin.z + 46 - point.z) ** 2).toBeGreaterThan(point.radius ** 2);
  });

  it('gives the core channel a readable combat-sized attack area', () => {
    const point = territorySiegeActionPoint(0, 'start_core_channel');
    expect(point.radius).toBe(TERRITORY_SIEGE_CORE_ATTACK_RADIUS);
    expect(point.radius).toBeGreaterThanOrEqual(12);
  });

  it('blocks the gate crossing until the gate is destroyed', () => {
    const origin = territorySiegeOrigin(0);
    const blocked = clampTerritorySiegeGate(0, false, origin.z + 23, origin.x, origin.z + 15, 0.6);
    expect(blocked.z).toBeGreaterThan(origin.z + 18);
    expect(clampTerritorySiegeGate(0, true, origin.z + 23, origin.x, origin.z + 15, 0.6).z).toBe(
      origin.z + 15,
    );
  });

  it('authoritatively seals both sides of a closed gate after reconciliation', () => {
    const origin = territorySiegeOrigin(0);
    const attacker = sealTerritorySiegeGateForSide(
      0,
      'attacker',
      false,
      origin.x,
      origin.z + 10,
      0.5,
    );
    const defender = sealTerritorySiegeGateForSide(
      0,
      'defender',
      false,
      origin.x,
      origin.z + 28,
      0.5,
    );
    expect(attacker.z).toBeGreaterThan(origin.z + TERRITORY_SIEGE_GATE_Z);
    expect(defender.z).toBeLessThan(origin.z + TERRITORY_SIEGE_GATE_Z);
    expect(sealTerritorySiegeGateForSide(0, 'attacker', true, origin.x, origin.z + 10, 0.5).z).toBe(
      origin.z + 10,
    );
    expect(
      sealTerritorySiegeGateForSide(
        0,
        'attacker',
        false,
        origin.x + TERRITORY_SIEGE_GATE_HALF_WIDTH + 2,
        origin.z + 10,
        0.5,
      ).z,
    ).toBe(origin.z + 10);
  });

  it('seals the complete twenty-unit opening between the front wall segments', () => {
    const frontWallInnerEdges = territorySiegeLocalColliders().flatMap((collider) =>
      collider.type === 'obb' && collider.z === 18 && Math.abs(collider.x) === 27
        ? [Math.abs(collider.x) - collider.hw]
        : [],
    );
    expect(frontWallInnerEdges).toEqual([10, 10]);
    expect(TERRITORY_SIEGE_GATE_HALF_WIDTH).toBe(10);
  });

  it('gives each defense tower a radius that covers the gate approach but not spawn', () => {
    const origin = territorySiegeOrigin(0);
    const towers = territorySiegeTowerPositions(0);
    expect(towers).toHaveLength(2);
    expect(TERRITORY_SIEGE_TOWER_RANGE).toBeGreaterThan(TERRITORY_SIEGE_TOWER_X);
    for (const tower of towers) {
      expect(
        Math.hypot(tower.x - origin.x, tower.z - (origin.z + TERRITORY_SIEGE_GATE_Z)),
      ).toBeLessThan(TERRITORY_SIEGE_TOWER_RANGE);
    }
    expect(territorySiegeInTowerRange(0, origin.x, origin.z + TERRITORY_SIEGE_GATE_Z)).toBe(true);
    expect(territorySiegeInTowerRange(0, origin.x, origin.z + 50)).toBe(true);
    expect(territorySiegeInTowerRange(0, origin.x, origin.z + 96)).toBe(false);
  });
});
