import { randomUUID } from 'node:crypto';
import { MOBS, TERRITORY_SIEGE_SLOT_COUNT, territorySiegeOrigin } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import type { Sim } from '../src/sim/sim';
import { territoryCellClaimable } from '../src/sim/territory_biome';
import {
  createTerritoryCaptureState,
  TERRITORY_CAPTURE_CAMP_Z,
  TERRITORY_CAPTURE_DURATION_MS,
  TERRITORY_CAPTURE_HOLD_MS,
  TERRITORY_CAPTURE_INITIAL_GUARDS,
  TERRITORY_CAPTURE_PREPARE_MS,
  TERRITORY_CAPTURE_RADIUS,
  TERRITORY_CAPTURE_RESPAWN_MS,
  type TerritoryCaptureDifficulty,
  type TerritoryCaptureState,
  territoryCaptureAdmission,
  territoryCaptureCreatureId,
  territoryCaptureDifficulty,
  territoryCaptureGuardPosition,
  territoryCaptureSpawn,
  territoryCaptureTick,
} from '../src/sim/territory_capture';
import {
  type TerritorySiegeBiome,
  territorySiegeBiomeForCell,
} from '../src/sim/territory_siege_biome';
import { isTerritoryClaimAdjacent } from '../src/sim/territory_topology';
import { addThreat, SUMMONED_ADD_THREAT_SEED } from '../src/sim/threat';
import type { TerritoryCaptureView } from '../src/world_api';
import type { TerritoryGameSession } from './territory_game_runtime';
import type { TerritoryService } from './territory_service';

interface CaptureParticipant<S extends TerritoryGameSession> {
  characterId: number;
  name: string;
  pid: number;
  session: S;
  connected: boolean;
  inField: boolean;
  preparingUntilMs: number | null;
  respawnAtMs: number | null;
  seatNo: number;
  returnPos: { x: number; z: number; facing: number };
}

interface CaptureRun<S extends TerritoryGameSession> {
  id: string;
  cellId: number;
  guildId: number;
  slot: number;
  biome: TerritorySiegeBiome;
  difficulty: TerritoryCaptureDifficulty;
  endsAtMs: number;
  state: TerritoryCaptureState;
  participants: Map<number, CaptureParticipant<S>>;
  initialMobIds: Set<number>;
  reinforcementMobIds: Set<number>;
  wave: number;
  lastBroadcastSecond: number;
  completing: boolean;
}

export interface TerritoryCaptureRuntimeDeps<S extends TerritoryGameSession> {
  sim: Sim;
  service: TerritoryService;
  sessions(): Iterable<S>;
  guildId(session: S): number | null;
  characterName(session: S): string;
  send(session: S, message: unknown): void;
  teleport(session: S, position: { x: number; z: number }): void;
}

/** Authoritative neutral-camp expedition runtime, separate from guild-vs-guild sieges. */
export class TerritoryCaptureRuntime<S extends TerritoryGameSession> {
  private readonly byCell = new Map<number, CaptureRun<S>>();
  private readonly byGuild = new Map<number, CaptureRun<S>>();
  private readonly byCharacter = new Map<number, CaptureRun<S>>();
  private readonly pendingCells = new Set<number>();
  private sequence = 0;

  constructor(private readonly deps: TerritoryCaptureRuntimeDeps<S>) {}

  occupiedSlots(): ReadonlySet<number> {
    return new Set([...this.byCell.values()].map((run) => run.slot));
  }

