import type { TerritorySiegeView } from '../world_api';

export interface TerritorySiegeVisualState {
  gateVisible: boolean;
  gateScaleY: number;
  coreScaleY: number;
  ramVisible: boolean;
  ramSwing: number;
  coreChannelVisible: boolean;
}

export function territorySiegeVisualState(
  siege: TerritorySiegeView | null,
  timeSeconds: number,
): TerritorySiegeVisualState {
  const coreProgress = Math.max(0, Math.min(1, siege?.coreProgress ?? 0));
  return {
    gateVisible: !siege?.gateOpen,
    gateScaleY: siege?.gateOpen ? 0.08 : 1,
    coreScaleY: Math.max(0.12, 1 - coreProgress * 0.7),
    ramVisible: siege?.ramDeployed ?? false,
    ramSwing: siege?.ramDeployed && siege.ramCooldown > 0 ? Math.sin(timeSeconds * 8) * 0.28 : 0,
    coreChannelVisible: siege?.coreChanneling ?? false,
  };
}
