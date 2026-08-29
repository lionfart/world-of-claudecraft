import { isTerritorySiegePos } from '../src/sim/data';
import type { Sim } from '../src/sim/sim';
import type { TerritoryDelta } from '../src/sim/territory_delta';
import {
  territorySiegeActionPoint,
  territorySiegeInTowerRange,
  territorySiegeRamSeat,
  territorySiegeSpawn,
} from '../src/sim/territory_siege_layout';
import {
  TERRITORY_SIEGE_RESULT_PRESENTATION_MS,
  territorySiegeResultReturnIn,
} from '../src/sim/territory_siege_result';
import type {
  TerritoryMapState,
  TerritorySiegeAction,
  TerritorySiegeView,
  TerritoryStructureKind,
  TerritoryStructureSlot,
} from '../src/world_api';
import { territoryMetrics } from './http/territory_metrics';
import type { TerritoryRepository } from './territory_db';
import {
  type TerritoryActorResolver,
  type TerritoryCommand,
  type TerritoryPublishedChange,
  TerritoryService,
} from './territory_service';
import { TerritorySiegeTowerZones } from './territory_siege_tower_zones';

export { TerritoryRepository } from './territory_db';

const STRUCTURE_SLOTS = new Set<TerritoryStructureSlot>([
  'keep_core',
  'gate',
  'wall',
  'tower_north',
  'tower_south',
  'storehouse',
  'construction_workshop',
  'siege_workshop',
]);
const STRUCTURE_KINDS = new Set<TerritoryStructureKind>([
  'keep',
  'gate',
  'wall',
  'defense_tower',
  'storehouse',
  'construction_workshop',
  'siege_workshop',
]);
const SIEGE_ACTIONS = new Set<TerritorySiegeAction>([
  'deploy_ram',
  'enter_ram',
  'leave_ram',
  'ram_gate',
  'start_core_channel',
  'stop_core_channel',
]);
const SIEGE_LOCKED_COMBAT_COMMANDS = new Set([
  'castSlot',
  'castAt',
  'cast',
  'releaseEmpowered',
  'attack',
]);
const TERRITORY_COMMANDS = new Set([
  'territory_watch',
  'territory_place_keep',
  'territory_claim',
  'territory_build',
  'territory_upgrade',
  'territory_repair',
  'territory_declare_war',
  'territory_join_war',
  'territory_leave_war',
  'territory_siege_action',
]);
const WS_FRAME_MAX_BYTES = 16 * 1024;

export interface TerritoryGameSession {
  accountId: number;
  characterId: number;
  pid: number;
  left: boolean;
  linkdead: boolean;
}

type WireMessage = Record<string, unknown>;
interface SessionTerritoryState {
  watching: boolean;
  warId: string | null;
  returnPos: { x: number; z: number; facing: number } | null;
  controlAnchor: { x: number; z: number } | null;
  resultSiege: TerritorySiegeView | null;
  resultReturnAtMs: number | null;
  resultSecond: number | null;
}

export interface TerritoryGameDeps<S extends TerritoryGameSession> {
  sim: Sim;
  sessions(): Iterable<S>;
  sessionByCharacterId(characterId: number): S | undefined;
  send(session: S, message: unknown): void;
  sendRaw(session: S, payload: string): void;
  teleport(session: S, position: { x: number; z: number }): void;
}

export class TerritoryGameRuntime<S extends TerritoryGameSession> {
  readonly service: TerritoryService;
  private readonly states = new WeakMap<S, SessionTerritoryState>();
  private readonly towerZones = new TerritorySiegeTowerZones();

  constructor(
    repository: TerritoryRepository,
    resolveActor: TerritoryActorResolver,
    private readonly deps: TerritoryGameDeps<S>,
  ) {
    this.service = new TerritoryService(
      repository,
      resolveActor,
      (change) => this.broadcastChange(change),
      () => this.broadcastSieges(),
      (warId) => this.broadcastWarNotice(warId),
    );
  }

  reconnect(session: S): void {
    this.service.reconnectCharacter(session.characterId);
    void this.service
      .warNoticeForCharacter(session.characterId)
      .then((war) => {
        if (!session.left && !session.linkdead)
          this.deps.send(session, {
            t: 'territory_war_notice',
            war,
            revision: this.service.currentRevision(),
          });
      })
      .catch((error) => console.error('territory war notice reconnect failed:', error));
  }
  disconnect(session: S): void {
    this.service.disconnectCharacter(session.characterId);
  }
  leave(session: S): void {
    this.disconnect(session);
    this.deps.sim.setTerritorySiegeTeam(session.pid, null);
    this.states.delete(session);
  }

