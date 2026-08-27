import { Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';
import { registerTerritoryMetrics } from '../../server/http/territory_metrics';

describe('territory operational metrics', () => {
  it('registers bounded labels and a live slot gauge on the supplied registry', async () => {
    const registry = new Registry();
    const sink = registerTerritoryMetrics(registry, () => 3);
    sink.snapshot('cache_hit');
    sink.resync('cascade');
    sink.declarationRejected('slots');
    sink.capture(0.2, 12);
    const body = await registry.metrics();
    expect(body).toContain('woc_territory_siege_slots_active 3');
    expect(body).toContain('outcome="cache_hit"');
    expect(body).toContain('reason="cascade"');
    expect(body).toContain('reason="slots"');
  });
});
