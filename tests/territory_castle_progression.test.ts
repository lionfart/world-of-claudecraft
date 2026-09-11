import { describe, expect, it } from 'vitest';
import {
  TERRITORY_CASTLE_MAX_LEVEL,
  territoryActiveCastleLevel,
  territoryCastleLevel,
  territoryStructureLevelCap,
  territoryStructureSlotBuildable,
  territoryStructureUpgradeAllowed,
} from '../src/sim/territory_castle_progression';

describe('territory castle progression', () => {
  it('keeps the castle and every dependent building within four levels', () => {
    expect(TERRITORY_CASTLE_MAX_LEVEL).toBe(4);
    expect(territoryCastleLevel(99)).toBe(4);
    expect(territoryStructureLevelCap('keep_core', 1)).toBe(4);
    expect(territoryStructureLevelCap('granary', 2)).toBe(2);
  });

  it('blocks a building at the active castle level until the castle finishes upgrading', () => {
    expect(territoryActiveCastleLevel({ level: 2, state: 'building' })).toBe(1);
    expect(territoryStructureUpgradeAllowed('granary', 1, 1)).toBe(false);
    expect(territoryStructureUpgradeAllowed('granary', 1, 2)).toBe(true);
  });

  it('retires standalone wall and gate construction in favor of the castle button', () => {
    expect(territoryStructureSlotBuildable('walls')).toBe(false);
    expect(territoryStructureSlotBuildable('gate')).toBe(false);
    expect(territoryStructureSlotBuildable('wall')).toBe(false);
    expect(territoryStructureSlotBuildable('towers')).toBe(true);
    expect(territoryStructureUpgradeAllowed('walls', 1, 4)).toBe(false);
  });
});
