// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SLOTS = [
  'keep_core',
  'towers',
  'stockpile',
  'granary',
  'forester',
  'mine',
  'house',
  'siege_workshop',
] as const;

function entryView(path: 'index.html' | 'play.html'): DocumentFragment {
  const markup = readFileSync(path, 'utf8').replace(/<link\b[^>]*>/gi, '');
  const document = new DOMParser().parseFromString(markup, 'text/html');
  const template = document.getElementById('game-ui-template') as HTMLTemplateElement | null;
  if (!template) throw new Error(`${path} is missing the game UI template`);
  return template.content;
}

describe.each(['index.html', 'play.html'] as const)('%s territory structure details', (path) => {
  it('provides one-click details and a compact countdown row for every slot', () => {
    const view = entryView(path);
    expect(view.querySelector('#territory-structure-detail-panel')).not.toBeNull();
    expect(view.querySelector('#territory-structure-detail-action')).not.toBeNull();
    for (const slot of SLOTS) {
      expect(view.querySelector(`#territory-slot-${slot}-countdown`)).not.toBeNull();
    }
  });
});

describe('territory structure controller wiring', () => {
  it('keeps card clicks read-only and performs mutations from the detail action', () => {
    const source = readFileSync('src/ui/territory_map_controller.ts', 'utf8');
    const cardHandler = source.slice(
      source.indexOf('private performSlot('),
      source.indexOf('private performStructureAction('),
    );
    expect(cardHandler).not.toContain('territoryBuild(');
    expect(cardHandler).not.toContain('territoryUpgrade(');
    expect(source).toContain("element('#territory-structure-detail-action').addEventListener");
  });
});
