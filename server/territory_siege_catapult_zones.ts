import type { TerritorySiegeCatapultImpact } from '../src/sim/territory_siege';
import type {
  TerritoryCatapultShotKind,
  TerritoryCatapultShotView,
  TerritoryWarSide,
} from '../src/world_api';

export interface TerritoryCatapultTarget {
  characterId: number;
  warId: string;
  side: TerritoryWarSide;
  x: number;
  z: number;
  alive: boolean;
}

interface TerritoryCatapultZone extends TerritorySiegeCatapultImpact {
  id: number;
  warId: string;
  sourceCharacterId: number;
  fromX: number;
  fromZ: number;
  x: number;
  z: number;
  queuedAtMs: number;
  launchesAtMs: number;
  detonatesAtMs: number;
  localX: number;
  localZ: number;
}

export interface TerritoryCatapultHit {
  sourceCharacterId: number;
  targetCharacterId: number;
  damage: number;
  kind: TerritoryCatapultShotKind;
  slow?: TerritorySiegeCatapultImpact['slow'];
}

/** Server clock for visible catapult flights and their landing damage. */
export class TerritorySiegeCatapultZones {
  private readonly zones: TerritoryCatapultZone[] = [];
  private nextId = 1;

  queue(
    impact: TerritorySiegeCatapultImpact & { warId: string; sourceCharacterId: number },
    world: { fromX: number; fromZ: number; x: number; z: number },
    nowMs: number,
  ): void {
    const launchDelayMs = impact.launchDelayMs ?? 0;
    this.zones.push({
      ...impact,
      localX: impact.x,
      localZ: impact.z,
      ...world,
      id: this.nextId++,
      queuedAtMs: nowMs,
      launchesAtMs: nowMs + launchDelayMs,
      detonatesAtMs: nowMs + launchDelayMs + impact.delayMs,
    });
  }

  detonate(
    nowMs: number,
    targets: Iterable<TerritoryCatapultTarget>,
  ): {
    hits: TerritoryCatapultHit[];
    impacts: TerritoryCatapultZone[];
    removed: boolean;
  } {
    const due = this.zones.filter((zone) => zone.detonatesAtMs <= nowMs);
    if (!due.length) return { hits: [], impacts: [], removed: false };
    const living = [...targets].filter((target) => target.alive);
    const hits: TerritoryCatapultHit[] = [];
    for (const zone of due) {
      for (const target of living) {
        if (target.warId !== zone.warId || target.side === zone.side) continue;
        if ((target.x - zone.x) ** 2 + (target.z - zone.z) ** 2 > zone.radius ** 2) continue;
        hits.push({
          sourceCharacterId: zone.sourceCharacterId,
          targetCharacterId: target.characterId,
          damage: zone.damage,
          kind: zone.kind,
          slow: zone.slow,
        });
      }
    }
    const ids = new Set(due.map((zone) => zone.id));
    for (let index = this.zones.length - 1; index >= 0; index -= 1) {
      if (ids.has(this.zones[index].id)) this.zones.splice(index, 1);
    }
    return { hits, impacts: due, removed: true };
  }

  view(warId: string, nowMs: number): TerritoryCatapultShotView[] {
    return this.zones
      .filter((zone) => zone.warId === warId)
      .map((zone) => ({
        id: zone.id,
        catapultId: zone.catapultId,
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
