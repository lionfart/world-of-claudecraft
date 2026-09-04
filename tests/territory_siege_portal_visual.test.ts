import { describe, expect, it } from 'vitest';
import { buildTerritorySiegeDefenderPortal } from '../src/render/territory_siege_prototype';
import {
  TERRITORY_SIEGE_DEFENDER_PORTAL_Z,
  TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
} from '../src/sim/territory_siege_layout';

describe('territory siege defender portal visual', () => {
  it('renders a complete portal face outside and inside the front wall', () => {
    const portal = buildTerritorySiegeDefenderPortal();
    const inside = portal.root.getObjectByName('territory-siege-defender-portal-face:inside');
    const outside = portal.root.getObjectByName('territory-siege-defender-portal-face:outside');

    expect(portal.root.position.z).toBe(TERRITORY_SIEGE_DEFENDER_PORTAL_Z);
    expect(inside?.position.z).toBeLessThan(-TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH);
    expect(outside?.position.z).toBeGreaterThan(TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH);
    for (const face of [inside, outside]) {
      expect(face?.getObjectByName('territory-siege-defender-portal-veil')).toBeDefined();
      expect(face?.getObjectByName('territory-siege-defender-portal-ring')).toBeDefined();
    }
    expect(portal.innerRings).toHaveLength(2);
  });
});
