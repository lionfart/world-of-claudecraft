import { applyTerritoryDelta, type TerritoryDelta } from '../src/sim/territory_delta';
import {
  createTerritorySiege,
  type TerritorySiegeRules,
  type TerritorySiegeState,
  territorySiegeApplyAction,
  territorySiegeConsumeRespawn,
  territorySiegeDisconnect,
  territorySiegeJoin,
  territorySiegeLeave,
  territorySiegeMarkResolved,
  territorySiegeRecordDeath,
  territorySiegeRestoreSeat,
  territorySiegeTick,
  territorySiegeTowerShot,
  territorySiegeViewFor,
} from '../src/sim/territory_siege';
import type {
  TerritoryGuildView,
  TerritoryMapState,
  TerritorySiegeAction,
  TerritoryStructureKind,
  TerritoryStructureSlot,
} from '../src/world_api';
import { territoryMetrics } from './http/territory_metrics';
import { TERRITORY_CONFIG, type TerritoryConfig } from './territory_config';
import {
  type TerritoryActor,
  type TerritoryGuildSnapshot,
  type TerritoryMutationContext,
  type TerritoryMutationResult,
  type TerritoryRepository,
  territoryGuildColor,
} from './territory_db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TerritoryCommand =
  | { kind: 'place_keep'; cellId: number }
  | { kind: 'claim'; cellId: number }
  | {
      kind: 'build';
      cellId: number;
      slot: TerritoryStructureSlot;
      structureKind: TerritoryStructureKind;
    }
  | { kind: 'upgrade'; cellId: number; slot: TerritoryStructureSlot }
  | { kind: 'repair'; cellId: number; slot: TerritoryStructureSlot }
  | { kind: 'declare_war'; cellId: number }
  | { kind: 'join_war'; warId: string }
  | { kind: 'leave_war'; warId: string }
  | { kind: 'siege_action'; action: TerritorySiegeAction };

export interface TerritoryPublishedChange {
  delta: TerritoryDelta | null;
  guildId: number;
  guild: TerritoryGuildView | null;
}

export type TerritoryActorResolver = (
  characterId: number,
) => TerritoryActor | null | Promise<TerritoryActor | null>;

export class TerritoryService {
  private publicSnapshot: TerritoryMapState | null = null;
  private guildSnapshots = new Map<number, TerritoryGuildSnapshot>();
  private refreshFlight: Promise<TerritoryMapState> | null = null;
  private readonly sieges = new Map<string, TerritorySiegeState>();
  private readonly siegeSlots = new Map<string, number>();
  private readonly pendingTowerShots: Array<{ characterId: number; damage: number }> = [];
  private siegePollFlight: Promise<void> | null = null;
  private lastSiegePollAt = 0;
  private lastSiegePublishSecond = -1;
  private lastConstructionCheckAt = 0;
  private constructionFlight: Promise<void> | null = null;
  private lastSeasonCheckAt = 0;
  private seasonCheckFlight: Promise<void> | null = null;
  private lastGuildSnapshotRefreshAt = 0;
  private guildSnapshotFlight: Promise<void> | null = null;
  private readonly siegeCommandIds = new Map<string, { characterId: number; atMs: number }>();
  private readonly siegeRules: TerritorySiegeRules;
  private readonly configuredSlotCount: number;
  private readonly ready: Promise<void>;

  constructor(
    readonly repository: TerritoryRepository,
    private readonly resolveActor: TerritoryActorResolver,
    private readonly publish: (change: TerritoryPublishedChange) => void,
    private readonly publishSieges: () => void = () => undefined,
    config: TerritoryConfig = TERRITORY_CONFIG,
  ) {
    this.siegeRules = {
      teamSize: config.teamSize,
      disconnectGraceMs: config.disconnectGraceSeconds * 1_000,
      respawnWaveMs: config.respawnWaveSeconds * 1_000,
      attackerForfeitMs: config.attackerForfeitSeconds * 1_000,
      actionCooldownMs: 500,
    };
    this.configuredSlotCount = config.realmWarSlots;
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.repository.ensureActiveSeason();
    await this.refreshPublicSnapshot();
    await this.pollSieges(Date.now(), true);
  }