  tick(nowMs: number): void {
    this.service.tickSieges(nowMs, (warId, characterId) => {
      const session = this.deps.sessionByCharacterId(characterId);
      const placement = session
        ? this.service.siegePlacementForCharacter(session.characterId)
        : null;
      const target = session ? this.deps.sim.entities.get(session.pid) : null;
      return (
        !!placement &&
        placement.warId === warId &&
        !!target &&
        !target.dead &&
        territorySiegeInTowerRange(placement.slot, target.pos.x, target.pos.z)
      );
    });
    let zonesChanged = false;
    for (const shot of this.service.drainTowerShots()) {
      const session = this.deps.sessionByCharacterId(shot.characterId);
      const target = session ? this.deps.sim.entities.get(session.pid) : null;
      if (!target || target.dead) continue;
      this.towerZones.queue(shot.warId, target.pos, shot.damage, nowMs);
      zonesChanged = true;
    }
    const targets = [...this.deps.sessions()].flatMap((session) => {
      const placement = this.service.siegePlacementForCharacter(session.characterId);
      const entity = this.deps.sim.entities.get(session.pid);
      if (placement?.side !== 'attacker' || !entity) return [];
      return [
        {
          characterId: session.characterId,
          warId: placement.warId,
          x: entity.pos.x,
          z: entity.pos.z,
          alive: !entity.dead,
        },
      ];
    });
    const detonation = this.towerZones.detonate(nowMs, targets);
    if (detonation.removed) zonesChanged = true;
    for (const hit of detonation.hits) {
      const session = this.deps.sessionByCharacterId(hit.characterId);
      const target = session ? this.deps.sim.entities.get(session.pid) : null;
      if (!target || target.dead) continue;
      this.deps.sim.dealDamage(
        null,
        target,
        hit.damage,
        false,
        'physical',
        'Defense Tower',
        'hit',
        true,
      );
    }
    for (const session of this.deps.sessions()) {
      if (session.left || session.linkdead) continue;
      const placement = this.service.siegePlacementForCharacter(session.characterId);
      const siege = this.service.siegeForCharacter(session.characterId, nowMs);
      if (placement && siege) this.updateFighter(session, placement, siege, nowMs);
    }
    this.tickResultReturns(nowMs);
    if (zonesChanged) this.broadcastSieges();
  }

  async snapshotForAccount(accountId: number): Promise<TerritoryMapState | null> {
    const session = [...this.deps.sessions()].find(
      (entry) => entry.accountId === accountId && !entry.left,
    );
    return session ? this.service.snapshotForCharacter(session.characterId) : null;
  }

  async changesForAccount(
    accountId: number,
    after: number,
  ): Promise<{ deltas: TerritoryDelta[]; resetRequired: boolean } | null> {
    const session = [...this.deps.sessions()].find(
      (entry) => entry.accountId === accountId && !entry.left,
    );
    if (!session) return null;
    const changes = await this.service.changesAfter(after);
    const guildId = this.deps.sim.meta(session.pid)?.guildMembership?.guildId ?? null;
    return {
      ...changes,
      deltas: changes.deltas.map((delta) => this.deltaForGuild(delta, guildId, null)),
    };
  }

