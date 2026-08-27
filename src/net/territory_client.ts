import { apiUrl } from '../client_origin';
import { applyTerritoryDelta, type TerritoryDelta } from '../sim/territory_delta';
import type {
  ClientCommand,
  TerritoryMapState,
  TerritorySiegeAction,
  TerritorySiegeView,
  TerritoryStructureKind,
  TerritoryStructureSlot,
} from '../world_api';

type SendCommand = (payload: { cmd: ClientCommand } & Record<string, unknown>) => void;

/** Owns the on-demand territory REST mirror and compact WebSocket command surface. */
export class TerritoryClient {
  state: TerritoryMapState | null = null;
  private commandSeq = 0;

  constructor(
    private readonly base: () => string,
    private readonly token: () => string,
    private readonly send: SendCommand,
  ) {}

  handleMessage(msg: Record<string, unknown>): boolean {
    if (msg.t === 'territory_delta' && this.state && typeof msg.delta === 'object') {
      const next = applyTerritoryDelta(this.state, msg.delta as TerritoryDelta);
      if (next) this.state = next;
      else void this.loadChanges();
      return true;
    }
    if (msg.t === 'territory_resync') {
      void this.loadSnapshot();
      return true;
    }
    if (msg.t !== 'territory_siege') return false;
    if (!this.state) {
      void this.loadSnapshot();
      return true;
    }
    const siege =
      msg.siege &&
      typeof msg.siege === 'object' &&
      typeof (msg.siege as Record<string, unknown>).warId === 'string'
        ? (msg.siege as TerritorySiegeView)
        : null;
    this.state = { ...this.state, siege };
    return true;
  }

  open(): void {
    this.send({ cmd: 'territory_watch', active: true });
    void this.loadSnapshot();
  }
  close(): void {
    this.send({ cmd: 'territory_watch', active: false });
  }
  placeKeep(cellId: number): void {
    this.mutate({ cmd: 'territory_place_keep', cellId });
  }
  claim(cellId: number): void {
    this.mutate({ cmd: 'territory_claim', cellId });
  }
  build(cellId: number, slot: TerritoryStructureSlot, kind: TerritoryStructureKind): void {
    this.mutate({ cmd: 'territory_build', cellId, slot, kind });
  }
  upgrade(cellId: number, slot: TerritoryStructureSlot): void {
    this.mutate({ cmd: 'territory_upgrade', cellId, slot });
  }
  repair(cellId: number, slot: TerritoryStructureSlot): void {
    this.mutate({ cmd: 'territory_repair', cellId, slot });
  }
  declareWar(cellId: number): void {
    this.mutate({ cmd: 'territory_declare_war', cellId });
  }
  joinWar(warId: string): void {
    this.mutate({ cmd: 'territory_join_war', warId });
  }
  leaveWar(warId: string): void {
    this.mutate({ cmd: 'territory_leave_war', warId });
  }
  siegeAction(action: TerritorySiegeAction): void {
    this.mutate({ cmd: 'territory_siege_action', action });
  }

  private commandId(): string {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    if (randomUuid) return randomUuid;
    this.commandSeq = (this.commandSeq + 1) % 1_000_000_000_000;
    return `00000000-0000-4000-8000-${String(this.commandSeq).padStart(12, '0')}`;
  }

  private mutate(payload: { cmd: ClientCommand } & Record<string, unknown>): void {
    this.send({
      ...payload,
      commandId: this.commandId(),
      expectedRevision: this.state?.revision ?? 0,
    });
  }

  private async loadSnapshot(): Promise<void> {
    try {
      const res = await fetch(apiUrl('/api/territory/map', this.base()), {
        headers: { Authorization: `Bearer ${this.token()}` },
      });
      if (!res.ok) return;
      const state = (await res.json()) as TerritoryMapState;
      if (state && Number.isSafeInteger(state.revision) && Array.isArray(state.cells))
        this.state = state;
    } catch {
      // Resync may race a reconnect. A later watch or revision gap retries.
    }
  }

  private async loadChanges(): Promise<void> {
    const current = this.state;
    if (!current) return this.loadSnapshot();
    try {
      const res = await fetch(
        apiUrl(`/api/territory/changes?after=${current.revision}`, this.base()),
        {
          headers: { Authorization: `Bearer ${this.token()}` },
        },
      );
      if (!res.ok) throw new Error('territory changes unavailable');
      const body = (await res.json()) as { deltas?: TerritoryDelta[]; resetRequired?: boolean };
      if (body.resetRequired || !Array.isArray(body.deltas)) return this.loadSnapshot();
      let next: TerritoryMapState | null = current;
      for (const delta of body.deltas) {
        next = next ? applyTerritoryDelta(next, delta) : null;
        if (!next) break;
      }
      if (next) this.state = next;
      else await this.loadSnapshot();
    } catch {
      await this.loadSnapshot();
    }
  }
}

const installedClients = new WeakMap<object, TerritoryClient>();
type InstalledHost = object & {
  base: string;
  token: string;
  cmd(payload: { cmd: ClientCommand } & Record<string, unknown>): void;
};

function installedClient(host: object): TerritoryClient {
  let client = installedClients.get(host);
  if (!client) {
    const source = host as InstalledHost;
    client = new TerritoryClient(
      () => source.base,
      () => source.token,
      (payload) => source.cmd(payload),
    );
    installedClients.set(host, client);
  }
  return client;
}

export function handleTerritoryMessage(host: object, message: Record<string, unknown>): boolean {
  return installedClient(host).handleMessage(message);
}

/** Installs the IWorldTerritory facet without growing the legacy ClientWorld monolith. */
export function installTerritoryClient<T extends object>(prototype: T): void {
  const client = (host: T) => installedClient(host);
  Object.defineProperties(prototype, {
    territoryMap: {
      get(this: T) {
        return client(this).state;
      },
    },
    territoryOpen: {
      value(this: T) {
        client(this).open();
      },
    },
    territoryClose: {
      value(this: T) {
        client(this).close();
      },
    },
    territoryPlaceKeep: {
      value(this: T, cellId: number) {
        client(this).placeKeep(cellId);
      },
    },
    territoryClaim: {
      value(this: T, cellId: number) {
        client(this).claim(cellId);
      },
    },
    territoryBuild: {
      value(this: T, cellId: number, slot: TerritoryStructureSlot, kind: TerritoryStructureKind) {
        client(this).build(cellId, slot, kind);
      },
    },
    territoryUpgrade: {
      value(this: T, cellId: number, slot: TerritoryStructureSlot) {
        client(this).upgrade(cellId, slot);
      },
    },
    territoryRepair: {
      value(this: T, cellId: number, slot: TerritoryStructureSlot) {
        client(this).repair(cellId, slot);
      },
    },
    territoryDeclareWar: {
      value(this: T, cellId: number) {
        client(this).declareWar(cellId);
      },
    },
    territoryJoinWar: {
      value(this: T, warId: string) {
        client(this).joinWar(warId);
      },
    },
    territoryLeaveWar: {
      value(this: T, warId: string) {
        client(this).leaveWar(warId);
      },
    },
    territorySiegeAction: {
      value(this: T, action: TerritorySiegeAction) {
        client(this).siegeAction(action);
      },
    },
  });
}
