import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file: string): string => readFileSync(`${root}/${file}`, 'utf8');

describe('territory siege voluntary exit', () => {
  it('ships the leave affordance in both playable documents', () => {
    for (const file of ['index.html', 'play.html']) {
      expect(read(file)).toContain('id="territory-leave-siege"');
    }
  });

  it('routes the active siege war id through the authoritative leave command', () => {
    const controller = read('src/ui/territory_map_controller.ts');
    expect(controller).toContain("element('#territory-leave-siege').addEventListener('click'");
    expect(controller).toContain('this.world.territoryLeaveWar(warId);');
    expect(controller).toContain("t('hudChrome.territoryMap.leaveWar')");
  });
});
