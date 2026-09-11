import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const entry = (name: 'index.html' | 'play.html'): string =>
  readFileSync(join(repoRoot, name), 'utf8');

describe('Donate shell surfaces', () => {
  it('replaces every public Steam wishlist control in both entry documents', () => {
    for (const name of ['index.html', 'play.html'] as const) {
      const html = entry(name);
      expect(html, name).not.toContain('Wishlist on Steam');
      expect(html, name).not.toContain('steam-wishlist');
      expect(html, name).not.toContain('store.steampowered.com/app/4897790');
      expect(html.match(/data-donate-sol/g), name).toHaveLength(3);
      expect(html, name).toMatch(/<a\s+class="donate-cta"\s+data-donate-sol/);
      expect(html, name).toMatch(/<a\s+class="social-link donate"\s+data-donate-sol/);
      expect(html, name).toContain('class="community-link donate community-support-chip"');
      expect(html, name).toContain('id="mobile-donate"');
      expect(html.match(/data-donate-sol\s+href="\/donate"/g), name).toHaveLength(3);
      expect(html, name).not.toContain('data-donate-sol href="https://solscan.io"');
    }
  });

  it('keeps donation links visible and routes them through the runtime wallet redirect', () => {
    const main = readFileSync(join(repoRoot, 'src/main.ts'), 'utf8');
    const wiring = main.slice(
      main.indexOf('function wireDonateLinks'),
      main.indexOf('function wireContractAddressCopy'),
    );
    expect(wiring).toContain('anchor.hidden = false');
    expect(wiring).toContain("anchor.href = '/donate'");
    expect(wiring).not.toContain('anchor.hidden = true');
    expect(main).toContain("const DONATE_URL = '/donate'");
  });
});