  async start(
    session: S,
    command: { commandId?: unknown; expectedRevision?: unknown },
    cellId: number,
  ): Promise<void> {
    if (session.left || session.linkdead) return;
    const existingForCharacter = this.byCharacter.get(session.characterId);
    if (existingForCharacter) {
      this.sendView(existingForCharacter, session);
      return;
    }
    if (this.deps.service.siegePlacementForCharacter(session.characterId)) {
      this.refuse(session, 'occupied');
      return;
    }
    if (
      !Number.isSafeInteger(command.expectedRevision) ||
      Number(command.expectedRevision) !== this.deps.service.currentRevision()
    ) {
      this.refuse(session, 'revision_conflict');
      this.deps.send(session, { t: 'territory_resync' });
      return;
    }
    if (this.pendingCells.has(cellId)) {
      this.refuse(session, 'occupied');
      return;
    }
    this.pendingCells.add(cellId);
    try {
      const [actor, snapshot] = await Promise.all([
        this.deps.service.actor(session.characterId),
        this.deps.service.snapshotForCharacter(session.characterId),
      ]);
      if (!actor || !snapshot.guild) {
        this.refuse(session, 'not_in_guild');
        return;
      }
      const activeForGuild = this.byGuild.get(actor.guildId);
      if (activeForGuild) {
        this.sendView(activeForGuild, session);
        return;
      }
      const running = this.byCell.get(cellId);
      if (running) {
        if (running.guildId !== actor.guildId) this.refuse(session, 'occupied');
        else this.sendView(running, session);
        return;
      }
      const manifest = this.deps.service.repository.manifest;
      const cell = manifest.byId.get(cellId);
      const owned = new Set(
        snapshot.cells
          .filter((entry) => entry.ownerGuildId === String(actor.guildId))
          .map((entry) => entry.cellId),
      );
      const admission = territoryCaptureAdmission({
        rank: actor.rank,
        claimable: territoryCellClaimable(cell, manifest.radius),
        alreadyOwned: snapshot.cells.some((entry) => entry.cellId === cellId),
        adjacent: isTerritoryClaimAdjacent(manifest, owned, cellId),
        ownedCount: snapshot.guild.ownedCellCount,
        capacity: snapshot.guild.cellCapacity,
      });
      if (admission || !cell) {
        this.refuse(
          session,
          admission === 'forbidden'
            ? 'forbidden'
            : admission === 'not_adjacent'
              ? 'not_adjacent'
              : admission === 'capacity_reached'
                ? 'capacity'
                : admission === 'already_owned'
                  ? 'occupied'
                  : 'invalid_cell',
        );
        return;
      }
      const slot = this.allocateSlot();
      if (slot === null) {
        this.refuse(session, 'war_slots_full');
        return;
      }
      const nowMs = Date.now();
      const run: CaptureRun<S> = {
        id: `camp:${cellId}:${++this.sequence}`,
        cellId,
        guildId: actor.guildId,
        slot,
        biome: territorySiegeBiomeForCell(cell, manifest.radius),
        difficulty: territoryCaptureDifficulty(cell.q, cell.r, manifest.radius),
        endsAtMs: nowMs + TERRITORY_CAPTURE_DURATION_MS,
        state: createTerritoryCaptureState(nowMs),
        participants: new Map(),
        initialMobIds: new Set(),
        reinforcementMobIds: new Set(),
        wave: 0,
        lastBroadcastSecond: -1,
        completing: false,
      };
      this.byCell.set(cellId, run);
      this.byGuild.set(actor.guildId, run);
      for (let index = 0; index < TERRITORY_CAPTURE_INITIAL_GUARDS; index += 1)
        // Initial guards defend their camp but do not acquire a player at the
        // distant staging point. Ordinary proximity aggro takes over on approach.
        run.initialMobIds.add(this.spawnCreature(run, index, 0));
      this.broadcast(run, nowMs);
    } finally {
      this.pendingCells.delete(cellId);
    }
  }

  reconnect(session: S): void {
    const run = this.byCharacter.get(session.characterId);
    const participant = run?.participants.get(session.characterId);
    if (run && participant) {
      participant.session = session;
      participant.pid = session.pid;
      participant.connected = true;
      participant.name = this.deps.characterName(session);
      if (participant.inField) this.enterField(run, participant);
      this.sendView(run, session);
      return;
    }
    const guildId = this.deps.guildId(session);
    const guildRun = guildId === null ? null : this.byGuild.get(guildId);
    if (guildRun) this.sendView(guildRun, session);
  }

