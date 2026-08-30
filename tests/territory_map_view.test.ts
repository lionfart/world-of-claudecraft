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
      requirementsEnabled: false,
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

  it('keeps the compact maximum season on the same bounded viewport path', () => {
    const large = state();
    large.season.radius = 44;
    const model = buildTerritoryMapModel({
      state: large,
      canvasSize: 560,
      zoom: 18,
      center: { x: 0, y: 0 },
      hoveredCellId: null,
      selectedCellId: null,
    });
    expect(model.totalCells).toBe(5_941);
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

  it('projects neighboring cells on the pointy-top axes used by the supplied art', () => {
    const model = buildTerritoryMapModel({
      state: state(),
      canvasSize: 560,
      zoom: 5,
      center: { x: 0, y: 0 },
      hoveredCellId: null,
      selectedCellId: null,
    });
    const centre = model.visibleCells.find((cell) => cell.q === 0 && cell.r === 0);
    const east = model.visibleCells.find((cell) => cell.q === 1 && cell.r === 0);
    const southEast = model.visibleCells.find((cell) => cell.q === 0 && cell.r === 1);
    if (!centre || !east || !southEast) throw new Error('centre neighbors were culled');

    expect(east.my).toBeCloseTo(centre.my, 8);
    expect(east.mx - centre.mx).toBeCloseTo(Math.sqrt(3) * centre.radiusPx, 8);
    expect(southEast.my - centre.my).toBeCloseTo(1.5 * centre.radiusPx, 8);
    expect(
      territoryCellAt(createTerritoryManifest(), model.view, 560, southEast.mx, southEast.my),
    ).toBe(southEast.cellId);
  });

  it('marks only the outside edges of contiguous guild territory', () => {
    const manifest = createTerritoryManifest();
    const centre = manifest.byAxial.get('0:0');
    const east = manifest.byAxial.get('1:0');
    const northEast = manifest.byAxial.get('1:-1');
    if (!centre || !east || !northEast) throw new Error('compact manifest lost centre cells');
    const map = state();
    map.cells = [
      {
        ...centre,
        cellId: centre.id,
        ownerGuildId: 'a',
        ownerGuildName: 'A',
        ownerColor: '#a00',
        keepRoot: true,
      },
      {
        ...east,
        cellId: east.id,
        ownerGuildId: 'a',
        ownerGuildName: 'A',
        ownerColor: '#a00',
        keepRoot: false,
      },
      {
        ...northEast,
        cellId: northEast.id,
        ownerGuildId: 'b',
        ownerGuildName: 'B',
        ownerColor: '#00a',
        keepRoot: true,
      },
    ];
    const model = buildTerritoryMapModel({
      state: map,
      canvasSize: 560,
      zoom: 5,
      center: { x: 0, y: 0 },
      hoveredCellId: null,
      selectedCellId: null,
    });
    const projectedCentre = model.visibleCells.find((cell) => cell.cellId === centre.id);
    if (!projectedCentre) throw new Error('centre cell was culled from the centred view');

    expect(projectedCentre.borderSides[0]).toBe(false);
    expect(projectedCentre.borderSides[1]).toBe(true);
    expect(projectedCentre.borderSides[2]).toBe(true);
  });
});
