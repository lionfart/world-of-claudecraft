import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { territoryConstructionDurationMs } from '../src/sim/territory_construction';
import type { TerritoryDelta } from '../src/sim/territory_delta';
import {
  createTerritoryManifest,
  type TerritoryManifest,
  type TerritoryResourceKind,
  territoryRadiusForActiveGuilds,
} from '../src/sim/territory_manifest';
import {
  isTerritoryClaimAdjacent,
  territoryConnectivityAfterCapture,
} from '../src/sim/territory_topology';
import type {
  TerritoryGuildRank,
  TerritoryGuildView,
  TerritoryMapState,
  TerritoryOwnedCellView,
  TerritoryStructureKind,
  TerritoryStructureSlot,
  TerritoryStructureView,
  TerritoryWarSide,
  TerritoryWarStatus,
  TerritoryWarView,
} from '../src/world_api';
import { territoryMetrics } from './http/territory_metrics';
import { REALM } from './realm';
import { TERRITORY_CONFIG, type TerritoryConfig } from './territory_config';
import {
  territoryCellCapacity,
  territoryFirstKeepAllowed,
  territoryRequiresSpend,
  territoryWarJoinAllowed,
} from './territory_rules';

const RESOURCE_TICK_MS = 5 * 60_000;
const TERRITORY_LOCK_TIMEOUT_MS = 2_000;
const TERRITORY_STATEMENT_TIMEOUT_MS = 5_000;
const TERRITORY_IDLE_TX_TIMEOUT_MS = 10_000;
const CLAIM_COST = { wood: 10, iron: 5, grain: 10, labor: 5 } as const;
const WAR_COST = { wood: 50, iron: 75, grain: 50, labor: 50 } as const;
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
type MutationError =
  | 'disabled'
  | 'not_in_guild'
  | 'forbidden'
  | 'revision_conflict'
  | 'invalid_cell'
  | 'not_adjacent'
  | 'capacity'
  | 'insufficient_resources'
  | 'occupied'
  | 'invalid_structure'
  | 'not_repairable'
  | 'war_conflict'
  | 'war_slots_full'
  | 'war_not_found'
  | 'registration_closed'
  | 'team_full'
  | 'not_participant';

export type TerritoryMutationResult =
  | {
      ok: true;
      delta: TerritoryDelta | null;
      duplicate: boolean;
      guildId: number;
      seat?: { warId: string; side: TerritoryWarSide; seatNo: number };
      war?: TerritoryWarView;
    }
  | { ok: false; error: MutationError };

export interface TerritoryActor {
  characterId: number;
  guildId: number;
  guildName: string;
  rank: TerritoryGuildRank;
}

export type TerritoryGuildSnapshot = Omit<TerritoryGuildView, 'rank'>;

export interface TerritoryMutationContext extends TerritoryActor {
  commandId: string;
  expectedRevision: number;
}

export interface TerritorySiegeRuntimeRecord {
  warId: string;
  version: number;
  status: TerritoryWarStatus;
  startsAtMs: number;
  endsAtMs: number;
  gateLevel: number;
  coreLevel: number;
  attackerHasSiegeWorkshop: boolean;
  defenseTowerLevel: number;
  participants: Array<{
    characterId: number;
    side: TerritoryWarSide;
    seatNo: number;
    active: boolean;
  }>;
}

interface SeasonRow {
  id: string | number;
  season_no: number;
  manifest_version: number;
  manifest_checksum: string;
  radius: number;
  revision: string | number;
  starts_at: Date | string;
  ends_at: Date | string;
}

interface GuildStateRow {
  territory_level: number;
  wood: string | number;
  iron: string | number;
  grain: string | number;
  labor: string | number;
  accrued_at: Date | string;
}