  disconnect(session: S): void {
    const participant = this.byCharacter
      .get(session.characterId)
      ?.participants.get(session.characterId);
    if (participant) participant.connected = false;
  }

  leave(session: S): void {
    // A network/session exit is not an expedition unregister. The character's
    // seat remains valid until the encounter deadline, mirroring guild sieges.
    this.disconnect(session);
  }

  action(session: S, action: 'join' | 'enter' | 'leave', nowMs = Date.now()): void {
    const guildId = this.deps.guildId(session);
    const run = guildId === null ? null : this.byGuild.get(guildId);
    if (!run) {
      this.refuse(session, 'not_participant');
      return;
    }
    if (action === 'join') {
      if (this.deps.service.siegePlacementForCharacter(session.characterId)) {
        this.refuse(session, 'occupied');
        return;
      }
      this.join(run, session, nowMs);
      return;
    }
    const participant = run.participants.get(session.characterId);
    if (!participant || this.byCharacter.get(session.characterId) !== run) {
      this.refuse(session, 'not_participant');
      return;
    }
    if (action === 'enter') this.requestEntry(run, session, nowMs);
    else this.exitField(run, participant, nowMs);
  }

  tick(nowMs: number): void {
    for (const run of [...this.byCell.values()]) {
      if (run.completing) continue;
      if (nowMs >= run.endsAtMs) {
        this.cancel(run);
        continue;
      }
      for (const participant of run.participants.values()) {
        if (!participant.connected || participant.session.left || participant.session.linkdead)
          continue;
        if (participant.preparingUntilMs !== null && nowMs >= participant.preparingUntilMs) {
          this.enterField(run, participant);
        }
        if (!participant.inField) continue;
        const entity = this.deps.sim.entities.get(participant.pid);
        if (!entity?.dead) {
          participant.respawnAtMs = null;
          continue;
        }
        participant.respawnAtMs ??= nowMs + TERRITORY_CAPTURE_RESPAWN_MS;
        if (nowMs < participant.respawnAtMs) continue;
        const local = territoryCaptureSpawn(participant.seatNo);
        const origin = territorySiegeOrigin(run.slot);
        this.deps.sim.revivePlayerAt(
          participant.pid,
          this.deps.sim.groundPos(origin.x + local.x, origin.z + local.z),
          1,
        );
        const revived = this.deps.sim.entities.get(participant.pid);
        if (revived) {
          revived.facing = local.facing;
          revived.prevFacing = local.facing;
        }
        participant.respawnAtMs = null;
      }
      const initialGuardsAlive = this.alive(run.initialMobIds);
      const reinforcementsAlive = this.alive(run.reinforcementMobIds);
      const occupants = this.occupants(run);
      const tick = territoryCaptureTick(run.state, {
        nowMs,
        initialGuardsAlive,
        reinforcementsAlive,
        occupants,
      });
      run.state = tick.state;
      if (tick.spawnReinforcements > 0) {
        run.wave += 1;
        const target = this.nearestParticipant(run);
        for (let index = 0; index < tick.spawnReinforcements; index += 1)
          run.reinforcementMobIds.add(this.spawnCreature(run, index, run.wave, target?.pid));
      }
      if (tick.completed) {
        run.completing = true;
        void this.complete(run).catch(() => {
          for (const participant of run.participants.values())
            this.refuse(participant.session, 'unavailable');
          this.cancel(run);
        });
        continue;
      }
      const second = Math.floor(nowMs / 1_000);
      // Preparation, encounter lifetime and respawn clocks are all second-based,
      // so participants need a 1 Hz view even while capture progress is paused.
      if (second !== run.lastBroadcastSecond) this.broadcast(run, nowMs);
    }
  }

  viewForCharacter(characterId: number, nowMs = Date.now()): TerritoryCaptureView | null {
    const run = this.byCharacter.get(characterId);
    return run ? this.view(run, nowMs, run.participants.get(characterId)) : null;
  }

