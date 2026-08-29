export interface TerritorySiegeSceneryPlacement {
  x: number;
  z: number;
  scale: number;
  yaw: number;
}

export interface TerritorySiegeBuildingPlacement extends TerritorySiegeSceneryPlacement {
  kind: 'homeA' | 'homeB';
}

/**
 * Hand-authored cover clusters leave the central assault road and castle gate
 * readable while breaking up the large field into natural combat lanes.
 */
export const TERRITORY_SIEGE_TREES: readonly TerritorySiegeSceneryPlacement[] = [
  { x: -88, z: -119, scale: 8.6, yaw: 2.5 },
  { x: 87, z: -114, scale: 7.2, yaw: 0.4 },
  { x: -72, z: -101, scale: 8.2, yaw: 0.2 },
  { x: -58, z: -94, scale: 6.8, yaw: 1.1 },
  { x: 61, z: -100, scale: 7.6, yaw: 2.3 },
  { x: 74, z: -88, scale: 6.5, yaw: 0.8 },
  { x: -90, z: -81, scale: 7.1, yaw: 1.7 },
  { x: 89, z: -69, scale: 8.4, yaw: 2.1 },
  { x: -70, z: -70, scale: 7.4, yaw: 2.8 },
  { x: 69, z: -62, scale: 8, yaw: 1.7 },
  { x: -65, z: -42, scale: 6.4, yaw: 0.5 },
  { x: 61, z: -35, scale: 7.2, yaw: 2.1 },
  { x: -71, z: -12, scale: 8.4, yaw: 1.4 },
  { x: 72, z: -4, scale: 6.7, yaw: 0.1 },
  { x: -89, z: -18, scale: 8.1, yaw: 0.9 },
  { x: 90, z: 8, scale: 7.4, yaw: 2.6 },
  { x: -65, z: 19, scale: 7.5, yaw: 2.5 },
  { x: 66, z: 26, scale: 8.1, yaw: 1 },
  { x: -72, z: 48, scale: 6.6, yaw: 0.6 },
  { x: 70, z: 52, scale: 7.7, yaw: 2.7 },
  { x: -90, z: 43, scale: 7.5, yaw: 1.3 },
  { x: 89, z: 61, scale: 8.5, yaw: 0.5 },
  { x: -61, z: 72, scale: 8, yaw: 1.8 },
  { x: 62, z: 78, scale: 6.9, yaw: 0.3 },
  { x: -73, z: 101, scale: 7.8, yaw: 2.2 },
  { x: -51, z: 106, scale: 6.3, yaw: 1.2 },
  { x: 52, z: 103, scale: 7.1, yaw: 0.7 },
  { x: 74, z: 96, scale: 8.3, yaw: 2.9 },
  { x: -88, z: 113, scale: 7.9, yaw: 2 },
  { x: 88, z: 119, scale: 7.3, yaw: 1 },
  { x: -70, z: 127, scale: 6.8, yaw: 0.35 },
  { x: 68, z: 128, scale: 8.2, yaw: 2.75 },
];

export const TERRITORY_SIEGE_ROCKS: readonly TerritorySiegeSceneryPlacement[] = [
  { x: -86, z: 121, scale: 3.4, yaw: 1.8 },
  { x: 84, z: 112, scale: 3.7, yaw: 0.2 },
  { x: -53, z: 91, scale: 3.8, yaw: 0.4 },
  { x: 46, z: 92, scale: 3.1, yaw: 2.4 },
  { x: -59, z: 61, scale: 2.7, yaw: 1.2 },
  { x: 55, z: 58, scale: 3.6, yaw: 0.2 },
  { x: -70, z: 34, scale: 3.2, yaw: 2.8 },
  { x: 72, z: 16, scale: 2.8, yaw: 1.5 },
  { x: -61, z: -24, scale: 3.7, yaw: 0.9 },
  { x: 62, z: -48, scale: 3.4, yaw: 2.1 },
  { x: -69, z: -82, scale: 2.9, yaw: 1.7 },
  { x: 57, z: -88, scale: 3.8, yaw: 0.6 },
  { x: -36, z: 78, scale: 2.5, yaw: 2.5 },
  { x: 35, z: 72, scale: 2.6, yaw: 1.1 },
  { x: -87, z: 19, scale: 3, yaw: 2.2 },
  { x: 88, z: -29, scale: 3.5, yaw: 0.85 },
  { x: -83, z: -107, scale: 2.8, yaw: 0.4 },
  { x: 81, z: -120, scale: 3.1, yaw: 2.6 },
];

export const TERRITORY_SIEGE_BUSHES: readonly TerritorySiegeSceneryPlacement[] = [
  { x: -83, z: 124, scale: 2.6, yaw: 0.7 },
  { x: 81, z: 121, scale: 2.3, yaw: 2.1 },
  { x: -49, z: 104, scale: 2.8, yaw: 0.2 },
  { x: 56, z: 97, scale: 2.4, yaw: 1.2 },
  { x: -43, z: 86, scale: 2.1, yaw: 2.3 },
  { x: 42, z: 80, scale: 2.7, yaw: 0.7 },
  { x: -67, z: 62, scale: 2.5, yaw: 1.7 },
  { x: 65, z: 68, scale: 2.2, yaw: 2.8 },
  { x: -55, z: 43, scale: 2.7, yaw: 0.5 },
  { x: 58, z: 39, scale: 2.4, yaw: 1.9 },
  { x: -70, z: 3, scale: 2.2, yaw: 2.5 },
  { x: 68, z: -17, scale: 2.8, yaw: 0.8 },
  { x: -59, z: -55, scale: 2.3, yaw: 1.4 },
  { x: 57, z: -70, scale: 2.6, yaw: 2.2 },
  { x: -84, z: 72, scale: 2.7, yaw: 1.2 },
  { x: 86, z: 82, scale: 2.5, yaw: 2.4 },
  { x: -87, z: 23, scale: 2.2, yaw: 0.35 },
  { x: 85, z: -35, scale: 2.8, yaw: 1.55 },
  { x: -82, z: -93, scale: 2.4, yaw: 2.8 },
  { x: 84, z: -111, scale: 2.6, yaw: 0.15 },
];

export const TERRITORY_SIEGE_HOMES: readonly TerritorySiegeBuildingPlacement[] = [
  { kind: 'homeA', x: -27, z: -5, scale: 8.2, yaw: 0.35 },
  { kind: 'homeB', x: 27, z: -7, scale: 8, yaw: -0.3 },
  { kind: 'homeB', x: -27, z: -37, scale: 7.6, yaw: 0.15 },
  { kind: 'homeA', x: 27, z: -39, scale: 7.8, yaw: -0.2 },
];
