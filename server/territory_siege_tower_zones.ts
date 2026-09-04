import type { TerritoryTowerZoneView } from '../src/world_api';

export interface TerritoryTowerTarget {
  characterId: number;
  warId: string;
  x: number;
  z: number;
  alive: boolean;
}

interface TerritoryTowerZone {
  id: number;
  warId: string;
  fromX: number;
  fromZ: number;
  x: number;
  z: number;
  radius: number;
  damage: number;
  durationMs: number;
  detonatesAtMs: number;
}

export class TerritorySiegeTowerZones {
  private readonly zones: TerritoryTowerZone[] = [];
  private nextId = 1;

  queue(
    warId: string,
    source: Pick<TerritoryTowerTarget, 'x' | 'z'>,
    target: Pick<TerritoryTowerTarget, 'x' | 'z'>,
    damage: number,
    nowMs: number,
  ): void {
    const durationMs = 1_800;
    this.zones.push({
      id: this.nextId++,
      warId,
      fromX: source.x,
      fromZ: source.z,
      x: target.x,
      z: target.z,
      radius: 5,
      damage,
      durationMs,
      detonatesAtMs: nowMs + durationMs,
    });
  }

  detonate(
    nowMs: number,
    targets: Iterable<TerritoryTowerTarget>,
  ): { hits: Array<{ characterId: number; damage: number }>; removed: boolean } {
    const due = this.zones.filter((zone) => zone.detonatesAtMs <= nowMs);
    if (due.length === 0) return { hits: [], removed: false };
    const livingTargets = [...targets].filter((target) => target.alive);
    const hits: Array<{ characterId: number; damage: number }> = [];
    for (const zone of due) {
      for (const target of livingTargets) {
        if (target.warId !== zone.warId) continue;
        if ((target.x - zone.x) ** 2 + (target.z - zone.z) ** 2 > zone.radius ** 2) continue;
        hits.push({ characterId: target.characterId, damage: zone.damage });
      }
    }
    const dueIds = new Set(due.map((zone) => zone.id));
    for (let i = this.zones.length - 1; i >= 0; i -= 1) {
      if (dueIds.has(this.zones[i].id)) this.zones.splice(i, 1);
    }
    return { hits, removed: true };
  }

  view(warId: string, nowMs: number): TerritoryTowerZoneView[] {
    return this.zones
      .filter((zone) => zone.warId === warId)
      .map((zone) => ({
        id: zone.id,
        fromX: zone.fromX,
        fromZ: zone.fromZ,
        x: zone.x,
        z: zone.z,
        radius: zone.radius,
        detonatesIn: Math.max(0, (zone.detonatesAtMs - nowMs) / 1_000),
        duration: zone.durationMs / 1_000,
      }));
  }
}
