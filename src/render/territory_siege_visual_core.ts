import { TERRITORY_SIEGE_MAX_RAMS } from '../sim/territory_siege_layout';
import type { TerritorySiegeObjectiveTarget, TerritorySiegeView } from '../world_api';

export const TERRITORY_SIEGE_GATE_VISUAL_WIDTH = 20.4;
export const TERRITORY_SIEGE_GATE_VISUAL_HEIGHT = 5.8;
export const TERRITORY_SIEGE_CORE_CRYSTAL_SCALE = 2.8;
export const TERRITORY_SIEGE_RAM_HEAD_BASE_Z = -1.2;
export const TERRITORY_SIEGE_RAM_SUPPORT_X = 1.12;
export const TERRITORY_SIEGE_RAM_SUPPORT_Z = 0.82;

export interface TerritorySiegeVisualState {
  gateVisible: boolean;
  gateScaleY: number;
  coreScaleY: number;
  ramVisible: boolean;
  ramThrust: number;
  coreHealthVisible: boolean;
  coreChannelVisible: boolean;
  coreChannelPulse: number;
}

export interface TerritorySiegeGuideVisibility {
  ramDeployment: boolean;
  towerRanges: readonly [boolean, boolean];
}

/** A renderer target is actionable only while its authoritative view exists. */
export function territorySiegeObjectiveSelectable(
  siege: TerritorySiegeView | null,
  target: TerritorySiegeObjectiveTarget | null,
): boolean {
  if (!siege || !target || siege.state !== 'active') return false;
  if (target.kind === 'gate') return !siege.gateOpen;
  if (target.kind === 'wall')
    return siege.wallHealth?.some((entry) => entry.id === target.id && entry.hp > 0) ?? false;
  if (target.kind === 'tower')
    return (
      siege.defenseTowerLevel > 0 &&
      (siege.towerHealth?.some((entry) => entry.id === target.id && entry.hp > 0) ?? false)
    );
  if (target.kind === 'ram')
    return siege.rams?.length
      ? siege.rams.some((entry) => entry.id === target.id)
      : target.id === 0 && siege.ramDeployed;
  if (target.kind === 'mortar') return siege.mortars.some((entry) => entry.id === target.id);
  return siege.catapults?.some((entry) => entry.id === target.id) ?? false;
}

/** Tactical construction/range guides stay hidden until their objective is selected. */
export function territorySiegeGuideVisibility(
  siege: TerritorySiegeView | null,
  selectedObjective: TerritorySiegeObjectiveTarget | null,
  deployedRamCount: number,
): TerritorySiegeGuideVisibility {
  const active = siege?.state === 'active';
  const towersActive = active && (siege?.defenseTowerLevel ?? 0) > 0;
  const towerVisible = (id: 'left' | 'right'): boolean => {
    if (!towersActive || selectedObjective?.kind !== 'tower' || selectedObjective.id !== id)
      return false;
    const health = siege?.towerHealth?.find((entry) => entry.id === id);
    return !!health && health.hp > 0;
  };
  return {
    ramDeployment:
      active &&
      selectedObjective?.kind === 'gate' &&
      !siege?.gateOpen &&
      deployedRamCount < TERRITORY_SIEGE_MAX_RAMS,
    towerRanges: [towerVisible('left'), towerVisible('right')],
  };
}

export function territorySiegeVisualState(
  siege: TerritorySiegeView | null,
  timeSeconds: number,
): TerritorySiegeVisualState {
  const coreProgress = Math.max(0, Math.min(1, siege?.coreProgress ?? 0));
  const keepBreached =
    !!siege && (siege.gateOpen || !!siege.wallHealth?.some((wall) => wall.hp <= 0));
  return {
    gateVisible: !siege?.gateOpen,
    gateScaleY: siege?.gateOpen ? 0.08 : 1,
    coreScaleY: Math.max(0.7, 1 - coreProgress * 0.3),
    ramVisible: siege?.ramDeployed ?? false,
    ramThrust: siege?.ramDeployed && siege.ramCooldown > 0 ? Math.sin(timeSeconds * 8) * 0.72 : 0,
    coreHealthVisible: keepBreached,
    coreChannelVisible: siege?.coreChanneling ?? false,
    coreChannelPulse: 0.5 + Math.sin(timeSeconds * 5.4) * 0.5,
  };
}
