// THE HEX BUILDING KIT's measured footprints, the one source of truth for how
// big these models actually are.
//
// Every hand-placed building in the game collides as a CIRCLE, and these models
// are rectangles. A circle that contains a rectangle bulges past its flat walls,
// worst at the middle of each wall, and the player's own 0.5yd radius widens
// that band again: you are stopped in open air with the wall still a stride
// away. Player report: "the collision on things like the stables is too large
// causing a buffer around the building making it seem like there is an
// invisible wall". Undersizing is the same defect mirrored, and reads worse: the
// circle then cuts the CORNERS off, so you are walled out of ground the model
// does not occupy while also clipping into it along the axes.
//
// The three colourways (hex_ green, hexr_ red, hexb_ blue) are the same meshes,
// so one table serves Dawnhold, the Last Keep and the Ashen Bulwark. Values are
// the model's own bounding footprint at scale 1, measured off the shipped GLBs.
// Pure leaf: no rng, no SimContext, no imports.

export interface HexBuildingUnit {
  /** unit extent along the model's local x, at scale 1 */
  w: number;
  /** unit extent along the model's local z, at scale 1 */
  d: number;
  /** local-space centre offset measured from the asset origin */
  cx?: number;
  /** local-space centre offset measured from the asset origin */
  cz?: number;
}

/** Measured unit footprints, keyed by model family (colourway suffix dropped). */
export const HEX_BUILDING_UNIT: Record<string, HexBuildingUnit> = {
  castle: { w: 1.97522, d: 2.2561 },
  barracks: { w: 1.44004, d: 1.56617, cz: 0.063035 },
  townhall: { w: 1.43506, d: 1.56376, cx: -0.00129, cz: -0.00183 },
  church: { w: 1.0291, d: 1.155 },
  tavern: { w: 1.1718, d: 1.3324 },
  stables: { w: 1.8587, d: 2.1316 },
  homeA: { w: 0.79194, d: 0.85371, cz: -0.041825 },
  homeB: { w: 0.87495, d: 1.09875, cx: -0.001285, cz: 0.010675 },
  market: { w: 1.7994, d: 1.3156 },
  blacksmith: { w: 1.2876, d: 1.24517, cx: 0.0138, cz: 0.062575 },
  archeryrange: { w: 1.6706, d: 1.5509 },
  towerCatapult: { w: 0.9297, d: 1.3033 },
  towerCannon: { w: 0.92974, d: 1.11103, cz: 0.024435 },
  tent: { w: 1.51643, d: 1.34502, cx: 0.001935, cz: -0.08402 },
  watchtower: { w: 1.0449, d: 1.0449 },
  well: { w: 0.65177, d: 0.75068, cx: 0.010935 },
  hay: { w: 0.4, d: 0.21586 },
};

/** `hexrStables` to `stables`, so one table covers all three colourways. */
export function hexBuildingFamily(key: string): string {
  const m = /^hex[rb]?([A-Z]\w*)$/.exec(key);
  if (!m) return key;
  return m[1].charAt(0).toLowerCase() + m[1].slice(1);
}

/**
 * The model's half-extents at an authored scale, in the model's LOCAL axes.
 *
 * Local, not world: the collider carries the same `rot` the prop is drawn with
 * and rotates the query point into local space, so these never need swapping
 * for a rotated building. Returns null for a key with no measurement, and the
 * caller keeps its circle.
 */
export function hexBuildingBox(
  key: string,
  scale: number,
): { hw: number; hd: number } | null {
  const u = HEX_BUILDING_UNIT[hexBuildingFamily(key)];
  if (!u) return null;
  return { hw: (u.w * scale) / 2, hd: (u.d * scale) / 2 };
}

/** Full measured local footprint, including asymmetric asset-origin offsets. */
export function hexBuildingBounds(
  key: string,
  scaleX: number,
  scaleZ = scaleX,
): { hw: number; hd: number; cx: number; cz: number } | null {
  const unit = HEX_BUILDING_UNIT[hexBuildingFamily(key)];
  if (!unit) return null;
  return {
    hw: (unit.w * scaleX) / 2,
    hd: (unit.d * scaleZ) / 2,
    cx: (unit.cx ?? 0) * scaleX,
    cz: (unit.cz ?? 0) * scaleZ,
  };
}
