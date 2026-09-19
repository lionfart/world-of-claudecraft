import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ENTRY_FILES = ['index.html', 'play.html'] as const;

function openingTagForId(html: string, id: string): string {
  const match = html.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`));
  if (!match) throw new Error(`Missing #${id}`);
  return match[0];
}

describe.each(ENTRY_FILES)('%s HUD primitive contracts', (entry) => {
  const html = readFileSync(new URL(`../${entry}`, import.meta.url), 'utf8');

  it('keeps desktop HUD launchers on the shared dark icon-button primitive', () => {
    for (const id of ['mm-char', 'mm-map', 'mm-territory', 'mm-options']) {
      const tag = openingTagForId(html, id);
      expect(tag).toContain('ui-icon-btn');
      expect(tag).toContain('ui-icon-btn--micro');
    }
  });

  it('keeps map controls on themed button primitives', () => {
    expect(openingTagForId(html, 'map-level-toggle')).toContain('ui-btn');
    expect(openingTagForId(html, 'map-zoom-in')).toContain('ui-disc');
    expect(openingTagForId(html, 'map-zoom-out')).toContain('ui-disc');
  });

  it('keeps every siege ability on the socket art and cooldown contract', () => {
    const ids = [
      'territory-ram-strike',
      'territory-ram-power-strike',
      'territory-mortar-fire',
      'territory-mortar-frost',
      'territory-mortar-venom',
      'territory-catapult-fire',
      'territory-catapult-cluster',
    ];

    for (const id of ids) {
      const tag = openingTagForId(html, id);
      expect(tag).toContain('ui-socket');
      const start = html.indexOf(tag);
      const end = html.indexOf('</button>', start);
      const contents = html.slice(start, end);
      expect(contents).toContain('ui-socket-art');
      expect(contents).toContain('ui-socket-key');
      expect(contents).toContain('ui-socket-cd-text');
    }
  });
});
