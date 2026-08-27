import type { TerritorySiegeView } from '../world_api';

export interface TerritorySiegeVisualState {
  gateVisible: boolean;
  gateScaleY: number;
  coreScaleY: number;
  ramVisible: boolean;
  ramSwing: number;
  rampVisible: boolean;
}

export function territorySiegeVisualState(
  siege: TerritorySiegeView | null,
  timeSeconds: number,
): TerritorySiegeVisualState {
  const gateProgress = Math.max(0, Math.min(1, siege?.gateProgress ?? 0));
  const coreProgress = Math.max(0, Math.min(1, siege?.coreProgress ?? 0));
  return {
    gateVisible: !siege?.gateOpen,
    gateScaleY: Math.max(0.08, 1 - gateProgress * 0.65),
    coreScaleY: Math.max(0.12, 1 - coreProgress * 0.7),
    ramVisible: siege?.ramDeployed ?? false,
    ramSwing: siege?.ramDeployed ? Math.sin(timeSeconds * 5) * 0.22 : 0,
    rampVisible: siege?.rampDeployed ?? false,
  };
}
