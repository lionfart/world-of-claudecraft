// Opt-in real PostgreSQL coverage for atomic mutations and idempotent capture.
// The default suite stays DB-free; set TEST_DATABASE_URL to a disposable DB.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TerritoryRepository } from '../server/territory_db';
import { TERRITORY_SCHEMA } from '../server/territory_schema';

const DB_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = `territory_integration_${process.pid}`;
const describeDb = DB_URL ? describe : describe.skip;

describeDb('territory persistence (real PostgreSQL)', () => {
  let bootstrap: Pool;
  let pool: Pool;
  let repository: TerritoryRepository;

  beforeAll(async () => {
    bootstrap = new Pool({ connectionString: DB_URL, max: 1 });
    await bootstrap.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await bootstrap.query(`CREATE SCHEMA ${SCHEMA}`);
    pool = new Pool({
      connectionString: DB_URL,
      max: 4,
      options: `-c search_path=${SCHEMA}`,
    });
    await pool.query(`
      CREATE TABLE guilds (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
      CREATE TABLE characters (
        id SERIAL PRIMARY KEY,
        last_login TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await pool.query(TERRITORY_SCHEMA);
    repository = new TerritoryRepository(pool, undefined, 'territory-test');
    await repository.ensureActiveSeason(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await bootstrap.end();
    }
  });

  it('deduplicates a command and rolls resource spending back with an occupied build', async () => {
    const guild = await pool.query<{ id: number }>(
      `INSERT INTO guilds(name) VALUES ('A') RETURNING id`,
    );
    const character = await pool.query<{ id: number }>(
      `INSERT INTO characters DEFAULT VALUES RETURNING id`,
    );
    const actor = {
      characterId: character.rows[0].id,
      guildId: guild.rows[0].id,
      guildName: 'A',
      rank: 'leader' as const,
    };
    const starter = repository.manifest.cells.find((cell) => !cell.starter);
    if (!starter) throw new Error('territory manifest has no unrestricted test cell');
    const commandId = randomUUID();
    const racing = await Promise.all([
      repository.placeKeep({ ...actor, commandId, expectedRevision: 1 }, starter.id),
      repository.placeKeep({ ...actor, commandId, expectedRevision: 1 }, starter.id),
    ]);
    const placed = racing.find((result) => result.ok && !result.duplicate);
    expect(racing.filter((result) => result.ok && result.duplicate)).toHaveLength(1);
    expect(placed).toMatchObject({ ok: true, duplicate: false });
    const duplicate = await repository.placeKeep(
      { ...actor, commandId, expectedRevision: 1 },
      starter.id,
    );
    expect(duplicate).toMatchObject({ ok: true, duplicate: true });

    if (!placed?.ok || !placed.delta) throw new Error('place keep did not commit');
    const built = await repository.build(
      { ...actor, commandId: randomUUID(), expectedRevision: placed.delta.revision },
      starter.id,
      'gate',
      'gate',
    );
    if (!built.ok || !built.delta) throw new Error('gate build did not commit');
    const before = await pool.query<{ wood: string; iron: string; grain: string; labor: string }>(
      `SELECT wood, iron, grain, labor FROM territory_guild_state WHERE guild_id = $1`,
      [actor.guildId],
    );
    const refused = await repository.build(
      { ...actor, commandId: randomUUID(), expectedRevision: built.delta.revision },
      starter.id,
      'gate',
      'gate',
    );
    expect(refused).toEqual({ ok: false, error: 'occupied' });
    const after = await pool.query<{ wood: string; iron: string; grain: string; labor: string }>(
      `SELECT wood, iron, grain, labor FROM territory_guild_state WHERE guild_id = $1`,
      [actor.guildId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
    const season = await pool.query<{ revision: string }>(
      `SELECT revision FROM territory_seasons WHERE status = 'active'`,
    );
    expect(Number(season.rows[0].revision)).toBe(built.delta.revision);
  });

  it('seats concurrent participants from one map revision without serializing the season', async () => {
    const attacker = await pool.query<{ id: number }>(
      `INSERT INTO guilds(name) VALUES ('Seat A') RETURNING id`,
    );
    const defender = await pool.query<{ id: number }>(
      `INSERT INTO guilds(name) VALUES ('Seat D') RETURNING id`,
    );
    const characters = await pool.query<{ id: number }>(
      `INSERT INTO characters VALUES (DEFAULT), (DEFAULT) RETURNING id`,
    );
    const season = await pool.query<{ id: string; revision: string }>(
      `SELECT id, revision FROM territory_seasons WHERE status = 'active'`,
    );
    const warId = randomUUID();
    await pool.query(
      `INSERT INTO territory_wars
         (id, season_id, target_cell_id, attacker_guild_id, defender_guild_id,
          status, starts_at, ends_at)
       VALUES ($1, $2, 999999, $3, $4, 'forming', now() + interval '1 minute',
               now() + interval '1 hour')`,
      [warId, season.rows[0].id, attacker.rows[0].id, defender.rows[0].id],
    );
    const actors = characters.rows.map((character) => ({
      characterId: character.id,
      guildId: attacker.rows[0].id,
      guildName: 'Seat A',
      rank: 'member' as const,
    }));

    const joined = await Promise.all(
      actors.map((actor) =>
        repository.joinWar(
          {
            ...actor,
            commandId: randomUUID(),
            expectedRevision: Number(season.rows[0].revision),
          },
          warId,
        ),
      ),
    );

    expect(joined).toEqual([
      expect.objectContaining({ ok: true, seat: expect.objectContaining({ side: 'attacker' }) }),
      expect.objectContaining({ ok: true, seat: expect.objectContaining({ side: 'attacker' }) }),
    ]);
    expect(
      new Set(joined.flatMap((result) => (result.ok && result.seat ? [result.seat.seatNo] : [])))
        .size,
    ).toBe(2);
    const unchanged = await pool.query<{ revision: string }>(
      `SELECT revision FROM territory_seasons WHERE id = $1`,
      [season.rows[0].id],
    );
    expect(unchanged.rows[0].revision).toBe(season.rows[0].revision);
  });

  it('applies one capture result exactly once', async () => {
    const attacker = await pool.query<{ id: number }>(
      `INSERT INTO guilds(name) VALUES ('Capture A') RETURNING id`,
    );
    const defender = await pool.query<{ id: number }>(
      `INSERT INTO guilds(name) VALUES ('Capture D') RETURNING id`,
    );
    const target = repository.manifest.cells.find(
      (cell) => !cell.starter && cell.neighbors.length > 0,
    );
    if (!target) throw new Error('territory manifest has no capturable cell');
    const attackerCell = target.neighbors[0];
    const season = await pool.query<{ id: string; revision: string }>(
      `SELECT id, revision FROM territory_seasons WHERE status = 'active'`,
    );
    await pool.query(
      `INSERT INTO territory_cells(season_id, cell_id, guild_id, keep_root)
       VALUES ($1, $2, $3, TRUE), ($1, $4, $5, TRUE)`,
      [season.rows[0].id, attackerCell, attacker.rows[0].id, target.id, defender.rows[0].id],
    );
    await pool.query(
      `INSERT INTO territory_structures(season_id, cell_id, slot, kind, level)
       VALUES ($1, $2, 'keep_core', 'keep', 3)`,
      [season.rows[0].id, target.id],
    );
    const warId = randomUUID();
    await pool.query(
      `INSERT INTO territory_wars
         (id, season_id, target_cell_id, attacker_guild_id, defender_guild_id,
          status, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, 'active', now() - interval '1 minute', now() + interval '1 hour')`,
      [warId, season.rows[0].id, target.id, attacker.rows[0].id, defender.rows[0].id],
    );
    const first = await repository.resolveWar(warId, 'attacker', 1, 'core_destroyed');
    const second = await repository.resolveWar(warId, 'attacker', 1, 'core_destroyed');
    expect(first?.cellsUpsert?.[0]?.ownerGuildId).toBe(String(attacker.rows[0].id));
    expect(second).toBeNull();
    const durable = await pool.query<{ guild_id: number; level: number; audits: string }>(
      `SELECT c.guild_id, s.level,
              (SELECT count(*) FROM territory_audit WHERE detail->>'warId' = $3) AS audits
         FROM territory_cells c
         JOIN territory_structures s ON s.season_id = c.season_id AND s.cell_id = c.cell_id
        WHERE c.season_id = $1 AND c.cell_id = $2 AND s.slot = 'keep_core'`,
      [season.rows[0].id, target.id, warId],
    );
    expect(durable.rows[0]).toMatchObject({ guild_id: attacker.rows[0].id, level: 2 });
    expect(Number(durable.rows[0].audits)).toBe(1);

    const defenderCharacter = await pool.query<{ id: number }>(
      `INSERT INTO characters DEFAULT VALUES RETURNING id`,
    );
    const reentryCell = repository.manifest.cells.find(
      (cell) => !cell.starter && cell.id !== target.id && cell.id !== attackerCell,
    );
    if (!reentryCell || !first) throw new Error('territory manifest has no re-entry cell');
    const reentry = await repository.placeKeep(
      {
        characterId: defenderCharacter.rows[0].id,
        guildId: defender.rows[0].id,
        guildName: 'Capture D',
        rank: 'leader',
        commandId: randomUUID(),
        expectedRevision: first.revision,
      },
      reentryCell.id,
    );
    expect(reentry).toMatchObject({
      ok: true,
      delta: {
        cellsUpsert: [
          expect.objectContaining({
            cellId: reentryCell.id,
            ownerGuildId: String(defender.rows[0].id),
            keepRoot: true,
          }),
        ],
      },
    });
  });

  it('closes a legacy manifest season and preserves its rows during the v2 pointer swap', async () => {
    await pool.query(
      `UPDATE territory_seasons
          SET status = 'closed', closed_at = now()
        WHERE status = 'active'`,
    );
    // Reproduce the production upgrade shape: a database created by manifest
    // v1 still rejects radius 20 until the idempotent schema pass replaces its
    // generated radius check constraint.
    await pool.query(`
      ALTER TABLE territory_seasons
        DROP CONSTRAINT territory_seasons_radius_check;
      ALTER TABLE territory_seasons
        ADD CONSTRAINT territory_seasons_radius_check CHECK (radius BETWEEN 63 AND 141);
    `);
    const nextNumber = await pool.query<{ value: number }>(
      `SELECT COALESCE(max(season_no), 0)::int + 1 AS value FROM territory_seasons`,
    );
    const legacy = await pool.query<{ id: string }>(
      `INSERT INTO territory_seasons
         (realm, season_no, status, manifest_version, manifest_checksum, radius, starts_at, ends_at)
       VALUES ('territory-test', $1, 'active', 1, 'legacy-checksum', 63,
               '2026-02-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')
       RETURNING id`,
      [nextNumber.rows[0].value],
    );
    const guild = await pool.query<{ id: number }>(`SELECT id FROM guilds ORDER BY id LIMIT 1`);
    await pool.query(
      `INSERT INTO territory_cells(season_id, cell_id, guild_id, keep_root)
       VALUES ($1, 1, $2, TRUE)`,
      [legacy.rows[0].id, guild.rows[0].id],
    );

    await pool.query(TERRITORY_SCHEMA);
    await repository.ensureActiveSeason(new Date('2026-02-02T00:00:00.000Z'));

    const oldSeason = await pool.query<{ status: string; reason: string; cells: string }>(
      `SELECT s.status, s.summary->>'reason' AS reason,
              (SELECT count(*) FROM territory_cells c WHERE c.season_id = s.id) AS cells
         FROM territory_seasons s WHERE s.id = $1`,
      [legacy.rows[0].id],
    );
    const active = await pool.query<{ manifest_version: number; radius: number }>(
      `SELECT manifest_version, radius FROM territory_seasons WHERE status = 'active'`,
    );
    expect(oldSeason.rows[0]).toMatchObject({
      status: 'closed',
      reason: 'manifest_upgrade',
      cells: '1',
    });
    expect(active.rows[0]).toEqual({ manifest_version: 2, radius: 20 });
  });
});
