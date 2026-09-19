import { describe, expect, it } from 'vitest';
import { territorySiegeObjectiveFrameView } from '../src/ui/territory_siege_objective_view';
import type { TerritorySiegeView } from '../src/world_api';

function siegeFixture(): TerritorySiegeView {
  return {
    state: 'active',
    castleLevel: 4,
    defenseTowerLevel: 3,
    gateProgress: 0.2,
    gateHp: 800,
    gateMaxHp: 1_000,
    wallHealth: [{ id: 'front_left:0', hp: 450, maxHp: 600 }],
    towerHealth: [{ id: 'left', hp: 325, maxHp: 500 }],
    rams: [{ id: 7, hp: 90, maxHp: 120 }],
    ramDeployed: true,
    mortars: [],
    catapults: [],
  } as unknown as TerritorySiegeView;
}

describe('territory siege objective target frame', () => {
  it('shows the castle level for the gate and wall beside their exact health', () => {
    const siege = siegeFixture();

    expect(territorySiegeObjectiveFrameView(siege, { kind: 'gate' })).toMatchObject({
      current: 800,
      maximum: 1_000,
      level: 4,
      labelKey: 'hudChrome.territoryMap.gateName',
    });
    expect(
      territorySiegeObjectiveFrameView(siege, { kind: 'wall', id: 'front_left:0' }),
    ).toMatchObject({
      current: 450,
      maximum: 600,
      level: 4,
      labelKey: 'hudChrome.territoryMap.wallName',
    });
  });

  it('shows the independently upgraded defense tower level', () => {
    expect(territorySiegeObjectiveFrameView(siegeFixture(), { kind: 'tower', id: 'left' })).toEqual(
      {
        current: 325,
        maximum: 500,
        level: 3,
        labelKey: 'hudChrome.territoryMap.towerName',
        key: 'tower:left',
      },
    );
  });

  it('keeps non-building siege weapons level-free', () => {
    expect(territorySiegeObjectiveFrameView(siegeFixture(), { kind: 'ram', id: 7 })).toMatchObject({
      current: 90,
      maximum: 120,
      level: null,
      labelKey: 'hudChrome.territoryMap.ramName',
    });
  });

  it('hides destroyed and missing objectives', () => {
    const siege = siegeFixture();
    siege.wallHealth = [{ id: 'front_left:0', hp: 0, maxHp: 600 }];

    expect(
      territorySiegeObjectiveFrameView(siege, { kind: 'wall', id: 'front_left:0' }),
    ).toBeNull();
    expect(territorySiegeObjectiveFrameView(siege, { kind: 'tower', id: 'right' })).toBeNull();
  });
});
