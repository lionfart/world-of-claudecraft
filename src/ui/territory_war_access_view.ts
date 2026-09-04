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
  const guildId = state?.guild?.id ?? null;
  if (notice && LIVE_WAR_STATUSES.has(notice.status)) {
    const side = notice.mySide ?? (guildId ? sideForGuild(notice, guildId) : null);
    if (side) return notice.mySide === side ? notice : { ...notice, mySide: side };
  }
  if (!guildId) return null;
  const candidates = (state?.wars ?? [])
    .flatMap((war) => {
      if (!LIVE_WAR_STATUSES.has(war.status)) return [];
      const side = sideForGuild(war, guildId);
      return side ? [{ ...war, mySide: side }] : [];
    })
    .sort((a, b) => {
      const activeOrder = Number(b.status === 'active') - Number(a.status === 'active');
      return activeOrder || a.startsAt.localeCompare(b.startsAt);
    });
  return candidates[0] ?? null;
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
