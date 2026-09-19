import { describe, expect, it } from 'vitest';
import { TERRITORY_SCHEMA } from '../../server/territory_schema';

describe('territory stockpile schema', () => {
  it('starts every produced resource at zero and updates legacy column defaults', () => {
    for (const resource of ['wood', 'iron', 'grain', 'labor']) {
      expect(TERRITORY_SCHEMA).toContain(`${resource} BIGINT NOT NULL DEFAULT 0`);
      expect(TERRITORY_SCHEMA).toContain(`ALTER COLUMN ${resource} SET DEFAULT 0`);
    }
  });

  it('stores resources per city and supports damaged and repairing buildings', () => {
    expect(TERRITORY_SCHEMA).toContain('stockpile_migrated BOOLEAN NOT NULL DEFAULT FALSE');
    expect(TERRITORY_SCHEMA).toContain('accrued_at TIMESTAMPTZ NOT NULL DEFAULT now()');
    expect(TERRITORY_SCHEMA).toContain("'damaged'");
    expect(TERRITORY_SCHEMA).toContain("'repairing'");
    expect(TERRITORY_SCHEMA).toContain("state IN ('building', 'repairing')");
  });
});
