import { describe, expect, it } from 'vitest';
import { territorySiegeRaisedGroundHeight } from '../src/render/territory_siege_ground_reference';
import { DUNGEON_FLOOR_Y, territorySiegeOrigin } from '../src/sim/data';
import { TERRITORY_SIEGE_CITADEL_INNER_HEIGHT } from '../src/sim/territory_siege_ground';

describe('territory siege character ground reference', () => {
  it('treats the level-four inner ward as standing ground for animation', () => {
    const origin = territorySiegeOrigin(0);
    expect(territorySiegeRaisedGroundHeight(origin.x, origin.z - 46, 4)).toBe(
      DUNGEON_FLOOR_Y + TERRITORY_SIEGE_CITADEL_INNER_HEIGHT,
    );
  });

  it('does not override ordinary terrain outside the raised citadel', () => {
    const origin = territorySiegeOrigin(0);
    expect(territorySiegeRaisedGroundHeight(origin.x, origin.z - 46, 3)).toBeNull();
    expect(territorySiegeRaisedGroundHeight(0, 0, 4)).toBeNull();
  });
});