  private async refreshPublicSnapshot(): Promise<TerritoryMapState> {
    if (this.refreshFlight) return this.refreshFlight;
    territoryMetrics().snapshot('cache_miss');
    this.refreshFlight = Promise.all([
      this.repository.loadPublicSnapshot(),
      this.repository.loadGuildViewsSnapshot(),
    ])
      .then(([snapshot, guildSnapshots]) => {
        this.publicSnapshot = snapshot;
        this.guildSnapshots = guildSnapshots;
        this.lastGuildSnapshotRefreshAt = Date.now();
        return snapshot;
      })
      .finally(() => {
        this.refreshFlight = null;
      });
    return this.refreshFlight;
  }

  async actor(characterId: number): Promise<TerritoryActor | null> {
    return this.resolveActor(characterId);
  }

  async snapshotForCharacter(characterId: number): Promise<TerritoryMapState> {
    await this.ready;
    const cached = this.publicSnapshot;
    const base = cached ?? (await this.refreshPublicSnapshot());
    if (cached) territoryMetrics().snapshot('cache_hit');
    const actor = await this.actor(characterId);
    const guildBase = actor ? this.guildSnapshots.get(actor.guildId) : null;
    const guild =
      actor && guildBase
        ? { ...guildBase, name: actor.guildName, rank: actor.rank }
        : actor
          ? {
              id: String(actor.guildId),
              name: actor.guildName,
              color: territoryGuildColor(actor.guildId),
              rank: actor.rank,
              territoryLevel: 1,
              cellCapacity: 24,
              ownedCellCount: 0,
              resources: { wood: 250, iron: 250, grain: 250, labor: 250 },
              resourceCapacity: 2_000,
              accruedAt: base.season.startsAt,
            }
          : null;
    return {
      ...base,
      cells: [...base.cells],
      structures: [...base.structures],
      wars: base.wars.map((war) => ({
        ...war,
        mySide:
          actor?.guildId === Number(war.attackerGuildId)
            ? 'attacker'
            : actor?.guildId === Number(war.defenderGuildId)
              ? 'defender'
              : null,
      })),
      guild,
      siege: this.siegeForCharacter(characterId, Date.now()),
    };
  }

  siegeForCharacter(characterId: number, nowMs = Date.now()) {
    for (const state of this.sieges.values()) {
      const view = territorySiegeViewFor(state, characterId, nowMs);
      if (view) return view;
    }
    return null;
  }

  siegePlacementForCharacter(
    characterId: number,
  ): { warId: string; slot: number; side: 'attacker' | 'defender'; seatNo: number } | null {
    for (const [warId, state] of this.sieges) {
      const seat = state.seats.get(characterId);
      const slot = this.siegeSlots.get(warId);
      if (!seat || slot === undefined || state.phase === 'ended') continue;
      return { warId, slot, side: seat.side, seatNo: seat.seatNo };
    }
    return null;
  }

  recordCharacterDeath(characterId: number, nowMs = Date.now()): number | null {
    for (const state of this.sieges.values()) {
      if (!state.seats.has(characterId)) continue;
      return territorySiegeRecordDeath(state, characterId, nowMs, this.siegeRules);
    }
    return null;
  }

  consumeCharacterRespawn(characterId: number, nowMs = Date.now()): boolean {
    for (const state of this.sieges.values()) {
      if (territorySiegeConsumeRespawn(state, characterId, nowMs)) return true;
    }
    return false;
  }

  activeSiegeCount(): number {
    return this.sieges.size;
  }

  drainTowerShots(): Array<{ characterId: number; damage: number }> {
    return this.pendingTowerShots.splice(0, this.pendingTowerShots.length);
  }

