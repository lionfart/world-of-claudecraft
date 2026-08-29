import { describe, expect, it } from 'vitest';
import { LocalTerritoryState } from '../src/sim/territory_local';

describe('local territory re-entry', () => {
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
});
