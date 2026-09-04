import type { TerritoryResourceKind, TerritoryTerrain } from '../sim/territory_manifest';
import type { TerritorySiegeBiome } from '../sim/territory_siege_biome';

export type TerritoryGuildRank = 'member' | 'officer' | 'leader';
export type TerritoryStructureSlot =
  | 'keep_core'
  | 'walls'
  | 'towers'
  | 'granary'
  | 'forester'
  | 'mine'
  | 'house'
  // Legacy slots remain readable so existing seasonal rows can be migrated
  // without making an older snapshot undecodable.
  | 'gate'
  | 'wall'
  | 'tower_north'
  | 'tower_south'
  | 'storehouse'
  | 'construction_workshop'
  | 'siege_workshop';
export type TerritoryStructureKind =
  | 'keep'
  | 'walls'
  | 'towers'
  | 'granary'
  | 'forester'
  | 'mine'
  | 'house'
  | 'gate'
  | 'wall'
  | 'defense_tower'
  | 'storehouse'
  | 'construction_workshop'
  | 'siege_workshop';
export type TerritoryWarStatus = 'declared' | 'forming' | 'active' | 'resolved' | 'cancelled';
export type TerritoryWarSide = 'attacker' | 'defender';
export type TerritorySiegeAction =
  | 'deploy_ram'
  | 'enter_ram'
  | 'leave_ram'
  | 'ram_gate'
  | 'ram_power_slam'
  | 'deploy_mortar'
  | 'enter_mortar'
  | 'leave_mortar'
  | 'mortar_fire'
  | 'mortar_frost'
  | 'mortar_venom'
  | 'deploy_catapult'
  | 'enter_catapult'
  | 'leave_catapult'
  | 'catapult_fire'
  | 'catapult_cluster'
  | 'defender_portal'
  | 'start_core_channel'
  | 'stop_core_channel';

export type TerritoryMortarShotKind = 'normal' | 'frost' | 'venom';
export type TerritoryCatapultShotKind = 'normal' | 'cluster';
export type TerritorySiegeWallRun = 'left' | 'right' | 'back' | 'front_left' | 'front_right';
/** Stable identity for one independently breachable castle-wall model. */
export type TerritorySiegeWallId = `${TerritorySiegeWallRun}:${number}`;
export type TerritorySiegeTowerId = 'left' | 'right';
export type TerritorySiegeObjectiveTarget =
  | { kind: 'gate' }
  | { kind: 'wall'; id: TerritorySiegeWallId }
  | { kind: 'tower'; id: TerritorySiegeTowerId }
  | { kind: 'ram'; id: number }
  | { kind: 'mortar'; id: number }
  | { kind: 'catapult'; id: number };

export interface TerritoryTowerZoneView {
  id: number;
  fromX: number;
  fromZ: number;
  x: number;
  z: number;
  radius: number;
  detonatesIn: number;
  duration: number;
}

export interface TerritoryCoreChannelView {
  x: number;
  z: number;
}

/** One server-authoritative, single-operator ram placed in local siege coordinates. */
export interface TerritorySiegeRamView {
  id: number;
  x: number;
  z: number;
  /** Clockwise yaw in siege-local radians; the ram's nose points at the gate. */
  yaw: number;
  occupied: boolean;
  cooldown: number;
  empoweredCooldown: number;
  hp?: number;
  maxHp?: number;
}

/** One server-authoritative mortar. Like rams, every mortar has one operator. */
export interface TerritorySiegeMortarView {
  id: number;
  x: number;
  z: number;
  yaw: number;
  /** Final aim yaw; `yaw` may still be traversing toward it. */
  targetYaw?: number;
  side: TerritoryWarSide;
  occupied: boolean;
  cooldown: number;
  frostCooldown: number;
  venomCooldown: number;
  hp?: number;
  maxHp?: number;
}

/** A server-timed mortar-shell flight. Coordinates are in world space. */
export interface TerritoryMortarZoneView {
  id: number;
  /** Deployed mortar that launched the shell; used to synchronize model recoil and flight. */
  mortarId: number;
  fromX: number;
  fromZ: number;
  x: number;
  z: number;
  radius: number;
  /** Seconds until the aligned mortar actually launches this shell. */
  launchesIn: number;
  detonatesIn: number;
  duration: number;
  kind: TerritoryMortarShotKind;
}

export interface TerritorySiegeCatapultView {
  id: number;
  x: number;
  z: number;
  yaw: number;
  /** Final aim yaw; `yaw` may still be traversing toward it. */
  targetYaw?: number;
  side: TerritoryWarSide;
  occupied: boolean;
  cooldown: number;
  clusterCooldown: number;
  hp?: number;
  maxHp?: number;
}

/** A server-timed rock flight. Coordinates are in world space. */
export interface TerritoryCatapultShotView {
  id: number;
  /** Deployed catapult that launched the rock; used to synchronize model recoil and flight. */
  catapultId: number;
  fromX: number;
  fromZ: number;
  x: number;
  z: number;
  radius: number;
  /** Seconds until the aligned catapult actually launches this rock. */
  launchesIn: number;
  detonatesIn: number;
  duration: number;
  kind: TerritoryCatapultShotKind;
}

export interface TerritorySiegeStructureHealthView<TId extends string> {
  id: TId;
  hp: number;
  maxHp: number;
}