  dispatch(session: S, message: WireMessage, command: string): boolean {
    const control = this.service.siegeControlForCharacter(session.characterId);
    if (!TERRITORY_COMMANDS.has(command)) {
      return control && SIEGE_LOCKED_COMBAT_COMMANDS.has(command)
        ? this.refuse(session, 'siege_action_locked')
        : false;
    }
    if (command === 'territory_watch') {
      this.state(session).watching = message.active === true;
      return true;
    }
    const cellId =
      Number.isSafeInteger(message.cellId) && Number(message.cellId) > 0
        ? Number(message.cellId)
        : null;
    let mutation: TerritoryCommand | null = null;
    if (command === 'territory_place_keep' && cellId) mutation = { kind: 'place_keep', cellId };
    else if (command === 'territory_claim' && cellId) mutation = { kind: 'claim', cellId };
    else if (command === 'territory_declare_war' && cellId)
      mutation = { kind: 'declare_war', cellId };
    else if (
      command === 'territory_build' &&
      cellId &&
      STRUCTURE_SLOTS.has(message.slot as TerritoryStructureSlot) &&
      STRUCTURE_KINDS.has(message.kind as TerritoryStructureKind)
    ) {
      mutation = {
        kind: 'build',
        cellId,
        slot: message.slot as TerritoryStructureSlot,
        structureKind: message.kind as TerritoryStructureKind,
      };
    } else if (
      (command === 'territory_upgrade' || command === 'territory_repair') &&
      cellId &&
      STRUCTURE_SLOTS.has(message.slot as TerritoryStructureSlot)
    ) {
      mutation = {
        kind: command === 'territory_upgrade' ? 'upgrade' : 'repair',
        cellId,
        slot: message.slot as TerritoryStructureSlot,
      };
    } else if (
      (command === 'territory_join_war' || command === 'territory_leave_war') &&
      typeof message.warId === 'string'
    ) {
      mutation = {
        kind: command === 'territory_join_war' ? 'join_war' : 'leave_war',
        warId: message.warId,
      };
    } else if (
      command === 'territory_siege_action' &&
      SIEGE_ACTIONS.has(message.action as TerritorySiegeAction)
    ) {
      const action = message.action as TerritorySiegeAction;
      if (control?.kind === 'ram' && action !== 'ram_gate' && action !== 'leave_ram') {
        return this.refuse(session, 'ram_controls_only');
      }
      if (control?.kind === 'core_channel' && action !== 'stop_core_channel') {
        return this.refuse(session, 'channel_locked');
      }
      const placement = this.service.siegePlacementForCharacter(session.characterId);
      const fighter = this.deps.sim.entities.get(session.pid);
      if (!placement || !fighter) return this.refuse(session, 'not_participant');
      const point = territorySiegeActionPoint(placement.slot, action);
      if ((fighter.pos.x - point.x) ** 2 + (fighter.pos.z - point.z) ** 2 > point.radius ** 2)
        return this.refuse(session, 'out_of_range');
      mutation = { kind: 'siege_action', action };
    }
    if (mutation) this.queueMutation(session, message, mutation);
    return true;
  }

  private state(session: S): SessionTerritoryState {
    let state = this.states.get(session);
    if (!state) {
      state = {
        watching: false,
        warId: null,
        returnPos: null,
        controlAnchor: null,
        resultSiege: null,
        resultReturnAtMs: null,
        resultSecond: null,
      };
      this.states.set(session, state);
    }
    return state;
  }

  private deltaForGuild(
    delta: TerritoryDelta,
    guildId: number | null,
    guild: TerritoryPublishedChange['guild'],
  ): TerritoryDelta {
    return {
      ...delta,
      warsUpsert: delta.warsUpsert?.map((war) => ({
        ...war,
        mySide:
          guildId === Number(war.attackerGuildId)
            ? 'attacker'
            : guildId === Number(war.defenderGuildId)
              ? 'defender'
              : null,
      })),
      ...(guild ? { guild } : {}),
    };
  }

  private broadcastChange(change: TerritoryPublishedChange): void {
    for (const session of this.deps.sessions()) {
      if (!this.state(session).watching || session.left) continue;
      if (!change.delta || change.delta.resetRequired) {
        if (change.delta?.resetRequired) territoryMetrics().resync('cascade');
        this.deps.send(session, { t: 'territory_resync' });
        continue;
      }
      const guildId = this.deps.sim.meta(session.pid)?.guildMembership?.guildId ?? null;
      const delta = this.deltaForGuild(
        change.delta,
        guildId,
        guildId === change.guildId ? change.guild : null,
      );
      const frame = JSON.stringify({ t: 'territory_delta', delta });
      if (Buffer.byteLength(frame) > WS_FRAME_MAX_BYTES) {
        territoryMetrics().resync('frame_limit');
        this.deps.send(session, { t: 'territory_resync' });
      } else this.deps.sendRaw(session, frame);
    }
  }

  private broadcastWarNotice(_warId: string | null): void {
    for (const session of this.deps.sessions()) {
      if (session.left || session.linkdead) continue;
      const guildId = this.deps.sim.meta(session.pid)?.guildMembership?.guildId ?? null;
      const war = guildId === null ? null : this.service.warNoticeFor(session.characterId, guildId);
      this.deps.send(session, {
        t: 'territory_war_notice',
        war,
        revision: this.service.currentRevision(),
      });
    }
  }