  viewForGuild(
    guildId: number | null,
    characterId: number,
    nowMs = Date.now(),
  ): TerritoryCaptureView | null {
    const run = guildId === null ? null : this.byGuild.get(guildId);
    return run ? this.view(run, nowMs, run.participants.get(characterId)) : null;
  }

  private allocateSlot(): number | null {
    const occupied = new Set([...this.deps.service.activeSiegeSlots(), ...this.occupiedSlots()]);
    for (let slot = TERRITORY_SIEGE_SLOT_COUNT - 1; slot >= 0; slot -= 1)
      if (!occupied.has(slot)) return slot;
    return null;
  }

  private join(run: CaptureRun<S>, session: S, nowMs = Date.now()): void {
    const registered = run.participants.get(session.characterId);
    if (registered) {
      this.requestEntry(run, session, nowMs);
      return;
    }
    const entity = this.deps.sim.entities.get(session.pid);
    if (!entity) return;
    const participant: CaptureParticipant<S> = {
      characterId: session.characterId,
      name: this.deps.characterName(session),
      pid: session.pid,
      session,
      connected: true,
      inField: false,
      preparingUntilMs: null,
      respawnAtMs: null,
      seatNo: run.participants.size,
      returnPos: { x: entity.pos.x, z: entity.pos.z, facing: entity.facing },
    };
    run.participants.set(session.characterId, participant);
    this.byCharacter.set(session.characterId, run);
    this.requestEntry(run, session, nowMs);
  }

  private requestEntry(run: CaptureRun<S>, session: S, nowMs: number): void {
    const participant = run.participants.get(session.characterId);
    if (!participant || participant.inField || participant.preparingUntilMs !== null) {
      this.sendView(run, session);
      return;
    }
    participant.session = session;
    participant.pid = session.pid;
    participant.connected = true;
    participant.preparingUntilMs = nowMs + TERRITORY_CAPTURE_PREPARE_MS;
    this.broadcast(run, nowMs);
  }

  private enterField(run: CaptureRun<S>, participant: CaptureParticipant<S>): void {
    const local = territoryCaptureSpawn(participant.seatNo);
    const origin = territorySiegeOrigin(run.slot);
    const entity = this.deps.sim.entities.get(participant.pid);
    const spawn = this.deps.sim.groundPos(origin.x + local.x, origin.z + local.z);
    if (entity?.dead) this.deps.sim.revivePlayerAt(participant.pid, spawn, 1);
    else this.deps.teleport(participant.session, spawn);
    if (entity) {
      entity.facing = local.facing;
      entity.prevFacing = local.facing;
    }
    participant.inField = true;
    participant.preparingUntilMs = null;
    participant.respawnAtMs = null;
    this.deps.sim.setTerritorySiegeTeam(participant.pid, {
      warId: run.id,
      side: 'attacker',
      slot: run.slot,
      capture: true,
      gateOpen: true,
      control: null,
    });
  }

  private exitField(run: CaptureRun<S>, participant: CaptureParticipant<S>, nowMs: number): void {
    participant.preparingUntilMs = null;
    participant.respawnAtMs = null;
    if (participant.inField) {
      const entity = this.deps.sim.entities.get(participant.pid);
      if (entity?.dead)
        this.deps.sim.revivePlayerAt(
          participant.pid,
          this.deps.sim.groundPos(participant.returnPos.x, participant.returnPos.z),
          1,
        );
      else this.deps.teleport(participant.session, participant.returnPos);
    }
    participant.inField = false;
    this.deps.sim.setTerritorySiegeTeam(participant.pid, null);
    this.broadcast(run, nowMs);
  }

