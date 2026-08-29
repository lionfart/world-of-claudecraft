import { describe, expect, it, vi } from 'vitest';
import type { TerritoryConfig } from '../../server/territory_config';
import type { TerritoryRepository } from '../../server/territory_db';
import { TerritoryService } from '../../server/territory_service';
import type { TerritoryMapState } from '../../src/world_api';

const config: TerritoryConfig = {
  enabled: true,
  seasonWeeks: 12,
  warNoticeSeconds: 300,
  warDurationSeconds: 3_600,
  attackerForfeitSeconds: 600,
  disconnectGraceSeconds: 120,
  respawnWaveSeconds: 15,
  teamSize: 20,
  realmWarSlots: 4,
  constructionBaseSeconds: 300,
  requirementsEnabled: false,
  changeRetentionDays: 14,
  closedLiveRetentionDays: 30,
  participantRetentionDays: 180,
  historyRetentionDays: 365,
};

function mapState(wars: TerritoryMapState['wars'] = []): TerritoryMapState {
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
    revision: 1,
    cells: [],
    structures: [],
    wars,
    guild: null,
    siege: null,
  };
}

function repositoryFake(snapshot: TerritoryMapState, dueSieges: unknown[] = []) {
  return {
    ensureActiveSeason: vi.fn().mockResolvedValue(undefined),
    loadPublicSnapshot: vi.fn().mockResolvedValue(snapshot),
    loadGuildViewsSnapshot: vi.fn().mockResolvedValue(
      new Map([
        [
          7,
          {
            id: '7',
            name: 'Seven',
            color: '#3e78b2',
            territoryLevel: 2,
            cellCapacity: 36,
            ownedCellCount: 4,
            resources: { wood: 10, iron: 20, grain: 30, labor: 40 },
            resourceCapacity: 2_500,
            accruedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      ]),
    ),
    loadActiveWarRegistrations: vi.fn().mockResolvedValue([]),
    activateDueWars: vi.fn().mockResolvedValue(null),
    loadDueSieges: vi.fn().mockResolvedValue(dueSieges),
    completeDueStructures: vi.fn().mockResolvedValue(null),
    rollSeasonIfDue: vi.fn().mockResolvedValue(false),
    joinWar: vi.fn(),
    leaveWar: vi.fn(),
  };
}

describe('territory service hot paths', () => {
  it('serves hot personalized snapshots without a per-viewer guild query', async () => {
    const repository = repositoryFake(mapState());
    const resolveActor = vi.fn().mockReturnValue({
      characterId: 11,
      guildId: 7,
      guildName: 'Seven',
      rank: 'officer',
    });
    const service = new TerritoryService(
      repository as unknown as TerritoryRepository,
      resolveActor,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      config,
    );

    const first = await service.snapshotForCharacter(11);
    const second = await service.snapshotForCharacter(11);

    expect(first.guild).toMatchObject({ id: '7', rank: 'officer', ownedCellCount: 4 });
    expect(second.guild).toEqual(first.guild);
    expect(repository.loadPublicSnapshot).toHaveBeenCalledTimes(1);
    expect(repository.loadGuildViewsSnapshot).toHaveBeenCalledTimes(1);
    expect(repository.loadActiveWarRegistrations).toHaveBeenCalledTimes(1);
    expect(repository.loadDueSieges).toHaveBeenCalledTimes(1);
  });

  it('does not poll PostgreSQL while no war or construction deadline is due', async () => {
    const repository = repositoryFake(mapState());
    const service = new TerritoryService(
      repository as unknown as TerritoryRepository,
      vi.fn().mockReturnValue(null),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      config,
    );
    await service.snapshotForCharacter(11);

    for (let nowMs = 1; nowMs <= 50_000; nowMs += 50) service.tickSieges(nowMs);
    await Promise.resolve();

    expect(repository.activateDueWars).not.toHaveBeenCalled();
    expect(repository.loadDueSieges).toHaveBeenCalledTimes(1);
    expect(repository.completeDueStructures).not.toHaveBeenCalled();
    expect(repository.rollSeasonIfDue).not.toHaveBeenCalled();
  });

  it('personalizes a declared-war queue without exposing participant identities', async () => {
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
      attackerCount: 6,
      defenderCount: 4,
      mySide: null,
      registered: false,
    };
    const repository = repositoryFake(mapState([war]));
    repository.loadActiveWarRegistrations.mockResolvedValue([{ warId: war.id, characterId: 11 }]);
    const service = new TerritoryService(
      repository as unknown as TerritoryRepository,
      vi.fn().mockReturnValue({
        characterId: 11,
        guildId: 7,
        guildName: 'Seven',
        rank: 'member',
      }),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      config,
    );

    const snapshot = await service.snapshotForCharacter(11);
    const notice = await service.warNoticeForCharacter(11);

    expect(snapshot.wars[0]).toMatchObject({ mySide: 'attacker', registered: true });
    expect(notice).toMatchObject({
      attackerCount: 6,
      defenderCount: 4,
      mySide: 'attacker',
      registered: true,
    });
    expect(Object.keys(notice ?? {})).not.toContain('participants');
  });

  it('joins a live local siege without force-hydrating every participant again', async () => {
    const nowMs = Date.now();
    const war = {
      id: '00000000-0000-4000-8000-000000000001',
      targetCellId: 1,
      attackerGuildId: '7',
      attackerGuildName: 'Seven',
      defenderGuildId: '8',
      defenderGuildName: 'Eight',
      status: 'active' as const,
      declaredAt: new Date(nowMs - 10_000).toISOString(),
      startsAt: new Date(nowMs - 1_000).toISOString(),
      endsAt: new Date(nowMs + 60_000).toISOString(),
      winnerGuildId: null,
      attackerCount: 0,
      defenderCount: 0,
      mySide: null,
      registered: false,
    };
    const repository = repositoryFake(mapState([war]), [
      {
        warId: war.id,
        version: 2,
        status: 'active',
        startsAtMs: nowMs - 1_000,
        endsAtMs: nowMs + 60_000,
        gateLevel: 0,
        coreLevel: 1,
        // Test seasons disable structure requirements, so siege tools remain
        // buildable even before a guild has placed its workshop.
        attackerHasSiegeWorkshop: false,
        defenseTowerLevel: 0,
        participants: [],
      },
    ]);
    repository.joinWar.mockResolvedValue({
      ok: true,
      delta: null,
      duplicate: false,
      guildId: 7,
      seat: { warId: war.id, side: 'attacker', seatNo: 1 },
    });
    const service = new TerritoryService(
      repository as unknown as TerritoryRepository,
      vi.fn().mockReturnValue({
        characterId: 11,
        guildId: 7,
        guildName: 'Seven',
        rank: 'member',
      }),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      config,
    );
    await service.snapshotForCharacter(11);

    const joined = await service.execute(11, '00000000-0000-4000-8000-000000000002', 1, {
      kind: 'join_war',
      warId: war.id,
    });
    const actionId = '00000000-0000-4000-8000-000000000003';
    const action = await service.execute(11, actionId, 1, {
      kind: 'siege_action',
      action: 'start_core_channel',
    });
    const duplicate = await service.execute(11, actionId, 1, {
      kind: 'siege_action',
      action: 'start_core_channel',
    });

    expect(joined).toMatchObject({ ok: true, seat: { seatNo: 1 } });
    expect(action).toMatchObject({ ok: true, duplicate: false });
    expect(duplicate).toMatchObject({ ok: true, duplicate: true });
    expect(repository.loadDueSieges).toHaveBeenCalledTimes(1);
  });
});
