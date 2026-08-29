import { describe, expect, it } from 'vitest';
import {
  installTerritorySim,
  type TerritorySimTeam,
  territorySimLocksMovement,
} from '../src/sim/territory_local';

describe('territory local siege controls', () => {
  it('locks movement only while a siege tool or core channel owns the player', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    expect(territorySimLocksMovement(host, 1)).toBe(false);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
    });
    expect(territorySimLocksMovement(host, 1)).toBe(false);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: { kind: 'ram', seatNo: 1 },
    });
    expect(territorySimLocksMovement(host, 1)).toBe(true);
  });
});
