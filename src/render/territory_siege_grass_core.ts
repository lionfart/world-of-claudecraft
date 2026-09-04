import type { TerritorySiegeBiome } from '../sim/territory_siege_biome';
import {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  territorySiegeTerrainLiftLocal,
} from '../sim/territory_siege_ground';

const GRASS = {
  temperate: {
    step: 2.7,
    patchFloor: 0.37,
    chanceFloor: 0.43,
    colors: [0x91aa62, 0x6f934f, 0x587842],
  },
  rocky: { step: 4.4, patchFloor: 0.48, chanceFloor: 0.61, colors: [0x9a8c55, 0x7d7945, 0x65653d] },
  // Keep the existing sparse patches; fill them a little more densely (was 0.82).
  snow: { step: 7.8, patchFloor: 0.68, chanceFloor: 0.72, colors: [0xdde7df, 0xadbcae, 0x879b8c] },
  desert: {
    step: 6.2,
    patchFloor: 0.58,
    chanceFloor: 0.74,
    colors: [0xc7a154, 0x9a7940, 0x705d37],
  },
} as const;

export interface TerritorySiegeGrassPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  color: number;
}

function hash01(x: number, z: number): number {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

/** Construction-time plan shared by the single instanced grass draw and its tests. */
export function territorySiegeGrassPlacements(
  biome: TerritorySiegeBiome,
): TerritorySiegeGrassPlacement[] {
  const style = GRASS[biome];
  const placements: TerritorySiegeGrassPlacement[] = [];
  for (
    let z = -TERRITORY_SIEGE_FIELD_HALF_Z + 4;
    z <= TERRITORY_SIEGE_FIELD_HALF_Z - 4;
    z += style.step
  ) {
    for (
      let x = -TERRITORY_SIEGE_FIELD_HALF_X + 4;
      x <= TERRITORY_SIEGE_FIELD_HALF_X - 4;
      x += style.step
    ) {
      const patch = hash01(Math.floor(x / 13) * 4.7, Math.floor(z / 13) * 7.1);
      if (patch < style.patchFloor || hash01(x + 5.3, z - 8.9) < style.chanceFloor) continue;
      const px = x + (hash01(x + 19.2, z) - 0.5) * 2.2;
      const pz = z + (hash01(x, z - 12.7) - 0.5) * 2.2;
      if (
        Math.min(
          TERRITORY_SIEGE_FIELD_HALF_X - Math.abs(px),
          TERRITORY_SIEGE_FIELD_HALF_Z - Math.abs(pz),
        ) < 38
      )
        continue;
      const insideCastle = pz > -78 && pz < 23 && Math.abs(px) < 50;
      const onCastleLane = insideCastle && (Math.abs(px) < 6 || Math.abs(pz + 24) < 6);
      if (onCastleLane || (pz >= 16 && Math.abs(px) < 9.5)) continue;
      const scale = 0.72 + hash01(px - 3.1, pz + 11.4) * 0.68;
      const rootBurial = biome === 'snow' || biome === 'desert' ? 0.38 * scale : -0.015;
      placements.push({
        x: px,
        y: territorySiegeTerrainLiftLocal(px, pz) - rootBurial,
        z: pz,
        scale,
        yaw: hash01(pz + 2.7, px - 6.3) * Math.PI,
        color: style.colors[patch > 0.76 ? 0 : patch > 0.55 ? 1 : 2],
      });
    }
  }
  return placements;
}
