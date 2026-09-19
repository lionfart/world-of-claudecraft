import type { TerritorySiegeObjectiveTarget, TerritorySiegeView } from '../world_api';

export type TerritorySiegeObjectiveLabelKey =
  | 'hudChrome.territoryMap.gateName'
  | 'hudChrome.territoryMap.wallName'
  | 'hudChrome.territoryMap.towerName'
  | 'hudChrome.territoryMap.ramName'
  | 'hudChrome.territoryMap.mortarName'
  | 'hudChrome.territoryMap.catapultName';

export interface TerritorySiegeObjectiveFrameView {
  current: number;
  maximum: number;
  level: number | null;
  labelKey: TerritorySiegeObjectiveLabelKey;
  key: string;
}

/** Resolves the selected siege object's target-frame readout from one authoritative snapshot. */
export function territorySiegeObjectiveFrameView(
  siege: TerritorySiegeView | null | undefined,
  target: TerritorySiegeObjectiveTarget | null,
): TerritorySiegeObjectiveFrameView | null {
  if (!target || !siege || siege.state === 'ended') return null;
  if (target.kind === 'gate') {
    const maximum = siege.gateMaxHp ?? 100;
    const current = siege.gateHp ?? Math.max(0, 1 - siege.gateProgress) * maximum;
    return current > 0
      ? {
          current,
          maximum,
          level: siege.castleLevel,
          labelKey: 'hudChrome.territoryMap.gateName',
          key: 'gate',
        }
      : null;
  }
  if (target.kind === 'wall') {
    const health = siege.wallHealth?.find((entry) => entry.id === target.id);
    return health && health.hp > 0
      ? {
          current: health.hp,
          maximum: health.maxHp,
          level: siege.castleLevel,
          labelKey: 'hudChrome.territoryMap.wallName',
          key: `wall:${target.id}`,
        }
      : null;
  }
  if (target.kind === 'tower') {
    const health = siege.towerHealth?.find((entry) => entry.id === target.id);
    return health && health.hp > 0
      ? {
          current: health.hp,
          maximum: health.maxHp,
          level: siege.defenseTowerLevel,
          labelKey: 'hudChrome.territoryMap.towerName',
          key: `tower:${target.id}`,
        }
      : null;
  }
  const weapon =
    target.kind === 'ram'
      ? siege.rams?.find((entry) => entry.id === target.id)
      : target.kind === 'mortar'
        ? siege.mortars.find((entry) => entry.id === target.id)
        : siege.catapults?.find((entry) => entry.id === target.id);
  const current = weapon?.hp ?? weapon?.maxHp ?? 1;
  const maximum = weapon?.maxHp ?? Math.max(1, current);
  if (!weapon || current <= 0) return null;
  return {
    current,
    maximum,
    level: null,
    labelKey:
      target.kind === 'ram'
        ? 'hudChrome.territoryMap.ramName'
        : target.kind === 'mortar'
          ? 'hudChrome.territoryMap.mortarName'
          : 'hudChrome.territoryMap.catapultName',
    key: `${target.kind}:${target.id}`,
  };
}