export interface TerritorySeasonView {
  id: string;
  number: number;
  manifestVersion: number;
  manifestChecksum: string;
  radius: number;
  requirementsEnabled: boolean;
  startsAt: string;
  endsAt: string;
}

/** Only mutable/owned cells ride the network; neutral topology comes from the manifest. */
export interface TerritoryOwnedCellView {
  cellId: number;
  ownerGuildId: string;
  ownerGuildName: string;
  ownerColor: string;
  keepRoot: boolean;
  terrain: TerritoryTerrain;
  resource: TerritoryResourceKind | null;
}

export interface TerritoryStructureView {
  cellId: number;
  slot: TerritoryStructureSlot;
  kind: TerritoryStructureKind;
  level: number;
  state: 'building' | 'active';
  completesAt: string | null;
}

export interface TerritoryWarView {
  id: string;
  targetCellId: number;
  attackerGuildId: string;
  attackerGuildName: string;
  defenderGuildId: string;
  defenderGuildName: string;
  status: TerritoryWarStatus;
  declaredAt: string;
  startsAt: string;
  endsAt: string;
  winnerGuildId: string | null;
  attackerCount: number;
  defenderCount: number;
  mySide: TerritoryWarSide | null;
  /** Viewer-private queue state; public snapshots and deltas always carry false. */
  registered: boolean;
}

export interface TerritorySiegeView {
  warId: string;
  /** Visual environment selected from the target strategic hex. */
  biome: TerritorySiegeBiome;
  state: 'forming' | 'active' | 'ended';
  mySide: TerritoryWarSide;
  attackerCount: number;
  defenderCount: number;
  gateProgress: number;
  coreProgress: number;
  /** Exact objective health is rendered over the structures like an NPC health bar. */
  gateHp?: number;
  gateMaxHp?: number;
  coreHp?: number;
  coreMaxHp?: number;
  gateOpen: boolean;
  /** Compatibility summaries; `rams` is the authoritative multi-ram view. */
  ramDeployed: boolean;
  ramOccupants: number;
  ramJoined: boolean;
  ramCooldown: number;
  ramEmpoweredCooldown: number;
  rams?: TerritorySiegeRamView[];
  controlledRamId?: number | null;
  ramItemCount?: number;
  mortarDeployed: number;
  mortarJoined: boolean;
  mortarCooldown: number;
  mortarFrostCooldown: number;
  mortarVenomCooldown: number;
  mortars: TerritorySiegeMortarView[];
  controlledMortarId: number | null;
  mortarItemCount?: number;
  mortarZones: TerritoryMortarZoneView[];
  catapults?: TerritorySiegeCatapultView[];
  controlledCatapultId?: number | null;
  catapultItemCount?: number;
  catapultShots?: TerritoryCatapultShotView[];
  wallHealth?: TerritorySiegeStructureHealthView<TerritorySiegeWallId>[];
  towerHealth?: TerritorySiegeStructureHealthView<TerritorySiegeTowerId>[];
  coreChanneling: boolean;
  coreChannelProgress: number;
  /** Server-authoritative channel origins visible to every fighter in this siege. */
  coreChannels: TerritoryCoreChannelView[];
  defenseTowerLevel: number;
  towerZones: TerritoryTowerZoneView[];
  respawnIn: number;
  timeLeft: number;
  winner: TerritoryWarSide | null;
  /** Result-card countdown; zero during forming and active play. */
  resultReturnIn: number;
}

export interface TerritoryGuildView {
  id: string;
  name: string;
  color: string;
  rank: TerritoryGuildRank;
  territoryLevel: number;
  cellCapacity: number;
  ownedCellCount: number;
  resources: Record<TerritoryResourceKind, number>;
  resourceCapacity: number;
  accruedAt: string;
}

export interface TerritoryMapState {
  season: TerritorySeasonView;
  revision: number;
  cells: TerritoryOwnedCellView[];
  structures: TerritoryStructureView[];
  wars: TerritoryWarView[];
  guild: TerritoryGuildView | null;
  siege: TerritorySiegeView | null;
}

export interface IWorldTerritory {
  territoryMap: TerritoryMapState | null;
  /** Pre-battle notice remains available even while the strategic map is closed. */
  territoryWarNotice: TerritoryWarView | null;
  territoryOpen(): void;
  territoryClose(): void;
  territoryPlaceKeep(cellId: number): void;
  territoryClaim(cellId: number): void;
  territoryBuild(cellId: number, slot: TerritoryStructureSlot, kind: TerritoryStructureKind): void;
  territoryUpgrade(cellId: number, slot: TerritoryStructureSlot): void;
  /** Kept on the protocol seam for forwards compatibility; v1 rejects it because structures have no HP. */
  territoryRepair(cellId: number, slot: TerritoryStructureSlot): void;
  territoryDeclareWar(cellId: number): void;
  territoryCancelWar(warId: string): void;
  territoryJoinWar(warId: string): void;
  territoryLeaveWar(warId: string): void;
  territoryCraftSiege(kind: 'ram' | 'mortar' | 'catapult'): void;
  territorySiegeAction(
    action: TerritorySiegeAction,
    aim?: { x: number; z: number },
    facing?: number,
  ): void;
}
