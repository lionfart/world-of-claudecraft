import type { TerritoryGuildRank } from '../world_api/territory';
import { axialDistance } from './territory_manifest';
import type { TerritorySiegeBiome } from './territory_siege_biome';
import { TERRITORY_SIEGE_CORE_Z } from './territory_siege_layout';

export type TerritoryCapturePhase = 'guards' | 'capturing';

export interface TerritoryCaptureState {
  phase: TerritoryCapturePhase;
  progressMs: number;
  lastTickAtMs: number;
  nextWaveAtMs: number;
}

export interface TerritoryCaptureTickInput {
  nowMs: number;
  initialGuardsAlive: number;
  reinforcementsAlive: number;
  occupants: number;
}

export interface TerritoryCaptureTickResult {
  state: TerritoryCaptureState;
  spawnReinforcements: number;
  completed: boolean;
  changed: boolean;
}

export type TerritoryCaptureAdmissionError =
  | 'forbidden'
  | 'not_claimable'
  | 'already_owned'
  | 'not_adjacent'
  | 'capacity_reached';

export const TERRITORY_CAPTURE_CAMP_Z = TERRITORY_SIEGE_CORE_Z;
/** The whole camp clearing, not merely the campfire, contributes to capture. */
export const TERRITORY_CAPTURE_RADIUS = 18;
export const TERRITORY_CAPTURE_HOLD_MS = 60_000;
export const TERRITORY_CAPTURE_WAVE_INTERVAL_MS = 15_000;
export const TERRITORY_CAPTURE_INITIAL_GUARDS = 6;
export const TERRITORY_CAPTURE_WAVE_SIZE = 3;
export const TERRITORY_CAPTURE_MAX_REINFORCEMENTS = 7;
/** Registration is immediate; transfer into the expedition remains clearly telegraphed. */
export const TERRITORY_CAPTURE_PREPARE_MS = 10_000;
export const TERRITORY_CAPTURE_DURATION_MS = 60 * 60_000;
export const TERRITORY_CAPTURE_RESPAWN_MS = 15_000;

export type TerritoryCaptureDifficultyTier = 1 | 2 | 3 | 4;

export interface TerritoryCaptureDifficulty {
  tier: TerritoryCaptureDifficultyTier;
  level: number;
  powerMultiplier: number;
}

/** Visual species step up with the concentric strategic-map difficulty bands. */
const BIOME_CREATURES: Readonly<Record<TerritorySiegeBiome, readonly (readonly string[])[]>> = {
  temperate: [
    ['forest_wolf', 'wild_boar'],
    ['webwood_spider', 'mire_prowler'],
    ['fen_troll', 'ridge_stalker'],
    ['orchard_treant', 'mere_lurker'],
  ],
  rocky: [
    ['tunnel_rat', 'wild_boar'],
    ['mire_prowler', 'fen_troll'],
    ['ridge_stalker', 'deeprock_kobold'],
    ['deeprock_kobold', 'ironvein_foreman'],
  ],
  snow: [
    ['snowdrift_wolf', 'ice_wisp'],
    ['ice_wisp', 'rime_elemental'],
    ['rime_elemental', 'terrace_howler'],
    ['terrace_howler', 'frostmane_yeti'],
  ],
  desert: [
    ['ashbone_raider', 'dune_troll'],
    ['ashbone_warcaller', 'dune_troll'],
    ['ashbone_warcaller', 'emberwing_drake'],
    ['dragonkin_broodguard', 'emberwing_drake'],
  ],
};

/**
 * Outer-ring neutral land is the onboarding band. Level and an additional stat
 * multiplier rise monotonically toward the centre, while tier changes also swap
 * the visible creature roster.
 */
export function territoryCaptureDifficulty(
  q: number,
  r: number,
  radius: number,
): TerritoryCaptureDifficulty {
  const safeRadius = Math.max(1, Math.floor(radius));
  const distance = Math.min(safeRadius, axialDistance(q, r));
  const inward = Math.max(0, Math.min(1, (safeRadius - distance) / safeRadius));
  const tier = (Math.min(3, Math.floor(inward * 4)) + 1) as TerritoryCaptureDifficultyTier;
  return {
    tier,
    level: Math.max(3, Math.min(20, Math.round(3 + inward * 17))),
    powerMultiplier: [1, 1.15, 1.35, 1.6][tier - 1],
  };
}

