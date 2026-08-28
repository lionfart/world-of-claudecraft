import type * as THREE from 'three';
import type { PrewarmResumeUnit } from '../prewarm_resume';
import type { RenderableDiagnosticObject } from '../renderer_diagnostics';
import type { VariantPrewarmSlot } from '../variant_prewarm_slot';
import type { AbilityVfxFx } from './fx';
import { abilityVfxTexturePrewarmSteps } from './prewarm';
import type { AbilityVfxPrewarmGate } from './prewarm_gate';

export interface AbilityVfxPrewarmEntryOptions {
  gate: AbilityVfxPrewarmGate;
  fx: AbilityVfxFx;
  player: { id: number; pos: { x: number; y: number; z: number } };
  scene: THREE.Scene;
  abilityMaterialSlot: VariantPrewarmSlot;
  combatSkillMaterialSlot: VariantPrewarmSlot;
  primitiveProgramUnits: () => readonly PrewarmResumeUnit[];
  prewarmTexture: (texture: THREE.Texture) => void;
  prewarmMaterialTextures: (material: THREE.Material | THREE.Material[]) => void;
  compileColorPrograms: (group: THREE.Group) => Promise<unknown>;
}

export function createAbilityVfxPrewarmEntry(options: AbilityVfxPrewarmEntryOptions) {
  const resumeUnits = (): readonly PrewarmResumeUnit[] => [
    { id: 'ability-vfx:begin', run: () => options.gate.begin() },
    ...abilityVfxTexturePrewarmSteps().map((step) => ({
      id: `texture:${step.id}`,
      run: () => {
        for (const texture of step.build()) options.prewarmTexture(texture);
      },
    })),
    ...options.abilityMaterialSlot.resumeUnits(),
    ...options.combatSkillMaterialSlot.resumeUnits(),
    ...options.primitiveProgramUnits(),
    { id: 'ability-vfx:ready', run: () => options.gate.complete() },
  ];
  const run = async (): Promise<void> => {
    options.gate.begin();
    try {
      const { id, pos } = options.player;
      options.fx.prewarmSpawn(pos.x, pos.y, pos.z - 5, id);
      options.abilityMaterialSlot.run();
      options.combatSkillMaterialSlot.run();
      const groups = [
        options.abilityMaterialSlot.group,
        options.combatSkillMaterialSlot.group,
      ].filter((group): group is THREE.Group => group !== null);
      await Promise.all([
        ...groups.map(options.compileColorPrograms),
        ...options.primitiveProgramUnits().map((unit) => unit.run()),
      ]);
      options.scene.traverse((child) => {
        const renderable = child as RenderableDiagnosticObject;
        if (renderable.userData.renderCategory === 'vfx' && renderable.material) {
          options.prewarmMaterialTextures(renderable.material);
        }
      });
      options.gate.complete();
    } catch (error) {
      options.gate.fail();
      throw error;
    }
  };
  return {
    category: 'vfx' as const,
    priority: 62,
    required: false,
    resumeUnits,
    run,
  };
}
