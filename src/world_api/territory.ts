import type { TerritoryResourceKind, TerritoryTerrain } from '../sim/territory_manifest';

export type TerritoryGuildRank = 'member' | 'officer' | 'leader';
export type TerritoryStructureSlot =
  | 'keep_core'
  | 'gate'
  | 'wall'
  | 'tower_north'
  | 'tower_south'
  | 'storehouse'
  | 'construction_workshop'
  | 'siege_workshop';
export type TerritoryStructureKind =
  | 'keep'
  | 'gate'
  | 'wall'
  | 'defense_tower'
  | 'storehouse'
  | 'construction_workshop'
  | 'siege_workshop';
export type TerritoryWarStatus = 'declared' | 'forming' | 'active' | 'resolved' | 'cancelled';
export type TerritoryWarSide = 'attacker' | 'defender';
export type TerritorySiegeAction = 'deploy_ram' | 'ram_gate' | 'deploy_ramp' | 'strike_core';

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
  state: 'forming' | 'active' | 'ended';
  mySide: TerritoryWarSide;
  attackerCount: number;
  defenderCount: number;
  gateProgress: number;
  coreProgress: number;
  gateOpen: boolean;
  ramDeployed: boolean;
  rampDeployed: boolean;
  respawnIn: number;
  timeLeft: number;
  winner: TerritoryWarSide | null;
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
  territoryJoinWar(warId: string): void;
  territoryLeaveWar(warId: string): void;
  territorySiegeAction(action: TerritorySiegeAction): void;
}
