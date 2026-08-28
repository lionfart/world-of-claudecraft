import { describe, expect, it } from 'vitest';
import {
  createTerritoryManifest,
  TERRITORY_MAX_RADIUS,
  TERRITORY_MIN_RADIUS,
  territoryCellCount,
  territoryRadiusForActiveGuilds,
} from '../src/sim/territory_manifest';
import {
  isTerritoryClaimAdjacent,
  territoryConnectivityAfterCapture,
} from '../src/sim/territory_topology';

describe('seasonal territory manifest', () => {
  it('ships the compact test map at roughly one tenth of the original cell counts', () => {
    expect(territoryCellCount(TERRITORY_MIN_RADIUS)).toBe(1_261);
    expect(createTerritoryManifest(TERRITORY_MIN_RADIUS).cells).toHaveLength(1_261);
    expect(territoryCellCount(TERRITORY_MAX_RADIUS)).toBe(5_941);
    expect(createTerritoryManifest(TERRITORY_MAX_RADIUS).cells).toHaveLength(5_941);
    expect(createTerritoryManifest().version).toBe(2);
  });

  it('is deterministic, reciprocal, and checksum-pinned', () => {
    const manifest = createTerritoryManifest();
    expect(createTerritoryManifest().checksum).toBe(manifest.checksum);
    for (const cell of manifest.cells) {
      expect(cell.neighbors).toHaveLength(cell.neighbors.length >= 3 ? cell.neighbors.length : 3);
      for (const neighbor of cell.neighbors) {
        expect(manifest.byId.get(neighbor)?.neighbors).toContain(cell.id);
      }
    }
  });

  it('sizes a new season without changing the configured bounds', () => {
    expect(territoryRadiusForActiveGuilds(1)).toBe(TERRITORY_MIN_RADIUS);
    expect(territoryRadiusForActiveGuilds(10_000)).toBe(TERRITORY_MAX_RADIUS);
  });
});

describe('territory connectivity', () => {
  it('neutralizes a branch cut off from every keep root', () => {
    const manifest = createTerritoryManifest();
    const centre = manifest.byAxial.get('0:0');
    const bridge = manifest.byAxial.get('1:0');
    const branchA = manifest.byAxial.get('2:0');
    const branchB = manifest.byAxial.get('3:0');
    expect(centre && bridge && branchA && branchB).toBeTruthy();
    const owned = new Set([centre!.id, bridge!.id, branchA!.id, branchB!.id]);
    const result = territoryConnectivityAfterCapture(
      manifest,
      owned,
      bridge!.id,
      new Set([centre!.id]),
    );
    expect(result.disconnected).toEqual([branchA!.id, branchB!.id].sort((a, b) => a - b));
  });

  it('keeps land attached to a second keep root', () => {
    const manifest = createTerritoryManifest();
    const ids = ['0:0', '1:0', '2:0', '3:0'].map((key) => manifest.byAxial.get(key)!.id);
    const result = territoryConnectivityAfterCapture(
      manifest,
      new Set(ids),
      ids[1],
      new Set([ids[0], ids[3]]),
    );
    expect(result.disconnected).toEqual([]);
    expect(result.connected).toEqual(new Set([ids[0], ids[2], ids[3]]));
  });

  it('requires neutral claims to touch current ownership', () => {
    const manifest = createTerritoryManifest();
    const centre = manifest.byAxial.get('0:0')!;
    expect(isTerritoryClaimAdjacent(manifest, new Set([centre.id]), centre.neighbors[0])).toBe(
      true,
    );
    expect(
      isTerritoryClaimAdjacent(manifest, new Set([centre.id]), manifest.byAxial.get('5:0')!.id),
    ).toBe(false);
  });
});
