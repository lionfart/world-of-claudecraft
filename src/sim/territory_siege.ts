// Deterministic, server-authoritative rules for one seasonal territory siege.
// Wall-clock values are injected by the host; this leaf never reads Date or timers.

import type {
  TerritoryCatapultShotKind,
  TerritoryMortarShotKind,
  TerritorySiegeAction,
  TerritorySiegeView,
  TerritorySiegeWallId,
  TerritoryWarSide,
} from '../world_api';
import type { TerritorySiegeBiome } from './territory_siege_biome';
import {
  TERRITORY_SIEGE_GATE_Z,
  TERRITORY_SIEGE_MAX_CATAPULTS_PER_SIDE,
  TERRITORY_SIEGE_MAX_MORTARS_PER_SIDE,
  TERRITORY_SIEGE_MAX_RAMS,
  TERRITORY_SIEGE_TOWER_X,
  TERRITORY_SIEGE_TOWER_Z,
  TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH,
  territorySiegeCatapultDeployPlacement,
  territorySiegeCatapultPlacementAllowed,
  territorySiegeCatapultTargetAllowed,
  territorySiegeMortarDeployPlacement,
  territorySiegeMortarPlacementAllowed,
  territorySiegeMortarTargetAllowed,
  territorySiegeNearestCatapult,
  territorySiegeNearestMortar,
  territorySiegeNearestRam,
  territorySiegeRamDeploymentAreaContains,
  territorySiegeRamDeployPlacement,
  territorySiegeWallSegmentPlacements,
} from './territory_siege_layout';

export const TERRITORY_SIEGE_RAM_ITEM_ID = 'territory_battering_ram';
export const TERRITORY_SIEGE_MORTAR_ITEM_ID = 'territory_field_mortar';
export const TERRITORY_SIEGE_CATAPULT_ITEM_ID = 'territory_catapult';

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
  biome: TerritorySiegeBiome;
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
  rams: Map<number, TerritorySiegeRamState>;
  nextRamId: number;
  mortars: Map<number, TerritorySiegeMortarState>;
  nextMortarId: number;
  catapults: Map<number, TerritorySiegeCatapultState>;
  nextCatapultId: number;
  wallHp: Record<TerritorySiegeWallId, number>;
  wallMaxHp: number;
  towerHp: Record<'left' | 'right', number>;
  towerMaxHp: number;
  pendingMortarShots: TerritorySiegePendingMortarShot[];
  launchedMortarImpacts: TerritorySiegeLaunchedMortarImpact[];
  pendingCatapultShots: TerritorySiegePendingCatapultShot[];
  launchedCatapultImpacts: TerritorySiegeLaunchedCatapultImpact[];
  coreChannels: Map<number, { startedAtMs: number; nextTickAtMs: number }>;
  winner: TerritoryWarSide | null;
  resultReason: 'core_destroyed' | 'timeout' | 'attacker_no_show' | null;
  resolved: boolean;
  nextTowerShotAtMs: number;
  towerCursor: number;
}

export interface TerritorySiegeRamState {
  id: number;
  /** Position relative to the siege instance origin. */
  x: number;
  z: number;
  yaw: number;
  /** Rams are intentionally single-player siege weapons. */
  operatorCharacterId: number | null;
  nextSwingAtMs: number;
  nextPowerSwingAtMs: number;
  hp: number;
  maxHp: number;
}

export interface TerritorySiegeMortarState {
  id: number;
  x: number;
  z: number;
  yaw: number;
  side: TerritoryWarSide;
  operatorCharacterId: number | null;
  /** Prevents retargeting while the carriage is still traversing. */
  nextLaunchAtMs: number;
  nextShotAtMs: number;
  nextFrostAtMs: number;
  nextVenomAtMs: number;
  hp: number;
  maxHp: number;
}

export interface TerritorySiegeCatapultState {
  id: number;
  x: number;
  z: number;
  yaw: number;
  side: TerritoryWarSide;
  operatorCharacterId: number | null;
  /** Prevents retargeting while the carriage is still traversing. */
  nextLaunchAtMs: number;
  nextShotAtMs: number;
  nextClusterAtMs: number;
  hp: number;
  maxHp: number;
}

export interface TerritorySiegeActionContext {
  /** Actor position relative to the siege instance origin. */
  x?: number;
  z?: number;
  /** Inventory authority supplied by the host for deploy_ram. */
  hasRamItem?: boolean;
  /** Inventory authority supplied by the host for deploy_mortar. */
  hasMortarItem?: boolean;
  /** Inventory authority supplied by the host for deploy_catapult. */
  hasCatapultItem?: boolean;
  /** Actor facing in siege-local radians, used to orient deployed artillery. */
  facing?: number;
  /** Target position relative to the siege instance origin. */
  aimX?: number;
  aimZ?: number;
}

export type TerritorySiegeJoinResult =
  | { ok: true; seat: TerritorySiegeSeat; reconnected: boolean }
  | { ok: false; reason: 'ended' | 'team_full' };

export interface TerritorySiegeRamImpact {
  ramId: number;
  x: number;
  z: number;
  radius: number;
  damage: number;
  knockback: number;
}

export interface TerritorySiegeMortarImpact {
  mortarId: number;
  kind: TerritoryMortarShotKind;
  side: TerritoryWarSide;
  fromX: number;
  fromZ: number;
  x: number;
  z: number;
  radius: number;
  damage: number;
  /** Time spent traversing the weapon toward the target before launch. */
  launchDelayMs?: number;
  delayMs: number;
  slow?: { multiplier: number; duration: number };
  poison?: { damagePerTick: number; duration: number; interval: number };
  stun?: { duration: number };
}

export interface TerritorySiegeCatapultImpact {
  catapultId: number;
  kind: TerritoryCatapultShotKind;
  side: TerritoryWarSide;
  fromX: number;
  fromZ: number;
  x: number;
  z: number;
  radius: number;
  damage: number;
  structureDamage: number;
  /** Time spent traversing the weapon toward the target before launch. */
  launchDelayMs?: number;
  delayMs: number;
  slow?: { multiplier: number; duration: number };
}

