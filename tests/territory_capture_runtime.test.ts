import { describe, expect, it, vi } from 'vitest';
import { TerritoryCaptureRuntime } from '../server/territory_capture_runtime';
import type { TerritoryService } from '../server/territory_service';
import { territorySiegeOrigin } from '../src/sim/data';
import type { Sim } from '../src/sim/sim';
import { territoryCellClaimable } from '../src/sim/territory_biome';
import {
  TERRITORY_CAPTURE_CAMP_Z,
  TERRITORY_CAPTURE_HOLD_MS,
  TERRITORY_CAPTURE_PREPARE_MS,
  TERRITORY_CAPTURE_RESPAWN_MS,
} from '../src/sim/territory_capture';
import { createTerritoryManifest } from '../src/sim/territory_manifest';
import type { Entity } from '../src/sim/types';
import type { TerritoryMapState } from '../src/world_api';

describe('TerritoryCaptureRuntime', () => {
  it('spawns biome guards, unlocks camp progress after their deaths, and claims on completion', async () => {
    const manifest = createTerritoryManifest();
    const ownedCell = manifest.cells.find((candidate) =>
      candidate.neighbors.some((id) =>
        territoryCellClaimable(manifest.byId.get(id), manifest.radius),
      ),
    );
    const targetCell = ownedCell?.neighbors
      .map((id) => manifest.byId.get(id))
      .find((candidate) => territoryCellClaimable(candidate, manifest.radius));
    expect(ownedCell).toBeTruthy();
    expect(targetCell).toBeTruthy();
    if (!ownedCell || !targetCell)
      throw new Error('capture fixture needs adjacent claimable cells');

    const player = {
      id: 1,
      kind: 'player',
      name: 'Officer',
      pos: { x: 12, y: 0, z: 14 },
      level: 12,
      dead: false,
      facing: 0,
      prevFacing: 0,
    } as Entity;
    const guildMember = {
      ...player,
      id: 2,
      name: 'Guildmate',
      pos: { x: 18, y: 0, z: 20 },
    } as Entity;
    const outsider = {
      ...player,
      id: 3,
      name: 'Outsider',
      pos: { x: 24, y: 0, z: 26 },
    } as Entity;
    const entities = new Map<number, Entity>([
      [player.id, player],
      [guildMember.id, guildMember],
      [outsider.id, outsider],
    ]);
    const setTerritorySiegeTeam = vi.fn();
    const revivePlayerAt = vi.fn((pid: number, position: Entity['pos']) => {
      const entity = entities.get(pid);
      if (!entity) return;
      entity.dead = false;
      entity.pos = { ...position };
    });
    const sim = {
      entities,
      nextId: 10,
      groundPos: (x: number, z: number) => ({ x, y: 0, z }),
      addEntity: (entity: Entity) => entities.set(entity.id, entity),
      dropEntity: (id: number) => entities.delete(id),
      meta: (pid: number) => ({
        guildMembership: pid === outsider.id ? { guildId: 8 } : { guildId: 7 },
      }),
      setTerritorySiegeTeam,
      revivePlayerAt,
    } as unknown as Sim;
    const execute = vi.fn(async () => ({
      ok: true as const,
      delta: null,
      duplicate: false,
      guildId: 7,
    }));
    const snapshot = {
      cells: [
        {
          cellId: ownedCell.id,
          ownerGuildId: '7',
          ownerGuildName: 'Wardens',
          ownerColor: '#aa7733',
          keepRoot: true,
          terrain: ownedCell.terrain,
          resource: ownedCell.resource,
        },
      ],
      guild: { ownedCellCount: 1, cellCapacity: 6 },
    } as unknown as TerritoryMapState;
    const service = {
      repository: { manifest },
      actor: async () => ({ characterId: 4, guildId: 7, guildName: 'Wardens', rank: 'officer' }),
      snapshotForCharacter: async () => snapshot,
      currentRevision: () => 1,
      siegePlacementForCharacter: () => null,
      activeSiegeSlots: () => new Set<number>(),
      execute,
    } as unknown as TerritoryService;
    const session = { accountId: 3, characterId: 4, pid: 1, left: false, linkdead: false };
    const memberSession = {
      accountId: 4,
      characterId: 5,
      pid: 2,
      left: false,
      linkdead: false,
    };
    const outsiderSession = {
      accountId: 5,
      characterId: 6,
      pid: 3,
      left: false,
      linkdead: false,
    };
    const sessions = [session, memberSession, outsiderSession];
    const sent = new Map<number, unknown[]>();
    const runtime = new TerritoryCaptureRuntime({
      sim,
      service,
      sessions: () => sessions,
      guildId: (candidate) => (candidate === outsiderSession ? 8 : 7),
      characterName: (candidate) => entities.get(candidate.pid)?.name ?? 'Unknown',
      send: (candidate, message) => {
        const messages = sent.get(candidate.characterId) ?? [];
        messages.push(message);
        sent.set(candidate.characterId, messages);
      },
      teleport: (candidate, position) => {
        const entity = entities.get(candidate.pid);
        if (!entity) return;
        entity.pos.x = position.x;
        entity.pos.z = position.z;
      },
    });

    const registeredAt = Date.now();
    await runtime.start(
      session,
      { commandId: crypto.randomUUID(), expectedRevision: 1 },
      targetCell.id,
    );
    expect([...entities.values()].filter((entity) => entity.kind === 'mob')).toHaveLength(6);
    expect(runtime.viewForCharacter(session.characterId)).toBeNull();
    expect(runtime.viewForGuild(7, session.characterId)?.phase).toBe('guards');
    expect(runtime.viewForGuild(7, session.characterId)?.registered).toBe(false);
    expect(runtime.viewForGuild(7, memberSession.characterId)?.registered).toBe(false);
    expect(runtime.viewForGuild(8, outsiderSession.characterId)).toBeNull();
    expect(sent.get(memberSession.characterId)?.length).toBeGreaterThan(0);
    expect(sent.get(outsiderSession.characterId)).toBeUndefined();
    expect(setTerritorySiegeTeam).not.toHaveBeenCalled();
    for (const entity of entities.values()) {
      if (entity.kind !== 'mob') continue;
      expect(entity.aggroTargetId).toBeNull();
      expect(entity.inCombat).toBe(false);
    }

    runtime.action(session, 'enter', registeredAt);
    expect(runtime.viewForCharacter(session.characterId)).toBeNull();
    runtime.action(session, 'join', registeredAt);
    expect(runtime.viewForCharacter(session.characterId)?.registered).toBe(true);
    expect(runtime.viewForCharacter(session.characterId)?.preparingIn).toBeGreaterThan(0);
    expect(runtime.viewForGuild(7, memberSession.characterId)?.members).toEqual([
      expect.objectContaining({ name: 'Officer', inField: false }),
    ]);

    runtime.tick(registeredAt + TERRITORY_CAPTURE_PREPARE_MS + 1_000);
    expect(runtime.viewForCharacter(session.characterId)?.inField).toBe(true);
    expect(guildMember.pos).toEqual({ x: 18, y: 0, z: 20 });
    expect(setTerritorySiegeTeam).toHaveBeenCalledWith(
      player.id,
      expect.objectContaining({ capture: true, side: 'attacker' }),
    );
    const staged = runtime.viewForCharacter(session.characterId);
    if (!staged) throw new Error('capture view disappeared after staging');
    const stagedOrigin = territorySiegeOrigin(staged.slot);
    expect(player.pos.z - (stagedOrigin.z + TERRITORY_CAPTURE_CAMP_Z)).toBeGreaterThan(100);

    runtime.action(memberSession, 'join', registeredAt + TERRITORY_CAPTURE_PREPARE_MS + 1_500);
    expect(runtime.viewForGuild(7, session.characterId)?.participantCount).toBe(2);
    expect(runtime.viewForGuild(7, session.characterId)?.members).toEqual([
      expect.objectContaining({ name: 'Officer', inField: true }),
      expect.objectContaining({ name: 'Guildmate', preparingIn: expect.any(Number) }),
    ]);

    runtime.action(session, 'leave', registeredAt + TERRITORY_CAPTURE_PREPARE_MS + 2_000);
    expect(runtime.viewForCharacter(session.characterId)?.inField).toBe(false);
    expect(runtime.viewForCharacter(session.characterId)?.timeLeft).toBeGreaterThan(0);
    runtime.action(session, 'enter', registeredAt + TERRITORY_CAPTURE_PREPARE_MS + 3_000);
    expect(runtime.viewForCharacter(session.characterId)?.preparingIn).toBeGreaterThan(0);
    runtime.tick(registeredAt + TERRITORY_CAPTURE_PREPARE_MS * 2 + 4_000);
    expect(runtime.viewForCharacter(session.characterId)?.inField).toBe(true);

    player.dead = true;
    const deathAt = registeredAt + TERRITORY_CAPTURE_PREPARE_MS * 2 + 5_000;
    runtime.tick(deathAt);
    expect(runtime.viewForCharacter(session.characterId, deathAt)?.respawnIn).toBeGreaterThan(0);
    runtime.tick(deathAt + TERRITORY_CAPTURE_RESPAWN_MS + 1);
    expect(player.dead).toBe(false);
    expect(revivePlayerAt).toHaveBeenCalled();

    for (const entity of entities.values()) if (entity.kind === 'mob') entity.dead = true;
    const startedAt = deathAt + TERRITORY_CAPTURE_RESPAWN_MS + 1_000;
    runtime.tick(startedAt + 1_000);
    expect(runtime.viewForCharacter(session.characterId)?.phase).toBe('capturing');
    const view = runtime.viewForCharacter(session.characterId);
    expect(view?.slot).toBe(3);
    if (!view) throw new Error('capture view disappeared before entering the camp');
    const origin = territorySiegeOrigin(view.slot);
    player.pos.x = origin.x;
    player.pos.z = origin.z + TERRITORY_CAPTURE_CAMP_Z;

    for (let elapsed = 2_000; elapsed <= TERRITORY_CAPTURE_HOLD_MS + 2_000; elapsed += 1_000)
      runtime.tick(startedAt + elapsed);
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(runtime.viewForCharacter(session.characterId)).toBeNull();
    expect([...entities.values()].filter((entity) => entity.kind === 'mob')).toHaveLength(0);
  });
});
