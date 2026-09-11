import type { TerritoryMapState, TerritoryWarSide, TerritoryWarView } from '../world_api';

const LIVE_WAR_STATUSES = new Set<TerritoryWarView['status']>(['declared', 'forming', 'active']);

function sideForGuild(war: TerritoryWarView, guildId: string): TerritoryWarSide | null {
  if (war.attackerGuildId === guildId) return 'attacker';
  if (war.defenderGuildId === guildId) return 'defender';
  return null;
}

/**
 * Resolve the viewer's live war from both private push state and the public map
 * mirror. Public war rows deliberately carry `mySide: null`; deriving it from
 * the map's authenticated guild keeps the launcher badge reliable even when a
 * declaration raced guild-session metadata on the websocket host.
 */
export function territoryRelatedWar(
  notice: TerritoryWarView | null,
  state: TerritoryMapState | null,
): TerritoryWarView | null {
  return territoryRelatedWars(notice, state)[0] ?? null;
}

/**
 * Resolve every live war involving the viewer's guild. The private push is
 * merged over the public rows so its character-specific registration flag is
 * retained, while the public map keeps simultaneous attack and defense wars
 * visible in the launcher.
 */
export function territoryRelatedWars(
  notice: TerritoryWarView | null,
  state: TerritoryMapState | null,
): TerritoryWarView[] {
  const guildId = state?.guild?.id ?? null;
  const candidates = new Map<string, TerritoryWarView>();
  if (guildId) {
    for (const war of state?.wars ?? []) {
      if (!LIVE_WAR_STATUSES.has(war.status)) continue;
      const side = sideForGuild(war, guildId);
      if (side) candidates.set(war.id, { ...war, mySide: side });
    }
  }
  if (notice && LIVE_WAR_STATUSES.has(notice.status)) {
    const side = notice.mySide ?? (guildId ? sideForGuild(notice, guildId) : null);
    if (side)
      candidates.set(notice.id, notice.mySide === side ? notice : { ...notice, mySide: side });
  }
  return [...candidates.values()].sort((a, b) => {
    const activeOrder = Number(b.status === 'active') - Number(a.status === 'active');
    return activeOrder || a.startsAt.localeCompare(b.startsAt);
  });
}

export interface TerritoryWarAccess {
  open: boolean;
  unread: boolean;
  seenKey: string | null;
}

export function createTerritoryWarAccess(): TerritoryWarAccess {
  return { open: false, unread: false, seenKey: null };
}

/** Queue ticks/roster changes never re-alert. Battle start and a new war do. */
export function updateTerritoryWarAccess(
  state: TerritoryWarAccess,
  war: Pick<TerritoryWarView, 'id' | 'status'> | null,
): void {
  const live =
    war && (war.status === 'declared' || war.status === 'forming' || war.status === 'active');
  const key = live ? `${war.id}:${war.status === 'active' ? 'active' : 'queue'}` : null;
  if (state.open && key) state.seenKey = key;
  state.unread = key !== null && key !== state.seenKey;
}
