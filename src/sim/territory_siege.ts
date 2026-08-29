// Deterministic, server-authoritative rules for one seasonal territory siege.
// Wall-clock values are injected by the host; this leaf never reads Date or timers.

import type { TerritorySiegeAction, TerritorySiegeView, TerritoryWarSide } from '../world_api';

export interface TerritorySiegeRules {
  teamSize: number;
  disconnectGraceMs: number;
  respawnWaveMs: number;
  attackerForfeitMs: number;
  actionCooldownMs: number;
}

export interface TerritorySiegeDefinition {
  warId: string;
  warVersion: number;
  startsAtMs: number;
  endsAtMs: number;
  gateLevel: number;
  coreLevel: number;
  attackerHasSiegeWorkshop: boolean;
  defenseTowerLevel?: number;
}

export interface TerritorySiegeSeat {
  characterId: number;
  side: TerritoryWarSide;
  seatNo: number;
  connected: boolean;
  reservedUntilMs: number | null;
  deadUntilMs: number | null;
  lastActionAtMs: number | null;
}

export interface TerritorySiegeState {
  definition: TerritorySiegeDefinition;
  phase: 'forming' | 'active' | 'ended';
  seats: Map<number, TerritorySiegeSeat>;
  attackerEverJoined: boolean;
  gateHp: number;
  gateMaxHp: number;
  coreHp: number;
  coreMaxHp: number;
  ramDeployed: boolean;
  ramOccupants: Map<number, number>;
  nextRamSwingAtMs: number;
  coreChannels: Map<number, { startedAtMs: number; nextTickAtMs: number }>;
  winner: TerritoryWarSide | null;
  resultReason: 'core_destroyed' | 'timeout' | 'attacker_no_show' | null;
  resolved: boolean;
  nextTowerShotAtMs: number;
  towerCursor: number;
}

export type TerritorySiegeJoinResult =
  | { ok: true; seat: TerritorySiegeSeat; reconnected: boolean }
  | { ok: false; reason: 'ended' | 'team_full' };

export type TerritorySiegeActionResult =
  | { ok: true; ended: boolean }
  | {
      ok: false;
      reason:
        | 'not_active'
        | 'not_participant'
        | 'disconnected'
        | 'dead'
        | 'defender_action'
        | 'cooldown'
        | 'workshop_required'
        | 'ram_required'
        | 'ram_full'
        | 'ram_not_occupied'
        | 'ram_cooldown'
        | 'already_occupied'
        | 'channel_active'
        | 'channel_inactive'
        | 'gate_destroyed'
        | 'gate_locked_core'
        | 'already_deployed';
    };

function structureHp(base: number, level: number): number {
  return base + Math.max(0, Math.min(5, Math.floor(level))) * 25;
}

const RAM_CAPACITY = 4;
const CORE_CHANNEL_WARMUP_MS = 1_500;
const CORE_CHANNEL_TICK_MS = 1_000;
const CORE_CHANNEL_DAMAGE = 8;

function removeSiegeControl(state: TerritorySiegeState, characterId: number): void {
  state.ramOccupants.delete(characterId);
  state.coreChannels.delete(characterId);
}

function nextRamSeat(state: TerritorySiegeState): number {
  const occupied = new Set(state.ramOccupants.values());
  for (let seatNo = 1; seatNo <= RAM_CAPACITY; seatNo += 1) {
    if (!occupied.has(seatNo)) return seatNo;
  }
  return 0;
}

function ramDamage(occupants: number): number {
  return 12 + Math.max(1, Math.min(RAM_CAPACITY, occupants)) * 8;
}

function ramCooldownMs(occupants: number): number {
  return 3_200 - Math.max(1, Math.min(RAM_CAPACITY, occupants)) * 450;
}

function countSide(state: TerritorySiegeState, side: TerritoryWarSide): number {
  let count = 0;
  for (const seat of state.seats.values()) if (seat.side === side) count += 1;
  return count;
}

function nextSeat(state: TerritorySiegeState, side: TerritoryWarSide, teamSize: number): number {
  const used = new Set<number>();
  for (const seat of state.seats.values()) if (seat.side === side) used.add(seat.seatNo);
  for (let seatNo = 1; seatNo <= teamSize; seatNo += 1) if (!used.has(seatNo)) return seatNo;
  return 0;
}