interface TerritorySiegePendingMortarShot {
  sourceCharacterId: number;
  launchAtMs: number;
  fromYaw: number;
  impact: TerritorySiegeMortarImpact;
}

interface TerritorySiegePendingCatapultShot {
  sourceCharacterId: number;
  launchAtMs: number;
  fromYaw: number;
  impact: TerritorySiegeCatapultImpact;
}

export interface TerritorySiegeLaunchedMortarImpact {
  sourceCharacterId: number;
  impact: TerritorySiegeMortarImpact;
}

export interface TerritorySiegeLaunchedCatapultImpact {
  sourceCharacterId: number;
  impact: TerritorySiegeCatapultImpact;
}

export type TerritorySiegeActionResult =
  | {
      ok: true;
      ended: boolean;
      consumeRam?: boolean;
      ramImpact?: TerritorySiegeRamImpact;
      consumeMortar?: boolean;
      mortarImpact?: TerritorySiegeMortarImpact;
      consumeCatapult?: boolean;
      catapultImpact?: TerritorySiegeCatapultImpact;
    }
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
        | 'ram_power_cooldown'
        | 'already_occupied'
        | 'channel_active'
        | 'channel_inactive'
        | 'gate_destroyed'
        | 'gate_locked_core'
        | 'already_deployed'
        | 'ram_limit'
        | 'ram_overlap'
        | 'ram_out_of_zone'
        | 'ram_item_required'
        | 'ram_not_found'
        | 'mortar_required'
        | 'mortar_full'
        | 'mortar_not_occupied'
        | 'mortar_cooldown'
        | 'mortar_frost_cooldown'
        | 'mortar_venom_cooldown'
        | 'mortar_limit'
        | 'mortar_out_of_zone'
        | 'mortar_item_required'
        | 'mortar_not_found'
        | 'mortar_target_invalid'
        | 'out_of_range'
        | 'catapult_required'
        | 'catapult_full'
        | 'catapult_not_occupied'
        | 'catapult_cooldown'
        | 'catapult_cluster_cooldown'
        | 'catapult_limit'
        | 'catapult_out_of_zone'
        | 'catapult_item_required'
        | 'catapult_not_found'
        | 'catapult_target_invalid';
    };

function structureHp(base: number, level: number): number {
  return base + Math.max(0, Math.min(5, Math.floor(level))) * 25;
}

const CORE_CHANNEL_WARMUP_MS = 1_500;
const CORE_CHANNEL_TICK_MS = 1_000;
const CORE_CHANNEL_DAMAGE = 8;

/** The keep becomes attackable through either the gate or one destroyed wall segment. */
function territorySiegeKeepBreached(state: TerritorySiegeState): boolean {
  return state.gateHp <= 0 || Object.values(state.wallHp).some((hp) => hp <= 0);
}

function removeSiegeControl(state: TerritorySiegeState, characterId: number): void {
  for (const ram of state.rams.values()) {
    if (ram.operatorCharacterId === characterId) ram.operatorCharacterId = null;
  }
  for (const mortar of state.mortars.values()) {
    if (mortar.operatorCharacterId === characterId) mortar.operatorCharacterId = null;
  }
  for (const catapult of state.catapults.values()) {
    if (catapult.operatorCharacterId === characterId) catapult.operatorCharacterId = null;
  }
  state.coreChannels.delete(characterId);
}

function controlledMortar(
  state: TerritorySiegeState,
  characterId: number,
): TerritorySiegeMortarState | null {
  for (const mortar of state.mortars.values()) {
    if (mortar.operatorCharacterId === characterId) return mortar;
  }
  return null;
}

function controlledCatapult(
  state: TerritorySiegeState,
  characterId: number,
): TerritorySiegeCatapultState | null {
  for (const catapult of state.catapults.values()) {
    if (catapult.operatorCharacterId === characterId) return catapult;
  }
  return null;
}

function controlledRam(
  state: TerritorySiegeState,
  characterId: number,
): TerritorySiegeRamState | null {
  for (const ram of state.rams.values()) {
    if (ram.operatorCharacterId === characterId) return ram;
  }
  return null;
}

const RAM_DAMAGE = 20;
const RAM_COOLDOWN_MS = 2_400;
const RAM_POWER_DAMAGE = 48;
const RAM_POWER_COOLDOWN_MS = 14_000;
const RAM_POWER_AOE_DAMAGE = 28;
const RAM_POWER_AOE_RADIUS = 9;
const RAM_POWER_KNOCKBACK = 7;
const MORTAR_DELAY_MS = 2_200;
const MORTAR_DAMAGE = 34;
const MORTAR_COOLDOWN_MS = 6_000;
const MORTAR_FROST_DAMAGE = 16;
const MORTAR_FROST_COOLDOWN_MS = 14_000;
const MORTAR_VENOM_DAMAGE = 10;
const MORTAR_VENOM_COOLDOWN_MS = 20_000;
const CATAPULT_DELAY_MS = 2_400;
const CATAPULT_DAMAGE = 30;
const CATAPULT_STRUCTURE_DAMAGE = 36;
const CATAPULT_COOLDOWN_MS = 7_000;
const CATAPULT_CLUSTER_DAMAGE = 14;
const CATAPULT_CLUSTER_STRUCTURE_DAMAGE = 18;
const CATAPULT_CLUSTER_COOLDOWN_MS = 16_000;
/** Deliberate heavy-artillery traverse speed: one third of a turn takes two seconds. */
export const TERRITORY_SIEGE_ARTILLERY_TURN_RADIANS_PER_SECOND = Math.PI / 3;
export const TERRITORY_SIEGE_RAM_MAX_HP = 190;
export const TERRITORY_SIEGE_MORTAR_MAX_HP = 120;
export const TERRITORY_SIEGE_CATAPULT_MAX_HP = 165;

function shortestYawDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function artilleryAim(
  weapon: { x: number; z: number; yaw: number },
  aimX: number,
  aimZ: number,
): { targetYaw: number; launchDelayMs: number } {
  const targetYaw = Math.atan2(aimX - weapon.x, aimZ - weapon.z);
  const turnRadians = Math.abs(shortestYawDelta(weapon.yaw, targetYaw));
  return {
    targetYaw,
    launchDelayMs: Math.ceil(
      (turnRadians / TERRITORY_SIEGE_ARTILLERY_TURN_RADIANS_PER_SECOND) * 1_000,
    ),
  };
}

function artilleryDisplayYaw(
  targetYaw: number,
  pending: { fromYaw: number; launchAtMs: number; impact: { launchDelayMs?: number } } | undefined,
  nowMs: number,
): number {
  const delayMs = pending?.impact.launchDelayMs ?? 0;
  if (!pending || delayMs <= 0) return targetYaw;
  const progress = Math.max(0, Math.min(1, 1 - (pending.launchAtMs - nowMs) / delayMs));
  return pending.fromYaw + shortestYawDelta(pending.fromYaw, targetYaw) * progress;
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
  for (const ram of state.rams.values()) ram.operatorCharacterId = null;
  for (const mortar of state.mortars.values()) mortar.operatorCharacterId = null;
  for (const catapult of state.catapults.values()) catapult.operatorCharacterId = null;
  state.pendingMortarShots.length = 0;
  state.pendingCatapultShots.length = 0;
  state.launchedMortarImpacts.length = 0;
  state.launchedCatapultImpacts.length = 0;
  state.coreChannels.clear();
}

export type TerritorySiegeControl =
  | { kind: 'ram'; ramId: number }
  | { kind: 'mortar'; mortarId: number }
  | { kind: 'catapult'; catapultId: number }
  | { kind: 'core_channel' };

export function territorySiegeControlFor(
  state: TerritorySiegeState,
  characterId: number,
): TerritorySiegeControl | null {
  const ram = controlledRam(state, characterId);
  if (ram) return { kind: 'ram', ramId: ram.id };
  const mortar = controlledMortar(state, characterId);
  if (mortar) return { kind: 'mortar', mortarId: mortar.id };
  const catapult = controlledCatapult(state, characterId);
  if (catapult) return { kind: 'catapult', catapultId: catapult.id };
  return state.coreChannels.has(characterId) ? { kind: 'core_channel' } : null;
}

