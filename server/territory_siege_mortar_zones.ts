import type { TerritorySiegeMortarImpact } from '../src/sim/territory_siege';
import type {
  TerritoryMortarShotKind,
  TerritoryMortarZoneView,
  TerritoryWarSide,
} from '../src/world_api';

export interface TerritoryMortarTarget {
  characterId: number;
  warId: string;
  side: TerritoryWarSide;
  x: number;
  z: number;
  alive: boolean;
}

interface TerritoryMortarZone
  extends Omit<TerritorySiegeMortarImpact, 'fromX' | 'fromZ' | 'x' | 'z'> {
  id: number;
  warId: string;
  sourceCharacterId: number;
  fromX: number;
  fromZ: number;
  x: number;
  z: number;
  launchesAtMs: number;
  detonatesAtMs: number;
}

export interface TerritoryMortarHit {
  sourceCharacterId: number;
  targetCharacterId: number;
  damage: number;
  kind: TerritoryMortarShotKind;
  slow?: TerritorySiegeMortarImpact['slow'];
  poison?: TerritorySiegeMortarImpact['poison'];
  stun?: TerritorySiegeMortarImpact['stun'];
}

/**
 * Server-timed mortar shell flights. The only damage candidates accepted here are
 * participant players, and the side filter excludes the gunner's allies.
 * Castle gate/core objects never enter this collection and can never be hit.
 */
export class TerritorySiegeMortarZones {
  private readonly zones: TerritoryMortarZone[] = [];
  private nextId = 1;

  queue(
    impact: TerritorySiegeMortarImpact & { warId: string; sourceCharacterId: number },
    world: { fromX: number; fromZ: number; x: number; z: number },
    nowMs: number,
  ): void {
    const launchDelayMs = impact.launchDelayMs ?? 0;
    this.zones.push({
      ...impact,
      ...world,
      id: this.nextId++,
      launchesAtMs: nowMs + launchDelayMs,
      detonatesAtMs: nowMs + launchDelayMs + impact.delayMs,
    });
  }

  detonate(
    nowMs: number,
    targets: Iterable<TerritoryMortarTarget>,
  ): {
    hits: TerritoryMortarHit[];
    impacts: Array<Pick<TerritoryMortarZone, 'x' | 'z' | 'radius' | 'kind'>>;
    removed: boolean;
  } {
    const due = this.zones.filter((zone) => zone.detonatesAtMs <= nowMs);
    if (due.length === 0) return { hits: [], impacts: [], removed: false };
    const livingTargets = [...targets].filter((target) => target.alive);
    const hits: TerritoryMortarHit[] = [];
    for (const zone of due) {
      for (const target of livingTargets) {
        if (target.warId !== zone.warId || target.side === zone.side) continue;
        if ((target.x - zone.x) ** 2 + (target.z - zone.z) ** 2 > zone.radius ** 2) continue;
        hits.push({
          sourceCharacterId: zone.sourceCharacterId,
          targetCharacterId: target.characterId,
          damage: zone.damage,
          kind: zone.kind,
          slow: zone.slow,
          poison: zone.poison,
          stun: zone.stun,
        });
      }
    }
    const dueIds = new Set(due.map((zone) => zone.id));
    for (let index = this.zones.length - 1; index >= 0; index -= 1) {
      if (dueIds.has(this.zones[index].id)) this.zones.splice(index, 1);
    }
    return {
      hits,
      impacts: due.map(({ x, z, radius, kind }) => ({ x, z, radius, kind })),
      removed: true,
    };
  }

  view(warId: string, nowMs: number): TerritoryMortarZoneView[] {
    return this.zones
      .filter((zone) => zone.warId === warId)
      .map((zone) => ({
        id: zone.id,
        mortarId: zone.mortarId,
        fromX: zone.fromX,
        fromZ: zone.fromZ,
        x: zone.x,
        z: zone.z,
        radius: zone.radius,
        kind: zone.kind,
        duration: zone.delayMs / 1_000,
        launchesIn: Math.max(0, (zone.launchesAtMs - nowMs) / 1_000),
        detonatesIn: Math.max(0, (zone.detonatesAtMs - nowMs) / 1_000),
      }));
  }
}
