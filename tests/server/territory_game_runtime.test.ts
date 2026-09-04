import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { TerritoryRepository } from '../../server/territory_db';
import { TerritoryGameRuntime } from '../../server/territory_game_runtime';
import type { Sim } from '../../src/sim/sim';
import { createTerritoryManifest } from '../../src/sim/territory_manifest';
import type { TerritoryMapState } from '../../src/world_api';

const war = {
  id: '00000000-0000-4000-8000-000000000010',
  targetCellId: 3,
  attackerGuildId: '7',
  attackerGuildName: 'Seven',
  defenderGuildId: '8',
  defenderGuildName: 'Eight',
  status: 'declared' as const,
  declaredAt: '2026-01-01T00:00:00.000Z',
  startsAt: '2026-01-01T00:05:00.000Z',
  endsAt: '2026-01-01T01:05:00.000Z',
  winnerGuildId: null,
  attackerCount: 1,
  defenderCount: 1,
  mySide: null,
  registered: false,
};

function mapState(): TerritoryMapState {
  return {
    season: {
      id: '1',
      number: 1,
      manifestVersion: 1,
      manifestChecksum: 'test',
      radius: 63,
      requirementsEnabled: false,
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-04-01T00:00:00.000Z',
    },
    revision: 4,
    cells: [],
    structures: [],
    wars: [war],
    guild: null,
    siege: null,
  };
}

function repositoryFake(): TerritoryRepository {
  return {
    manifest: createTerritoryManifest(),
    ensureActiveSeason: vi.fn().mockResolvedValue(undefined),
    loadPublicSnapshot: vi.fn().mockResolvedValue(mapState()),
    loadGuildViewsSnapshot: vi.fn().mockResolvedValue(new Map()),
    loadActiveWarRegistrations: vi.fn().mockResolvedValue([]),
    loadDueSieges: vi.fn().mockResolvedValue([]),
    activateDueWars: vi.fn().mockResolvedValue(null),
    completeDueStructures: vi.fn().mockResolvedValue(null),
    rollSeasonIfDue: vi.fn().mockResolvedValue(false),
  } as unknown as TerritoryRepository;
}

describe('territory game runtime entry notice', () => {
  it('refreshes the badge after the join-time guild stamp becomes available', async () => {
    const session = {
      accountId: 1,
      characterId: 11,
      pid: 101,
      left: false,
      linkdead: false,
    };
    let guildLoaded = false;
    const sent: unknown[] = [];
    const runtime = new TerritoryGameRuntime(
      repositoryFake(),
      () =>
        guildLoaded ? { characterId: 11, guildId: 8, guildName: 'Eight', rank: 'member' } : null,
      {
        sim: {} as Sim,
        sessions: () => [session],
        sessionByCharacterId: () => session,
        send: (_session, message) => sent.push(message),
        sendRaw: () => undefined,
        teleport: () => undefined,
      },
    );

    runtime.reconnect(session);
    await vi.waitFor(() =>
      expect(sent).toContainEqual({ t: 'territory_war_notice', war: null, revision: 4 }),
    );

    guildLoaded = true;
    runtime.refreshWarNotice(session);
    await vi.waitFor(() =>
      expect(sent).toContainEqual({
        t: 'territory_war_notice',
        revision: 4,
        war: expect.objectContaining({ id: war.id, mySide: 'defender' }),
      }),
    );
  });

  it('wires the post-social refresh into the fresh join lifecycle', () => {
    const source = readFileSync('server/game.ts', 'utf8');
    const join = source.slice(source.indexOf('firstJoin: the fresh-join path'));
    const socialInit = join.indexOf('this.initSocial(session, true)');
    const refresh = join.indexOf('territoryGame.refreshWarNotice');

    expect(socialInit).toBeGreaterThanOrEqual(0);
    expect(refresh).toBeGreaterThan(socialInit);
  });
});
