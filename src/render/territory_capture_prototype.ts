import * as THREE from 'three';
import { territorySiegeOrigin } from '../sim/data';
import { TERRITORY_CAPTURE_CAMP_Z, TERRITORY_CAPTURE_RADIUS } from '../sim/territory_capture';
import type { TerritorySiegeBiome } from '../sim/territory_siege_biome';
import { TERRITORY_SIEGE_FLOOR_Y } from '../sim/territory_siege_layout';
import type { TerritoryCaptureView } from '../world_api';
import { surfaceMat } from './gfx';
import { cloneTerritorySiegeAsset } from './territory_siege_assets';
import { buildTerritorySiegeNaturalField } from './territory_siege_environment';

export interface TerritoryCapturePrototypeView {
  group: THREE.Group;
  update(capture: TerritoryCaptureView | null, timeSeconds: number): void;
}

const TENT_POSITIONS = [
  { x: -9.4, z: -7.2, yaw: 0.35 },
  { x: 9.4, z: -7.2, yaw: -0.35 },
  { x: -9.4, z: 7.2, yaw: 2.8 },
  { x: 9.4, z: 7.2, yaw: -2.8 },
] as const;

function tentColor(biome: TerritorySiegeBiome): number {
  if (biome === 'snow') return 0x627486;
  if (biome === 'desert') return 0x9b6235;
  if (biome === 'rocky') return 0x6f5a43;
  return 0x76402f;
}

function buildTent(biome: TerritorySiegeBiome): THREE.Group {
  const root = new THREE.Group();
  const canvas = new THREE.Mesh(
    new THREE.ConeGeometry(4.4, 4.1, 4),
    surfaceMat({ color: tentColor(biome), roughness: 0.96, flatShading: true }),
  );
  canvas.position.y = 2.05;
  canvas.rotation.y = Math.PI / 4;
  canvas.scale.z = 0.72;
  canvas.castShadow = true;
  canvas.receiveShadow = true;
  root.add(canvas);
  const poleMat = surfaceMat({ color: 0x4a2e1a, roughness: 0.88 });
  for (const x of [-1.75, 1.75]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 4.2, 7), poleMat);
    pole.position.set(x, 2, 0);
    pole.castShadow = true;
    root.add(pole);
  }
  return root;
}

function buildCampfire(): THREE.Group {
  const root = new THREE.Group();
  const logSource = cloneTerritorySiegeAsset('log');
  for (const yaw of [-0.72, 0.72]) {
    const log = logSource.clone(true);
    log.scale.setScalar(1.4);
    log.rotation.y = yaw;
    root.add(log);
  }
  const coals = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.45, 0.26, 10),
    surfaceMat({ color: 0x3b2115, roughness: 0.95, emissive: 0x8f2609, emissiveIntensity: 0.5 }),
  );
  coals.position.y = 0.14;
  root.add(coals);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 2.15, 9),
    surfaceMat({ color: 0xffa52f, roughness: 0.48, emissive: 0xff5d12, emissiveIntensity: 2.1 }),
  );
  flame.name = 'territory-capture-flame';
  flame.position.y = 1.2;
  root.add(flame);
  const light = new THREE.PointLight(0xff8a2d, 1.8, 22, 2);
  light.position.y = 2.3;
  root.add(light);
  return root;
}

function buildBanner(biome: TerritorySiegeBiome): THREE.Group {
  const root = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, 6.7, 8),
    surfaceMat({ color: 0x4b321d, roughness: 0.9 }),
  );
  pole.position.y = 3.35;
  root.add(pole);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 1.75),
    surfaceMat({
      color: biome === 'snow' ? 0x456b83 : biome === 'desert' ? 0xa8572d : 0x7f2e27,
      roughness: 0.92,
      side: THREE.DoubleSide,
    }),
  );
  cloth.position.set(1.48, 5.25, 0);
  root.add(cloth);
  return root;
}

/** Biome battlefield dressing for a neutral camp; no castle geometry is instantiated. */
export function buildTerritoryCapturePrototype(
  slot: number,
  biome: TerritorySiegeBiome,
): TerritoryCapturePrototypeView {
  const root = new THREE.Group();
  root.name = `territory-capture-field:${slot}:${biome}`;
  const origin = territorySiegeOrigin(slot);
  root.position.set(origin.x, TERRITORY_SIEGE_FLOOR_Y, origin.z);
  buildTerritorySiegeNaturalField(root, biome);

  const camp = new THREE.Group();
  camp.position.z = TERRITORY_CAPTURE_CAMP_Z;
  root.add(camp);
  for (const placement of TENT_POSITIONS) {
    const tent = buildTent(biome);
    tent.position.set(placement.x, 0, placement.z);
    tent.rotation.y = placement.yaw;
    camp.add(tent);
  }
  const fire = buildCampfire();
  const flame = fire.getObjectByName('territory-capture-flame');
  camp.add(fire);
  const banner = buildBanner(biome);
  banner.position.set(0, 0, -3.6);
  camp.add(banner);

  const guardRing = new THREE.Mesh(
    new THREE.TorusGeometry(TERRITORY_CAPTURE_RADIUS, 0.18, 8, 72),
    surfaceMat({ color: 0xb65a24, roughness: 0.5, emissive: 0x6e2109, emissiveIntensity: 0.8 }),
  );
  const captureRing = new THREE.Mesh(
    new THREE.TorusGeometry(TERRITORY_CAPTURE_RADIUS, 0.22, 8, 72),
    surfaceMat({ color: 0xd7b94f, roughness: 0.45, emissive: 0x705607, emissiveIntensity: 0.9 }),
  );
  for (const ring of [guardRing, captureRing]) {
    ring.position.y = 0.18;
    ring.rotation.x = Math.PI / 2;
    camp.add(ring);
  }

  const update = (capture: TerritoryCaptureView | null, timeSeconds: number): void => {
    root.visible = capture !== null;
    if (!capture) return;
    guardRing.visible = capture.phase === 'guards';
    captureRing.visible = capture.phase === 'capturing';
    const pulse = 1 + Math.sin(timeSeconds * 3.4) * 0.012;
    guardRing.scale.setScalar(pulse);
    captureRing.scale.setScalar(pulse);
    flame?.scale.setScalar(0.88 + Math.sin(timeSeconds * 9.5) * 0.12);
  };
  update(null, 0);
  return { group: root, update };
}
