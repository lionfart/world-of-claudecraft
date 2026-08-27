import { describe, expect, it } from 'vitest';
import { createTerritoryManifest } from '../src/sim/territory_manifest';
import { buildTerritoryMapModel, territoryCellAt } from '../src/ui/territory_map_view';
import type { TerritoryMapState } from '../src/world_api';

function state(): TerritoryMapState {
  const manifest = createTerritoryManifest();
  return {
    season: {
      id: '1',
      number: 1,
      manifestVersion: manifest.version,
      manifestChecksum: manifest.checksum,
      radius: manifest.radius,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-03-26T00:00:00.000Z',
    },
    revision: 1,
    cells: [],
    structures: [],
    wars: [],
    guild: null,
    siege: null,
  };
}

describe('territory map view', () => {
  it('culls to a small visible subset while zoomed in', () => {
    const model = buildTerritoryMapModel({
      state: state(),
      canvasSize: 560,
      zoom: 18,
      center: { x: 0, y: 0 },
      hoveredCellId: null,
      selectedCellId: null,
    });
    expect(model.visibleCells.length).toBeLessThan(100);
    expect(model.visibleCells.length).toBeGreaterThan(20);
  });

  it('keeps the 60,067-cell season on the same bounded viewport path', () => {
    const large = state();
    large.season.radius = 141;
    const model = buildTerritoryMapModel({
      state: large,
      canvasSize: 560,
      zoom: 18,
      center: { x: 0, y: 0 },
      hoveredCellId: null,
      selectedCellId: null,
    });
    expect(model.totalCells).toBe(60_067);
    expect(model.visibleCells.length).toBeLessThan(400);
  });

  it('round-trips the centre screen point to the centre cell', () => {
    const manifest = createTerritoryManifest();
    const model = buildTerritoryMapModel({
      state: state(),
      canvasSize: 560,
      zoom: 5,
      center: { x: 0, y: 0 },
      hoveredCellId: null,
      selectedCellId: null,
    });
    expect(territoryCellAt(manifest, model.view, 560, 280, 280)).toBe(
      manifest.byAxial.get('0:0')?.id,
    );
  });
});
