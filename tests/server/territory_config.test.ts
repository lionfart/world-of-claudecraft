import { describe, expect, it } from 'vitest';
import { territoryConfigFromEnv } from '../../server/territory_config';

describe('territory config', () => {
  it('ships the v1 test preset', () => {
    const config = territoryConfigFromEnv({});
    expect(config.warNoticeSeconds).toBe(300);
    expect(config.teamSize).toBe(20);
    expect(config.realmWarSlots).toBe(4);
    expect(config.disconnectGraceSeconds).toBe(120);
    expect(config.constructionBaseSeconds).toBe(300);
    expect(config.requirementsEnabled).toBe(false);
  });

  it('turns a future 24-hour notice into configuration only', () => {
    expect(territoryConfigFromEnv({ TERRITORY_WAR_NOTICE_SECONDS: '86400' }).warNoticeSeconds).toBe(
      86_400,
    );
  });

  it('keeps construction duration configurable without a schema change', () => {
    expect(
      territoryConfigFromEnv({ TERRITORY_CONSTRUCTION_BASE_SECONDS: '12' }).constructionBaseSeconds,
    ).toBe(12);
  });

  it('can restore progression requirements with configuration only', () => {
    expect(
      territoryConfigFromEnv({ TERRITORY_REQUIREMENTS_ENABLED: '1' }).requirementsEnabled,
    ).toBe(true);
  });
});
