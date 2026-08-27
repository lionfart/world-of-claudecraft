import { Counter, Gauge, Histogram, type Registry } from 'prom-client';

export type TerritorySnapshotOutcome = 'cache_hit' | 'cache_miss';
export type TerritoryResyncReason = 'cascade' | 'cursor' | 'frame_limit' | 'season';
export type TerritoryDeclarationRejection = 'conflict' | 'slots';

export interface TerritoryMetricSink {
  snapshot(outcome: TerritorySnapshotOutcome): void;
  resync(reason: TerritoryResyncReason): void;
  declarationRejected(reason: TerritoryDeclarationRejection): void;
  capture(durationSeconds: number, cascadeCells: number): void;
}

const noop: TerritoryMetricSink = {
  snapshot() {},
  resync() {},
  declarationRejected() {},
  capture() {},
};

let sink: TerritoryMetricSink = noop;

export function territoryMetrics(): TerritoryMetricSink {
  return sink;
}

export function registerTerritoryMetrics(
  registry: Registry,
  activeSlots: () => number,
): TerritoryMetricSink {
  const snapshots = new Counter({
    name: 'woc_territory_snapshots_total',
    help: 'Territory map snapshots by process-cache outcome.',
    labelNames: ['outcome'],
    registers: [registry],
  });
  const resyncs = new Counter({
    name: 'woc_territory_resyncs_total',
    help: 'Forced territory snapshot resyncs by bounded reason.',
    labelNames: ['reason'],
    registers: [registry],
  });
  const declarationRejections = new Counter({
    name: 'woc_territory_declaration_rejections_total',
    help: 'Territory war declarations rejected by overlap or realm slot capacity.',
    labelNames: ['reason'],
    registers: [registry],
  });
  const captureDuration = new Histogram({
    name: 'woc_territory_capture_duration_seconds',
    help: 'End-to-end database transaction time for a territory war resolution.',
    buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });
  const cascadeSize = new Histogram({
    name: 'woc_territory_capture_cascade_cells',
    help: 'Cells neutralized by a resolved capture cascade.',
    buckets: [0, 1, 8, 32, 128, 512, 2_048, 10_000, 60_000],
    registers: [registry],
  });
  new Gauge({
    name: 'woc_territory_siege_slots_active',
    help: 'Currently materialized territory siege instances in this realm process.',
    registers: [registry],
    collect() {
      this.set(Math.max(0, activeSlots()));
    },
  });
  for (const outcome of ['cache_hit', 'cache_miss'] as const) snapshots.inc({ outcome }, 0);
  for (const reason of ['cascade', 'cursor', 'frame_limit', 'season'] as const) {
    resyncs.inc({ reason }, 0);
  }
  for (const reason of ['conflict', 'slots'] as const) declarationRejections.inc({ reason }, 0);

  sink = {
    snapshot(outcome) {
      try {
        snapshots.inc({ outcome });
      } catch {}
    },
    resync(reason) {
      try {
        resyncs.inc({ reason });
      } catch {}
    },
    declarationRejected(reason) {
      try {
        declarationRejections.inc({ reason });
      } catch {}
    },
    capture(durationSeconds, cascadeCells) {
      try {
        if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
          captureDuration.observe(durationSeconds);
        }
        if (Number.isFinite(cascadeCells) && cascadeCells >= 0) cascadeSize.observe(cascadeCells);
      } catch {}
    },
  };
  return sink;
}
