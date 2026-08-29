import * as THREE from 'three';
import {
  TERRITORY_SIEGE_BUSHES,
  TERRITORY_SIEGE_HOMES,
  TERRITORY_SIEGE_ROCKS,
  TERRITORY_SIEGE_TERRAIN_PATCHES,
  TERRITORY_SIEGE_TREES,
} from '../sim/territory_siege_environment';
import { surfaceMat } from './gfx';
import { cloneTerritorySiegeAsset, type TerritorySiegeAssetKey } from './territory_siege_assets';

function place(
  parent: THREE.Object3D,
  key: TerritorySiegeAssetKey,
  x: number,
  y: number,
  z: number,
  scale: number,
  yaw: number,
): THREE.Group {
  const asset = cloneTerritorySiegeAsset(key);
  asset.position.set(x, y, z);
  asset.scale.setScalar(scale);
  asset.rotation.y = yaw;
  parent.add(asset);
  return asset;
}

/** Natural cover and color variation for the enlarged outer battlefield. */
export function buildTerritorySiegeNaturalField(root: THREE.Object3D): void {
  for (let index = 0; index < TERRITORY_SIEGE_TERRAIN_PATCHES.length; index += 1) {
    const patch = TERRITORY_SIEGE_TERRAIN_PATCHES[index];
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      surfaceMat({
        color: index % 2 === 0 ? 0x465a34 : 0x687044,
        roughness: 1,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = patch.yaw;
    mesh.scale.set(patch.scale, patch.scale * 0.62, 1);
    mesh.position.set(patch.x, 0.005, patch.z);
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  for (let index = 0; index < TERRITORY_SIEGE_TREES.length; index += 1) {
    const tree = TERRITORY_SIEGE_TREES[index];
    place(
      root,
      index % 3 === 0 ? 'treePineMedium' : 'treePineLarge',
      tree.x,
      0,
      tree.z,
      tree.scale * 0.16,
      tree.yaw,
    );
  }
  for (const rock of TERRITORY_SIEGE_ROCKS)
    place(root, 'rock', rock.x, 0, rock.z, rock.scale * 0.36, rock.yaw);
  for (const bush of TERRITORY_SIEGE_BUSHES)
    place(root, 'bush', bush.x, 0, bush.z, bush.scale * 0.55, bush.yaw);
}

/** Stone lanes, homes and small lived-in details inside the castle walls. */
export function buildTerritorySiegeCastleSettlement(root: THREE.Object3D): void {
  let roadIndex = 0;
  for (let z = 13; z >= -65; z -= 7.2) {
    place(root, roadIndex++ % 2 === 0 ? 'roadA' : 'roadB', 0, 0.025, z, 4.2, 0);
  }
  for (let x = -34; x <= 34; x += 7.2) {
    place(root, roadIndex++ % 2 === 0 ? 'roadA' : 'roadB', x, 0.023, -24, 4.2, Math.PI / 2);
  }

  for (const home of TERRITORY_SIEGE_HOMES)
    place(root, home.kind, home.x, 0, home.z, home.scale, home.yaw);

  place(root, 'well', 16, 0, -25, 7.2, 0.2);
  place(root, 'hay', -17, 0, -19, 3.2, 0.5);
  place(root, 'hay', -20, 0, -22, 2.8, 1.8);
  place(root, 'flag', -7, 0, 13, 5.2, 0);
  place(root, 'flag', 7, 0, 13, 5.2, 0);
}
