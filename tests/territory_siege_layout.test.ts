import { describe, expect, it } from 'vitest';
import { territorySiegeOrigin } from '../src/sim/data';
import {
  TERRITORY_SIEGE_FIELD_HALF_X,
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
});
