import { describe, expect, it } from 'vitest';
import {
  showTerritoryCastleTier,
  territoryCastleVisualStyle,
  territoryDefenseTowerVisualLevel,
  territoryDefenseTowerVisualStyle,
  territoryWoodTowerYaw,
} from '../src/render/territory_siege_castle_visual';

describe('territory siege castle tiers', () => {
  it('maps four castle levels through the raised Drakelands citadel', () => {
    expect(territoryCastleVisualStyle(1)).toMatchObject({
      wallAsset: 'palisadeWall',
      wallYawOffset: Math.PI,
      courtyard: 'dirt',
      gateFrame: 'timber',
    });
    expect(territoryCastleVisualStyle(2)).toMatchObject({
      wallAsset: 'wall',
      courtyard: 'current',
      gateFrame: 'stone',
    });
    expect(territoryCastleVisualStyle(3)).toMatchObject({
      wallAsset: 'drakelandsWall',
      courtyard: 'drakelands',
      gateFrame: 'drakelands',
    });
    expect(territoryCastleVisualStyle(4)).toMatchObject({
      wallAsset: 'drakelandsWall',
      courtyard: 'citadel',
      gateFrame: 'citadel',
    });
  });

  it('keeps exactly one prebuilt visual tier visible', () => {
    const tiers = [{ visible: true }, { visible: true }, { visible: true }, { visible: true }];
    showTerritoryCastleTier(tiers, 4);
    expect(tiers.map((tier) => tier.visible)).toEqual([false, false, false, true]);
  });

  it('progresses defense towers from timber and stone to the Drakelands bastion', () => {
    expect(territoryDefenseTowerVisualStyle(1)).toMatchObject({
      towerAsset: 'towerWood',
    });
    expect(territoryDefenseTowerVisualStyle(2)).toMatchObject({
      towerAsset: 'towerStone',
      towerScale: [6, 6, 6],
    });
    expect(territoryDefenseTowerVisualStyle(3)).toMatchObject({
      towerAsset: 'drakelandsBastion',
      towerScale: [1, 1, 1],
    });
    expect(territoryDefenseTowerVisualStyle(4)).toMatchObject({
      towerAsset: 'drakelandsBastion',
    });
    expect([
      territoryDefenseTowerVisualLevel(2),
      territoryDefenseTowerVisualLevel(4),
      territoryDefenseTowerVisualLevel(6),
      territoryDefenseTowerVisualLevel(8),
    ]).toEqual([1, 2, 3, 4]);
  });

  it('aims both timber-tower ladders diagonally into the courtyard', () => {
    const leftYaw = territoryWoodTowerYaw('left');
    const rightYaw = territoryWoodTowerYaw('right');
    expect(Math.sin(leftYaw)).toBeGreaterThan(0);
    expect(Math.sin(rightYaw)).toBeLessThan(0);
    expect(Math.cos(leftYaw)).toBeLessThan(0);
    expect(Math.cos(rightYaw)).toBeLessThan(0);
  });
});
