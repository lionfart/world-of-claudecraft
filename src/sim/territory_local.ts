import type {
  TerritoryMapState,
  TerritoryStructureKind,
  TerritoryStructureSlot,
} from '../world_api/territory';
import { createTerritoryManifest } from './territory_manifest';
import type { TerritorySiegeControl } from './territory_siege';
import {
  clampTerritorySiegeGate,
  sealTerritorySiegeGateForSide,
  territorySiegeProjectilePathClear,
} from './territory_siege_layout';
import { isTerritoryClaimAdjacent } from './territory_topology';

export interface TerritorySimTeam {
  warId: string;
  side: 'attacker' | 'defender';
  slot: number;
  gateOpen: boolean;
  control: TerritorySiegeControl | null;
}

const STARTING_RESOURCES = 250;
const SLOT_KIND: Readonly<Record<TerritoryStructureSlot, TerritoryStructureKind>> = {
  keep_core: 'keep',
  gate: 'gate',
  wall: 'wall',
  tower_north: 'defense_tower',
  tower_south: 'defense_tower',
  storehouse: 'storehouse',
  construction_workshop: 'construction_workshop',
  siege_workshop: 'siege_workshop',
};

export class LocalTerritoryState {
  private readonly manifest = createTerritoryManifest();
  readonly state: TerritoryMapState;

  constructor() {
    this.state = {
      season: {
        id: 'offline-season-1',
        number: 1,
        manifestVersion: this.manifest.version,
        manifestChecksum: this.manifest.checksum,
        radius: this.manifest.radius,
        requirementsEnabled: false,
        startsAt: '1970-01-01T00:00:00.000Z',
        endsAt: '9999-12-31T23:59:59.999Z',
      },
      revision: 1,
      cells: [],
      structures: [],
      wars: [],
      guild: {
        id: 'offline-guild',
        name: 'Wayfarers',
        color: '#bd7a32',
        rank: 'leader',
        territoryLevel: 1,
        cellCapacity: this.manifest.cells.length,
        ownedCellCount: 0,
        resources: {
          wood: STARTING_RESOURCES,
          iron: STARTING_RESOURCES,
          grain: STARTING_RESOURCES,
          labor: STARTING_RESOURCES,
        },
        resourceCapacity: 2_000,
        accruedAt: '1970-01-01T00:00:00.000Z',
      },
      siege: null,
    };
  }

  placeKeep(cellId: number): boolean {
    const cell = this.manifest.byId.get(cellId);
    const guild = this.state.guild;
    if (!cell || !guild || this.state.cells.some((owned) => owned.ownerGuildId === guild.id))
      return false;
    this.state.cells.push({
      cellId,
      ownerGuildId: guild.id,
      ownerGuildName: guild.name,
      ownerColor: guild.color,
      keepRoot: true,
      terrain: cell.terrain,
      resource: cell.resource,
    });
    this.state.structures.push({
      cellId,
      slot: 'keep_core',
      kind: 'keep',
      level: 1,
      state: 'active',
      completesAt: null,
    });
    guild.ownedCellCount = 1;
    this.state.revision += 1;
    return true;
  }

  claim(cellId: number): boolean {
    const guild = this.state.guild;
    const cell = this.manifest.byId.get(cellId);
    if (!guild || !cell || guild.ownedCellCount >= guild.cellCapacity) return false;
    const owned = new Set(this.state.cells.map((entry) => entry.cellId));
    if (!isTerritoryClaimAdjacent(this.manifest, owned, cellId)) return false;
    this.state.cells.push({
      cellId,
      ownerGuildId: guild.id,
      ownerGuildName: guild.name,
      ownerColor: guild.color,
      keepRoot: false,
      terrain: cell.terrain,
      resource: cell.resource,
    });
    guild.ownedCellCount += 1;
    this.state.revision += 1;
    return true;
  }

  build(cellId: number, slot: TerritoryStructureSlot, kind: TerritoryStructureKind): boolean {
    const guild = this.state.guild;
    const ownsCell = this.state.cells.some(
      (cell) => cell.cellId === cellId && cell.ownerGuildId === guild?.id,
    );
    if (
      !guild ||
      guild.rank === 'member' ||
      !ownsCell ||
      SLOT_KIND[slot] !== kind ||
      slot === 'keep_core' ||
      this.state.structures.some(
        (structure) => structure.cellId === cellId && structure.slot === slot,
      )
    ) {
      return false;
    }
    this.state.structures.push({
      cellId,
      slot,
      kind,
      level: 1,
      state: 'active',
      completesAt: null,
    });
    this.state.revision += 1;
    return true;
  }

  upgrade(cellId: number, slot: TerritoryStructureSlot): boolean {
    const structure = this.state.structures.find(
      (entry) => entry.cellId === cellId && entry.slot === slot,
    );
    if (!structure || structure.level >= 5 || this.state.guild?.rank === 'member') return false;
    structure.level += 1;
    this.state.revision += 1;
    return true;
  }
}