function num(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function territoryGuildColor(guildId: number): string {
  const id = Math.abs(Math.trunc(guildId));
  // Golden-angle stepping keeps neighbouring guild ids far apart on the hue
  // wheel. Small saturation/lightness cycles preserve distinction even after
  // a full hue wrap while remaining vivid enough for thin frontier ribbons.
  const hue = Math.round((id * 137.508 + 17) % 360);
  const saturation = 66 + (id % 3) * 7;
  const lightness = 48 + ((id * 5) % 3) * 5;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function buildCost(kind: TerritoryStructureKind, nextLevel: number) {
  const weight =
    kind === 'keep' ? 5 : kind === 'gate' || kind === 'wall' ? 3 : kind === 'defense_tower' ? 4 : 2;
  return {
    wood: weight * nextLevel * 12,
    iron: weight * nextLevel * 10,
    grain: weight * nextLevel * 5,
    labor: weight * nextLevel * 8,
  };
}

function validRankForManage(rank: TerritoryGuildRank): boolean {
  return rank === 'leader' || rank === 'officer';
}

async function beginTerritoryTransaction(client: PoolClient): Promise<void> {
  await client.query('BEGIN');
  await client.query(`SET LOCAL lock_timeout = ${TERRITORY_LOCK_TIMEOUT_MS}`);
  await client.query(`SET LOCAL statement_timeout = ${TERRITORY_STATEMENT_TIMEOUT_MS}`);
  await client.query(
    `SET LOCAL idle_in_transaction_session_timeout = ${TERRITORY_IDLE_TX_TIMEOUT_MS}`,
  );
}

export class TerritoryRepository {
  manifest: TerritoryManifest;

  constructor(
    private readonly pool: Pool,
    private readonly config: TerritoryConfig = TERRITORY_CONFIG,
    private readonly realm = REALM,
    manifest: TerritoryManifest = createTerritoryManifest(),
  ) {
    this.manifest = manifest;
  }

  async ensureActiveSeason(now = new Date()): Promise<void> {
    if (!this.config.enabled) return;
    const client = await this.pool.connect();
    try {
      await beginTerritoryTransaction(client);
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `territory-season:${this.realm}`,
      ]);
      const existing = await client.query<SeasonRow>(
        `SELECT id, season_no, manifest_version, manifest_checksum, radius, revision, starts_at, ends_at
           FROM territory_seasons WHERE realm = $1 AND status = 'active' FOR UPDATE`,
        [this.realm],
      );
      if (existing.rows[0]) {
        const season = existing.rows[0];
        if (season.manifest_version > this.manifest.version) {
          throw new Error(
            `territory manifest version ${season.manifest_version} is newer than code version ${this.manifest.version}`,
          );
        }
        if (season.manifest_version === this.manifest.version) {
          this.manifest = createTerritoryManifest(season.radius);
          this.assertManifest(season);
          await client.query('COMMIT');
          return;
        }
        await client.query(
          `UPDATE territory_seasons
              SET status = 'closed', closed_at = $2, ends_at = LEAST(ends_at, $2),
                  summary = jsonb_build_object(
                    'reason', 'manifest_upgrade',
                    'fromManifestVersion', manifest_version,
                    'toManifestVersion', $3::integer
                  )
            WHERE id = $1`,
          [season.id, now, this.manifest.version],
        );
        await client.query(
          `UPDATE territory_wars SET status = 'cancelled', version = version + 1,
                  result_reason = 'season_closed', resolved_at = $2
            WHERE season_id = $1 AND status IN ('declared', 'forming', 'active')`,
          [season.id, now],
        );
      }
      const sequence = await client.query<{ next_no: number }>(
        `SELECT COALESCE(MAX(season_no), 0)::int + 1 AS next_no FROM territory_seasons WHERE realm = $1`,
        [this.realm],
      );
      const endsAt = new Date(now.getTime() + this.config.seasonWeeks * 7 * 86_400_000);
      await client.query(
        `INSERT INTO territory_seasons
           (realm, season_no, status, manifest_version, manifest_checksum, radius, starts_at, ends_at)
         VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)`,
        [
          this.realm,
          sequence.rows[0]?.next_no ?? 1,
          this.manifest.version,
          this.manifest.checksum,
          this.manifest.radius,
          now,
          endsAt,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Closes the expired season by pointer swap. Historical rows stay attached
   * to the closed season for retention; the new active dataset starts empty.
   */
  async rollSeasonIfDue(now = new Date()): Promise<boolean> {
    if (!this.config.enabled) return false;
    const client = await this.pool.connect();
    try {
      await beginTerritoryTransaction(client);
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `territory-season:${this.realm}`,
      ]);
      const active = await client.query<SeasonRow>(
        `SELECT id, season_no, manifest_version, manifest_checksum, radius, revision, starts_at, ends_at
           FROM territory_seasons WHERE realm = $1 AND status = 'active' FOR UPDATE`,
        [this.realm],
      );
      const season = active.rows[0];
      if (!season || new Date(season.ends_at).getTime() > now.getTime()) {
        await client.query('COMMIT');
        return false;
      }
      const standings = await client.query<{
        guild_id: number;
        cells: string | number;
        keeps: string | number;
        wins: string | number;
      }>(
        `SELECT ranked.guild_id, ranked.cells, ranked.keeps,
                COALESCE(wins.wins, 0)::bigint AS wins
           FROM (
             SELECT guild_id, count(*)::bigint AS cells,
                    count(*) FILTER (WHERE keep_root)::bigint AS keeps
               FROM territory_cells WHERE season_id = $1 GROUP BY guild_id
           ) ranked
           LEFT JOIN (
             SELECT winner_guild_id AS guild_id, count(*)::bigint AS wins
               FROM territory_wars
              WHERE season_id = $1 AND status = 'resolved' AND winner_guild_id IS NOT NULL
              GROUP BY winner_guild_id
           ) wins USING (guild_id)
          ORDER BY ranked.cells DESC, wins DESC, ranked.guild_id`,
        [season.id],
      );
      const summary = {
        seasonNumber: season.season_no,
        closedAt: now.toISOString(),
        standings: standings.rows.map((row, index) => ({
          rank: index + 1,
          guildId: row.guild_id,
          cells: num(row.cells),
          keeps: num(row.keeps),
          wins: num(row.wins),
        })),
      };
      await client.query(
        `UPDATE territory_seasons
            SET status = 'closed', closed_at = $2, summary = $3::jsonb
          WHERE id = $1`,
        [season.id, now, JSON.stringify(summary)],
      );
      await client.query(
        `UPDATE territory_wars SET status = 'cancelled', version = version + 1,
                result_reason = 'season_closed', resolved_at = $2
          WHERE season_id = $1 AND status IN ('declared', 'forming', 'active')`,
        [season.id, now],
      );
      const activeGuilds = await client.query<{ count: string | number }>(
        `SELECT count(DISTINCT gm.guild_id)::bigint AS count
           FROM guild_members gm JOIN characters c ON c.id = gm.character_id
          WHERE c.last_login >= $1::timestamptz - interval '30 days'`,
        [now],
      );
      const nextManifest = createTerritoryManifest(
        territoryRadiusForActiveGuilds(num(activeGuilds.rows[0]?.count ?? 0)),
      );
      const endsAt = new Date(now.getTime() + this.config.seasonWeeks * 7 * 86_400_000);
      await client.query(
        `INSERT INTO territory_seasons
           (realm, season_no, status, manifest_version, manifest_checksum, radius, starts_at, ends_at)
         VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)`,
        [
          this.realm,
          season.season_no + 1,
          nextManifest.version,
          nextManifest.checksum,
          nextManifest.radius,
          now,
          endsAt,
        ],
      );
      await client.query('COMMIT');
      this.manifest = nextManifest;
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private assertManifest(season: SeasonRow): void {
    if (
      season.manifest_version !== this.manifest.version ||
      season.manifest_checksum !== this.manifest.checksum ||
      season.radius !== this.manifest.radius
    ) {
      throw new Error(
        `territory manifest mismatch: season=${season.manifest_version}/${season.radius}/${season.manifest_checksum}, code=${this.manifest.version}/${this.manifest.radius}/${this.manifest.checksum}`,
      );
    }
  }

  private async activeSeason(client: Pool | PoolClient, lock = false): Promise<SeasonRow> {
    const result = await client.query<SeasonRow>(
      `SELECT id, season_no, manifest_version, manifest_checksum, radius, revision, starts_at, ends_at
         FROM territory_seasons WHERE realm = $1 AND status = 'active'${lock ? ' FOR UPDATE' : ''}`,
      [this.realm],
    );
    const season = result.rows[0];
    if (!season) throw new Error(`no active territory season for realm ${this.realm}`);
    this.assertManifest(season);
    return season;
  }

  async loadPublicSnapshot(): Promise<TerritoryMapState> {
    const season = await this.activeSeason(this.pool);
    const seasonId = num(season.id);
    const [cellsResult, structuresResult, warsResult] = await Promise.all([
      this.pool.query<{
        cell_id: number;
        guild_id: number;
        guild_name: string;
        keep_root: boolean;
      }>(
        `SELECT c.cell_id, c.guild_id, g.name AS guild_name, c.keep_root
           FROM territory_cells c JOIN guilds g ON g.id = c.guild_id
          WHERE c.season_id = $1 ORDER BY c.cell_id`,
        [seasonId],
      ),
      this.pool.query<{
        cell_id: number;
        slot: TerritoryStructureSlot;
        kind: TerritoryStructureKind;
        level: number;
        state: 'building' | 'active';
        completes_at: Date | string | null;
      }>(
        `SELECT cell_id, slot, kind, COALESCE(target_level, level)::int AS level,
                state, completes_at
           FROM territory_structures WHERE season_id = $1 ORDER BY cell_id, slot`,
        [seasonId],
      ),
      this.pool.query<{
        id: string;
        target_cell_id: number;
        attacker_guild_id: number;
        attacker_name: string;
        defender_guild_id: number;
        defender_name: string;
        status: TerritoryWarView['status'];
        declared_at: Date | string;
        starts_at: Date | string;
        ends_at: Date | string;
        winner_guild_id: number | null;
        attacker_count: string | number;
        defender_count: string | number;
      }>(
        `SELECT w.id, w.target_cell_id, w.attacker_guild_id, ag.name AS attacker_name,
                w.defender_guild_id, dg.name AS defender_name, w.status, w.declared_at,
                w.starts_at, w.ends_at, w.winner_guild_id,
                count(p.character_id) FILTER (WHERE p.side = 'attacker' AND p.left_at IS NULL) AS attacker_count,
                count(p.character_id) FILTER (WHERE p.side = 'defender' AND p.left_at IS NULL) AS defender_count
           FROM territory_wars w
           JOIN guilds ag ON ag.id = w.attacker_guild_id
           JOIN guilds dg ON dg.id = w.defender_guild_id
           LEFT JOIN territory_war_participants p ON p.war_id = w.id
          WHERE w.season_id = $1 AND w.status <> 'cancelled'
          GROUP BY w.id, ag.name, dg.name ORDER BY w.starts_at`,
        [seasonId],
      ),
    ]);
    const cells: TerritoryOwnedCellView[] = cellsResult.rows.flatMap((row) => {
      const cell = this.manifest.byId.get(row.cell_id);
      return cell
        ? [
            {
              cellId: row.cell_id,
              ownerGuildId: String(row.guild_id),
              ownerGuildName: row.guild_name,
              ownerColor: territoryGuildColor(row.guild_id),
              keepRoot: row.keep_root,
              terrain: cell.terrain,
              resource: cell.resource,
            },
          ]
        : [];
    });
    return {
      season: {
        id: String(season.id),
        number: season.season_no,
        manifestVersion: season.manifest_version,
        manifestChecksum: season.manifest_checksum,
        radius: season.radius,
        requirementsEnabled: this.config.requirementsEnabled,
        startsAt: iso(season.starts_at),
        endsAt: iso(season.ends_at),
      },
      revision: num(season.revision),
      cells,
      structures: structuresResult.rows.map((row) => ({
        cellId: row.cell_id,
        slot: row.slot,
        kind: row.kind,
        level: row.level,
        state: row.state,
        completesAt: row.completes_at ? iso(row.completes_at) : null,
      })),
      wars: warsResult.rows.map((row) => ({
        id: row.id,
        targetCellId: row.target_cell_id,
        attackerGuildId: String(row.attacker_guild_id),
        attackerGuildName: row.attacker_name,
        defenderGuildId: String(row.defender_guild_id),
        defenderGuildName: row.defender_name,
        status: row.status,
        declaredAt: iso(row.declared_at),
        startsAt: iso(row.starts_at),
        endsAt: iso(row.ends_at),
        winnerGuildId: row.winner_guild_id === null ? null : String(row.winner_guild_id),
        attackerCount: num(row.attacker_count),
        defenderCount: num(row.defender_count),
        mySide: null,
        registered: false,
      })),
      guild: null,
      siege: null,
    };
  }

  /** One startup/cache-refresh batch; never queried per map viewer. */
  async loadActiveWarRegistrations(): Promise<Array<{ warId: string; characterId: number }>> {
    const season = await this.activeSeason(this.pool);
    const result = await this.pool.query<{ war_id: string; character_id: number }>(
      `SELECT p.war_id, p.character_id
         FROM territory_war_participants p
         JOIN territory_wars w ON w.id = p.war_id
        WHERE w.season_id = $1 AND w.status IN ('declared', 'forming', 'active')
          AND p.left_at IS NULL AND p.seat_no IS NOT NULL
          AND (p.side = 'defender' OR p.joined_at <= w.starts_at)
        ORDER BY p.war_id, p.character_id`,
      [season.id],
    );
    return result.rows.map((row) => ({ warId: row.war_id, characterId: row.character_id }));
  }

  /**
   * Loads every private guild view in one bounded season batch. Resource accrual
   * is projected from accrued_at without writing, so opening a hot map never
   * creates one transaction per viewer. The next guild mutation persists the
   * same lazy-accrual calculation under its guild-state lock.
   */
  async loadGuildViewsSnapshot(now = new Date()): Promise<Map<number, TerritoryGuildSnapshot>> {
    const season = await this.activeSeason(this.pool);
    const seasonId = num(season.id);
    const [states, owned, stores] = await Promise.all([
      this.pool.query<GuildStateRow & { guild_id: number; guild_name: string }>(
        `SELECT s.guild_id, g.name AS guild_name, s.territory_level,
                s.wood, s.iron, s.grain, s.labor, s.accrued_at
           FROM territory_guild_state s JOIN guilds g ON g.id = s.guild_id
          WHERE s.season_id = $1 ORDER BY s.guild_id`,
        [seasonId],
      ),
      this.pool.query<{ guild_id: number; cell_id: number }>(
        `SELECT guild_id, cell_id FROM territory_cells
          WHERE season_id = $1 ORDER BY guild_id, cell_id`,
        [seasonId],
      ),
      this.pool.query<{ guild_id: number; total: string | number }>(
        `SELECT c.guild_id, COALESCE(sum(s.level), 0) AS total
           FROM territory_structures s
           JOIN territory_cells c ON c.season_id = s.season_id AND c.cell_id = s.cell_id
          WHERE s.season_id = $1 AND s.kind = 'storehouse'
            AND (s.state = 'active' OR s.target_level > s.level)
          GROUP BY c.guild_id ORDER BY c.guild_id`,
        [seasonId],
      ),
    ]);
    const cellsByGuild = new Map<number, number[]>();
    for (const cell of owned.rows) {
      const cells = cellsByGuild.get(cell.guild_id) ?? [];
      cells.push(cell.cell_id);
      cellsByGuild.set(cell.guild_id, cells);
    }
    const storeLevels = new Map(stores.rows.map((row) => [row.guild_id, num(row.total)]));
    const views = new Map<number, TerritoryGuildSnapshot>();
    for (const state of states.rows) {
      const cellIds = cellsByGuild.get(state.guild_id) ?? [];
      const storeLevel = storeLevels.get(state.guild_id) ?? 0;
      const capacity = 2_000 + storeLevel * 500;
      const accruedMs = new Date(state.accrued_at).getTime();
      const ticks = Math.max(0, Math.floor((now.getTime() - accruedMs) / RESOURCE_TICK_MS));
      const production: Record<TerritoryResourceKind, number> = {
        wood: 0,
        iron: 0,
        grain: 0,
        labor: 0,
      };
      if (ticks > 0) {
        for (const cellId of cellIds) {
          const resource = this.manifest.byId.get(cellId)?.resource;
          if (resource) production[resource] += ticks;
        }
      }
      const level = state.territory_level;
      views.set(state.guild_id, {
        id: String(state.guild_id),
        name: state.guild_name,
        color: territoryGuildColor(state.guild_id),
        territoryLevel: level,
        cellCapacity: territoryCellCapacity(
          level,
          this.manifest.cells.length,
          this.config.requirementsEnabled,
        ),
        ownedCellCount: cellIds.length,
        resources: {
          wood: Math.min(capacity, num(state.wood) + production.wood),
          iron: Math.min(capacity, num(state.iron) + production.iron),
          grain: Math.min(capacity, num(state.grain) + production.grain),
          labor: Math.min(capacity, num(state.labor) + production.labor),
        },
        resourceCapacity: capacity,
        accruedAt: new Date(accruedMs + ticks * RESOURCE_TICK_MS).toISOString(),
      });
    }
    return views;
  }

  private async ensureGuildState(
    client: PoolClient,
    seasonId: number,
    guildId: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO territory_guild_state(season_id, guild_id)
       VALUES ($1, $2) ON CONFLICT (season_id, guild_id) DO NOTHING`,
      [seasonId, guildId],
    );
  }

  private async accrueLocked(
    client: PoolClient,
    seasonId: number,
    guildId: number,
    now: Date,
  ): Promise<GuildStateRow> {
    await this.ensureGuildState(client, seasonId, guildId);
    const result = await client.query<GuildStateRow>(
      `SELECT territory_level, wood, iron, grain, labor, accrued_at
         FROM territory_guild_state WHERE season_id = $1 AND guild_id = $2 FOR UPDATE`,
      [seasonId, guildId],
    );
    let row = result.rows[0];
    const accruedMs = new Date(row.accrued_at).getTime();
    const ticks = Math.max(0, Math.floor((now.getTime() - accruedMs) / RESOURCE_TICK_MS));
    if (ticks === 0) return row;
    const [owned, storehouses] = await Promise.all([
      client.query<{ cell_id: number }>(
        `SELECT cell_id FROM territory_cells WHERE season_id = $1 AND guild_id = $2`,
        [seasonId, guildId],
      ),
      client.query<{ total: string | number }>(
        `SELECT COALESCE(sum(s.level), 0) AS total
           FROM territory_structures s
           JOIN territory_cells c ON c.season_id = s.season_id AND c.cell_id = s.cell_id
          WHERE s.season_id = $1 AND c.guild_id = $2 AND s.kind = 'storehouse'
            AND (s.state = 'active' OR s.target_level > s.level)`,
        [seasonId, guildId],
      ),
    ]);
    const production: Record<TerritoryResourceKind, number> = {
      wood: 0,
      iron: 0,
      grain: 0,
      labor: 0,
    };
    for (const ownedCell of owned.rows) {
      const resource = this.manifest.byId.get(ownedCell.cell_id)?.resource;
      if (resource) production[resource] += ticks;
    }
    const capacity = 2_000 + num(storehouses.rows[0]?.total ?? 0) * 500;
    const advancedAt = new Date(accruedMs + ticks * RESOURCE_TICK_MS);
    const updated = await client.query<GuildStateRow>(
      `UPDATE territory_guild_state
          SET wood = LEAST($3, wood + $4), iron = LEAST($3, iron + $5),
              grain = LEAST($3, grain + $6), labor = LEAST($3, labor + $7),
              accrued_at = $8, updated_at = now()
        WHERE season_id = $1 AND guild_id = $2
        RETURNING territory_level, wood, iron, grain, labor, accrued_at`,
      [
        seasonId,
        guildId,
        capacity,
        production.wood,
        production.iron,
        production.grain,
        production.labor,
        advancedAt,
      ],
    );
    row = updated.rows[0];
    return row;
  }

  async loadGuildView(actor: TerritoryActor, now = new Date()): Promise<TerritoryGuildView> {
    const client = await this.pool.connect();
    try {
      await beginTerritoryTransaction(client);
      const season = await this.activeSeason(client);
      const seasonId = num(season.id);
      const state = await this.accrueLocked(client, seasonId, actor.guildId, now);
      const [owned, stores] = await Promise.all([
        client.query<{ count: string | number }>(
          `SELECT count(*) AS count FROM territory_cells WHERE season_id = $1 AND guild_id = $2`,
          [seasonId, actor.guildId],
        ),
        client.query<{ total: string | number }>(
          `SELECT COALESCE(sum(s.level), 0) AS total FROM territory_structures s
             JOIN territory_cells c ON c.season_id = s.season_id AND c.cell_id = s.cell_id
            WHERE s.season_id = $1 AND c.guild_id = $2 AND s.kind = 'storehouse'
              AND (s.state = 'active' OR s.target_level > s.level)`,
          [seasonId, actor.guildId],
        ),
      ]);
      await client.query('COMMIT');
      const level = state.territory_level;
      return {
        id: String(actor.guildId),
        name: actor.guildName,
        color: territoryGuildColor(actor.guildId),
        rank: actor.rank,
        territoryLevel: level,
        cellCapacity: territoryCellCapacity(
          level,
          this.manifest.cells.length,
          this.config.requirementsEnabled,
        ),
        ownedCellCount: num(owned.rows[0]?.count ?? 0),
        resources: {
          wood: num(state.wood),
          iron: num(state.iron),
          grain: num(state.grain),
          labor: num(state.labor),
        },
        resourceCapacity: 2_000 + num(stores.rows[0]?.total ?? 0) * 500,
        accruedAt: iso(state.accrued_at),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async spend(
    client: PoolClient,
    seasonId: number,
    guildId: number,
    cost: Readonly<Record<TerritoryResourceKind, number>>,
  ): Promise<boolean> {
    const result = await client.query(
      `UPDATE territory_guild_state
          SET wood = wood - $3, iron = iron - $4, grain = grain - $5, labor = labor - $6,
              updated_at = now()
        WHERE season_id = $1 AND guild_id = $2
          AND wood >= $3 AND iron >= $4 AND grain >= $5 AND labor >= $6`,
      [seasonId, guildId, cost.wood, cost.iron, cost.grain, cost.labor],
    );
    return (result.rowCount ?? 0) === 1;
  }

  private async mutate(
    ctx: TerritoryMutationContext,
    action: string,
    targetCellId: number | null,
    perform: (client: PoolClient, season: SeasonRow) => Promise<TerritoryDelta | MutationError>,
  ): Promise<TerritoryMutationResult> {
    if (!this.config.enabled) return { ok: false, error: 'disabled' };
    const client = await this.pool.connect();
    try {
      await beginTerritoryTransaction(client);
      const reservation = await client.query(
        `INSERT INTO territory_audit
           (command_id, actor_character_id, guild_id, action, target_cell_id, detail)
         VALUES ($1, $2, $3, $4, $5, '{"pending":true}'::jsonb)
         ON CONFLICT (command_id) DO NOTHING
         RETURNING command_id`,
        [ctx.commandId, ctx.characterId, ctx.guildId, action, targetCellId],
      );
      if ((reservation.rowCount ?? 0) === 0) {
        const duplicate = await client.query<{
          actor_character_id: number | null;
          action: string;
        }>(`SELECT actor_character_id, action FROM territory_audit WHERE command_id = $1`, [
          ctx.commandId,
        ]);
        await client.query('ROLLBACK');
        return duplicate.rows[0]?.actor_character_id === ctx.characterId &&
          duplicate.rows[0]?.action === action
          ? { ok: true, delta: null, duplicate: true, guildId: ctx.guildId }
          : { ok: false, error: 'revision_conflict' };
      }
      const season = await this.activeSeason(client, true);
      if (num(season.revision) !== ctx.expectedRevision) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'revision_conflict' };
      }
      await this.accrueLocked(client, num(season.id), ctx.guildId, new Date());
      const outcome = await perform(client, season);
      if (typeof outcome === 'string') {
        await client.query('ROLLBACK');
        return { ok: false, error: outcome };
      }
      const bumped = await client.query<{ revision: string | number }>(
        `UPDATE territory_seasons SET revision = revision + 1 WHERE id = $1 RETURNING revision`,
        [season.id],
      );
      const revision = num(bumped.rows[0].revision);
      const delta: TerritoryDelta = { ...outcome, revision };
      await client.query(
        `INSERT INTO territory_changes(season_id, revision, payload) VALUES ($1, $2, $3::jsonb)`,
        [season.id, revision, JSON.stringify(delta)],
      );
      await client.query(
        `UPDATE territory_audit SET season_id = $2, detail = $3::jsonb
          WHERE command_id = $1`,
        [ctx.commandId, season.id, JSON.stringify({ revision })],
      );
      await client.query('COMMIT');
      return { ok: true, delta, duplicate: false, guildId: ctx.guildId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Participant seating is isolated from the global map revision. The war row
   * serializes seat allocation while unrelated claims, builds, and the other
   * 39 combatants can proceed without contending on territory_seasons.
   */
  private async mutateParticipation(
    ctx: TerritoryMutationContext,
    action: 'join_war' | 'leave_war',
    warId: string,
    perform: (
      client: PoolClient,
      season: SeasonRow,
    ) => Promise<
      { seat?: { warId: string; side: TerritoryWarSide; seatNo: number } } | MutationError
    >,
  ): Promise<TerritoryMutationResult> {
    if (!this.config.enabled) return { ok: false, error: 'disabled' };
    const client = await this.pool.connect();
    try {
      await beginTerritoryTransaction(client);
      const reservation = await client.query(
        `INSERT INTO territory_audit
           (command_id, actor_character_id, guild_id, action, detail)
         VALUES ($1, $2, $3, $4, '{"pending":true}'::jsonb)
         ON CONFLICT (command_id) DO NOTHING
         RETURNING command_id`,
        [ctx.commandId, ctx.characterId, ctx.guildId, action],
      );
      if ((reservation.rowCount ?? 0) === 0) {
        const duplicate = await client.query<{
          actor_character_id: number | null;
          action: string;
          detail: {
            warId?: string;
            side?: TerritoryWarSide;
            seatNo?: number;
          };
        }>(
          `SELECT actor_character_id, action, detail
             FROM territory_audit WHERE command_id = $1`,
          [ctx.commandId],
        );
        await client.query('ROLLBACK');
        const row = duplicate.rows[0];
        if (row?.actor_character_id !== ctx.characterId || row.action !== action) {
          return { ok: false, error: 'revision_conflict' };
        }
        const seat =
          row.detail?.warId && row.detail.side && Number.isInteger(row.detail.seatNo)
            ? {
                warId: row.detail.warId,
                side: row.detail.side,
                seatNo: row.detail.seatNo as number,
              }
            : undefined;
        return { ok: true, delta: null, duplicate: true, guildId: ctx.guildId, seat };
      }
      const season = await this.activeSeason(client);
      if (num(season.revision) !== ctx.expectedRevision) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'revision_conflict' };
      }
      const outcome = await perform(client, season);
      if (typeof outcome === 'string') {
        await client.query('ROLLBACK');
        return { ok: false, error: outcome };
      }
      await client.query(
        `UPDATE territory_audit SET season_id = $2, detail = $3::jsonb
          WHERE command_id = $1`,
        [
          ctx.commandId,
          season.id,
          JSON.stringify({ revision: num(season.revision), warId, ...outcome.seat }),
        ],
      );
      const war = await this.warView(client, warId, ctx.guildId, ctx.characterId);
      await client.query('COMMIT');
      return {
        ok: true,
        delta: null,
        duplicate: false,
        guildId: ctx.guildId,
        seat: outcome.seat,
        ...(war ? { war } : {}),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  placeKeep(ctx: TerritoryMutationContext, cellId: number): Promise<TerritoryMutationResult> {
    return this.mutate(ctx, 'place_keep', cellId, async (client, season) => {
      if (ctx.rank !== 'leader') return 'forbidden';
      const cell = this.manifest.byId.get(cellId);
      if (!territoryFirstKeepAllowed(cell, this.config.requirementsEnabled)) {
        return 'invalid_cell';
      }
      const existing = await client.query(
        `SELECT 1 FROM territory_cells WHERE season_id = $1 AND (cell_id = $2 OR guild_id = $3) LIMIT 1`,
        [season.id, cellId, ctx.guildId],
      );
      if ((existing.rowCount ?? 0) > 0) return 'occupied';
      await client.query(
        `INSERT INTO territory_cells(season_id, cell_id, guild_id, keep_root) VALUES ($1, $2, $3, TRUE)`,
        [season.id, cellId, ctx.guildId],
      );
      await client.query(
        `INSERT INTO territory_structures(season_id, cell_id, slot, kind, level)
         VALUES ($1, $2, 'keep_core', 'keep', 1)`,
        [season.id, cellId],
      );
      return {
        revision: 0,
        cellsUpsert: [this.cellView(cellId, ctx.guildId, ctx.guildName, true)],
        structuresUpsert: [this.structureView(cellId, 'keep_core', 'keep', 1)],
      };
    });
  }

  claim(ctx: TerritoryMutationContext, cellId: number): Promise<TerritoryMutationResult> {
    return this.mutate(ctx, 'claim', cellId, async (client, season) => {
      if (!validRankForManage(ctx.rank)) return 'forbidden';
      const cell = this.manifest.byId.get(cellId);
      if (!cell) return 'invalid_cell';
      const owner = await client.query(
        `SELECT 1 FROM territory_cells WHERE season_id = $1 AND cell_id = $2`,
        [season.id, cellId],
      );
      if ((owner.rowCount ?? 0) > 0) return 'occupied';
      const ownedRows = await client.query<{ cell_id: number }>(
        `SELECT cell_id FROM territory_cells WHERE season_id = $1 AND guild_id = $2`,
        [season.id, ctx.guildId],
      );
      const owned = new Set(ownedRows.rows.map((row) => row.cell_id));
      if (!isTerritoryClaimAdjacent(this.manifest, owned, cellId)) return 'not_adjacent';
      const state = await client.query<{ territory_level: number }>(
        `SELECT territory_level FROM territory_guild_state WHERE season_id = $1 AND guild_id = $2`,
        [season.id, ctx.guildId],
      );
      const reserved = await client.query<{ count: string | number }>(
        `SELECT count(*) AS count FROM territory_wars
          WHERE season_id = $1 AND attacker_guild_id = $2
            AND status IN ('declared', 'forming', 'active')`,
        [season.id, ctx.guildId],
      );
      const capacity = territoryCellCapacity(
        state.rows[0]?.territory_level ?? 1,
        this.manifest.cells.length,
        this.config.requirementsEnabled,
      );
      if (owned.size + num(reserved.rows[0]?.count ?? 0) >= capacity) return 'capacity';
      if (
        territoryRequiresSpend(this.config.requirementsEnabled) &&
        !(await this.spend(client, num(season.id), ctx.guildId, CLAIM_COST))
      ) {
        return 'insufficient_resources';
      }
      await client.query(
        `INSERT INTO territory_cells(season_id, cell_id, guild_id) VALUES ($1, $2, $3)`,
        [season.id, cellId, ctx.guildId],
      );
      return {
        revision: 0,
        cellsUpsert: [this.cellView(cellId, ctx.guildId, ctx.guildName, false)],
      };
    });
  }

  build(
    ctx: TerritoryMutationContext,
    cellId: number,
    slot: TerritoryStructureSlot,
    kind: TerritoryStructureKind,
  ): Promise<TerritoryMutationResult> {
    return this.mutate(ctx, 'build', cellId, async (client, season) => {
      if (!validRankForManage(ctx.rank)) return 'forbidden';
      if (SLOT_KIND[slot] !== kind || slot === 'keep_core') return 'invalid_structure';
      const keep = await client.query(
        `SELECT 1 FROM territory_cells WHERE season_id = $1 AND cell_id = $2 AND guild_id = $3 AND keep_root`,
        [season.id, cellId, ctx.guildId],
      );
      if ((keep.rowCount ?? 0) !== 1) return 'invalid_cell';
      const workshops = await client.query<{ total: string | number }>(
        `SELECT COALESCE(sum(s.level), 0) AS total
           FROM territory_structures s
           JOIN territory_cells c ON c.season_id = s.season_id AND c.cell_id = s.cell_id
          WHERE s.season_id = $1 AND c.guild_id = $2
            AND s.kind = 'construction_workshop'
            AND (s.state = 'active' OR s.target_level > s.level)`,
        [season.id, ctx.guildId],
      );
      if (
        territoryRequiresSpend(this.config.requirementsEnabled) &&
        !(await this.spend(client, num(season.id), ctx.guildId, buildCost(kind, 1)))
      ) {
        return 'insufficient_resources';
      }
      const completesAt = new Date(
        Date.now() +
          territoryConstructionDurationMs(
            kind,
            1,
            num(workshops.rows[0]?.total ?? 0),
            this.config.constructionBaseSeconds,
          ),
      );
      const inserted = await client.query(
        `INSERT INTO territory_structures
           (season_id, cell_id, slot, kind, level, target_level, state, completes_at)
         VALUES ($1, $2, $3, $4, 1, 1, 'building', $5) ON CONFLICT DO NOTHING`,
        [season.id, cellId, slot, kind, completesAt],
      );
      if ((inserted.rowCount ?? 0) !== 1) return 'occupied';
      return {
        revision: 0,
        structuresUpsert: [this.structureView(cellId, slot, kind, 1, 'building', completesAt)],
      };
    });
  }

  upgrade(
    ctx: TerritoryMutationContext,
    cellId: number,
    slot: TerritoryStructureSlot,
  ): Promise<TerritoryMutationResult> {
    return this.mutate(ctx, 'upgrade', cellId, async (client, season) => {
      if (!validRankForManage(ctx.rank)) return 'forbidden';
      const structure = await client.query<{
        kind: TerritoryStructureKind;
        level: number;
        state: 'building' | 'active';
      }>(
        `SELECT s.kind, s.level, s.state FROM territory_structures s
           JOIN territory_cells c ON c.season_id = s.season_id AND c.cell_id = s.cell_id
          WHERE s.season_id = $1 AND s.cell_id = $2 AND s.slot = $3 AND c.guild_id = $4
          FOR UPDATE OF s`,
        [season.id, cellId, slot, ctx.guildId],
      );
      const current = structure.rows[0];
      if (current?.state !== 'active' || current.level >= 5) return 'invalid_structure';
      const nextLevel = current.level + 1;
      const workshops = await client.query<{ total: string | number }>(
        `SELECT COALESCE(sum(s.level), 0) AS total
           FROM territory_structures s
           JOIN territory_cells c ON c.season_id = s.season_id AND c.cell_id = s.cell_id
          WHERE s.season_id = $1 AND c.guild_id = $2
            AND s.kind = 'construction_workshop'
            AND (s.state = 'active' OR s.target_level > s.level)`,
        [season.id, ctx.guildId],
      );
      if (
        territoryRequiresSpend(this.config.requirementsEnabled) &&
        !(await this.spend(client, num(season.id), ctx.guildId, buildCost(current.kind, nextLevel)))
      ) {
        return 'insufficient_resources';
      }
      const completesAt = new Date(
        Date.now() +
          territoryConstructionDurationMs(
            current.kind,
            nextLevel,
            num(workshops.rows[0]?.total ?? 0),
            this.config.constructionBaseSeconds,
          ),
      );
      await client.query(
        `UPDATE territory_structures
            SET target_level = $4, state = 'building', completes_at = $5, updated_at = now()
          WHERE season_id = $1 AND cell_id = $2 AND slot = $3`,
        [season.id, cellId, slot, nextLevel, completesAt],
      );
      return {
        revision: 0,
        structuresUpsert: [
          this.structureView(cellId, slot, current.kind, nextLevel, 'building', completesAt),
        ],
      };
    });
  }

  repair(_ctx: TerritoryMutationContext): Promise<TerritoryMutationResult> {
    return Promise.resolve({ ok: false, error: 'not_repairable' });
  }

  declareWar(ctx: TerritoryMutationContext, cellId: number): Promise<TerritoryMutationResult> {
    return this.mutate(ctx, 'declare_war', cellId, async (client, season) => {
      if (!validRankForManage(ctx.rank)) return 'forbidden';
      const target = await client.query<{ guild_id: number; guild_name: string }>(
        `SELECT c.guild_id, g.name AS guild_name FROM territory_cells c
           JOIN guilds g ON g.id = c.guild_id
          WHERE c.season_id = $1 AND c.cell_id = $2 FOR UPDATE OF c`,
        [season.id, cellId],
      );
      const defender = target.rows[0];
      if (!defender || defender.guild_id === ctx.guildId) return 'invalid_cell';
      const owned = await client.query<{ cell_id: number }>(
        `SELECT cell_id FROM territory_cells WHERE season_id = $1 AND guild_id = $2`,
        [season.id, ctx.guildId],
      );
      if (
        !isTerritoryClaimAdjacent(
          this.manifest,
          new Set(owned.rows.map((row) => row.cell_id)),
          cellId,
        )
      ) {
        return 'not_adjacent';
      }
      const [guildState, outgoing] = await Promise.all([
        client.query<{ territory_level: number }>(
          `SELECT territory_level FROM territory_guild_state
            WHERE season_id = $1 AND guild_id = $2`,
          [season.id, ctx.guildId],
        ),
        client.query<{ count: string | number }>(
          `SELECT count(*) AS count FROM territory_wars
            WHERE season_id = $1 AND attacker_guild_id = $2
              AND status IN ('declared', 'forming', 'active')`,
          [season.id, ctx.guildId],
        ),
      ]);
      const capacity = territoryCellCapacity(
        guildState.rows[0]?.territory_level ?? 1,
        this.manifest.cells.length,
        this.config.requirementsEnabled,
      );
      if (owned.rows.length + num(outgoing.rows[0]?.count ?? 0) >= capacity) return 'capacity';
      const startsAt = new Date(Date.now() + this.config.warNoticeSeconds * 1_000);
      const endsAt = new Date(startsAt.getTime() + this.config.warDurationSeconds * 1_000);
      const conflict = await client.query<{
        slots: string | number;
        attacker_conflict: boolean;
        defender_conflict: boolean;
      }>(
        `SELECT count(*) AS slots,
                bool_or(attacker_guild_id = $2) AS attacker_conflict,
                bool_or(defender_guild_id = $3) AS defender_conflict
           FROM territory_wars
          WHERE season_id = $1 AND status IN ('declared', 'forming', 'active')
            AND starts_at < $5 AND ends_at > $4`,
        [season.id, ctx.guildId, defender.guild_id, startsAt, endsAt],
      );
      const conflictRow = conflict.rows[0];
      if (conflictRow?.attacker_conflict || conflictRow?.defender_conflict) return 'war_conflict';
      if (num(conflictRow?.slots ?? 0) >= this.config.realmWarSlots) return 'war_slots_full';
      if (
        territoryRequiresSpend(this.config.requirementsEnabled) &&
        !(await this.spend(client, num(season.id), ctx.guildId, WAR_COST))
      ) {
        return 'insufficient_resources';
      }
      const warId = randomUUID();
      await client.query(
        `INSERT INTO territory_wars
           (id, season_id, target_cell_id, attacker_guild_id, defender_guild_id, status, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, $5, 'declared', $6, $7)`,
        [warId, season.id, cellId, ctx.guildId, defender.guild_id, startsAt, endsAt],
      );
      return {
        revision: 0,
        warsUpsert: [
          {
            id: warId,
            targetCellId: cellId,
            attackerGuildId: String(ctx.guildId),
            attackerGuildName: ctx.guildName,
            defenderGuildId: String(defender.guild_id),
            defenderGuildName: defender.guild_name,
            status: 'declared',
            declaredAt: new Date().toISOString(),
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            winnerGuildId: null,
            attackerCount: 0,
            defenderCount: 0,
            mySide: null,
            registered: false,
          },
        ],
      };
    });
  }

  cancelWar(ctx: TerritoryMutationContext, warId: string): Promise<TerritoryMutationResult> {
    return this.mutate(ctx, 'cancel_war', null, async (client, season) => {
      if (!validRankForManage(ctx.rank)) return 'forbidden';
      const war = await client.query<{
        attacker_guild_id: number;
        status: TerritoryWarStatus;
        starts_at: Date | string;
      }>(
        `SELECT attacker_guild_id, status, starts_at FROM territory_wars
          WHERE id = $1 AND season_id = $2 FOR UPDATE`,
        [warId, season.id],
      );
      const row = war.rows[0];
      if (!row) return 'war_not_found';
      if (row.attacker_guild_id !== ctx.guildId) return 'forbidden';
      if (
        !['declared', 'forming'].includes(row.status) ||
        new Date(row.starts_at).getTime() <= Date.now()
      ) {
        return 'registration_closed';
      }
      const cancelled = await client.query(
        `UPDATE territory_wars
            SET status = 'cancelled', resolved_at = now(), version = version + 1
          WHERE id = $1 AND season_id = $2
            AND status IN ('declared', 'forming') AND starts_at > now()`,
        [warId, season.id],
      );
      if ((cancelled.rowCount ?? 0) !== 1) return 'registration_closed';
      await client.query(
        `UPDATE territory_war_participants
            SET left_at = now(), seat_no = NULL
          WHERE war_id = $1 AND left_at IS NULL`,
        [warId],
      );
      const view = await this.warView(client, warId, ctx.guildId, ctx.characterId);
      if (!view) return 'war_not_found';
      return {
        revision: 0,
        warsUpsert: [{ ...view, mySide: null, registered: false }],
      };
    });
  }

  joinWar(ctx: TerritoryMutationContext, warId: string): Promise<TerritoryMutationResult> {
    return this.mutateParticipation(ctx, 'join_war', warId, async (client, season) => {
      const war = await client.query<{
        attacker_guild_id: number;
        defender_guild_id: number;
        status: TerritoryWarView['status'];
        starts_at: Date | string;
      }>(
        `SELECT attacker_guild_id, defender_guild_id, status, starts_at FROM territory_wars
          WHERE id = $1 AND season_id = $2 FOR UPDATE`,
        [warId, season.id],
      );
      const row = war.rows[0];
      if (!row || !['declared', 'forming', 'active'].includes(row.status)) return 'war_not_found';
      const side: TerritoryWarSide | null =
        row.attacker_guild_id === ctx.guildId
          ? 'attacker'
          : row.defender_guild_id === ctx.guildId
            ? 'defender'
            : null;
      if (!side) return 'forbidden';
      const existing = await client.query<{ seat_no: number; joined_at: Date | string }>(
        `SELECT seat_no, joined_at FROM territory_war_participants
          WHERE war_id = $1 AND character_id = $2
            AND left_at IS NULL AND seat_no IS NOT NULL`,
        [warId, ctx.characterId],
      );
      const started = Date.now() >= new Date(row.starts_at).getTime();
      const policyStatus = started ? 'active' : row.status;
      const registeredBeforeStart = existing.rows[0]
        ? new Date(existing.rows[0].joined_at).getTime() <= new Date(row.starts_at).getTime()
        : false;
      if (existing.rows[0] && territoryWarJoinAllowed(policyStatus, side, registeredBeforeStart)) {
        return { seat: { warId, side, seatNo: existing.rows[0].seat_no } };
      }
      if (!territoryWarJoinAllowed(policyStatus, side, false)) return 'registration_closed';
      const seats = await client.query<{ seat_no: number }>(
        `SELECT seat_no FROM territory_war_participants
          WHERE war_id = $1 AND side = $2 AND left_at IS NULL AND seat_no IS NOT NULL`,
        [warId, side],
      );
      const used = new Set(seats.rows.map((seat) => seat.seat_no));
      let seatNo = 1;
      while (used.has(seatNo) && seatNo <= this.config.teamSize) seatNo += 1;
      if (seatNo > this.config.teamSize) return 'team_full';
      await client.query(
        `INSERT INTO territory_war_participants
           (war_id, character_id, guild_id, side, seat_no)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (war_id, character_id) DO UPDATE
           SET guild_id = EXCLUDED.guild_id, side = EXCLUDED.side, seat_no = EXCLUDED.seat_no,
               joined_at = now(), disconnected_at = NULL, left_at = NULL`,
        [warId, ctx.characterId, ctx.guildId, side, seatNo],
      );
      return { seat: { warId, side, seatNo } };
    });
  }

  leaveWar(ctx: TerritoryMutationContext, warId: string): Promise<TerritoryMutationResult> {
    return this.mutateParticipation(ctx, 'leave_war', warId, async (client, season) => {
      const war = await client.query(
        `SELECT 1 FROM territory_wars
          WHERE id = $1 AND season_id = $2
            AND status IN ('declared', 'forming', 'active')
          FOR UPDATE`,
        [warId, season.id],
      );
      if ((war.rowCount ?? 0) !== 1) return 'war_not_found';
      const left = await client.query(
        `UPDATE territory_war_participants
            SET left_at = now(), seat_no = NULL
          WHERE war_id = $1 AND character_id = $2 AND left_at IS NULL`,
        [warId, ctx.characterId],
      );
      if ((left.rowCount ?? 0) !== 1) return 'not_participant';
      return {};
    });
  }

  private async warView(
    client: PoolClient,
    warId: string,
    viewerGuildId: number | null,
    viewerCharacterId: number | null,
  ): Promise<TerritoryWarView | null> {
    const result = await client.query<{
      id: string;
      target_cell_id: number;
      attacker_guild_id: number;
      attacker_name: string;
      defender_guild_id: number;
      defender_name: string;
      status: TerritoryWarView['status'];
      declared_at: Date | string;
      starts_at: Date | string;
      ends_at: Date | string;
      winner_guild_id: number | null;
      attacker_count: string | number;
      defender_count: string | number;
      registered: boolean;
    }>(
      `SELECT w.id, w.target_cell_id, w.attacker_guild_id, ag.name AS attacker_name,
              w.defender_guild_id, dg.name AS defender_name, w.status, w.declared_at,
              w.starts_at, w.ends_at, w.winner_guild_id,
              count(p.character_id) FILTER (WHERE p.side = 'attacker' AND p.left_at IS NULL) AS attacker_count,
              count(p.character_id) FILTER (WHERE p.side = 'defender' AND p.left_at IS NULL) AS defender_count,
              COALESCE(bool_or(p.character_id = $2 AND p.left_at IS NULL AND p.seat_no IS NOT NULL), false) AS registered
         FROM territory_wars w JOIN guilds ag ON ag.id = w.attacker_guild_id
         JOIN guilds dg ON dg.id = w.defender_guild_id
         LEFT JOIN territory_war_participants p ON p.war_id = w.id
        WHERE w.id = $1 GROUP BY w.id, ag.name, dg.name`,
      [warId, viewerCharacterId ?? 0],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      targetCellId: row.target_cell_id,
      attackerGuildId: String(row.attacker_guild_id),
      attackerGuildName: row.attacker_name,
      defenderGuildId: String(row.defender_guild_id),
      defenderGuildName: row.defender_name,
      status: row.status,
      declaredAt: iso(row.declared_at),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      winnerGuildId: row.winner_guild_id === null ? null : String(row.winner_guild_id),
      attackerCount: num(row.attacker_count),
      defenderCount: num(row.defender_count),
      mySide:
        viewerGuildId === row.attacker_guild_id
          ? 'attacker'
          : viewerGuildId === row.defender_guild_id
            ? 'defender'
            : null,
      registered: row.registered,
    };
  }

  private cellView(
    cellId: number,
    guildId: number,
    guildName: string,
    keepRoot: boolean,
  ): TerritoryOwnedCellView {
    const cell = this.manifest.byId.get(cellId);
    if (!cell) throw new Error(`territory manifest missing cell ${cellId}`);
    return {
      cellId,
      ownerGuildId: String(guildId),
      ownerGuildName: guildName,
      ownerColor: territoryGuildColor(guildId),
      keepRoot,
      terrain: cell.terrain,
      resource: cell.resource,
    };
  }

  private structureView(
    cellId: number,
    slot: TerritoryStructureSlot,
    kind: TerritoryStructureKind,
    level: number,
    state: TerritoryStructureView['state'] = 'active',
    completesAt: Date | string | null = null,
  ): TerritoryStructureView {
    return {
      cellId,
      slot,
      kind,
      level,
      state,
      completesAt: completesAt === null ? null : iso(completesAt),
    };
  }

  /** Moves due declarations into the live state in one bounded revision. */
  async activateDueWars(now = new Date(), batchSize = 16): Promise<TerritoryDelta | null> {
    const observed = await this.activeSeason(this.pool);
    const due = await this.pool.query(
      `SELECT 1 FROM territory_wars
        WHERE season_id = $1 AND status IN ('declared', 'forming')
          AND starts_at <= $2 AND ends_at > $2
        LIMIT 1`,
      [observed.id, now],
    );
    if ((due.rowCount ?? 0) === 0) return null;
    const client = await this.pool.connect();
    try {
      await beginTerritoryTransaction(client);
      const season = await this.activeSeason(client, true);
      const activated = await client.query<{ id: string }>(
        `WITH due AS (
           SELECT id FROM territory_wars
            WHERE season_id = $1 AND status IN ('declared', 'forming')
              AND starts_at <= $2 AND ends_at > $2
            ORDER BY starts_at, id
            LIMIT $3
            FOR UPDATE
         )
         UPDATE territory_wars w SET status = 'active', version = version + 1
          FROM due WHERE w.id = due.id
         RETURNING w.id`,
        [season.id, now, Math.max(1, Math.min(64, Math.floor(batchSize)))],
      );
      if (activated.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const wars: TerritoryWarView[] = [];
      for (const row of activated.rows) {
        const view = await this.warView(client, row.id, null, null);
        if (view) wars.push(view);
      }
      const bumped = await client.query<{ revision: string | number }>(
        `UPDATE territory_seasons SET revision = revision + 1 WHERE id = $1 RETURNING revision`,
        [season.id],
      );
      const revision = num(bumped.rows[0].revision);
      const delta: TerritoryDelta = { revision, warsUpsert: wars };
      await client.query(
        `INSERT INTO territory_changes(season_id, revision, payload) VALUES ($1, $2, $3::jsonb)`,
        [season.id, revision, JSON.stringify(delta)],
      );
      await client.query(
        `INSERT INTO territory_audit(season_id, action, detail)
         VALUES ($1, 'activate_wars', $2::jsonb)`,
        [season.id, JSON.stringify({ revision, count: wars.length })],
      );
      await client.query('COMMIT');
      return delta;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Activates a bounded batch of due queues and emits one atomic revision. */
  async completeDueStructures(now = new Date(), batchSize = 128): Promise<TerritoryDelta | null> {
    const observed = await this.activeSeason(this.pool);
    const hasDue = await this.pool.query(
      `SELECT 1 FROM territory_structures
        WHERE season_id = $1 AND state = 'building' AND completes_at <= $2
        LIMIT 1`,
      [observed.id, now],
    );
    if ((hasDue.rowCount ?? 0) === 0) return null;

    const client = await this.pool.connect();
    try {
      await beginTerritoryTransaction(client);
      const season = await this.activeSeason(client, true);
      const completed = await client.query<{
        cell_id: number;
        slot: TerritoryStructureSlot;
        kind: TerritoryStructureKind;
        level: number;
        guild_id: number;
      }>(
        `WITH due AS (
           SELECT s.season_id, s.cell_id, s.slot, c.guild_id
             FROM territory_structures s
             JOIN territory_cells c ON c.season_id = s.season_id AND c.cell_id = s.cell_id
            WHERE s.season_id = $1 AND s.state = 'building' AND s.completes_at <= $2
            ORDER BY s.completes_at, s.cell_id, s.slot
            LIMIT $3
            FOR UPDATE OF s
         )
         UPDATE territory_structures s
            SET level = COALESCE(s.target_level, s.level), target_level = NULL,
                state = 'active', completes_at = NULL, updated_at = now()
           FROM due
          WHERE s.season_id = due.season_id AND s.cell_id = due.cell_id AND s.slot = due.slot
         RETURNING s.cell_id, s.slot, s.kind, s.level, due.guild_id`,
        [season.id, now, Math.max(1, Math.min(512, Math.floor(batchSize)))],
      );
      if (completed.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const keepLevels = new Map<number, number>();
      for (const row of completed.rows) {
        if (row.kind !== 'keep') continue;
        keepLevels.set(row.guild_id, Math.max(keepLevels.get(row.guild_id) ?? 1, row.level));
      }
      if (keepLevels.size > 0) {
        await client.query(
          `UPDATE territory_guild_state g
              SET territory_level = GREATEST(g.territory_level, levels.level), updated_at = now()
             FROM unnest($2::int[], $3::int[]) AS levels(guild_id, level)
            WHERE g.season_id = $1 AND g.guild_id = levels.guild_id`,
          [season.id, [...keepLevels.keys()], [...keepLevels.values()]],
        );
      }
      const bumped = await client.query<{ revision: string | number }>(
        `UPDATE territory_seasons SET revision = revision + 1 WHERE id = $1 RETURNING revision`,
        [season.id],
      );
      const revision = num(bumped.rows[0].revision);
      const delta: TerritoryDelta = {
        revision,
        structuresUpsert: completed.rows.map((row) =>
          this.structureView(row.cell_id, row.slot, row.kind, row.level),
        ),
      };
      await client.query(
        `INSERT INTO territory_changes(season_id, revision, payload) VALUES ($1, $2, $3::jsonb)`,
        [season.id, revision, JSON.stringify(delta)],
      );
      await client.query(
        `INSERT INTO territory_audit(season_id, action, detail)
         VALUES ($1, 'complete_builds', $2::jsonb)`,
        [season.id, JSON.stringify({ revision, count: completed.rows.length })],
      );
      await client.query('COMMIT');
      return delta;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * War-instance warmup read. At most realmWarSlots rows are materialized; a
   * process restart can therefore reconstruct every concurrently due siege in
   * two bounded queries without scanning static topology.
   */
  async loadDueSieges(now = new Date()): Promise<TerritorySiegeRuntimeRecord[]> {
    const season = await this.activeSeason(this.pool);
    const wars = await this.pool.query<{
      id: string;
      version: number;
      status: TerritoryWarStatus;
      starts_at: Date | string;
      ends_at: Date | string;
      gate_level: number;
      core_level: number;
      attacker_has_siege_workshop: boolean;
      defense_tower_level: number;
    }>(
      `SELECT w.id, w.version, w.status, w.starts_at, w.ends_at,
              COALESCE(
                CASE WHEN gate.state = 'active' OR gate.target_level > gate.level
                  THEN gate.level ELSE 0 END,
                0
              )::int AS gate_level,
              COALESCE(
                CASE WHEN core.state = 'active' OR core.target_level > core.level
                  THEN core.level ELSE 1 END,
                1
              )::int AS core_level,
              (
                COALESCE(CASE WHEN tower_n.state = 'active' OR tower_n.target_level > tower_n.level
                  THEN tower_n.level ELSE 0 END, 0) +
                COALESCE(CASE WHEN tower_s.state = 'active' OR tower_s.target_level > tower_s.level
                  THEN tower_s.level ELSE 0 END, 0)
              )::int AS defense_tower_level,
              EXISTS (
                SELECT 1 FROM territory_structures workshop
                JOIN territory_cells owned
                  ON owned.season_id = workshop.season_id AND owned.cell_id = workshop.cell_id
                WHERE workshop.season_id = w.season_id
                  AND owned.guild_id = w.attacker_guild_id
                  AND workshop.kind = 'siege_workshop'
                  AND (workshop.state = 'active' OR workshop.target_level > workshop.level)
              ) AS attacker_has_siege_workshop
         FROM territory_wars w
         LEFT JOIN territory_structures gate
           ON gate.season_id = w.season_id AND gate.cell_id = w.target_cell_id AND gate.slot = 'gate'
         LEFT JOIN territory_structures core
           ON core.season_id = w.season_id AND core.cell_id = w.target_cell_id AND core.slot = 'keep_core'
         LEFT JOIN territory_structures tower_n
           ON tower_n.season_id = w.season_id AND tower_n.cell_id = w.target_cell_id AND tower_n.slot = 'tower_north'
         LEFT JOIN territory_structures tower_s
           ON tower_s.season_id = w.season_id AND tower_s.cell_id = w.target_cell_id AND tower_s.slot = 'tower_south'
        WHERE w.season_id = $1 AND w.status IN ('declared', 'forming', 'active')
          AND w.starts_at <= $2
        ORDER BY w.starts_at, w.id
        LIMIT $3`,
      [season.id, now, this.config.realmWarSlots],
    );
    if (wars.rows.length === 0) return [];
    const warIds = wars.rows.map((war) => war.id);
    const participants = await this.pool.query<{
      war_id: string;
      character_id: number;
      side: TerritoryWarSide;
      seat_no: number | null;
      left_at: Date | string | null;
    }>(
      `SELECT p.war_id, p.character_id, p.side, p.seat_no, p.left_at
         FROM territory_war_participants p
         JOIN territory_wars w ON w.id = p.war_id
        WHERE p.war_id = ANY($1::uuid[])
          AND (p.side = 'defender' OR p.joined_at <= w.starts_at)
        ORDER BY p.war_id, p.side, p.seat_no, p.character_id`,
      [warIds],
    );
    const byWar = new Map<string, TerritorySiegeRuntimeRecord['participants']>();
    for (const participant of participants.rows) {
      if (participant.seat_no === null) continue;
      const list = byWar.get(participant.war_id) ?? [];
      list.push({
        characterId: participant.character_id,
        side: participant.side,
        seatNo: participant.seat_no,
        active: participant.left_at === null,
      });
      byWar.set(participant.war_id, list);
    }
    return wars.rows.map((war) => ({
      warId: war.id,
      version: war.version,
      status: war.status,
      startsAtMs: new Date(war.starts_at).getTime(),
      endsAtMs: new Date(war.ends_at).getTime(),
      gateLevel: war.gate_level,
      coreLevel: war.core_level,
      attackerHasSiegeWorkshop: war.attacker_has_siege_workshop,
      defenseTowerLevel: war.defense_tower_level,
      participants: byWar.get(war.id) ?? [],
    }));
  }

  async changesAfter(after: number): Promise<{ deltas: TerritoryDelta[]; resetRequired: boolean }> {
    const season = await this.activeSeason(this.pool);
    if (after >= num(season.revision)) return { deltas: [], resetRequired: false };
    const oldest = await this.pool.query<{ revision: string | number }>(
      `SELECT revision FROM territory_changes WHERE season_id = $1 ORDER BY revision LIMIT 1`,
      [season.id],
    );
    if (oldest.rows[0] && after < num(oldest.rows[0].revision) - 1) {
      return { deltas: [], resetRequired: true };
    }
    const result = await this.pool.query<{ payload: TerritoryDelta }>(
      `SELECT payload FROM territory_changes
        WHERE season_id = $1 AND revision > $2 ORDER BY revision LIMIT 1000`,
      [season.id, after],
    );
    const deltas = result.rows.map((row) => row.payload);
    if (deltas.some((delta) => delta.resetRequired)) {
      return { deltas: [], resetRequired: true };
    }
    const finalRevision = deltas.at(-1)?.revision ?? after;
    return { deltas, resetRequired: finalRevision !== num(season.revision) };
  }

  async resolveWar(
    warId: string,
    winner: TerritoryWarSide,
    expectedWarVersion: number,
    reason: string,
  ): Promise<TerritoryDelta | null> {
    const startedAt = performance.now();
    const client = await this.pool.connect();
    try {
      await beginTerritoryTransaction(client);
      const season = await this.activeSeason(client);
      await client.query(`SELECT pg_advisory_xact_lock($1)`, [num(season.id)]);
      const lockedSeason = await this.activeSeason(client, true);
      const war = await client.query<{
        version: number;
        status: TerritoryWarView['status'];
        target_cell_id: number;
        attacker_guild_id: number;
        defender_guild_id: number;
        attacker_name: string;
        target_keep_root: boolean;
      }>(
        `SELECT w.version, w.status, w.target_cell_id, w.attacker_guild_id, w.defender_guild_id,
                g.name AS attacker_name, c.keep_root AS target_keep_root
           FROM territory_wars w JOIN guilds g ON g.id = w.attacker_guild_id
           JOIN territory_cells c ON c.season_id = w.season_id AND c.cell_id = w.target_cell_id
          WHERE w.id = $1 AND w.season_id = $2 FOR UPDATE OF w`,
        [warId, lockedSeason.id],
      );
      const row = war.rows[0];
      if (!row || row.status === 'resolved' || row.version !== expectedWarVersion) {
        await client.query('ROLLBACK');
        return null;
      }
      const cellsRemove: number[] = [];
      const structuresRemove: Array<{ cellId: number; slot: TerritoryStructureSlot }> = [];
      const cellsUpsert: TerritoryOwnedCellView[] = [];
      const structuresUpsert: TerritoryStructureView[] = [];
      if (winner === 'attacker') {
        const defenderCells = await client.query<{ cell_id: number; keep_root: boolean }>(
          `SELECT cell_id, keep_root FROM territory_cells
            WHERE season_id = $1 AND guild_id = $2 ORDER BY cell_id`,
          [lockedSeason.id, row.defender_guild_id],
        );
        const owned = new Set(defenderCells.rows.map((cell) => cell.cell_id));
        const roots = new Set(
          defenderCells.rows
            .filter((cell) => cell.keep_root && cell.cell_id !== row.target_cell_id)
            .map((cell) => cell.cell_id),
        );
        const connectivity = territoryConnectivityAfterCapture(
          this.manifest,
          owned,
          row.target_cell_id,
          roots,
        );
        cellsRemove.push(...connectivity.disconnected);
        if (cellsRemove.length > 0) {
          const removedStructures = await client.query<{
            cell_id: number;
            slot: TerritoryStructureSlot;
          }>(
            `SELECT cell_id, slot FROM territory_structures
              WHERE season_id = $1 AND cell_id = ANY($2::int[])`,
            [lockedSeason.id, cellsRemove],
          );
          structuresRemove.push(
            ...removedStructures.rows.map((structure) => ({
              cellId: structure.cell_id,
              slot: structure.slot,
            })),
          );
          await client.query(
            `DELETE FROM territory_cells WHERE season_id = $1 AND cell_id = ANY($2::int[])`,
            [lockedSeason.id, cellsRemove],
          );
        }
        await client.query(
          `UPDATE territory_cells SET guild_id = $3, claimed_at = now()
            WHERE season_id = $1 AND cell_id = $2`,
          [lockedSeason.id, row.target_cell_id, row.attacker_guild_id],
        );
        const downgraded = await client.query<{
          cell_id: number;
          slot: TerritoryStructureSlot;
          kind: TerritoryStructureKind;
          level: number;
        }>(
          `UPDATE territory_structures
              SET level = GREATEST(1, level - 1), target_level = NULL, state = 'active',
                  completes_at = NULL, updated_at = now()
             WHERE season_id = $1 AND cell_id = $2
             RETURNING cell_id, slot, kind, level`,
          [lockedSeason.id, row.target_cell_id],
        );
        cellsUpsert.push(
          this.cellView(
            row.target_cell_id,
            row.attacker_guild_id,
            row.attacker_name,
            row.target_keep_root,
          ),
        );
        structuresUpsert.push(
          ...downgraded.rows.map((structure) =>
            this.structureView(structure.cell_id, structure.slot, structure.kind, structure.level),
          ),
        );
      }
      const winnerGuildId = winner === 'attacker' ? row.attacker_guild_id : row.defender_guild_id;
      await client.query(
        `UPDATE territory_wars
            SET status = 'resolved', version = version + 1, winner_guild_id = $2,
                result_reason = $3, resolved_at = now()
          WHERE id = $1`,
        [warId, winnerGuildId, reason],
      );
      const resolvedWar = await this.warView(client, warId, null, null);
      const bumped = await client.query<{ revision: string | number }>(
        `UPDATE territory_seasons SET revision = revision + 1 WHERE id = $1 RETURNING revision`,
        [lockedSeason.id],
      );
      const revision = num(bumped.rows[0].revision);
      const payload: TerritoryDelta =
        cellsRemove.length > 512
          ? { revision, resetRequired: true }
          : {
              revision,
              cellsRemove,
              cellsUpsert,
              structuresRemove,
              structuresUpsert,
              ...(resolvedWar ? { warsUpsert: [resolvedWar] } : {}),
            };
      await client.query(
        `INSERT INTO territory_changes(season_id, revision, payload) VALUES ($1, $2, $3::jsonb)`,
        [lockedSeason.id, revision, JSON.stringify(payload)],
      );
      await client.query(
        `INSERT INTO territory_audit(season_id, guild_id, action, target_cell_id, detail)
         VALUES ($1, $2, 'resolve_war', $3, $4::jsonb)`,
        [
          lockedSeason.id,
          winnerGuildId,
          row.target_cell_id,
          JSON.stringify({ warId, winner, reason, revision, cascade: cellsRemove.length }),
        ],
      );
      await client.query('COMMIT');
      territoryMetrics().capture((performance.now() - startedAt) / 1_000, cellsRemove.length);
      return payload;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

function retentionArgs(retentionDays: number, batchSize: number): [number, number] | null {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return null;
  return [Math.max(1, Math.floor(retentionDays)), Math.max(1, Math.floor(batchSize))];
}

export async function pruneTerritoryChangesBatch(
  db: Pick<Pool, 'query'>,
  retentionDays: number,
  batchSize: number,
): Promise<number> {
  const args = retentionArgs(retentionDays, batchSize);
  if (!args) return 0;
  const result = await db.query(
    `DELETE FROM territory_changes
      WHERE (season_id, revision) IN (
        SELECT season_id, revision FROM territory_changes
         WHERE created_at < now() - make_interval(days => $1)
         ORDER BY created_at, season_id, revision LIMIT $2
      )`,
    args,
  );
  return result.rowCount ?? 0;
}

export async function pruneTerritoryClosedLiveBatch(
  db: Pick<Pool, 'query'>,
  retentionDays: number,
  batchSize: number,
): Promise<number> {
  const args = retentionArgs(retentionDays, batchSize);
  if (!args) return 0;
  const result = await db.query<{ removed: string | number }>(
    `WITH candidates AS (
       SELECT 'cell'::text AS kind, c.season_id, c.cell_id::bigint AS row_id, s.closed_at
         FROM territory_cells c JOIN territory_seasons s ON s.id = c.season_id
        WHERE s.status = 'closed' AND s.closed_at < now() - make_interval(days => $1)
       UNION ALL
       SELECT 'guild'::text, g.season_id, g.guild_id::bigint, s.closed_at
         FROM territory_guild_state g JOIN territory_seasons s ON s.id = g.season_id
        WHERE s.status = 'closed' AND s.closed_at < now() - make_interval(days => $1)
       ORDER BY closed_at, season_id, row_id LIMIT $2
     ), deleted_cells AS (
       DELETE FROM territory_cells c USING candidates x
        WHERE x.kind = 'cell' AND c.season_id = x.season_id AND c.cell_id = x.row_id
       RETURNING 1
     ), deleted_guilds AS (
       DELETE FROM territory_guild_state g USING candidates x
        WHERE x.kind = 'guild' AND g.season_id = x.season_id AND g.guild_id = x.row_id
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM deleted_cells) +
            (SELECT count(*) FROM deleted_guilds) AS removed`,
    args,
  );
  return num(result.rows[0]?.removed ?? 0);
}

export async function pruneTerritoryParticipantsBatch(
  db: Pick<Pool, 'query'>,
  retentionDays: number,
  batchSize: number,
): Promise<number> {
  const args = retentionArgs(retentionDays, batchSize);
  if (!args) return 0;
  const result = await db.query(
    `DELETE FROM territory_war_participants
      WHERE (war_id, character_id) IN (
        SELECT p.war_id, p.character_id FROM territory_war_participants p
        JOIN territory_wars w ON w.id = p.war_id
        WHERE w.resolved_at < now() - make_interval(days => $1)
        ORDER BY w.resolved_at, p.war_id, p.character_id LIMIT $2
      )`,
    args,
  );
  return result.rowCount ?? 0;
}

export async function pruneTerritoryHistoryBatch(
  db: Pick<Pool, 'query'>,
  retentionDays: number,
  batchSize: number,
): Promise<number> {
  const args = retentionArgs(retentionDays, batchSize);
  if (!args) return 0;
  const result = await db.query<{ removed: string | number }>(
    `WITH deleted_audit AS (
       DELETE FROM territory_audit WHERE id IN (
         SELECT id FROM territory_audit
          WHERE created_at < now() - make_interval(days => $1)
          ORDER BY created_at, id LIMIT $2
       ) RETURNING 1
     )
     SELECT count(*) AS removed FROM deleted_audit`,
    args,
  );
  // Wars need their UUID key and cannot share the bigint candidate above; use
  // the unspent portion of this bounded batch after the audit delete.
  const auditRemoved = num(result.rows[0]?.removed ?? 0);
  if (auditRemoved >= args[1]) return auditRemoved;
  const wars = await db.query(
    `DELETE FROM territory_wars WHERE id IN (
       SELECT id FROM territory_wars
        WHERE resolved_at < now() - make_interval(days => $1)
        ORDER BY resolved_at, id LIMIT $2
     )`,
    [args[0], args[1] - auditRemoved],
  );
  return auditRemoved + (wars.rowCount ?? 0);
}