export function createTerritorySiege(definition: TerritorySiegeDefinition): TerritorySiegeState {
  const gateMaxHp = structureHp(100, Math.max(1, definition.gateLevel));
  const coreMaxHp = structureHp(150, definition.coreLevel);
  const wallMaxHp = structureHp(120, definition.gateLevel);
  const towerLevel = Math.max(0, definition.defenseTowerLevel ?? 0);
  const towerMaxHp = towerLevel > 0 ? structureHp(90, towerLevel) : 0;
  return {
    definition,
    phase: 'forming',
    seats: new Map(),
    attackerEverJoined: false,
    gateHp: gateMaxHp,
    gateMaxHp,
    coreHp: coreMaxHp,
    coreMaxHp,
    rams: new Map(),
    nextRamId: 1,
    mortars: new Map(),
    nextMortarId: 1,
    catapults: new Map(),
    nextCatapultId: 1,
    wallHp: Object.fromEntries(
      Object.keys(territorySiegeWallSegmentPlacements()).map((id) => [id, wallMaxHp]),
    ) as Record<TerritorySiegeWallId, number>,
    wallMaxHp,
    towerHp: { left: towerMaxHp, right: towerMaxHp },
    towerMaxHp,
    pendingMortarShots: [],
    launchedMortarImpacts: [],
    pendingCatapultShots: [],
    launchedCatapultImpacts: [],
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
  eligible: (characterId: number) => boolean = () => true,
): { characterId: number; damage: number; towerId: 'left' | 'right' } | null {
  const level = Math.max(0, Math.floor(state.definition.defenseTowerLevel ?? 0));
  const livingTowerIds = (['left', 'right'] as const).filter((id) => state.towerHp[id] > 0);
  const livingTowers = livingTowerIds.length;
  if (
    state.phase !== 'active' ||
    level === 0 ||
    livingTowers === 0 ||
    nowMs < state.nextTowerShotAtMs
  )
    return null;
  state.nextTowerShotAtMs = nowMs + Math.max(1_500, 4_000 - level * 300);
  const targets = [...state.seats.values()]
    .filter(
      (seat) =>
        seat.side === 'attacker' &&
        seat.connected &&
        seat.deadUntilMs === null &&
        eligible(seat.characterId),
    )
    .sort((a, b) => a.seatNo - b.seatNo || a.characterId - b.characterId);
  if (targets.length === 0) return null;
  const target = targets[state.towerCursor % targets.length];
  const towerId = livingTowerIds[state.towerCursor % livingTowerIds.length];
  state.towerCursor += 1;
  return {
    characterId: target.characterId,
    damage: 4 + level * 3 + livingTowers * 2,
    towerId,
  };
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
      if (seat.side === 'attacker') {
        // The attacking roster locks at battle start. Losing the socket must
        // never consume that registration; the player may return at any time
        // before resolution, even after the ordinary grace window elapsed.
        seat.reservedUntilMs = null;
      } else {
        state.seats.delete(characterId);
      }
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
  if (state.gateHp <= 0) {
    for (const ram of state.rams.values()) ram.operatorCharacterId = null;
  }
  for (let index = state.pendingMortarShots.length - 1; index >= 0; index -= 1) {
    const pending = state.pendingMortarShots[index];
    if (nowMs < pending.launchAtMs) continue;
    state.pendingMortarShots.splice(index, 1);
    const weapon = state.mortars.get(pending.impact.mortarId);
    const seat = state.seats.get(pending.sourceCharacterId);
    if (
      !weapon ||
      weapon.hp <= 0 ||
      weapon.operatorCharacterId !== pending.sourceCharacterId ||
      !seat?.connected ||
      seat.deadUntilMs !== null
    )
      continue;
    state.launchedMortarImpacts.push({
      sourceCharacterId: pending.sourceCharacterId,
      impact: { ...pending.impact, launchDelayMs: 0 },
    });
  }
  for (let index = state.pendingCatapultShots.length - 1; index >= 0; index -= 1) {
    const pending = state.pendingCatapultShots[index];
    if (nowMs < pending.launchAtMs) continue;
    state.pendingCatapultShots.splice(index, 1);
    const weapon = state.catapults.get(pending.impact.catapultId);
    const seat = state.seats.get(pending.sourceCharacterId);
    if (
      !weapon ||
      weapon.hp <= 0 ||
      weapon.operatorCharacterId !== pending.sourceCharacterId ||
      !seat?.connected ||
      seat.deadUntilMs !== null
    )
      continue;
    state.launchedCatapultImpacts.push({
      sourceCharacterId: pending.sourceCharacterId,
      impact: { ...pending.impact, launchDelayMs: 0 },
    });
  }
  for (const [characterId, channel] of state.coreChannels) {
    const seat = state.seats.get(characterId);
    if (
      !seat?.connected ||
      seat.deadUntilMs !== null ||
      seat.side !== 'attacker' ||
      !territorySiegeKeepBreached(state)
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

export function territorySiegeDrainLaunchedMortarImpacts(
  state: TerritorySiegeState,
): TerritorySiegeLaunchedMortarImpact[] {
  return state.launchedMortarImpacts.splice(0, state.launchedMortarImpacts.length);
}

export function territorySiegeDrainLaunchedCatapultImpacts(
  state: TerritorySiegeState,
): TerritorySiegeLaunchedCatapultImpact[] {
  return state.launchedCatapultImpacts.splice(0, state.launchedCatapultImpacts.length);
}

function catapultCircleHitsWall(
  impact: Pick<TerritorySiegeCatapultImpact, 'x' | 'z' | 'radius'>,
  wall: Readonly<{ x: number; z: number; scaleX: number; yaw: number }>,
): boolean {
  const cosine = Math.cos(-wall.yaw);
  const sine = Math.sin(-wall.yaw);
  const dx = impact.x - wall.x;
  const dz = impact.z - wall.z;
  const localX = dx * cosine + dz * sine;
  const localZ = -dx * sine + dz * cosine;
  const outsideX = Math.max(0, Math.abs(localX) - wall.scaleX);
  const outsideZ = Math.max(0, Math.abs(localZ) - TERRITORY_SIEGE_WALL_VISUAL_HALF_DEPTH);
  return outsideX * outsideX + outsideZ * outsideZ <= impact.radius * impact.radius;
}

/**
 * Applies a landed catapult rock to enemy siege objectives in siege-local space.
 * Attackers can breach defender structures; both sides can destroy opposing field weapons.
 */
export function territorySiegeApplyCatapultStructureImpact(
  state: TerritorySiegeState,
  impact: Pick<TerritorySiegeCatapultImpact, 'side' | 'x' | 'z' | 'radius' | 'structureDamage'>,
): boolean {
  if (state.phase !== 'active' || impact.structureDamage <= 0) {
    return false;
  }
  const inRange = (x: number, z: number, extra = 0) =>
    (impact.x - x) ** 2 + (impact.z - z) ** 2 <= (impact.radius + extra) ** 2;
  let changed = false;
  if (impact.side === 'attacker' && state.gateHp > 0 && inRange(0, TERRITORY_SIEGE_GATE_Z, 3)) {
    state.gateHp = Math.max(0, state.gateHp - impact.structureDamage);
    changed = true;
  }
  if (impact.side === 'attacker') {
    for (const [id, wall] of Object.entries(territorySiegeWallSegmentPlacements()) as [
      TerritorySiegeWallId,
      ReturnType<typeof territorySiegeWallSegmentPlacements>[TerritorySiegeWallId],
    ][]) {
      if (state.wallHp[id] <= 0 || !catapultCircleHitsWall(impact, wall)) continue;
      state.wallHp[id] = Math.max(0, state.wallHp[id] - impact.structureDamage);
      changed = true;
    }
    if (state.towerHp.left > 0 && inRange(-TERRITORY_SIEGE_TOWER_X, TERRITORY_SIEGE_TOWER_Z, 4)) {
      state.towerHp.left = Math.max(0, state.towerHp.left - impact.structureDamage);
      changed = true;
    }
    if (state.towerHp.right > 0 && inRange(TERRITORY_SIEGE_TOWER_X, TERRITORY_SIEGE_TOWER_Z, 4)) {
      state.towerHp.right = Math.max(0, state.towerHp.right - impact.structureDamage);
      changed = true;
    }
  }

  const damageWeapon = <T extends { x: number; z: number; hp: number; side?: TerritoryWarSide }>(
    weapons: Map<number, T>,
    radius: number,
    sideFor: (weapon: T) => TerritoryWarSide,
  ): void => {
    for (const [id, weapon] of weapons) {
      if (sideFor(weapon) === impact.side || !inRange(weapon.x, weapon.z, radius)) continue;
      weapon.hp = Math.max(0, weapon.hp - impact.structureDamage);
      changed = true;
      if (weapon.hp === 0) weapons.delete(id);
    }
  };
  damageWeapon(state.rams, 2.65, () => 'attacker');
  damageWeapon(state.mortars, 2.45, (weapon) => weapon.side ?? 'attacker');
  damageWeapon(state.catapults, 3.1, (weapon) => weapon.side ?? 'attacker');
  return changed;
}

export function territorySiegeApplyAction(
  state: TerritorySiegeState,
  characterId: number,
  action: TerritorySiegeAction,
  nowMs: number,
  rules: TerritorySiegeRules,
  context: TerritorySiegeActionContext = {},
): TerritorySiegeActionResult {
  territorySiegeTick(state, nowMs, rules);
  if (state.phase !== 'active') return { ok: false, reason: 'not_active' };
  const seat = state.seats.get(characterId);
  if (!seat) return { ok: false, reason: 'not_participant' };
  if (!seat.connected) return { ok: false, reason: 'disconnected' };
  if (seat.deadUntilMs !== null) return { ok: false, reason: 'dead' };
  const mortarAction =
    action === 'deploy_mortar' ||
    action === 'enter_mortar' ||
    action === 'leave_mortar' ||
    action === 'mortar_fire' ||
    action === 'mortar_frost' ||
    action === 'mortar_venom';
  const catapultAction =
    action === 'deploy_catapult' ||
    action === 'enter_catapult' ||
    action === 'leave_catapult' ||
    action === 'catapult_fire' ||
    action === 'catapult_cluster';
  if (seat.side !== 'attacker' && !mortarAction && !catapultAction) {
    return { ok: false, reason: 'defender_action' };
  }
  const bypassActionCooldown =
    action === 'leave_ram' ||
    action === 'leave_mortar' ||
    action === 'leave_catapult' ||
    action === 'stop_core_channel';
  if (
    !bypassActionCooldown &&
    seat.lastActionAtMs !== null &&
    nowMs - seat.lastActionAtMs < rules.actionCooldownMs
  ) {
    return { ok: false, reason: 'cooldown' };
  }

  switch (action) {
    case 'deploy_ram': {
      if (state.gateHp <= 0) return { ok: false, reason: 'gate_destroyed' };
      if (!state.definition.attackerHasSiegeWorkshop) {
        return { ok: false, reason: 'workshop_required' };
      }
      if (context.hasRamItem === false) return { ok: false, reason: 'ram_item_required' };
      if (state.rams.size >= TERRITORY_SIEGE_MAX_RAMS) {
        return { ok: false, reason: 'ram_limit' };
      }
      const actorX = context.x ?? 0;
      const actorZ = context.z ?? 27;
      if (!territorySiegeRamDeploymentAreaContains(actorX, actorZ)) {
        return { ok: false, reason: 'ram_out_of_zone' };
      }
      const placement = territorySiegeRamDeployPlacement(state.rams.size);
      if (!placement) return { ok: false, reason: 'ram_limit' };
      const id = state.nextRamId++;
      state.rams.set(id, {
        id,
        ...placement,
        operatorCharacterId: null,
        nextSwingAtMs: nowMs,
        nextPowerSwingAtMs: nowMs,
        hp: TERRITORY_SIEGE_RAM_MAX_HP,
        maxHp: TERRITORY_SIEGE_RAM_MAX_HP,
      });
      if (!bypassActionCooldown) seat.lastActionAtMs = nowMs;
      return { ok: true, ended: state.winner !== null, consumeRam: true };
    }
    case 'enter_ram': {
      if (state.rams.size === 0) return { ok: false, reason: 'ram_required' };
      if (state.gateHp <= 0) return { ok: false, reason: 'gate_destroyed' };
      if (controlledRam(state, characterId)) return { ok: false, reason: 'already_occupied' };
      if (controlledMortar(state, characterId)) return { ok: false, reason: 'already_occupied' };
      if (controlledCatapult(state, characterId)) return { ok: false, reason: 'already_occupied' };
      if (state.coreChannels.has(characterId)) return { ok: false, reason: 'channel_active' };
      const candidates = [...state.rams.values()].filter(
        (candidate) => candidate.operatorCharacterId === null,
      );
      if (candidates.length === 0) return { ok: false, reason: 'ram_full' };
      const ram =
        context.x === undefined || context.z === undefined
          ? candidates[0]
          : territorySiegeNearestRam(context.x, context.z, candidates);
      if (!ram) return { ok: false, reason: 'ram_not_found' };
      ram.operatorCharacterId = characterId;
      break;
    }
    case 'deploy_mortar': {
      if (context.hasMortarItem === false) {
        return { ok: false, reason: 'mortar_item_required' };
      }
      const sideMortars = [...state.mortars.values()].filter(
        (candidate) => candidate.side === seat.side,
      );
      if (sideMortars.length >= TERRITORY_SIEGE_MAX_MORTARS_PER_SIDE) {
        return { ok: false, reason: 'mortar_limit' };
      }
      const actorX = context.x ?? 0;
      const actorZ = context.z ?? (seat.side === 'defender' ? -18 : 58);
      if (
        !territorySiegeMortarPlacementAllowed(
          actorX,
          actorZ,
          state.mortars.values(),
          state.rams.values(),
          state.catapults.values(),
        )
      ) {
        return { ok: false, reason: 'mortar_out_of_zone' };
      }
      const placement = territorySiegeMortarDeployPlacement(
        seat.side,
        actorX,
        actorZ,
        context.facing,
      );
      const id = state.nextMortarId++;
      state.mortars.set(id, {
        id,
        ...placement,
        operatorCharacterId: null,
        nextLaunchAtMs: nowMs,
        nextShotAtMs: nowMs,
        nextFrostAtMs: nowMs,
        nextVenomAtMs: nowMs,
        hp: TERRITORY_SIEGE_MORTAR_MAX_HP,
        maxHp: TERRITORY_SIEGE_MORTAR_MAX_HP,
      });
      if (!bypassActionCooldown) seat.lastActionAtMs = nowMs;
      return { ok: true, ended: state.winner !== null, consumeMortar: true };
    }
    case 'enter_mortar': {
      const ownMortars = [...state.mortars.values()].filter(
        (candidate) => candidate.side === seat.side,
      );
      if (ownMortars.length === 0) return { ok: false, reason: 'mortar_required' };
      if (
        controlledRam(state, characterId) ||
        controlledMortar(state, characterId) ||
        controlledCatapult(state, characterId)
      ) {
        return { ok: false, reason: 'already_occupied' };
      }
      if (state.coreChannels.has(characterId)) return { ok: false, reason: 'channel_active' };
      const candidates = ownMortars.filter((candidate) => candidate.operatorCharacterId === null);
      if (candidates.length === 0) return { ok: false, reason: 'mortar_full' };
      const mortar =
        context.x === undefined || context.z === undefined
          ? candidates[0]
          : territorySiegeNearestMortar(context.x, context.z, candidates);
      if (!mortar) return { ok: false, reason: 'mortar_not_found' };
      mortar.operatorCharacterId = characterId;
      break;
    }
    case 'leave_mortar': {
      const mortar = controlledMortar(state, characterId);
      if (!mortar) return { ok: false, reason: 'mortar_not_occupied' };
      mortar.operatorCharacterId = null;
      break;
    }
    case 'mortar_fire':
    case 'mortar_frost':
    case 'mortar_venom': {
      const mortar = controlledMortar(state, characterId);
      if (!mortar) return { ok: false, reason: 'mortar_not_occupied' };
      const aimX = context.aimX;
      const aimZ = context.aimZ;
      if (
        aimX === undefined ||
        aimZ === undefined ||
        !territorySiegeMortarTargetAllowed(mortar, aimX, aimZ)
      ) {
        return { ok: false, reason: 'mortar_target_invalid' };
      }
      const kind: TerritoryMortarShotKind =
        action === 'mortar_fire' ? 'normal' : action === 'mortar_frost' ? 'frost' : 'venom';
      if (nowMs < mortar.nextLaunchAtMs) {
        return { ok: false, reason: 'mortar_cooldown' };
      }
      const nextAt =
        kind === 'normal'
          ? mortar.nextShotAtMs
          : kind === 'frost'
            ? mortar.nextFrostAtMs
            : mortar.nextVenomAtMs;
      if (nowMs < nextAt) {
        return {
          ok: false,
          reason:
            kind === 'normal'
              ? 'mortar_cooldown'
              : kind === 'frost'
                ? 'mortar_frost_cooldown'
                : 'mortar_venom_cooldown',
        };
      }
      const fromYaw = mortar.yaw;
      const aim = artilleryAim(mortar, aimX, aimZ);
      mortar.yaw = aim.targetYaw;
      mortar.nextLaunchAtMs = nowMs + aim.launchDelayMs;
      if (kind === 'normal') mortar.nextShotAtMs = nowMs + aim.launchDelayMs + MORTAR_COOLDOWN_MS;
      else if (kind === 'frost')
        mortar.nextFrostAtMs = nowMs + aim.launchDelayMs + MORTAR_FROST_COOLDOWN_MS;
      else mortar.nextVenomAtMs = nowMs + aim.launchDelayMs + MORTAR_VENOM_COOLDOWN_MS;
      const mortarImpact: TerritorySiegeMortarImpact = {
        mortarId: mortar.id,
        kind,
        side: seat.side,
        fromX: mortar.x,
        fromZ: mortar.z,
        x: aimX,
        z: aimZ,
        radius: kind === 'frost' ? 7 : 6,
        damage:
          kind === 'normal'
            ? MORTAR_DAMAGE
            : kind === 'frost'
              ? MORTAR_FROST_DAMAGE
              : MORTAR_VENOM_DAMAGE,
        launchDelayMs: aim.launchDelayMs,
        delayMs: MORTAR_DELAY_MS,
        ...(kind === 'frost' ? { slow: { multiplier: 0.5, duration: 5 } } : {}),
        ...(kind === 'venom'
          ? {
              poison: { damagePerTick: 4, duration: 4, interval: 1 },
              stun: { duration: 1.5 },
            }
          : {}),
      };
      if (!bypassActionCooldown) seat.lastActionAtMs = nowMs;
      if (aim.launchDelayMs > 0) {
        state.pendingMortarShots.push({
          sourceCharacterId: characterId,
          launchAtMs: nowMs + aim.launchDelayMs,
          fromYaw,
          impact: mortarImpact,
        });
        return { ok: true, ended: state.winner !== null };
      }
      return { ok: true, ended: state.winner !== null, mortarImpact };
    }
    case 'deploy_catapult': {
      if (context.hasCatapultItem === false) {
        return { ok: false, reason: 'catapult_item_required' };
      }
      const ownCatapults = [...state.catapults.values()].filter(
        (candidate) => candidate.side === seat.side,
      );
      if (ownCatapults.length >= TERRITORY_SIEGE_MAX_CATAPULTS_PER_SIDE) {
        return { ok: false, reason: 'catapult_limit' };
      }
      const actorX = context.x ?? 0;
      const actorZ = context.z ?? (seat.side === 'defender' ? -24 : 62);
      if (
        !territorySiegeCatapultPlacementAllowed(
          actorX,
          actorZ,
          state.catapults.values(),
          state.mortars.values(),
          state.rams.values(),
        )
      ) {
        return { ok: false, reason: 'catapult_out_of_zone' };
      }
      const id = state.nextCatapultId++;
      state.catapults.set(id, {
        id,
        ...territorySiegeCatapultDeployPlacement(
          seat.side,
          actorX,
          actorZ,
          context.facing ?? (seat.side === 'defender' ? Math.PI : 0),
        ),
        operatorCharacterId: null,
        nextLaunchAtMs: nowMs,
        nextShotAtMs: nowMs,
        nextClusterAtMs: nowMs,
        hp: TERRITORY_SIEGE_CATAPULT_MAX_HP,
        maxHp: TERRITORY_SIEGE_CATAPULT_MAX_HP,
      });
      if (!bypassActionCooldown) seat.lastActionAtMs = nowMs;
      return { ok: true, ended: false, consumeCatapult: true };
    }
    case 'enter_catapult': {
      const ownCatapults = [...state.catapults.values()].filter(
        (candidate) => candidate.side === seat.side,
      );
      if (ownCatapults.length === 0) return { ok: false, reason: 'catapult_required' };
      if (
        controlledRam(state, characterId) ||
        controlledMortar(state, characterId) ||
        controlledCatapult(state, characterId)
      )
        return { ok: false, reason: 'already_occupied' };
      if (state.coreChannels.has(characterId)) return { ok: false, reason: 'channel_active' };
      const candidates = ownCatapults.filter((candidate) => candidate.operatorCharacterId === null);
      if (candidates.length === 0) return { ok: false, reason: 'catapult_full' };
      const catapult =
        context.x === undefined || context.z === undefined
          ? candidates[0]
          : territorySiegeNearestCatapult(context.x, context.z, candidates);
      if (!catapult) return { ok: false, reason: 'catapult_not_found' };
      catapult.operatorCharacterId = characterId;
      break;
    }
    case 'leave_catapult': {
      const catapult = controlledCatapult(state, characterId);
      if (!catapult) return { ok: false, reason: 'catapult_not_occupied' };
      catapult.operatorCharacterId = null;
      break;
    }
    case 'catapult_fire':
    case 'catapult_cluster': {
      const catapult = controlledCatapult(state, characterId);
      if (!catapult) return { ok: false, reason: 'catapult_not_occupied' };
      const aimX = context.aimX;
      const aimZ = context.aimZ;
      if (
        aimX === undefined ||
        aimZ === undefined ||
        !territorySiegeCatapultTargetAllowed(catapult, aimX, aimZ)
      )
        return { ok: false, reason: 'catapult_target_invalid' };
      const cluster = action === 'catapult_cluster';
      if (nowMs < catapult.nextLaunchAtMs) {
        return { ok: false, reason: 'catapult_cooldown' };
      }
      const nextAt = cluster ? catapult.nextClusterAtMs : catapult.nextShotAtMs;
      if (nowMs < nextAt) {
        return { ok: false, reason: cluster ? 'catapult_cluster_cooldown' : 'catapult_cooldown' };
      }
      const fromYaw = catapult.yaw;
      const aim = artilleryAim(catapult, aimX, aimZ);
      catapult.nextLaunchAtMs = nowMs + aim.launchDelayMs;
      if (cluster)
        catapult.nextClusterAtMs = nowMs + aim.launchDelayMs + CATAPULT_CLUSTER_COOLDOWN_MS;
      else catapult.nextShotAtMs = nowMs + aim.launchDelayMs + CATAPULT_COOLDOWN_MS;
      catapult.yaw = aim.targetYaw;
      const catapultImpact: TerritorySiegeCatapultImpact = {
        catapultId: catapult.id,
        kind: cluster ? 'cluster' : 'normal',
        side: seat.side,
        fromX: catapult.x,
        fromZ: catapult.z,
        x: aimX,
        z: aimZ,
        radius: cluster ? 10 : 5.5,
        damage: cluster ? CATAPULT_CLUSTER_DAMAGE : CATAPULT_DAMAGE,
        structureDamage: cluster ? CATAPULT_CLUSTER_STRUCTURE_DAMAGE : CATAPULT_STRUCTURE_DAMAGE,
        launchDelayMs: aim.launchDelayMs,
        delayMs: CATAPULT_DELAY_MS,
        ...(cluster ? { slow: { multiplier: 0.58, duration: 4 } } : {}),
      };
      if (!bypassActionCooldown) seat.lastActionAtMs = nowMs;
      if (aim.launchDelayMs > 0) {
        state.pendingCatapultShots.push({
          sourceCharacterId: characterId,
          launchAtMs: nowMs + aim.launchDelayMs,
          fromYaw,
          impact: catapultImpact,
        });
        return { ok: true, ended: false };
      }
      return { ok: true, ended: false, catapultImpact };
    }
    case 'leave_ram': {
      const ram = controlledRam(state, characterId);
      if (!ram) {
        return { ok: false, reason: 'ram_not_occupied' };
      }
      ram.operatorCharacterId = null;
      break;
    }
    case 'ram_gate': {
      if (state.gateMaxHp === 0 || state.gateHp <= 0) {
        return { ok: false, reason: 'gate_destroyed' };
      }
      const ram = controlledRam(state, characterId);
      if (!ram) return { ok: false, reason: 'ram_not_occupied' };
      if (nowMs < ram.nextSwingAtMs) return { ok: false, reason: 'ram_cooldown' };
      state.gateHp = Math.max(0, state.gateHp - RAM_DAMAGE);
      ram.nextSwingAtMs = nowMs + RAM_COOLDOWN_MS;
      if (state.gateHp === 0) {
        for (const deployed of state.rams.values()) deployed.operatorCharacterId = null;
      }
      break;
    }
    case 'ram_power_slam': {
      if (state.gateMaxHp === 0 || state.gateHp <= 0) {
        return { ok: false, reason: 'gate_destroyed' };
      }
      const ram = controlledRam(state, characterId);
      if (!ram) return { ok: false, reason: 'ram_not_occupied' };
      if (nowMs < ram.nextPowerSwingAtMs) {
        return { ok: false, reason: 'ram_power_cooldown' };
      }
      state.gateHp = Math.max(0, state.gateHp - RAM_POWER_DAMAGE);
      ram.nextPowerSwingAtMs = nowMs + RAM_POWER_COOLDOWN_MS;
      ram.nextSwingAtMs = Math.max(ram.nextSwingAtMs, nowMs + RAM_COOLDOWN_MS);
      const impactDistance = 5;
      const ramImpact: TerritorySiegeRamImpact = {
        ramId: ram.id,
        x: ram.x - Math.sin(ram.yaw) * impactDistance,
        z: ram.z - Math.cos(ram.yaw) * impactDistance,
        radius: RAM_POWER_AOE_RADIUS,
        damage: RAM_POWER_AOE_DAMAGE,
        knockback: RAM_POWER_KNOCKBACK,
      };
      if (state.gateHp === 0) {
        for (const deployed of state.rams.values()) deployed.operatorCharacterId = null;
      }
      if (!bypassActionCooldown) seat.lastActionAtMs = nowMs;
      return { ok: true, ended: state.winner !== null, ramImpact };
    }
    case 'start_core_channel':
      if (!territorySiegeKeepBreached(state)) {
        return { ok: false, reason: 'gate_locked_core' };
      }
      if (controlledRam(state, characterId)) return { ok: false, reason: 'already_occupied' };
      if (controlledMortar(state, characterId)) return { ok: false, reason: 'already_occupied' };
      if (controlledCatapult(state, characterId)) return { ok: false, reason: 'already_occupied' };
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
  const ram = controlledRam(state, characterId);
  const mortar = controlledMortar(state, characterId);
  const catapult = controlledCatapult(state, characterId);
  return {
    warId: state.definition.warId,
    biome: state.definition.biome,
    state: state.phase,
    mySide: seat.side,
    attackerCount: countSide(state, 'attacker'),
    defenderCount: countSide(state, 'defender'),
    gateProgress: state.gateMaxHp === 0 ? 1 : 1 - state.gateHp / state.gateMaxHp,
    coreProgress: 1 - state.coreHp / state.coreMaxHp,
    gateHp: state.gateHp,
    gateMaxHp: state.gateMaxHp,
    coreHp: state.coreHp,
    coreMaxHp: state.coreMaxHp,
    gateOpen: state.gateHp <= 0,
    ramDeployed: state.rams.size > 0,
    ramOccupants: [...state.rams.values()].filter(
      (candidate) => candidate.operatorCharacterId !== null,
    ).length,
    ramJoined: ram !== null,
    ramCooldown: ram ? Math.max(0, Math.ceil((ram.nextSwingAtMs - nowMs) / 1_000)) : 0,
    ramEmpoweredCooldown: ram
      ? Math.max(0, Math.ceil((ram.nextPowerSwingAtMs - nowMs) / 1_000))
      : 0,
    rams: [...state.rams.values()].map((candidate) => ({
      id: candidate.id,
      x: candidate.x,
      z: candidate.z,
      yaw: candidate.yaw,
      occupied: candidate.operatorCharacterId !== null,
      cooldown: Math.max(0, Math.ceil((candidate.nextSwingAtMs - nowMs) / 1_000)),
      empoweredCooldown: Math.max(0, Math.ceil((candidate.nextPowerSwingAtMs - nowMs) / 1_000)),
      hp: candidate.hp,
      maxHp: candidate.maxHp,
    })),
    controlledRamId: ram?.id ?? null,
    mortarDeployed: state.mortars.size,
    mortarJoined: mortar !== null,
    mortarCooldown: mortar ? Math.max(0, Math.ceil((mortar.nextShotAtMs - nowMs) / 1_000)) : 0,
    mortarFrostCooldown: mortar
      ? Math.max(0, Math.ceil((mortar.nextFrostAtMs - nowMs) / 1_000))
      : 0,
    mortarVenomCooldown: mortar
      ? Math.max(0, Math.ceil((mortar.nextVenomAtMs - nowMs) / 1_000))
      : 0,
    mortars: [...state.mortars.values()].map((candidate) => ({
      id: candidate.id,
      x: candidate.x,
      z: candidate.z,
      yaw: artilleryDisplayYaw(
        candidate.yaw,
        state.pendingMortarShots.find((shot) => shot.impact.mortarId === candidate.id),
        nowMs,
      ),
      targetYaw: candidate.yaw,
      side: candidate.side,
      occupied: candidate.operatorCharacterId !== null,
      cooldown: Math.max(0, Math.ceil((candidate.nextShotAtMs - nowMs) / 1_000)),
      frostCooldown: Math.max(0, Math.ceil((candidate.nextFrostAtMs - nowMs) / 1_000)),
      venomCooldown: Math.max(0, Math.ceil((candidate.nextVenomAtMs - nowMs) / 1_000)),
      hp: candidate.hp,
      maxHp: candidate.maxHp,
    })),
    controlledMortarId: mortar?.id ?? null,
    mortarZones: [],
    catapults: [...state.catapults.values()].map((candidate) => ({
      id: candidate.id,
      x: candidate.x,
      z: candidate.z,
      yaw: artilleryDisplayYaw(
        candidate.yaw,
        state.pendingCatapultShots.find((shot) => shot.impact.catapultId === candidate.id),
        nowMs,
      ),
      targetYaw: candidate.yaw,
      side: candidate.side,
      occupied: candidate.operatorCharacterId !== null,
      cooldown: Math.max(0, Math.ceil((candidate.nextShotAtMs - nowMs) / 1_000)),
      clusterCooldown: Math.max(0, Math.ceil((candidate.nextClusterAtMs - nowMs) / 1_000)),
      hp: candidate.hp,
      maxHp: candidate.maxHp,
    })),
    controlledCatapultId: catapult?.id ?? null,
    catapultShots: [],
    wallHealth: Object.keys(territorySiegeWallSegmentPlacements()).map((id) => ({
      id: id as TerritorySiegeWallId,
      hp: state.wallHp[id as TerritorySiegeWallId],
      maxHp: state.wallMaxHp,
    })),
    towerHealth: (['left', 'right'] as const).map((id) => ({
      id,
      hp: state.towerHp[id],
      maxHp: state.towerMaxHp,
    })),
    coreChanneling: state.coreChannels.has(characterId),
    coreChannelProgress: Math.min(
      1,
      Math.max(
        0,
        (nowMs - (state.coreChannels.get(characterId)?.startedAtMs ?? nowMs)) /
          CORE_CHANNEL_WARMUP_MS,
      ),
    ),
    coreChannels: [],
    defenseTowerLevel: Math.max(0, Math.floor(state.definition.defenseTowerLevel ?? 0)),
    towerZones: [],
    respawnIn:
      seat.deadUntilMs === null ? 0 : Math.max(0, Math.ceil((seat.deadUntilMs - nowMs) / 1000)),
    timeLeft: Math.max(0, Math.ceil((state.definition.endsAtMs - nowMs) / 1000)),
    winner: state.winner,
    resultReturnIn: 0,
  };
}
