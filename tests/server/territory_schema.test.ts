import { describe, expect, it } from 'vitest';
import { TERRITORY_SCHEMA } from '../../server/territory_schema';

describe('territory stockpile schema', () => {
  it('starts every produced resource at zero and updates legacy column defaults', () => {
    for (const resource of ['wood', 'iron', 'grain', 'labor']) {
      expect(TERRITORY_SCHEMA).toContain(`${resource} BIGINT NOT NULL DEFAULT 0`);
      expect(TERRITORY_SCHEMA).toContain(
        `ALTER COLUMN ${resource} SET DEFAULT 0`,
      );
    }
  });
});
