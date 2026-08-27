import type * as THREE from 'three';
import { TERRITORY_SIEGE_SLOT_COUNT, territorySiegeOrigin } from '../sim/data';
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
      if (Math.abs(x - origin.x) >= 180 || Math.abs(z - origin.z) >= 180) continue;
      const view = buildTerritorySiegePrototype(slot);
      setRenderCategory(view.group, 'dungeon');
      this.scene.add(view.group);
      this.views.set(slot, view);
    }
    for (const view of this.views.values()) view.update(this.siege(), time);
  }
}