  private broadcastSieges(): void {
    const nowMs = Date.now();
    for (const session of this.deps.sessions()) {
      if (session.left || session.linkdead) continue;
      const state = this.state(session);
      const placement = this.service.siegePlacementForCharacter(session.characterId);
      if (placement) this.service.reconnectCharacter(session.characterId, nowMs);
      const baseSiege = this.service.siegeForCharacter(session.characterId, nowMs);
      let siege = baseSiege
        ? {
            ...baseSiege,
            towerZones: this.towerZones.view(baseSiege.warId, nowMs),
          }
        : null;
      if (siege?.state === 'ended' && siege.winner !== null) {
        state.resultReturnAtMs ??= nowMs + TERRITORY_SIEGE_RESULT_PRESENTATION_MS;
        siege = {
          ...siege,
          resultReturnIn: territorySiegeResultReturnIn(state.resultReturnAtMs, nowMs),
        };
        state.resultSiege = siege;
        state.resultSecond = siege.resultReturnIn;
      } else if (!siege && state.resultSiege && state.resultReturnAtMs !== null) {
        siege = {
          ...state.resultSiege,
          resultReturnIn: territorySiegeResultReturnIn(state.resultReturnAtMs, nowMs),
        };
        state.resultSiege = siege;
      } else if (siege && siege.state !== 'ended') {
        state.resultSiege = null;
        state.resultReturnAtMs = null;
        state.resultSecond = null;
      }
      if (!siege && state.warId === null) continue;
      if (siege && placement && state.warId !== siege.warId)
        this.enterSiege(session, state, placement);
      else if (!siege && state.returnPos) this.returnFromSiege(session, state);
      if (siege && placement) this.updateFighter(session, placement, siege, nowMs);
      else this.deps.sim.setTerritorySiegeTeam(session.pid, null);
      state.warId = siege?.warId ?? null;
      this.deps.send(session, { t: 'territory_siege', siege });
    }
  }

  private tickResultReturns(nowMs: number): void {
    for (const session of this.deps.sessions()) {
      if (session.left || session.linkdead) continue;
      const state = this.state(session);
      if (!state.resultSiege || state.resultReturnAtMs === null) continue;
      const seconds = territorySiegeResultReturnIn(state.resultReturnAtMs, nowMs);
      if (seconds === 0) {
        this.returnFromSiege(session, state);
        this.deps.sim.setTerritorySiegeTeam(session.pid, null);
        state.warId = null;
        state.resultSiege = null;
        state.resultReturnAtMs = null;
        state.resultSecond = null;
        this.deps.send(session, { t: 'territory_siege', siege: null });
        continue;
      }
      if (seconds === state.resultSecond) continue;
      state.resultSecond = seconds;
      state.resultSiege = { ...state.resultSiege, resultReturnIn: seconds };
      this.deps.send(session, { t: 'territory_siege', siege: state.resultSiege });
    }
  }

  private enterSiege(
    session: S,
    state: SessionTerritoryState,
    placement: NonNullable<ReturnType<TerritoryService['siegePlacementForCharacter']>>,
  ): void {
    const entity = this.deps.sim.entities.get(session.pid);
    if (entity && !isTerritorySiegePos(entity.pos.x) && !state.returnPos) {
      state.returnPos = { x: entity.pos.x, z: entity.pos.z, facing: entity.facing };
    }
    const spawn = territorySiegeSpawn(placement.slot, placement.side, placement.seatNo);
    this.deps.teleport(session, spawn);
    const teleported = this.deps.sim.entities.get(session.pid);
    if (teleported) teleported.facing = spawn.facing;
    this.deps.sim.setTerritorySiegeTeam(session.pid, {
      warId: placement.warId,
      side: placement.side,
      slot: placement.slot,
      gateOpen: false,
      control: null,
    });
  }

  private returnFromSiege(session: S, state: SessionTerritoryState): void {
    const position = state.returnPos;
    if (!position) return;
    this.deps.teleport(session, position);
    const entity = this.deps.sim.entities.get(session.pid);
    if (entity) entity.facing = position.facing;
    state.returnPos = null;
    state.controlAnchor = null;
  }

