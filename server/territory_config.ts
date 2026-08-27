export interface TerritoryConfig {
  enabled: boolean;
  seasonWeeks: number;
  warNoticeSeconds: number;
  warDurationSeconds: number;
  attackerForfeitSeconds: number;
  disconnectGraceSeconds: number;
  respawnWaveSeconds: number;
  teamSize: number;
  realmWarSlots: number;
  constructionBaseSeconds: number;
  changeRetentionDays: number;
  closedLiveRetentionDays: number;
  participantRetentionDays: number;
  historyRetentionDays: number;
}

function whole(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return fallback;
  const value = Number(raw);
  return value >= min && value <= max ? value : fallback;
}

export function territoryConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TerritoryConfig {
  return {
    enabled: env.TERRITORY_ENABLED !== '0',
    seasonWeeks: whole(env.TERRITORY_SEASON_WEEKS, 12, 1, 52),
    warNoticeSeconds: whole(env.TERRITORY_WAR_NOTICE_SECONDS, 300, 60, 7 * 86_400),
    warDurationSeconds: whole(env.TERRITORY_WAR_DURATION_SECONDS, 3_600, 600, 7_200),
    attackerForfeitSeconds: whole(env.TERRITORY_ATTACKER_FORFEIT_SECONDS, 600, 60, 1_800),
    disconnectGraceSeconds: whole(env.TERRITORY_DISCONNECT_GRACE_SECONDS, 120, 15, 600),
    respawnWaveSeconds: whole(env.TERRITORY_RESPAWN_WAVE_SECONDS, 15, 5, 60),
    teamSize: whole(env.TERRITORY_TEAM_SIZE, 20, 1, 20),
    realmWarSlots: whole(env.TERRITORY_REALM_WAR_SLOTS, 4, 1, 16),
    constructionBaseSeconds: whole(env.TERRITORY_CONSTRUCTION_BASE_SECONDS, 300, 1, 86_400),
    changeRetentionDays: 14,
    closedLiveRetentionDays: 30,
    participantRetentionDays: 180,
    historyRetentionDays: 365,
  };
}

export const TERRITORY_CONFIG = territoryConfigFromEnv();
