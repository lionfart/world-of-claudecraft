import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ENTRY_FILES = ['index.html', 'play.html'] as const;

function openingTagForId(html: string, id: string): string {
  const match = html.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`));
  if (!match) throw new Error(`Missing #${id}`);
  return match[0];
}

function elementBlockForId(html: string, id: string): string {
  const tag = openingTagForId(html, id);
  const tagName = tag.match(/^<([a-z0-9-]+)/i)?.[1];
  if (!tagName) throw new Error(`Missing tag name for #${id}`);
  const start = html.indexOf(tag);
  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    const token = match[0];
    if (token.startsWith('</')) depth -= 1;
    else if (!token.endsWith('/>')) depth += 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  throw new Error(`Missing closing tag for #${id}`);
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

  it('keeps player, pet, target, and target-of-target levels on medal primitives', () => {
    for (const id of ['pf-level', 'petf-level', 'tf-level', 'totf-level']) {
      expect(openingTagForId(html, id)).toContain('ui-medal');
    }
    expect(openingTagForId(html, 'tf-level')).toContain('ui-medal--right');
  });

  it('keeps health and resource bars on filled bevel primitives', () => {
    const resource = elementBlockForId(html, 'pf-resource');
    expect(resource).toContain('ui-bevel');
    expect(resource).toContain('ui-bevel--res');
    expect(resource).toContain('ui-bevel-fill');
    expect(resource).toContain('ui-bevel-ticks');
    expect(resource).toContain('ui-bevel-edge');
    expect(resource).toContain('ui-bevel-text');

    for (const fillId of ['pf-hp', 'petf-hp', 'tf-hp', 'totf-hp']) {
      const fill = openingTagForId(html, fillId);
      expect(fill).toContain('ui-bevel-fill');
      const prefix = html.slice(Math.max(0, html.indexOf(fill) - 180), html.indexOf(fill));
      expect(prefix).toContain('ui-bevel');
    }
  });

  it('keeps player and hostile cast bars fully themed', () => {
    for (const id of ['castbar', 'tf-castbar']) {
      const tag = openingTagForId(html, id);
      const block = elementBlockForId(html, id);
      expect(tag).toContain('ui-cast');
      expect(block).toContain('ui-cast-fill');
      expect(block).toContain('ui-cast-edge');
      expect(block).toContain('ui-cast-icon');
      expect(block).toContain('ui-cast-label');
      expect(block).toContain('ui-cast-timer');
    }
    expect(openingTagForId(html, 'tf-castbar')).toContain('ui-cast--hostile');
  });

  it('keeps the experience rail and representative windows themed', () => {
    const xp = elementBlockForId(html, 'xpbar');
    expect(openingTagForId(html, 'xpbar')).toContain('ui-rail');
    for (const childClass of [
      'ui-rail-fill',
      'ui-rail-rested',
      'ui-rail-ticks',
      'ui-rail-label',
    ]) {
      expect(xp).toContain(childClass);
    }

    for (const id of [
      'map-window',
      'char-window',
      'spellbook',
      'warfare-window',
      'options-menu',
    ]) {
      expect(openingTagForId(html, id)).toContain('ui-window');
    }
  });

  it('keeps shared chat, minimap, and overlay controls on UI primitives', () => {
    expect(openingTagForId(html, 'chatlog-frame')).toContain('ui-panel-soft');
    expect(openingTagForId(html, 'minimap-daynight')).toContain('ui-disc');
    expect(openingTagForId(html, 'minimap-clock')).toContain('ui-num');
    expect(openingTagForId(html, 'ctx-menu')).toContain('ui-panel-strong');
    const deathOverlay = elementBlockForId(html, 'death-overlay');
    expect(deathOverlay).toContain('death-panel ui-panel-strong');
    expect(deathOverlay).toContain('<h2 class="ui-cin"');
  });
});
