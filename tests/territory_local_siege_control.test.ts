import { describe, expect, it } from 'vitest';
import { territorySiegeOrigin } from '../src/sim/data';
import {
  installTerritorySim,
  type TerritorySimTeam,
  territorySimLocksMovement,
  territorySimProjectilePathClear,
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

  it('exposes the live gate state to projectile collision', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    const origin = territorySiegeOrigin(0);
    const from = { x: origin.x, z: origin.z + 26 };
    const to = { x: origin.x, z: origin.z + 10 };

    expect(territorySimProjectilePathClear(host, 1, from, to)).toBe(true);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
    });
    expect(territorySimProjectilePathClear(host, 1, from, to)).toBe(false);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: true,
      control: null,
    });
    expect(territorySimProjectilePathClear(host, 1, from, to)).toBe(true);
  });
});
