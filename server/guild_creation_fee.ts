import { GUILD_CREATION_FEE_COPPER } from '../src/sim/guild_bank';

export function guildCreationFeeFromEnv(raw = process.env.GUILD_CREATION_FEE_COPPER): number {
  if (raw === undefined || raw.trim() === '') return GUILD_CREATION_FEE_COPPER;
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`GUILD_CREATION_FEE_COPPER must be a non-negative integer, got ${raw}`);
  }
  const copper = Number(raw);
  if (!Number.isSafeInteger(copper) || copper % 10_000 !== 0) {
    throw new Error(`GUILD_CREATION_FEE_COPPER must be zero or a whole number of gold, got ${raw}`);
  }
  return copper;
}

export function guildCreationFeeGold(copper: number): number {
  const gold = copper / 10_000;
  if (!Number.isInteger(gold) || gold < 0) {
    throw new Error(
      `Guild creation fee must be zero or a whole number of gold for the guild.createFee matcher, got ${copper}`,
    );
  }
  return gold;
}