  private async pollSieges(nowMs: number, force = false): Promise<void> {
    const activationDue =
      this.publicSnapshot?.wars.some(
        (war) =>
          (war.status === 'declared' || war.status === 'forming') &&
          new Date(war.startsAt).getTime() <= nowMs,
      ) ?? false;
    const hydrationDue =
      this.publicSnapshot?.wars.some(
        (war) =>
          war.status === 'active' &&
          new Date(war.startsAt).getTime() <= nowMs &&
          !this.sieges.has(war.id),
      ) ?? false;
    if (!force && !activationDue && !hydrationDue) return;
    if (!force && nowMs - this.lastSiegePollAt < 1_000) return;
    if (this.siegePollFlight) return this.siegePollFlight;
    this.lastSiegePollAt = nowMs;
    this.siegePollFlight = (async () => {
      const activation = activationDue
        ? await this.repository.activateDueWars(new Date(nowMs))
        : null;
      if (activation) {
        const next = this.publicSnapshot && applyTerritoryDelta(this.publicSnapshot, activation);
        if (next) this.publicSnapshot = next;
        else await this.refreshPublicSnapshot();
        this.publish({ delta: activation, guildId: 0, guild: null });
      }
      if (force || activation || hydrationDue) {
        const records = await this.repository.loadDueSieges(new Date(nowMs));
        const dueIds = new Set(records.map((record) => record.warId));
        for (const warId of this.siegeSlots.keys()) {
          if (!dueIds.has(warId) && !this.sieges.has(warId)) this.siegeSlots.delete(warId);
        }
        const usedSlots = new Set(this.siegeSlots.values());
        for (const record of records) {
          if (!this.siegeSlots.has(record.warId)) {
            let slot = 0;
            while (usedSlots.has(slot) && slot < this.configuredSlotCount) slot += 1;
            if (slot >= this.configuredSlotCount) continue;
            this.siegeSlots.set(record.warId, slot);
            usedSlots.add(slot);
          }
          const state =
            this.sieges.get(record.warId) ??
            createTerritorySiege({
              warId: record.warId,
              warVersion: record.version,
              startsAtMs: record.startsAtMs,
              endsAtMs: record.endsAtMs,
              gateLevel: record.gateLevel,
              coreLevel: record.coreLevel,
              attackerHasSiegeWorkshop: record.attackerHasSiegeWorkshop,
              defenseTowerLevel: record.defenseTowerLevel,
            });
          for (const participant of record.participants) {
            if (!participant.active) continue;
            territorySiegeRestoreSeat(
              state,
              {
                characterId: participant.characterId,
                side: participant.side,
                seatNo: participant.seatNo,
                connected: false,
              },
              nowMs + this.siegeRules.disconnectGraceMs,
            );
          }
          territorySiegeTick(state, nowMs, this.siegeRules);
          this.sieges.set(record.warId, state);
        }
      }
    })().finally(() => {
      this.siegePollFlight = null;
    });
    return this.siegePollFlight;
  }

