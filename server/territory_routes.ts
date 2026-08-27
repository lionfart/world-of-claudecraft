import { ctxAccountId } from './http/context';
import { requireAccount } from './http/middleware/require_account';
import type { Ctx, RouteDef } from './http/types';
import { json } from './http_util';

export interface TerritoryRoutesRuntime {
  snapshotForAccount(accountId: number): Promise<unknown | null>;
  changesForAccount(
    accountId: number,
    after: number,
  ): Promise<{ deltas: unknown[]; resetRequired: boolean } | null>;
}

let runtime: TerritoryRoutesRuntime | null = null;

export function configureTerritoryRoutesRuntime(value: TerritoryRoutesRuntime): void {
  runtime = value;
}

export function resetTerritoryRoutesRuntimeForTests(): void {
  runtime = null;
}

function useRuntime(): TerritoryRoutesRuntime {
  if (!runtime) throw new Error('territory routes runtime is not configured');
  return runtime;
}

async function mapHandler(ctx: Ctx): Promise<void> {
  const snapshot = await useRuntime().snapshotForAccount(ctxAccountId(ctx));
  if (!snapshot) {
    json(ctx.res, 409, { error: 'character is not in world' });
    return;
  }
  json(ctx.res, 200, snapshot);
}

async function changesHandler(ctx: Ctx): Promise<void> {
  const raw = Array.isArray(ctx.query.after) ? ctx.query.after[0] : ctx.query.after;
  const after = Number(raw);
  if (!Number.isSafeInteger(after) || after < 0) {
    json(ctx.res, 400, { error: 'invalid revision' });
    return;
  }
  const changes = await useRuntime().changesForAccount(ctxAccountId(ctx), after);
  if (!changes) {
    json(ctx.res, 409, { error: 'character is not in world' });
    return;
  }
  json(ctx.res, 200, changes);
}

const readAccount = requireAccount({ scope: 'read' });

export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/api/territory/map',
    surface: 'api',
    middleware: [readAccount],
    handler: mapHandler,
  },
  {
    method: 'GET',
    path: '/api/territory/changes',
    surface: 'api',
    middleware: [readAccount],
    handler: changesHandler,
  },
];
