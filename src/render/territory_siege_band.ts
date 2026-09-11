import type * as THREE from 'three';
import { TERRITORY_SIEGE_SLOT_COUNT, territorySiegeOrigin } from '../sim/data';
import type { TerritorySiegeBiome } from '../sim/territory_siege_biome';
import {
  TERRITORY_SIEGE_FIELD_HALF_X,
  TERRITORY_SIEGE_FIELD_HALF_Z,
  TERRITORY_SIEGE_VISUAL_MARGIN,
} from '../sim/territory_siege_ground';
import type {
  TerritoryCaptureView,
  TerritorySiegeObjectiveTarget,
  TerritorySiegeView,
} from '../world_api';
import { setRenderCategory } from './renderer_diagnostics';
import {
  buildTerritoryCapturePrototype,
  type TerritoryCapturePrototypeView,
} from './territory_capture_prototype';
import {
  buildTerritorySiegePrototype,
  type TerritorySiegePrototypeView,
} from './territory_siege_prototype';
import { territorySiegeObjectiveSelectable } from './territory_siege_visual_core';

type TerritoryBattlefieldView =
  | {
      kind: 'siege';
      biome: TerritorySiegeBiome;
      view: TerritorySiegePrototypeView;
    }
  | {
      kind: 'capture';
      biome: TerritorySiegeBiome;
      view: TerritoryCapturePrototypeView;
    };

/** Lazily materializes and updates the four isolated seasonal siege fields. */
export class TerritorySiegeBand {
  private readonly views = new Map<number, TerritoryBattlefieldView>();
  private readonly objectiveTargets: THREE.Object3D[] = [];
  private selectedObjective: TerritorySiegeObjectiveTarget | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly state: () => {
      siege: TerritorySiegeView | null;
      capture: TerritoryCaptureView | null;
    },
  ) {}

  sync(x: number, z: number, time: number): void {
    const { siege, capture } = this.state();
    if (!territorySiegeObjectiveSelectable(siege, this.selectedObjective)) {
      this.selectedObjective = null;
    }
    const kind = capture ? 'capture' : 'siege';
    const biome = capture?.biome ?? siege?.biome ?? null;
    for (let slot = 0; slot < TERRITORY_SIEGE_SLOT_COUNT; slot += 1) {
      if (capture && slot !== capture.slot) continue;
      const origin = territorySiegeOrigin(slot);
      if (
        Math.abs(x - origin.x) >=
          TERRITORY_SIEGE_FIELD_HALF_X + TERRITORY_SIEGE_VISUAL_MARGIN + 20 ||
        Math.abs(z - origin.z) >=
          TERRITORY_SIEGE_FIELD_HALF_Z + TERRITORY_SIEGE_VISUAL_MARGIN + 20
      )
        continue;
      if (!biome) continue;
      const existing = this.views.get(slot);
      if (existing && existing.biome === biome && existing.kind === kind)
        continue;
      if (existing) {
        this.scene.remove(existing.view.group);
        this.views.delete(slot);
        this.rebuildObjectiveTargets();
      }
      const view = capture
        ? buildTerritoryCapturePrototype(slot, biome)
        : buildTerritorySiegePrototype(slot, biome);
      setRenderCategory(view.group, 'dungeon');
      this.scene.add(view.group);
      this.views.set(
        slot,
        capture
          ? {
              kind: 'capture',
              biome,
              view: view as TerritoryCapturePrototypeView,
            }
          : { kind: 'siege', biome, view: view as TerritorySiegePrototypeView },
      );
      this.rebuildObjectiveTargets();
    }
    for (const entry of this.views.values()) {
      if (entry.kind === 'capture') entry.view.update(capture, time);
      else entry.view.update(siege, time, { x, z }, this.selectedObjective);
    }
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
          TerritorySiegeObjectiveTarget | undefined;
        if (
          objective &&
          object.visible &&
          territorySiegeObjectiveSelectable(this.state().siege, objective)
        ) {
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
    this.selectedObjective = territorySiegeObjectiveSelectable(
      this.state().siege,
      target,
    )
      ? target
      : null;
  }

  private rebuildObjectiveTargets(): void {
    this.objectiveTargets.length = 0;
    for (const entry of this.views.values())
      if (entry.kind === 'siege')
        this.objectiveTargets.push(...entry.view.objectiveTargets);
  }
}