export class TerritorySimRuntime {
  private local: LocalTerritoryState | null = null;
  private visible = false;
  private readonly teams = new Map<number, TerritorySimTeam>();

  get map(): TerritoryMapState | null {
    return this.visible ? this.authority().state : null;
  }
  get warNotice(): null {
    return null;
  }

  open(): void {
    this.visible = true;
    this.authority();
  }
  close(): void {
    this.visible = false;
  }
  placeKeep(cellId: number): void {
    this.authority().placeKeep(cellId);
  }
  claim(cellId: number): void {
    this.authority().claim(cellId);
  }
  build(cellId: number, slot: TerritoryStructureSlot, kind: TerritoryStructureKind): void {
    this.authority().build(cellId, slot, kind);
  }
  upgrade(cellId: number, slot: TerritoryStructureSlot): void {
    this.authority().upgrade(cellId, slot);
  }
  setTeam(pid: number, team: TerritorySimTeam | null): void {
    if (team) this.teams.set(pid, team);
    else this.teams.delete(pid);
  }
  hasTeam(pid: number): boolean {
    return this.teams.has(pid);
  }
  team(pid: number): TerritorySimTeam | null {
    return this.teams.get(pid) ?? null;
  }
  hostile(attackerPid: number, targetPid: number): boolean | null {
    const attacker = this.teams.get(attackerPid);
    const target = this.teams.get(targetPid);
    return attacker && target && attacker.warId === target.warId
      ? attacker.side !== target.side
      : null;
  }

  private authority(): LocalTerritoryState {
    this.local ??= new LocalTerritoryState();
    return this.local;
  }
}

const simTerritories = new WeakMap<object, TerritorySimRuntime>();
function simTerritory(host: object): TerritorySimRuntime {
  let territory = simTerritories.get(host);
  if (!territory) {
    territory = new TerritorySimRuntime();
    simTerritories.set(host, territory);
  }
  return territory;
}

export function territorySimHasTeam(host: object, pid: number): boolean {
  return simTerritory(host).hasTeam(pid);
}

export function territorySimTeamFor(host: object, pid: number): TerritorySimTeam | null {
  return simTerritory(host).team(pid);
}

export function territorySimLocksMovement(host: object, pid: number): boolean {
  return !!territorySimTeamFor(host, pid)?.control;
}

export function territorySimResolveGate(
  host: object,
  pid: number,
  fromZ: number,
  position: { x: number; z: number },
  radius: number,
): { x: number; z: number } {
  const team = territorySimTeamFor(host, pid);
  if (!team) return position;
  const swept = clampTerritorySiegeGate(
    team.slot,
    team.gateOpen,
    fromZ,
    position.x,
    position.z,
    radius,
  );
  return sealTerritorySiegeGateForSide(
    team.slot,
    team.side,
    team.gateOpen,
    swept.x,
    swept.z,
    radius,
  );
}

export function territorySimProjectilePathClear(
  host: object,
  pid: number,
  from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>,
  radius = 0.05,
): boolean {
  const team = territorySimTeamFor(host, pid);
  return team
    ? territorySiegeProjectilePathClear(team.slot, team.gateOpen, from, to, radius)
    : true;
}

export function territorySimHostile(
  host: object,
  attackerPid: number,
  targetPid: number,
): boolean | null {
  return simTerritory(host).hostile(attackerPid, targetPid);
}

/** Installs the offline IWorldTerritory surface without growing the legacy Sim monolith. */
export function installTerritorySim<T extends object>(prototype: T): void {
  const territory = (host: T) => simTerritory(host);
  Object.defineProperties(prototype, {
    territoryMap: {
      get(this: T) {
        return territory(this).map;
      },
    },
    territoryWarNotice: {
      get(this: T) {
        return territory(this).warNotice;
      },
    },
    territoryOpen: {
      value(this: T) {
        territory(this).open();
      },
    },
    territoryClose: {
      value(this: T) {
        territory(this).close();
      },
    },
    territoryPlaceKeep: {
      value(this: T, cellId: number) {
        territory(this).placeKeep(cellId);
      },
    },
    territoryClaim: {
      value(this: T, cellId: number) {
        territory(this).claim(cellId);
      },
    },
    territoryBuild: {
      value(this: T, cellId: number, slot: TerritoryStructureSlot, kind: TerritoryStructureKind) {
        territory(this).build(cellId, slot, kind);
      },
    },
    territoryUpgrade: {
      value(this: T, cellId: number, slot: TerritoryStructureSlot) {
        territory(this).upgrade(cellId, slot);
      },
    },
    territoryRepair: { value() {} },
    territoryDeclareWar: { value() {} },
    territoryCancelWar: { value() {} },
    territoryJoinWar: { value() {} },
    territoryLeaveWar: { value() {} },
    territorySiegeAction: { value() {} },
    setTerritorySiegeTeam: {
      value(this: T, pid: number, team: TerritorySimTeam | null) {
        territory(this).setTeam(pid, team);
      },
    },
  });
}
