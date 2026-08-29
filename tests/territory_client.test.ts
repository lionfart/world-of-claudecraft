import { describe, expect, it, vi } from 'vitest';
import { TerritoryClient } from '../src/net/territory_client';
import type { TerritoryWarView } from '../src/world_api';

describe('territory client war notices', () => {
  it('keeps a personalized pre-war notice outside the on-demand map state', () => {
    const send = vi.fn();
    const client = new TerritoryClient(
      () => '',
      () => '',
      send,
    );
    const war: TerritoryWarView = {
      id: 'war',
      targetCellId: 3,
      attackerGuildId: '7',
      attackerGuildName: 'Seven',
      defenderGuildId: '8',
      defenderGuildName: 'Eight',
      status: 'declared',
      declaredAt: '2026-01-01T00:00:00.000Z',
      startsAt: '2026-01-01T00:05:00.000Z',
      endsAt: '2026-01-01T01:05:00.000Z',
      winnerGuildId: null,
      attackerCount: 2,
      defenderCount: 3,
      mySide: 'attacker',
      registered: true,
    };

    expect(client.handleMessage({ t: 'territory_war_notice', war, revision: 12 })).toBe(true);
    expect(client.notice).toEqual(war);
    expect(client.state).toBeNull();
    client.joinWar(war.id);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: 'territory_join_war', expectedRevision: 12 }),
    );
    expect(client.handleMessage({ t: 'territory_war_notice', war: null })).toBe(true);
    expect(client.notice).toBeNull();
  });
});
