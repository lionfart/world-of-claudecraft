import type * as THREE from 'three';
import { TERRITORY_SIEGE_SLOT_COUNT, territorySiegeOrigin } from '../sim/data';
import {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  TERRITORY_SIEGE_VISUAL_MARGIN,
} from '../sim/territory_siege_ground';
import type { TerritorySiegeView } from '../world_api';
import { setRenderCategory } from './renderer_diagnostics';
import {
  buildTerritorySiegePrototype,
  type TerritorySiegePrototypeView,
} from './territory_siege_prototype';

/** Lazily materializes and updates the four isolated seasonal siege fields. */
export class TerritorySiegeBand {
  private readonly views = new Map<number, TerritorySiegePrototypeView>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly siege: () => TerritorySiegeView | null,
  ) {}

  sync(x: number, z: number, time: number): void {
    for (let slot = 0; slot < TERRITORY_SIEGE_SLOT_COUNT; slot += 1) {
      if (this.views.has(slot)) continue;
      const origin = territorySiegeOrigin(slot);
      if (
        Math.abs(x - origin.x) >=
          TERRITORY_SIEGE_FIELD_HALF_X + TERRITORY_SIEGE_VISUAL_MARGIN + 20 ||
        Math.abs(z - origin.z) >= TERRITORY_SIEGE_FIELD_HALF_Z + TERRITORY_SIEGE_VISUAL_MARGIN + 20
      )
        continue;
      const view = buildTerritorySiegePrototype(slot);
      setRenderCategory(view.group, 'dungeon');
      this.scene.add(view.group);
      this.views.set(slot, view);
    }
    for (const view of this.views.values()) view.update(this.siege(), time, { x, z });
  }
}