function finish(
  state: TerritorySiegeState,
  winner: TerritoryWarSide,
  reason: NonNullable<TerritorySiegeState['resultReason']>,
): void {
  if (state.phase === 'ended') return;
  state.phase = 'ended';
  state.winner = winner;
  state.resultReason = reason;
  state.ramOccupants.clear();
  state.coreChannels.clear();
}

export type TerritorySiegeControl = { kind: 'ram'; seatNo: number } | { kind: 'core_channel' };

export function territorySiegeControlFor(
  state: TerritorySiegeState,
  characterId: number,
): TerritorySiegeControl | null {
  const ramSeat = state.ramOccupants.get(characterId);
  if (ramSeat !== undefined) return { kind: 'ram', seatNo: ramSeat };
  return state.coreChannels.has(characterId) ? { kind: 'core_channel' } : null;
}

export function createTerritorySiege(definition: TerritorySiegeDefinition): TerritorySiegeState {
  const gateMaxHp = definition.gateLevel <= 0 ? 0 : structureHp(100, definition.gateLevel);
  const coreMaxHp = structureHp(150, definition.coreLevel);
  return {
    definition,
    phase: 'forming',
    seats: new Map(),
    attackerEverJoined: false,
    gateHp: gateMaxHp,
    gateMaxHp,
    coreHp: coreMaxHp,
    coreMaxHp,
    ramDeployed: false,
    ramOccupants: new Map(),
    nextRamSwingAtMs: definition.startsAtMs,
    coreChannels: new Map(),
    winner: null,
    resultReason: null,
    resolved: false,
    nextTowerShotAtMs: definition.startsAtMs,
    towerCursor: 0,
  };
}

export function territorySiegeTowerShot(
  state: TerritorySiegeState,
  nowMs: number,
): { characterId: number; damage: number } | null {
  const level = Math.max(0, Math.floor(state.definition.defenseTowerLevel ?? 0));
  if (state.phase !== 'active' || level === 0 || nowMs < state.nextTowerShotAtMs) return null;
  state.nextTowerShotAtMs = nowMs + Math.max(1_500, 4_000 - level * 300);
  const targets = [...state.seats.values()]
    .filter((seat) => seat.side === 'attacker' && seat.connected && seat.deadUntilMs === null)
    .sort((a, b) => a.seatNo - b.seatNo || a.characterId - b.characterId);
  if (targets.length === 0) return null;
  const target = targets[state.towerCursor % targets.length];
  state.towerCursor += 1;
  return { characterId: target.characterId, damage: 6 + level * 4 };
}

/** Restores a DB-assigned seat while warming a process after deploy/restart. */
export function territorySiegeRestoreSeat(
  state: TerritorySiegeState,
  seat: Pick<TerritorySiegeSeat, 'characterId' | 'side' | 'seatNo' | 'connected'>,
  reservedUntilMs: number | null = null,
): void {
  if (state.phase === 'ended' || state.seats.has(seat.characterId)) return;
  state.seats.set(seat.characterId, {
    ...seat,
    reservedUntilMs,
    deadUntilMs: null,
    lastActionAtMs: null,
  });
  if (seat.side === 'attacker' && seat.connected) state.attackerEverJoined = true;
}

export function territorySiegeJoin(
  state: TerritorySiegeState,
  characterId: number,
  side: TerritoryWarSide,
  nowMs: number,
  rules: TerritorySiegeRules,
): TerritorySiegeJoinResult {
  if (state.phase === 'ended') return { ok: false, reason: 'ended' };
  const existing = state.seats.get(characterId);
  if (existing) {
    existing.connected = true;
    existing.reservedUntilMs = null;
    if (side === 'attacker') state.attackerEverJoined = true;
    return { ok: true, seat: existing, reconnected: true };
  }
  const seatNo = nextSeat(state, side, rules.teamSize);
  if (seatNo === 0) return { ok: false, reason: 'team_full' };
  const seat: TerritorySiegeSeat = {
    characterId,
    side,
    seatNo,
    connected: true,
    reservedUntilMs: null,
    deadUntilMs: null,
    lastActionAtMs: null,
  };
  state.seats.set(characterId, seat);
  if (side === 'attacker') state.attackerEverJoined = true;
  territorySiegeTick(state, nowMs, rules);
  return { ok: true, seat, reconnected: false };
}

