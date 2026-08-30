import type {
  TerritoryGuildView,
  TerritoryMapState,
  TerritoryWarSide,
  TerritoryWarStatus,
} from '../world_api';

export interface GuildTerritoryWarModel {
  id: string;
  targetCellId: number;
  side: TerritoryWarSide;
  opponentName: string;
  status: TerritoryWarStatus;
  registered: boolean;
  attackerCount: number;
  defenderCount: number;
  secondsRemaining: number;
  canCancel: boolean;
  canJoin: boolean;
  canLeave: boolean;
}

export interface GuildTerritoryPanelModel {
  guild: TerritoryGuildView;
  canManage: boolean;
  wars: GuildTerritoryWarModel[];
}

function secondsUntil(iso: string, nowMs: number): number {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.ceil((time - nowMs) / 1_000)) : 0;
}

/**
 * Pure Guild-window projection for the territory command panel. Server-side
 * rank and registration checks remain authoritative; these flags only keep the
 * UI honest and make the available actions obvious.
 */
export function guildTerritoryPanelModel(
  state: TerritoryMapState | null,
  nowMs: number,
): GuildTerritoryPanelModel | null {
  const guild = state?.guild ?? null;
  if (!state || !guild) return null;
  const canManage = guild.rank === 'leader' || guild.rank === 'officer';
  const wars = state.wars
    .filter(
      (war) =>
        (war.status === 'declared' || war.status === 'forming' || war.status === 'active') &&
        (war.attackerGuildId === guild.id || war.defenderGuildId === guild.id),
    )
    .map((war): GuildTerritoryWarModel => {
      const side: TerritoryWarSide = war.attackerGuildId === guild.id ? 'attacker' : 'defender';
      const preBattle = war.status === 'declared' || war.status === 'forming';
      return {
        id: war.id,
        targetCellId: war.targetCellId,
        side,
        opponentName: side === 'attacker' ? war.defenderGuildName : war.attackerGuildName,
        status: war.status,
        registered: war.registered,
        attackerCount: war.attackerCount,
        defenderCount: war.defenderCount,
        secondsRemaining: secondsUntil(preBattle ? war.startsAt : war.endsAt, nowMs),
        canCancel: canManage && side === 'attacker' && preBattle,
        // Attackers must have registered before battle start. Defenders may
        // reinforce at any point while the siege is active (up to the seat cap).
        canJoin:
          !war.registered &&
          war.mySide !== null &&
          (preBattle || (war.status === 'active' && side === 'defender')),
        // A registered player may always leave, including during the battle.
        canLeave: war.registered,
      };
    })
    .sort((a, b) => a.secondsRemaining - b.secondsRemaining || a.id.localeCompare(b.id));
  return { guild, canManage, wars };
}
