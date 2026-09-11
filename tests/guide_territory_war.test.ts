import { describe, expect, it } from 'vitest';
import { pageFor } from '../src/guide/pages';
import { GUIDE_ROUTES } from '../src/guide/routes';
import { setLanguage, t } from '../src/ui/i18n';

describe('Territory War guide', () => {
  it('registers a public compete route backed by its own page', () => {
    const route = GUIDE_ROUTES.find((candidate) => candidate.id === 'territory-war');
    expect(route).toMatchObject({
      sub: 'territory-war',
      navKey: 'guide.nav.territoryWar',
      group: 'compete',
      descKey: 'guide.territoryWarPage.intro',
    });
    expect(pageFor('territory-war')).toBeTruthy();
  });

  it('renders the campaign, objectives, structures, and every siege weapon', () => {
    setLanguage('en');
    const html =
      pageFor('territory-war')?.render({
        params: [],
        sub: 'territory-war',
        titleKey: 'guide.nav.territoryWar',
      }) ?? '';

    for (const key of [
      'guide.territoryWarPage.mapHeading',
      'guide.territoryWarPage.developmentHeading',
      'guide.territoryWarPage.rosterHeading',
      'guide.territoryWarPage.objectiveHeading',
      'guide.territoryWarPage.ramHeading',
      'guide.territoryWarPage.mortarHeading',
      'guide.territoryWarPage.catapultHeading',
      'guide.territoryWarPage.defenseHeading',
      'guide.territoryWarPage.outcomeHeading',
    ] as const) {
      expect(html).toContain(t(key));
    }
    expect(html).toContain('twenty attackers and twenty defenders');
    expect(html).toContain('keep core');
    expect(html).toContain('Defenders can approach an intact gate');
    expect(html).not.toMatch(/\bguide\.[a-zA-Z0-9_.]+/);
  });
});
