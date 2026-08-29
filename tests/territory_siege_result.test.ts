import { describe, expect, it } from 'vitest';
import {
  TERRITORY_SIEGE_RESULT_PRESENTATION_MS,
  territorySiegeResultReturnIn,
} from '../src/sim/territory_siege_result';

describe('territory siege result presentation', () => {
  it('holds the result for five seconds and rounds the visible countdown upward', () => {
    const start = 10_000;
    const returnAt = start + TERRITORY_SIEGE_RESULT_PRESENTATION_MS;
    expect(territorySiegeResultReturnIn(returnAt, start)).toBe(5);
    expect(territorySiegeResultReturnIn(returnAt, start + 4_001)).toBe(1);
    expect(territorySiegeResultReturnIn(returnAt, returnAt)).toBe(0);
    expect(territorySiegeResultReturnIn(returnAt, returnAt + 500)).toBe(0);
  });
});
