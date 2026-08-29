import { describe, expect, it } from 'vitest';
import { territorySiegeOrigin } from '../src/sim/data';
import {
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

  it('allows ram construction from the attacker approach and gate apron', () => {
    const point = territorySiegeActionPoint(0, 'deploy_ram');
    const origin = territorySiegeOrigin(0);
    for (const z of [origin.z + 46, origin.z + 18]) {
      expect((z - point.z) ** 2).toBeLessThanOrEqual(point.radius ** 2);
    }
  });
});
