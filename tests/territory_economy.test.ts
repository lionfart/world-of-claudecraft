import { describe, expect, it } from 'vitest';
import {
  TERRITORY_RESOURCE_TICK_MS,
  territoryResourceProductionPerHour,
  territoryResourceProductionPerTick,
  territoryStockpileCapacity,
  territoryStructureCost,
  territoryStructureRepairCost,
} from '../src/sim/territory_economy';

describe('territory structure costs', () => {
  it('prices level-one buildings only in normal purse currency', () => {
    expect(territoryStructureCost('granary', 1)).toEqual({
      copper: 500,
      resources: { wood: 0, iron: 0, grain: 0, labor: 0 },
    });
  });

  it('adds guild resources from level two onward', () => {
    expect(territoryStructureCost('granary', 2)).toEqual({
      copper: 1_000,
      resources: { wood: 48, iron: 40, grain: 20, labor: 32 },
    });
    expect(territoryStructureCost('keep', 3)).toEqual({
      copper: 3_750,
      resources: { wood: 180, iron: 150, grain: 75, labor: 120 },
    });
    expect(territoryStructureCost('keep', 4)).toEqual({
      copper: 5_000,
      resources: { wood: 240, iron: 200, grain: 100, labor: 160 },
    });
  });

  it('prices capture repairs from the preserved building level', () => {
    expect(territoryStructureRepairCost('granary', 1)).toEqual({
      copper: 250,
      resources: { wood: 12, iron: 10, grain: 6, labor: 8 },
    });
    expect(territoryStructureRepairCost('defense_tower', 3)).toEqual({
      copper: 1_500,
      resources: { wood: 72, iron: 60, grain: 36, labor: 48 },
    });
  });
});

describe('territory stockpile capacity', () => {
  it('adds a bounded amount of storage at each of the four building levels', () => {
    expect(territoryStockpileCapacity(1)).toBe(500);
    expect(territoryStockpileCapacity(2)).toBe(1_000);
    expect(territoryStockpileCapacity(3)).toBe(2_000);
    expect(territoryStockpileCapacity(4)).toBe(4_000);
    expect(territoryStockpileCapacity(99)).toBe(4_000);
  });
});

describe('territory hourly production', () => {
  it('uses one-hour authoritative ticks', () => {
    expect(TERRITORY_RESOURCE_TICK_MS).toBe(60 * 60_000);
  });

  it('combines the natural hex multiplier with the matching local building level', () => {
    const buildings = { forester: 3, mine: 2, granary: 1, house: 0 };
    expect(territoryResourceProductionPerTick('wood', 2, buildings)).toBe(6);
    expect(territoryResourceProductionPerHour('wood', 2, buildings)).toBe(6);
    expect(territoryResourceProductionPerHour('iron', 3, buildings)).toBe(6);
    expect(territoryResourceProductionPerHour('grain', 2, buildings)).toBe(2);
    expect(territoryResourceProductionPerHour('labor', 2, buildings)).toBe(0);
  });

  it('does not produce without the matching resource building', () => {
    expect(territoryResourceProductionPerHour('wood', 3, { mine: 3 })).toBe(0);
  });

  it('keeps an active resource building productive without a natural deposit', () => {
    expect(territoryResourceProductionPerHour('iron', 0, { mine: 2 })).toBe(2);
    expect(territoryResourceProductionPerHour('grain', 0, { granary: 3 })).toBe(3);
  });
});