  /** Called from the host loop. It does no DB work at 20 Hz; due-war reads are one-second bounded. */
  tickSieges(nowMs = Date.now()): void {
    if (!this.publicSnapshot) return;
    if (nowMs - this.lastSeasonCheckAt >= 60_000 && !this.seasonCheckFlight) {
      this.lastSeasonCheckAt = nowMs;
      this.seasonCheckFlight = this.repository
        .rollSeasonIfDue(new Date(nowMs))
        .then(async (rolled) => {
          if (!rolled) return;
          this.sieges.clear();
          this.siegeSlots.clear();
          this.siegeCommandIds.clear();
          await this.refreshPublicSnapshot();
          territoryMetrics().resync('season');
          this.publish({ delta: null, guildId: 0, guild: null });
          this.publishSieges();
        })
        .catch((error) => console.error('territory season rollover failed:', error))
        .finally(() => {
          this.seasonCheckFlight = null;
        });
    }
    void this.pollSieges(nowMs).catch((error) =>
      console.error('territory siege poll failed:', error),
    );
    const constructionDue = this.publicSnapshot.structures.some(
      (structure) =>
        structure.state === 'building' &&
        structure.completesAt !== null &&
        new Date(structure.completesAt).getTime() <= nowMs,
    );
    if (
      constructionDue &&
      nowMs - this.lastConstructionCheckAt >= 1_000 &&
      !this.constructionFlight
    ) {
      this.lastConstructionCheckAt = nowMs;
      this.constructionFlight = this.repository
        .completeDueStructures(new Date(nowMs))
        .then(async (delta) => {
          if (!delta) return;
          const next = this.publicSnapshot && applyTerritoryDelta(this.publicSnapshot, delta);
          if (next) this.publicSnapshot = next;
          else await this.refreshPublicSnapshot();
          this.guildSnapshots = await this.repository.loadGuildViewsSnapshot(new Date(nowMs));
          this.lastGuildSnapshotRefreshAt = nowMs;
          this.publish({ delta, guildId: 0, guild: null });
          this.publish({ delta: null, guildId: 0, guild: null });
        })
        .catch((error) => console.error('territory construction completion failed:', error))
        .finally(() => {
          this.constructionFlight = null;
        });
    }
    if (nowMs - this.lastGuildSnapshotRefreshAt >= 5 * 60_000 && !this.guildSnapshotFlight) {
      this.lastGuildSnapshotRefreshAt = nowMs;
      this.guildSnapshotFlight = this.repository
        .loadGuildViewsSnapshot(new Date(nowMs))
        .then((snapshots) => {
          this.guildSnapshots = snapshots;
          this.publish({ delta: null, guildId: 0, guild: null });
        })
        .catch((error) => console.error('territory guild snapshot refresh failed:', error))
        .finally(() => {
          this.guildSnapshotFlight = null;
        });
    }
    let changed = false;
    for (const [warId, state] of this.sieges) {
      const previousPhase = state.phase;
      territorySiegeTick(state, nowMs, this.siegeRules);
      const towerShot = territorySiegeTowerShot(state, nowMs);
      if (towerShot) this.pendingTowerShots.push(towerShot);
      if (state.phase !== previousPhase) changed = true;
      if (state.phase !== 'ended' || !territorySiegeMarkResolved(state)) continue;
      changed = true;
      void this.resolveWar(
        warId,
        state.winner ?? 'defender',
        state.definition.warVersion,
        state.resultReason ?? 'timeout',
      )
        .then(() => {
          if (this.sieges.get(warId) === state) this.sieges.delete(warId);
          this.siegeSlots.delete(warId);
          this.publishSieges();
        })
        .catch((error) => {
          state.resolved = false;
          console.error('territory siege resolution failed:', error);
        });
    }
    const publishSecond = Math.floor(nowMs / 1_000);
    if (changed || (this.sieges.size > 0 && publishSecond !== this.lastSiegePublishSecond)) {
      this.lastSiegePublishSecond = publishSecond;
      this.publishSieges();
    }
  }

  disconnectCharacter(characterId: number, nowMs = Date.now()): void {
    for (const state of this.sieges.values()) {
      if (territorySiegeDisconnect(state, characterId, nowMs, this.siegeRules)) {
        this.publishSieges();
      }
    }
  }

  reconnectCharacter(characterId: number, nowMs = Date.now()): void {
    for (const state of this.sieges.values()) {
      const seat = state.seats.get(characterId);
      if (!seat) continue;
      if (seat.connected) continue;
      territorySiegeJoin(state, characterId, seat.side, nowMs, this.siegeRules);
      this.publishSieges();
    }
  }

  async changesAfter(after: number): Promise<{ deltas: TerritoryDelta[]; resetRequired: boolean }> {
    await this.ready;
    const changes = await this.repository.changesAfter(after);
    if (changes.resetRequired) territoryMetrics().resync('cursor');
    return changes;
  }

