import { describe, expect, it } from 'vitest';
import { territoryConstructionDurationMs } from '../src/sim/territory_construction';

describe('territory construction timing', () => {
  it('scales with structure weight and target level', () => {
    expect(territoryConstructionDurationMs('gate', 2, 0, 10)).toBe(60_000);
    expect(territoryConstructionDurationMs('keep', 2, 0, 10)).toBe(100_000);
  });

  it('applies active workshop levels with a fifty-percent floor', () => {
    expect(territoryConstructionDurationMs('wall', 1, 2, 10)).toBe(24_000);
    expect(territoryConstructionDurationMs('wall', 1, 99, 10)).toBe(15_000);
  });
});
