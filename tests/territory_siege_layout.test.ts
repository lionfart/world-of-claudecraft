import { describe, expect, it } from 'vitest';
import { territorySiegeOrigin } from '../src/sim/data';
import {
  clampTerritorySiegeGate,
  TERRITORY_SIEGE_FIELD_HALF_X,
  territorySiegeActionPoint,
  territorySiegeBandColliders,
  territorySiegeSpawn,
} from '../src/sim/territory_siege_layout';

describe('territory siege instance layout', () => {
  it('keeps all four collider copies isolated', () => {
    const colliders = territorySiegeBandColliders();
    expect(colliders.length).toBeGreaterThan(20);
    expect(territorySiegeOrigin(1).z - territorySiegeOrigin(0).z).toBe(700);
  });

  it('places both twenty-player teams inside the compact interest field', () => {
    for (let seat = 1; seat <= 20; seat += 1) {
      for (const side of ['attacker', 'defender'] as const) {
        const spawn = territorySiegeSpawn(0, side, seat);
        expect(Math.abs(spawn.x - territorySiegeOrigin(0).x)).toBeLessThan(
          TERRITORY_SIEGE_FIELD_HALF_X,
        );
      }
    }
  });

  it('restricts ram construction to the marked gate apron', () => {
    const point = territorySiegeActionPoint(0, 'deploy_ram');
    const origin = territorySiegeOrigin(0);
    expect((origin.z + 25 - point.z) ** 2).toBeLessThanOrEqual(point.radius ** 2);
    expect((origin.z + 46 - point.z) ** 2).toBeGreaterThan(point.radius ** 2);
  });

  it('blocks the gate crossing until the gate is destroyed', () => {
    const origin = territorySiegeOrigin(0);
    const blocked = clampTerritorySiegeGate(0, false, origin.z + 23, origin.x, origin.z + 15, 0.6);
    expect(blocked.z).toBeGreaterThan(origin.z + 18);
    expect(clampTerritorySiegeGate(0, true, origin.z + 23, origin.x, origin.z + 15, 0.6).z).toBe(
      origin.z + 15,
    );
  });
});