  private spawnCreature(
    run: CaptureRun<S>,
    index: number,
    wave: number,
    targetPid?: number,
  ): number {
    const templateId = territoryCaptureCreatureId(run.biome, index, wave, run.difficulty.tier);
    const template = MOBS[templateId];
    if (!template) throw new Error(`missing territory capture creature: ${templateId}`);
    const local = territoryCaptureGuardPosition(index, wave);
    const origin = territorySiegeOrigin(run.slot);
    const target = targetPid === undefined ? null : this.deps.sim.entities.get(targetPid);
    const level = run.difficulty.level;
    const mob = createMob(
      this.deps.sim.nextId++,
      template,
      level,
      this.deps.sim.groundPos(origin.x + local.x, origin.z + local.z),
    );
    mob.maxHp = Math.max(1, Math.round(mob.maxHp * run.difficulty.powerMultiplier));
    mob.hp = mob.maxHp;
    mob.weapon.min = Math.max(1, Math.round(mob.weapon.min * run.difficulty.powerMultiplier));
    mob.weapon.max = Math.max(
      mob.weapon.min,
      Math.round(mob.weapon.max * run.difficulty.powerMultiplier),
    );
    mob.stats.armor = Math.round(mob.stats.armor * run.difficulty.powerMultiplier);
    mob.summonedAdd = true;
    mob.offStreamRng = true;
    mob.leashAnchor = { ...mob.pos };
    if (target && !target.dead) {
      mob.aggroTargetId = target.id;
      mob.inCombat = true;
      mob.aiState = 'chase';
      addThreat(mob, target.id, SUMMONED_ADD_THREAT_SEED);
    }
    this.deps.sim.addEntity(mob);
    return mob.id;
  }

  private alive(ids: ReadonlySet<number>): number {
    let count = 0;
    for (const id of ids) if (!this.deps.sim.entities.get(id)?.dead) count += 1;
    return count;
  }

  private occupants(run: CaptureRun<S>): number {
    const origin = territorySiegeOrigin(run.slot);
    const campX = origin.x;
    const campZ = origin.z + TERRITORY_CAPTURE_CAMP_Z;
    let count = 0;
    for (const participant of run.participants.values()) {
      const entity = this.deps.sim.entities.get(participant.pid);
      if (
        participant.connected &&
        participant.inField &&
        !participant.session.left &&
        entity &&
        !entity.dead &&
        (entity.pos.x - campX) ** 2 + (entity.pos.z - campZ) ** 2 <= TERRITORY_CAPTURE_RADIUS ** 2
      )
        count += 1;
    }
    return count;
  }

  private nearestParticipant(run: CaptureRun<S>): CaptureParticipant<S> | null {
    for (const participant of run.participants.values()) {
      const entity = this.deps.sim.entities.get(participant.pid);
      if (participant.connected && participant.inField && entity && !entity.dead)
        return participant;
    }
    return null;
  }

  private view(
    run: CaptureRun<S>,
    nowMs: number,
    participant?: CaptureParticipant<S>,
  ): TerritoryCaptureView {
    const progress = Math.max(0, Math.min(1, run.state.progressMs / TERRITORY_CAPTURE_HOLD_MS));
    return {
      id: run.id,
      cellId: run.cellId,
      slot: run.slot,
      biome: run.biome,
      difficultyTier: run.difficulty.tier,
      enemyLevel: run.difficulty.level,
      phase: run.state.phase,
      initialGuardsAlive: this.alive(run.initialMobIds),
      reinforcementsAlive: this.alive(run.reinforcementMobIds),
      participantCount: run.participants.size,
      occupants: this.occupants(run),
      progress,
      registered: participant !== undefined,
      members: [...run.participants.values()]
        .sort((a, b) => a.seatNo - b.seatNo)
        .map((member) => ({
          characterId: member.characterId,
          name: member.name,
          connected: member.connected && !member.session.left && !member.session.linkdead,
          inField: member.inField,
          preparingIn:
            member.preparingUntilMs === null
              ? 0
              : Math.max(0, Math.ceil((member.preparingUntilMs - nowMs) / 1_000)),
          respawnIn:
            member.respawnAtMs === null
              ? 0
              : Math.max(0, Math.ceil((member.respawnAtMs - nowMs) / 1_000)),
        })),
      inField: participant?.inField ?? false,
      preparingIn:
        participant?.preparingUntilMs == null
          ? 0
          : Math.max(0, Math.ceil((participant.preparingUntilMs - nowMs) / 1_000)),
      respawnIn:
        participant?.respawnAtMs == null
          ? 0
          : Math.max(0, Math.ceil((participant.respawnAtMs - nowMs) / 1_000)),
      timeLeft: Math.max(0, Math.ceil((run.endsAtMs - nowMs) / 1_000)),
      secondsRemaining: Math.max(
        0,
        Math.ceil((TERRITORY_CAPTURE_HOLD_MS - run.state.progressMs) / 1_000),
      ),
    };
  }

