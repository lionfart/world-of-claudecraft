import type { TerritorySiegeView } from '../world_api';

export const TERRITORY_SIEGE_GATE_VISUAL_WIDTH = 20.4;
export const TERRITORY_SIEGE_GATE_VISUAL_HEIGHT = 5.8;
export const TERRITORY_SIEGE_CORE_CRYSTAL_SCALE = 2.8;

export interface TerritorySiegeVisualState {
  gateVisible: boolean;
  gateScaleY: number;
  coreScaleY: number;
  ramVisible: boolean;
  ramSwing: number;
  coreChannelVisible: boolean;
  coreChannelPulse: number;
}

export function territorySiegeVisualState(
  siege: TerritorySiegeView | null,
  timeSeconds: number,
): TerritorySiegeVisualState {
  const coreProgress = Math.max(0, Math.min(1, siege?.coreProgress ?? 0));
  return {
    gateVisible: !siege?.gateOpen,
    gateScaleY: siege?.gateOpen ? 0.08 : 1,
    coreScaleY: Math.max(0.7, 1 - coreProgress * 0.3),
    ramVisible: siege?.ramDeployed ?? false,
    ramSwing: siege?.ramDeployed && siege.ramCooldown > 0 ? Math.sin(timeSeconds * 8) * 0.28 : 0,
    coreChannelVisible: siege?.coreChanneling ?? false,
    coreChannelPulse: 0.5 + Math.sin(timeSeconds * 5.4) * 0.5,
  };
}