export function territorySiegeDisconnect(
  state: TerritorySiegeState,
  characterId: number,
  nowMs: number,
  rules: TerritorySiegeRules,
): boolean {
  const seat = state.seats.get(characterId);
  if (!seat) return false;
  seat.connected = false;
  seat.reservedUntilMs = nowMs + rules.disconnectGraceMs;
  removeSiegeControl(state, characterId);
  return true;
}

export function territorySiegeLeave(state: TerritorySiegeState, characterId: number): boolean {
  removeSiegeControl(state, characterId);
  return state.seats.delete(characterId);
}

export function territorySiegeRecordDeath(
  state: TerritorySiegeState,
  characterId: number,
  nowMs: number,
  rules: TerritorySiegeRules,
): number | null {
  const seat = state.seats.get(characterId);
  if (!seat || state.phase !== 'active') return null;
  if (seat.deadUntilMs !== null) return seat.deadUntilMs;
  removeSiegeControl(state, characterId);
  const elapsed = Math.max(0, nowMs - state.definition.startsAtMs);
  const wave = Math.floor(elapsed / rules.respawnWaveMs) + 1;
  seat.deadUntilMs = state.definition.startsAtMs + wave * rules.respawnWaveMs;
  return seat.deadUntilMs;
}

export function territorySiegeConsumeRespawn(
  state: TerritorySiegeState,
  characterId: number,
  nowMs: number,
): boolean {
  const seat = state.seats.get(characterId);
  if (!seat || seat.deadUntilMs === null || nowMs < seat.deadUntilMs) return false;
  seat.deadUntilMs = null;
  return true;
}

export function territorySiegeTick(
  state: TerritorySiegeState,
  nowMs: number,
  rules: TerritorySiegeRules,
): void {
  if (state.phase === 'ended') return;
  for (const [characterId, seat] of state.seats) {
    if (!seat.connected && seat.reservedUntilMs !== null && nowMs >= seat.reservedUntilMs) {
      removeSiegeControl(state, characterId);
      state.seats.delete(characterId);
    }
  }
  if (state.phase === 'forming' && nowMs >= state.definition.startsAtMs) state.phase = 'active';
  if (state.phase !== 'active') return;
  if (!state.attackerEverJoined && nowMs >= state.definition.startsAtMs + rules.attackerForfeitMs) {
    finish(state, 'defender', 'attacker_no_show');
    return;
  }
  if (nowMs >= state.definition.endsAtMs) {
    finish(state, 'defender', 'timeout');
    return;
  }
  if (state.gateHp <= 0 && state.ramOccupants.size > 0) state.ramOccupants.clear();
  for (const [characterId, channel] of state.coreChannels) {
    const seat = state.seats.get(characterId);
    if (
      !seat?.connected ||
      seat.deadUntilMs !== null ||
      seat.side !== 'attacker' ||
      state.gateHp > 0
    ) {
      state.coreChannels.delete(characterId);
      continue;
    }
    if (nowMs < channel.nextTickAtMs) continue;
    const ticks = Math.floor((nowMs - channel.nextTickAtMs) / CORE_CHANNEL_TICK_MS) + 1;
    channel.nextTickAtMs += ticks * CORE_CHANNEL_TICK_MS;
    state.coreHp = Math.max(0, state.coreHp - ticks * CORE_CHANNEL_DAMAGE);
    if (state.coreHp === 0) {
      finish(state, 'attacker', 'core_destroyed');
      return;
    }
  }
}