  private broadcast(run: CaptureRun<S>, nowMs: number): void {
    run.lastBroadcastSecond = Math.floor(nowMs / 1_000);
    for (const session of this.deps.sessions()) {
      if (session.left || session.linkdead || this.deps.guildId(session) !== run.guildId) continue;
      this.deps.send(session, {
        t: 'territory_capture',
        capture: this.view(run, nowMs, run.participants.get(session.characterId)),
      });
    }
  }

  private sendView(run: CaptureRun<S>, session: S): void {
    this.deps.send(session, {
      t: 'territory_capture',
      capture: this.view(run, Date.now(), run.participants.get(session.characterId)),
    });
  }

  private async complete(run: CaptureRun<S>): Promise<void> {
    const leader = this.nearestParticipant(run) ?? [...run.participants.values()][0];
    let result = leader
      ? await this.deps.service.execute(
          leader.characterId,
          randomUUID(),
          this.deps.service.currentRevision(),
          { kind: 'claim', cellId: run.cellId },
        )
      : ({ ok: false, error: 'not_participant' } as const);
    if (!result.ok && result.error === 'revision_conflict' && leader) {
      result = await this.deps.service.execute(
        leader.characterId,
        randomUUID(),
        this.deps.service.currentRevision(),
        { kind: 'claim', cellId: run.cellId },
      );
    }
    if (!result.ok)
      for (const participant of run.participants.values())
        this.refuse(participant.session, result.error);
    this.finish(run);
  }

  private finish(run: CaptureRun<S>): void {
    this.cleanupCreatures(run);
    for (const participant of run.participants.values()) {
      this.deps.sim.setTerritorySiegeTeam(participant.pid, null);
      if (participant.connected && !participant.session.left && !participant.session.linkdead) {
        const current = this.deps.sim.entities.get(participant.pid);
        if (current?.dead)
          this.deps.sim.revivePlayerAt(
            participant.pid,
            this.deps.sim.groundPos(participant.returnPos.x, participant.returnPos.z),
            1,
          );
        else if (participant.inField)
          this.deps.teleport(participant.session, participant.returnPos);
      }
      const entity = this.deps.sim.entities.get(participant.pid);
      if (entity) {
        entity.facing = participant.returnPos.facing;
        entity.prevFacing = participant.returnPos.facing;
      }
      this.byCharacter.delete(participant.characterId);
    }
    for (const session of this.deps.sessions())
      if (!session.left && !session.linkdead && this.deps.guildId(session) === run.guildId)
        this.deps.send(session, { t: 'territory_capture', capture: null });
    this.byCell.delete(run.cellId);
    this.byGuild.delete(run.guildId);
  }

  private cancel(run: CaptureRun<S>): void {
    this.finish(run);
  }

  private cleanupCreatures(run: CaptureRun<S>): void {
    for (const id of [...run.initialMobIds, ...run.reinforcementMobIds])
      if (this.deps.sim.entities.has(id)) this.deps.sim.dropEntity(id);
  }

  private refuse(session: S, code: string): void {
    this.deps.send(session, { t: 'territory_error', code });
  }
}
