import { describe, expect, it } from 'vitest';
import {
  territoryCellCapacity,
  territoryFirstKeepAllowed,
  territoryRequiresSpend,
} from '../../server/territory_rules';

describe('territory test preset rules', () => {
  it('allows the first keep on any valid neutral cell', () => {
    expect(territoryFirstKeepAllowed({ starter: false }, false)).toBe(true);
    expect(territoryFirstKeepAllowed({ starter: false }, true)).toBe(false);
  });

  it('removes level capacity and resource spending while the preset is active', () => {
    expect(territoryCellCapacity(1, 1_261, false)).toBe(1_261);
    expect(territoryCellCapacity(1, 1_261, true)).toBe(24);
    expect(territoryRequiresSpend(false)).toBe(false);
    expect(territoryRequiresSpend(true)).toBe(true);
  });
});
