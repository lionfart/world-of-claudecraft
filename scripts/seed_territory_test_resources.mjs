#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export const TERRITORY_TEST_ITEMS = [
  'territory_wood',
  'territory_iron',
  'territory_grain',
  'territory_labor',
];
export const TERRITORY_TEST_ITEM_COUNT = 10_000;
export const TERRITORY_TEST_COPPER = 1_000_000; // 10,000 silver

/** Idempotently raises the test grant to its requested floor without deleting save data. */
export function seedTerritoryTestState(input) {
  const state = structuredClone(input ?? {});
  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
  state.inventory = inventory;
  for (const itemId of TERRITORY_TEST_ITEMS) {
    const existing = inventory.reduce(
      (total, slot) => total + (slot?.itemId === itemId ? Math.max(0, Number(slot.count) || 0) : 0),
      0,
    );
    const missing = Math.max(0, TERRITORY_TEST_ITEM_COUNT - existing);
    if (missing === 0) continue;
    const plain = inventory.find((slot) => slot?.itemId === itemId && !slot.instance);
    if (plain) plain.count = Math.max(0, Number(plain.count) || 0) + missing;
    else inventory.push({ itemId, count: missing });
  }
  state.copper = Math.max(Math.max(0, Number(state.copper) || 0), TERRITORY_TEST_COPPER);
  return state;
}

async function main() {
  try {
    process.loadEnvFile?.();
  } catch {
    // Local hosting may inject DATABASE_URL through its supervisor environment.
  }
  const apply = process.argv.includes('--apply');
  const realmArg = process.argv.find((arg) => arg.startsWith('--realm='));
  const realm = realmArg?.slice('--realm='.length).trim() || process.env.REALM_NAME || 'Claudemoon';
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await pool.query('BEGIN');
    const result = await pool.query(
      `SELECT id, state FROM characters
        WHERE realm = $1 AND state IS NOT NULL
        ORDER BY id FOR UPDATE`,
      [realm],
    );
    if (result.rows.length !== 6) {
      throw new Error(
        `Expected exactly 6 initialized characters in ${realm}; found ${result.rows.length}.`,
      );
    }
    for (const row of result.rows) {
      const state = seedTerritoryTestState(row.state);
      if (apply) {
        await pool.query('UPDATE characters SET state = $1, updated_at = now() WHERE id = $2', [
          JSON.stringify(state),
          row.id,
        ]);
      }
    }
    if (apply) await pool.query('COMMIT');
    else await pool.query('ROLLBACK');
    console.log(`${apply ? 'Seeded' : 'Would seed'} 6 initialized ${realm} characters.`);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
