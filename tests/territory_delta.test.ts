import { describe, expect, it } from 'vitest';
import { applyTerritoryDelta } from '../src/sim/territory_delta';
import type { TerritoryMapState } from '../src/world_api';

function state(): TerritoryMapState {
  return {
    season: {
      id: 'season',
      number: 1,
      manifestVersion: 1,
      manifestChecksum: 'checksum',
      radius: 63,
      requirementsEnabled: false,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-03-26T00:00:00.000Z',
    },
    revision: 4,
    cells: [
      {
        cellId: 1,
        ownerGuildId: 'a',
        ownerGuildName: 'A',
        ownerColor: '#fff',
        keepRoot: true,
        terrain: 'grassland',
        resource: null,
      },
    ],
    structures: [],
    wars: [],
    guild: null,
    siege: null,
  };
}

describe('territory delta mirror', () => {
  it('applies exactly the next revision', () => {
    const next = applyTerritoryDelta(state(), { revision: 5, cellsRemove: [1] });
    expect(next?.revision).toBe(5);
    expect(next?.cells).toEqual([]);
  });

  it('requires a resync after a revision gap', () => {
    expect(applyTerritoryDelta(state(), { revision: 7 })).toBeNull();
  });

  it('requires a resync for an intentionally compacted cascade', () => {
    expect(applyTerritoryDelta(state(), { revision: 5, resetRequired: true })).toBeNull();
  });
});
