import type * as THREE from 'three';
import { TERRITORY_SIEGE_SLOT_COUNT, territorySiegeOrigin } from '../sim/data';
import type { TerritorySiegeBiome } from '../sim/territory_siege_biome';
import {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  TERRITORY_SIEGE_VISUAL_MARGIN,
} from '../sim/territory_siege_ground';
import type { TerritorySiegeObjectiveTarget, TerritorySiegeView } from '../world_api';
import { setRenderCategory } from './renderer_diagnostics';
import {
  buildTerritorySiegePrototype,
  type TerritorySiegePrototypeView,
} from './territory_siege_prototype';

/** Lazily materializes and updates the four isolated seasonal siege fields. */
export class TerritorySiegeBand {
  private readonly views = new Map<
    number,
    { biome: TerritorySiegeBiome; view: TerritorySiegePrototypeView }
  >();
  private readonly objectiveTargets: THREE.Object3D[] = [];
  private selectedObjective: TerritorySiegeObjectiveTarget | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly siege: () => TerritorySiegeView | null,
  ) {}

  sync(x: number, z: number, time: number): void {
    const siege = this.siege();
    for (let slot = 0; slot < TERRITORY_SIEGE_SLOT_COUNT; slot += 1) {
      const origin = territorySiegeOrigin(slot);
      if (
        Math.abs(x - origin.x) >=
          TERRITORY_SIEGE_FIELD_HALF_X + TERRITORY_SIEGE_VISUAL_MARGIN + 20 ||
        Math.abs(z - origin.z) >= TERRITORY_SIEGE_FIELD_HALF_Z + TERRITORY_SIEGE_VISUAL_MARGIN + 20
      )
        continue;
      if (!siege) continue;
      const existing = this.views.get(slot);
      if (existing?.biome === siege.biome) continue;
      if (existing) {
        this.scene.remove(existing.view.group);
        this.views.delete(slot);
        this.rebuildObjectiveTargets();
      }
      const view = buildTerritorySiegePrototype(slot, siege.biome);
      setRenderCategory(view.group, 'dungeon');
      this.scene.add(view.group);
      this.views.set(slot, { biome: siege.biome, view });
      this.rebuildObjectiveTargets();
    }
    for (const { view } of this.views.values())
      view.update(siege, time, { x, z }, this.selectedObjective);
  }

  /** Direct, exact picking for siege objectives; no character-style sloppy assist. */
  pickObjective(
    raycaster: THREE.Raycaster,
    hits: THREE.Intersection[],
  ): TerritorySiegeObjectiveTarget | null {
    if (!this.objectiveTargets.length) return null;
    hits.length = 0;
    raycaster.intersectObjects(this.objectiveTargets, true, hits);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        const objective = object.userData.territorySiegeObjective as
          | TerritorySiegeObjectiveTarget
          | undefined;
        if (objective && object.visible) {
          hits.length = 0;
          return objective;
        }
        object = object.parent;
      }
    }
    hits.length = 0;
    return null;
  }

  setSelectedObjective(target: TerritorySiegeObjectiveTarget | null): void {
    this.selectedObjective = target;
  }

  private rebuildObjectiveTargets(): void {
    this.objectiveTargets.length = 0;
    for (const { view } of this.views.values())
      this.objectiveTargets.push(...view.objectiveTargets);
  }
}
