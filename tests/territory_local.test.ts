import { describe, expect, it } from 'vitest';
import { LocalTerritoryState } from '../src/sim/territory_local';
import { createTerritoryManifest } from '../src/sim/territory_manifest';

describe('local territory re-entry', () => {
  it('starts without legacy guild-ledger resources before a stockpile produces them', () => {
    const territory = new LocalTerritoryState();
    expect(territory.state.guild?.resources).toEqual({
      wood: 0,
      iron: 0,
      grain: 0,
      labor: 0,
    });
  });

  it('allows a landless guild to place a new keep while rival cells remain', () => {
    const territory = new LocalTerritoryState();
    const guild = territory.state.guild;
    if (!guild) throw new Error('local territory guild missing');
    const rivalCell = 1;
    territory.state.cells.push({
      cellId: rivalCell,
      ownerGuildId: 'rival-guild',
      ownerGuildName: 'Rivals',
      ownerColor: '#aa3344',
      keepRoot: true,
      terrain: 'grassland',
      resource: null,
    });
    guild.ownedCellCount = 0;

    const target = 2;
    expect(territory.placeKeep(target)).toBe(true);
    expect(guild.ownedCellCount).toBe(1);
    expect(territory.state.cells).toContainEqual(
      expect.objectContaining({ cellId: target, ownerGuildId: guild.id, keepRoot: true }),
    );
  });

  it('uses the castle as the four-level cap for every dependent building', () => {
    const territory = new LocalTerritoryState();
    const target = 2;
    expect(territory.placeKeep(target)).toBe(true);
    expect(territory.build(target, 'walls', 'walls')).toBe(false);
    expect(territory.build(target, 'granary', 'granary')).toBe(true);
    expect(territory.upgrade(target, 'granary')).toBe(false);
    expect(territory.upgrade(target, 'keep_core')).toBe(true);
    expect(territory.upgrade(target, 'granary')).toBe(true);
    expect(territory.upgrade(target, 'granary')).toBe(false);
    expect(territory.upgrade(target, 'keep_core')).toBe(true);
    expect(territory.upgrade(target, 'granary')).toBe(true);
    expect(territory.upgrade(target, 'granary')).toBe(false);
    expect(territory.upgrade(target, 'keep_core')).toBe(true);
    expect(territory.upgrade(target, 'granary')).toBe(true);
    expect(territory.upgrade(target, 'keep_core')).toBe(false);
    expect(territory.upgrade(target, 'granary')).toBe(false);
  });

  it('starts every adjacent claim as an independently developable level-one castle', () => {
    const territory = new LocalTerritoryState();
    const manifest = createTerritoryManifest();
    const first = 2;
    expect(territory.placeKeep(first)).toBe(true);
    const neighbor = manifest.byId
      .get(first)
      ?.neighbors.find((cellId) => manifest.byId.has(cellId));
    if (!neighbor) throw new Error('starter cell has no neighbor');

    expect(territory.claim(neighbor)).toBe(true);
    expect(territory.state.cells).toContainEqual(
      expect.objectContaining({ cellId: neighbor, keepRoot: true }),
    );
    expect(territory.state.structures).toContainEqual(
      expect.objectContaining({ cellId: neighbor, slot: 'keep_core', level: 1, state: 'active' }),
    );
    expect(territory.build(neighbor, 'forester', 'forester')).toBe(true);
  });
});
