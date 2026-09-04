import { describe, expect, it } from 'vitest';
import {
  createTerritoryWarAccess,
  territoryRelatedWar,
  updateTerritoryWarAccess,
} from '../src/ui/territory_war_access_view';
import type { TerritoryMapState, TerritoryWarView } from '../src/world_api';

describe('war map launcher', () => {
  it('starts closed, signals incoming wars, and acknowledges them only when opened', () => {
    const state = createTerritoryWarAccess();
    updateTerritoryWarAccess(state, null);
    expect(state.unread).toBe(false);
    updateTerritoryWarAccess(state, { id: 'war1', status: 'declared' });
    expect(state.open).toBe(false);
    expect(state.unread).toBe(true);
    state.open = true;
    updateTerritoryWarAccess(state, { id: 'war1', status: 'declared' });
    expect(state.unread).toBe(false);
    state.open = false;
    updateTerritoryWarAccess(state, { id: 'war1', status: 'forming' });
    expect(state.unread).toBe(false);
    updateTerritoryWarAccess(state, { id: 'war1', status: 'active' });
    expect(state.unread).toBe(true);
  });

  it('clears withdrawn wars and detects a different war without reopening the map', () => {
    const state = createTerritoryWarAccess();
    state.open = true;
    updateTerritoryWarAccess(state, { id: 'a', status: 'active' });
    state.open = false;
    updateTerritoryWarAccess(state, { id: 'a', status: 'active' });
    expect(state.unread).toBe(false);
    updateTerritoryWarAccess(state, { id: 'a', status: 'resolved' });
    expect(state.unread).toBe(false);
    updateTerritoryWarAccess(state, { id: 'b', status: 'declared' });
    expect(state.unread).toBe(true);
    updateTerritoryWarAccess(state, { id: 'b', status: 'cancelled' });
    expect(state.unread).toBe(false);
    expect(state.open).toBe(false);
  });

  it('derives the viewer side from the authenticated map guild when the push notice is missing', () => {
    const war = {
      id: 'war-defender',
      attackerGuildId: '7',
      defenderGuildId: '12',
      status: 'declared',
      startsAt: '2026-09-03T12:05:00.000Z',
      mySide: null,
      registered: false,
    } as TerritoryWarView;
    const map = {
      guild: { id: '12' },
      wars: [war],
    } as unknown as TerritoryMapState;

    expect(territoryRelatedWar(null, map)).toMatchObject({
      id: 'war-defender',
      mySide: 'defender',
    });
  });
});
