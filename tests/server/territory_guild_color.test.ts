import { describe, expect, it } from 'vitest';
import { territoryGuildColor } from '../../server/territory_db';

describe('territory guild colors', () => {
  it('assigns a stable, broad palette instead of repeating a short color list', () => {
    const colors = Array.from({ length: 48 }, (_, index) => territoryGuildColor(index + 1));
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors.every((color) => /^hsl\(\d{1,3}, \d{2}%, \d{2}%\)$/.test(color))).toBe(true);
    expect(territoryGuildColor(17)).toBe(territoryGuildColor(17));
  });
});