export function territorySiegeApplyAction(
  state: TerritorySiegeState,
  characterId: number,
  action: TerritorySiegeAction,
  nowMs: number,
  rules: TerritorySiegeRules,
): TerritorySiegeActionResult {
  territorySiegeTick(state, nowMs, rules);
  if (state.phase !== 'active') return { ok: false, reason: 'not_active' };
  const seat = state.seats.get(characterId);
  if (!seat) return { ok: false, reason: 'not_participant' };
  if (!seat.connected) return { ok: false, reason: 'disconnected' };
  if (seat.deadUntilMs !== null) return { ok: false, reason: 'dead' };
  if (seat.side !== 'attacker') return { ok: false, reason: 'defender_action' };
  const bypassActionCooldown = action === 'leave_ram' || action === 'stop_core_channel';
  if (
    !bypassActionCooldown &&
    seat.lastActionAtMs !== null &&
    nowMs - seat.lastActionAtMs < rules.actionCooldownMs
  ) {
    return { ok: false, reason: 'cooldown' };
  }

  switch (action) {
    case 'deploy_ram':
      if (state.gateHp <= 0) return { ok: false, reason: 'gate_destroyed' };
      if (!state.definition.attackerHasSiegeWorkshop) {
        return { ok: false, reason: 'workshop_required' };
      }
      if (state.ramDeployed) return { ok: false, reason: 'already_deployed' };
      state.ramDeployed = true;
      break;
    case 'enter_ram': {
      if (!state.ramDeployed) return { ok: false, reason: 'ram_required' };
      if (state.gateHp <= 0) return { ok: false, reason: 'gate_destroyed' };
      if (state.ramOccupants.has(characterId)) return { ok: false, reason: 'already_occupied' };
      if (state.coreChannels.has(characterId)) return { ok: false, reason: 'channel_active' };
      const ramSeat = nextRamSeat(state);
      if (ramSeat === 0) return { ok: false, reason: 'ram_full' };
      state.ramOccupants.set(characterId, ramSeat);
      break;
    }
    case 'leave_ram':
      if (!state.ramOccupants.delete(characterId)) {
        return { ok: false, reason: 'ram_not_occupied' };
      }
      break;
    case 'ram_gate':
      if (state.gateMaxHp === 0 || state.gateHp <= 0) {
        return { ok: false, reason: 'gate_destroyed' };
      }
      if (!state.ramDeployed) return { ok: false, reason: 'ram_required' };
      if (!state.ramOccupants.has(characterId)) {
        return { ok: false, reason: 'ram_not_occupied' };
      }
      if (nowMs < state.nextRamSwingAtMs) return { ok: false, reason: 'ram_cooldown' };
      state.gateHp = Math.max(0, state.gateHp - ramDamage(state.ramOccupants.size));
      state.nextRamSwingAtMs = nowMs + ramCooldownMs(state.ramOccupants.size);
      if (state.gateHp === 0) state.ramOccupants.clear();
      break;
    case 'start_core_channel':
      if (state.gateHp > 0) return { ok: false, reason: 'gate_locked_core' };
      if (state.ramOccupants.has(characterId)) return { ok: false, reason: 'already_occupied' };
      if (state.coreChannels.has(characterId)) return { ok: false, reason: 'channel_active' };
      state.coreChannels.set(characterId, {
        startedAtMs: nowMs,
        nextTickAtMs: nowMs + CORE_CHANNEL_WARMUP_MS,
      });
      break;
    case 'stop_core_channel':
      if (!state.coreChannels.delete(characterId)) {
        return { ok: false, reason: 'channel_inactive' };
      }
      break;
  }
  if (!bypassActionCooldown) seat.lastActionAtMs = nowMs;
  return { ok: true, ended: state.winner !== null };
}

export function territorySiegeMarkResolved(state: TerritorySiegeState): boolean {
  if (state.phase !== 'ended' || state.resolved) return false;
  state.resolved = true;
  return true;
}

export function territorySiegeViewFor(
  state: TerritorySiegeState,
  characterId: number,
  nowMs: number,
): TerritorySiegeView | null {
  const seat = state.seats.get(characterId);
  if (!seat) return null;
  return {
    warId: state.definition.warId,
    state: state.phase,
    mySide: seat.side,
    attackerCount: countSide(state, 'attacker'),
    defenderCount: countSide(state, 'defender'),
    gateProgress: state.gateMaxHp === 0 ? 1 : 1 - state.gateHp / state.gateMaxHp,
    coreProgress: 1 - state.coreHp / state.coreMaxHp,
    gateOpen: state.gateHp <= 0,
    ramDeployed: state.ramDeployed,
    ramOccupants: state.ramOccupants.size,
    ramJoined: state.ramOccupants.has(characterId),
    ramCooldown: Math.max(0, Math.ceil((state.nextRamSwingAtMs - nowMs) / 1_000)),
    coreChanneling: state.coreChannels.has(characterId),
    coreChannelProgress: Math.min(
      1,
      Math.max(
        0,
        (nowMs - (state.coreChannels.get(characterId)?.startedAtMs ?? nowMs)) /
          CORE_CHANNEL_WARMUP_MS,
      ),
    ),
    towerZones: [],
    respawnIn:
      seat.deadUntilMs === null ? 0 : Math.max(0, Math.ceil((seat.deadUntilMs - nowMs) / 1000)),
    timeLeft: Math.max(0, Math.ceil((state.definition.endsAtMs - nowMs) / 1000)),
    winner: state.winner,
  };
}