  async execute(
    characterId: number,
    commandId: string,
    expectedRevision: number,
    command: TerritoryCommand,
  ): Promise<TerritoryMutationResult> {
    await this.ready;
    if (!UUID.test(commandId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      return { ok: false, error: 'revision_conflict' };
    }
    if (command.kind === 'siege_action') {
      const nowMs = Date.now();
      const duplicate = this.siegeCommandIds.get(commandId);
      if (duplicate) {
        return duplicate.characterId === characterId
          ? { ok: true, delta: null, duplicate: true, guildId: 0 }
          : { ok: false, error: 'revision_conflict' };
      }
      const actionActor = await this.actor(characterId);
      if (!actionActor) return { ok: false, error: 'not_in_guild' };
      for (const state of this.sieges.values()) {
        const seat = state.seats.get(characterId);
        if (!seat) continue;
        const war = this.publicSnapshot?.wars.find(
          (candidate) => candidate.id === state.definition.warId,
        );
        const eligibleGuildId =
          seat.side === 'attacker' ? war?.attackerGuildId : war?.defenderGuildId;
        if (eligibleGuildId !== String(actionActor.guildId)) {
          return { ok: false, error: 'not_participant' };
        }
        const action = territorySiegeApplyAction(
          state,
          characterId,
          command.action,
          nowMs,
          this.siegeRules,
        );
        if (!action.ok) return { ok: false, error: 'not_participant' };
        this.siegeCommandIds.set(commandId, { characterId, atMs: nowMs });
        if (this.siegeCommandIds.size > 4_096) {
          const cutoff = nowMs - 10 * 60_000;
          for (const [id, remembered] of this.siegeCommandIds) {
            if (remembered.atMs >= cutoff && this.siegeCommandIds.size <= 4_096) break;
            this.siegeCommandIds.delete(id);
          }
        }
        this.publishSieges();
        return { ok: true, delta: null, duplicate: false, guildId: actionActor.guildId };
      }
      return { ok: false, error: 'not_participant' };
    }
    const actor = await this.actor(characterId);
    if (!actor) return { ok: false, error: 'not_in_guild' };
    const ctx: TerritoryMutationContext = { ...actor, commandId, expectedRevision };
    let result: TerritoryMutationResult;
    switch (command.kind) {
      case 'place_keep':
        result = await this.repository.placeKeep(ctx, command.cellId);
        break;
      case 'claim':
        result = await this.repository.claim(ctx, command.cellId);
        break;
      case 'build':
        result = await this.repository.build(
          ctx,
          command.cellId,
          command.slot,
          command.structureKind,
        );
        break;
      case 'upgrade':
        result = await this.repository.upgrade(ctx, command.cellId, command.slot);
        break;
      case 'repair':
        result = await this.repository.repair(ctx);
        break;
      case 'declare_war':
        result = await this.repository.declareWar(ctx, command.cellId);
        break;
      case 'join_war':
        result = await this.repository.joinWar(ctx, command.warId);
        if (result.ok && result.seat) {
          const state = this.sieges.get(command.warId);
          if (state) {
            territorySiegeRestoreSeat(
              state,
              { characterId, side: result.seat.side, seatNo: result.seat.seatNo, connected: true },
              null,
            );
            territorySiegeJoin(state, characterId, result.seat.side, Date.now(), this.siegeRules);
          }
          this.publishSieges();
        }
        break;
      case 'leave_war':
        result = await this.repository.leaveWar(ctx, command.warId);
        if (result.ok) {
          const state = this.sieges.get(command.warId);
          if (state) territorySiegeLeave(state, characterId);
          this.publishSieges();
        }
        break;
    }
    if (!result.ok && command.kind === 'declare_war') {
      if (result.error === 'war_conflict') territoryMetrics().declarationRejected('conflict');
      if (result.error === 'war_slots_full') territoryMetrics().declarationRejected('slots');
    }
    if (!result.ok || result.duplicate || !result.delta) return result;
    const next = this.publicSnapshot && applyTerritoryDelta(this.publicSnapshot, result.delta);
    if (next) this.publicSnapshot = next;
    else await this.refreshPublicSnapshot();
    const guild = await this.repository.loadGuildView(actor);
    this.guildSnapshots.set(actor.guildId, guild);
    this.publish({ delta: result.delta, guildId: actor.guildId, guild });
    return result;
  }

  async resolveWar(
    warId: string,
    winner: 'attacker' | 'defender',
    expectedVersion: number,
    reason: string,
  ): Promise<boolean> {
    await this.ready;
    const delta = await this.repository.resolveWar(warId, winner, expectedVersion, reason);
    if (delta) {
      const next = this.publicSnapshot && applyTerritoryDelta(this.publicSnapshot, delta);
      if (next) this.publicSnapshot = next;
      else await this.refreshPublicSnapshot();
      this.publish({ delta, guildId: 0, guild: null });
    } else {
      await this.refreshPublicSnapshot();
      this.publish({ delta: null, guildId: 0, guild: null });
    }
    return true;
  }
}