  private updateFighter(
    session: S,
    placement: NonNullable<ReturnType<TerritoryService['siegePlacementForCharacter']>>,
    siege: NonNullable<ReturnType<TerritoryService['siegeForCharacter']>>,
    nowMs: number,
  ): void {
    const control = this.service.siegeControlForCharacter(session.characterId);
    this.deps.sim.setTerritorySiegeTeam(session.pid, {
      warId: placement.warId,
      side: placement.side,
      slot: placement.slot,
      gateOpen: siege.gateOpen,
      control,
    });
    const fighter = this.deps.sim.entities.get(session.pid);
    if (fighter && control?.kind === 'ram') {
      this.state(session).controlAnchor = null;
      const seat = territorySiegeRamSeat(placement.slot, control.seatNo);
      fighter.pos.x = seat.x;
      fighter.pos.z = seat.z;
      fighter.facing = seat.facing;
    } else if (fighter && control?.kind === 'core_channel') {
      const runtimeState = this.state(session);
      runtimeState.controlAnchor ??= { x: fighter.pos.x, z: fighter.pos.z };
      fighter.pos.x = runtimeState.controlAnchor.x;
      fighter.pos.z = runtimeState.controlAnchor.z;
    } else {
      this.state(session).controlAnchor = null;
    }
    if (!fighter?.dead) return;
    const respawnAt = this.service.recordCharacterDeath(session.characterId, nowMs);
    if (
      respawnAt === null ||
      nowMs < respawnAt ||
      !this.service.consumeCharacterRespawn(session.characterId, nowMs)
    )
      return;
    const spawn = territorySiegeSpawn(placement.slot, placement.side, placement.seatNo);
    this.deps.sim.revivePlayerAt(session.pid, this.deps.sim.groundPos(spawn.x, spawn.z), 1);
    const revived = this.deps.sim.entities.get(session.pid);
    if (revived) revived.facing = spawn.facing;
  }

  private refuse(session: S, code: string): true {
    this.deps.send(session, { t: 'territory_error', code });
    return true;
  }

  private queueMutation(session: S, message: WireMessage, command: TerritoryCommand): void {
    const commandId = typeof message.commandId === 'string' ? message.commandId : '';
    const revision =
      typeof message.expectedRevision === 'number' ? message.expectedRevision : Number.NaN;
    void this.service
      .execute(session.characterId, commandId, revision, command)
      .then((result) => {
        if (result.ok) return;
        this.deps.send(session, { t: 'territory_error', code: result.error });
        if (result.error === 'revision_conflict')
          this.deps.send(session, { t: 'territory_resync' });
      })
      .catch((error) => {
        console.error('territory command failed:', error);
        this.deps.send(session, { t: 'territory_error', code: 'unavailable' });
      });
  }
}

type InstalledGameHost = object & {
  sim: Sim;
  clients: Map<number, TerritoryGameSession>;
  sessionByCharacterId(characterId: number): TerritoryGameSession | null;
  send(session: TerritoryGameSession, message: unknown): void;
  sendRaw(session: TerritoryGameSession, payload: string): void;
  teleportSessionEntity(session: TerritoryGameSession, position: { x: number; z: number }): void;
};
const installedGames = new WeakMap<object, TerritoryGameRuntime<TerritoryGameSession>>();

function installedGame(host: object): TerritoryGameRuntime<TerritoryGameSession> {
  const runtime = installedGames.get(host);
  if (!runtime) throw new Error('territory game runtime is not initialized');
  return runtime;
}

export const territoryGame = {
  initialize(host: object, repository: TerritoryRepository): void {
    const source = host as InstalledGameHost;
    installedGames.set(
      host,
      new TerritoryGameRuntime(
        repository,
        (characterId) => {
          const session = source.sessionByCharacterId(characterId);
          const membership = session ? source.sim.meta(session.pid)?.guildMembership : null;
          if (!session || !membership) return null;
          return {
            characterId,
            guildId: membership.guildId,
            guildName: source.sim.entities.get(session.pid)?.guild ?? '',
            rank: membership.rank,
          };
        },
        {
          sim: source.sim,
          sessions: () => source.clients.values(),
          sessionByCharacterId: (id) => source.sessionByCharacterId(id) ?? undefined,
          send: (session, message) => source.send(session, message),
          sendRaw: (session, payload) => source.sendRaw(session, payload),
          teleport: (session, position) => source.teleportSessionEntity(session, position),
        },
      ),
    );
  },
  service(host: object): TerritoryService {
    return installedGame(host).service;
  },
  tick(host: object, nowMs: number): void {
    installedGame(host).tick(nowMs);
  },
  reconnect(host: object, session: TerritoryGameSession): void {
    installedGame(host).reconnect(session);
  },
  disconnect(host: object, session: TerritoryGameSession): void {
    installedGame(host).disconnect(session);
  },
  leave(host: object, session: TerritoryGameSession): void {
    installedGame(host).leave(session);
  },
  dispatch(
    host: object,
    session: TerritoryGameSession,
    message: WireMessage,
    command: string,
  ): boolean {
    return installedGame(host).dispatch(session, message, command);
  },
  snapshotForAccount(host: object, accountId: number): Promise<TerritoryMapState | null> {
    return installedGame(host).snapshotForAccount(accountId);
  },
  changesForAccount(
    host: object,
    accountId: number,
    after: number,
  ): Promise<{ deltas: TerritoryDelta[]; resetRequired: boolean } | null> {
    return installedGame(host).changesForAccount(accountId, after);
  },
};
