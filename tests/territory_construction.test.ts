import { describe, expect, it } from 'vitest';
import {
  territoryConstructionDurationMs,
  territoryConstructionFitsWarWindow,
  territoryRepairDurationMs,
} from '../src/sim/territory_construction';

describe('territory construction timing', () => {
  it('never completes a build immediately even when a stale zero preset is supplied', () => {
    expect(territoryConstructionDurationMs('keep', 4, 0, 0)).toBe(20_000);
  });

  it('scales with structure weight and target level', () => {
    expect(territoryConstructionDurationMs('gate', 2, 0, 10)).toBe(60_000);
    expect(territoryConstructionDurationMs('keep', 2, 0, 10)).toBe(100_000);
  });

  it('applies active workshop levels with a fifty-percent floor', () => {
    expect(territoryConstructionDurationMs('wall', 1, 2, 10)).toBe(24_000);
    expect(territoryConstructionDurationMs('wall', 1, 99, 10)).toBe(15_000);
  });

  it('repairs in half the equivalent construction time without an instant path', () => {
    expect(territoryRepairDurationMs('granary', 3, 0, 10)).toBe(30_000);
    expect(territoryRepairDurationMs('granary', 3, 0, 0)).toBe(3_000);
  });

  it('only permits work that completes before a declared war starts', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    const startsAtMs = now + 60_000;
    expect(
      territoryConstructionFitsWarWindow(now, 59_999, {
        status: 'declared',
        startsAtMs,
      }),
    ).toBe(true);
    expect(
      territoryConstructionFitsWarWindow(now, 60_001, {
        status: 'forming',
        startsAtMs,
      }),
    ).toBe(false);
    expect(
      territoryConstructionFitsWarWindow(now, 0, {
        status: 'active',
        startsAtMs,
      }),
    ).toBe(false);
    expect(territoryConstructionFitsWarWindow(now, 999_999, null)).toBe(true);
  });
});
