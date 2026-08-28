import { describe, expect, it } from 'vitest';
import { guildCreationFeeFromEnv, guildCreationFeeGold } from '../server/guild_creation_fee';

describe('guild creation fee configuration', () => {
  it('keeps one gold as the production default and permits the test waiver', () => {
    expect(guildCreationFeeFromEnv(undefined)).toBe(10_000);
    expect(guildCreationFeeFromEnv('0')).toBe(0);
    expect(guildCreationFeeGold(0)).toBe(0);
    expect(guildCreationFeeGold(10_000)).toBe(1);
  });

  it.each(['-1', 'free', '1.5', '9999'])('fails closed for malformed value %s', (raw) => {
    expect(() => guildCreationFeeFromEnv(raw)).toThrow();
  });
});