export function territoryCaptureAdmission(input: {
  rank: TerritoryGuildRank;
  claimable: boolean;
  alreadyOwned: boolean;
  adjacent: boolean;
  ownedCount: number;
  capacity: number;
}): TerritoryCaptureAdmissionError | null {
  if (input.rank === 'member') return 'forbidden';
  if (!input.claimable) return 'not_claimable';
  if (input.alreadyOwned) return 'already_owned';
  if (!input.adjacent) return 'not_adjacent';
  if (input.ownedCount >= input.capacity) return 'capacity_reached';
  return null;
}

export function createTerritoryCaptureState(nowMs: number): TerritoryCaptureState {
  return {
    phase: 'guards',
    progressMs: 0,
    lastTickAtMs: nowMs,
    nextWaveAtMs: nowMs + TERRITORY_CAPTURE_WAVE_INTERVAL_MS,
  };
}

/** Pure server-clock capture kernel. Creature deaths and camp occupancy are host inputs. */
export function territoryCaptureTick(
  current: TerritoryCaptureState,
  input: TerritoryCaptureTickInput,
): TerritoryCaptureTickResult {
  const elapsed = Math.max(0, Math.min(1_000, input.nowMs - current.lastTickAtMs));
  let phase = current.phase;
  let progressMs = current.progressMs;
  let nextWaveAtMs = current.nextWaveAtMs;
  let spawnReinforcements = 0;
  let changed = false;
  let enteredCaptureThisTick = false;

  if (phase === 'guards' && input.initialGuardsAlive <= 0) {
    phase = 'capturing';
    nextWaveAtMs = input.nowMs;
    changed = true;
    enteredCaptureThisTick = true;
  }

  if (phase === 'capturing') {
    if (input.occupants > 0 && !enteredCaptureThisTick)
      progressMs = Math.min(TERRITORY_CAPTURE_HOLD_MS, progressMs + elapsed);
    if (
      input.nowMs >= nextWaveAtMs &&
      input.reinforcementsAlive < TERRITORY_CAPTURE_MAX_REINFORCEMENTS
    ) {
      spawnReinforcements = Math.min(
        TERRITORY_CAPTURE_WAVE_SIZE,
        TERRITORY_CAPTURE_MAX_REINFORCEMENTS - input.reinforcementsAlive,
      );
      nextWaveAtMs = input.nowMs + TERRITORY_CAPTURE_WAVE_INTERVAL_MS;
      changed = true;
    }
  }

  return {
    state: {
      phase,
      progressMs,
      lastTickAtMs: input.nowMs,
      nextWaveAtMs,
    },
    spawnReinforcements,
    completed: progressMs >= TERRITORY_CAPTURE_HOLD_MS,
    changed: changed || progressMs !== current.progressMs,
  };
}

export function territoryCaptureCreatureId(
  biome: TerritorySiegeBiome,
  index: number,
  wave: number,
  tier: TerritoryCaptureDifficultyTier = 1,
): string {
  const roster = BIOME_CREATURES[biome][Math.max(0, Math.min(3, tier - 1))];
  return roster[Math.abs(index + wave) % roster.length];
}

export function territoryCaptureGuardPosition(
  index: number,
  wave: number,
): { x: number; z: number } {
  const count = wave === 0 ? TERRITORY_CAPTURE_INITIAL_GUARDS : TERRITORY_CAPTURE_WAVE_SIZE;
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + wave * 0.61;
  const radius = wave === 0 ? 12.5 + (index % 2) * 3.5 : 16;
  return {
    x: Math.sin(angle) * radius,
    z: TERRITORY_CAPTURE_CAMP_Z + Math.cos(angle) * radius,
  };
}

export function territoryCaptureSpawn(seatNo: number): { x: number; z: number; facing: number } {
  const column = seatNo % 3;
  const row = Math.floor(seatNo / 3);
  return {
    x: (column - 1) * 3.2,
    // A long approach lane keeps newly-arrived attackers outside natural aggro
    // range and makes the neutral battlefield read larger without changing the
    // shared siege-band dimensions.
    z: TERRITORY_CAPTURE_CAMP_Z + 142 + row * 2.4,
    facing: Math.PI,
  };
}
