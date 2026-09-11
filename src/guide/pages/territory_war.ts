// Territory War overview. This page documents player-visible rules and battlefield
// responsibilities without exposing tuning constants or internal matchmaking state.

import { esc } from '../../ui/esc';
import { t } from '../../ui/i18n';
import { hrefFor } from '../routes';
import type { GuidePage } from './types';
import { callout, pageHeader, paras, related, section } from './ui';

export const territoryWar: GuidePage = {
  titleKey: 'guide.nav.territoryWar',
  render() {
    return [
      '<article class="guide-article guide-territory-war">',
      pageHeader('guide.territoryWarPage.heading', 'guide.territoryWarPage.intro'),
      section('guide.territoryWarPage.mapHeading', paras('guide.territoryWarPage.mapBody')),
      section('guide.territoryWarPage.controlHeading', paras('guide.territoryWarPage.controlBody')),
      section(
        'guide.territoryWarPage.expansionHeading',
        paras('guide.territoryWarPage.expansionBody'),
      ),
      section(
        'guide.territoryWarPage.developmentHeading',
        paras('guide.territoryWarPage.developmentBody'),
      ),
      section(
        'guide.territoryWarPage.declarationHeading',
        paras('guide.territoryWarPage.declarationBody'),
      ),
      section(
        'guide.territoryWarPage.rosterHeading',
        paras('guide.territoryWarPage.rosterBody') +
          callout(esc(t('guide.territoryWarPage.rejoinNote')), { variant: 'note' }),
      ),
      section(
        'guide.territoryWarPage.battlefieldHeading',
        paras('guide.territoryWarPage.battlefieldBody'),
      ),
      section(
        'guide.territoryWarPage.objectiveHeading',
        paras('guide.territoryWarPage.objectiveBody') +
          callout(esc(t('guide.territoryWarPage.objectiveNote')), { variant: 'warn' }),
      ),
      section('guide.territoryWarPage.ramHeading', paras('guide.territoryWarPage.ramBody')),
      section('guide.territoryWarPage.mortarHeading', paras('guide.territoryWarPage.mortarBody')),
      section(
        'guide.territoryWarPage.catapultHeading',
        paras('guide.territoryWarPage.catapultBody'),
      ),
      section('guide.territoryWarPage.defenseHeading', paras('guide.territoryWarPage.defenseBody')),
      section('guide.territoryWarPage.outcomeHeading', paras('guide.territoryWarPage.outcomeBody')),
      related([
        { href: hrefFor('reference/combat'), key: 'guide.nav.combat' },
        { href: hrefFor('social'), key: 'guide.nav.social' },
        { href: hrefFor('arena'), key: 'guide.nav.arena' },
        { href: hrefFor('gear'), key: 'guide.nav.gear' },
      ]),
      '</article>',
    ].join('');
  },
};
