import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { territorySiegeOrigin } from '../src/sim/data';
import {
  installTerritorySim,
  type TerritorySimTeam,
  territorySimLocksMovement,
  territorySimProjectilePathClear,
  territorySimResolveGate,
} from '../src/sim/territory_local';
import { territorySiegeWallSegmentPlacements } from '../src/sim/territory_siege_layout';

describe('territory local siege controls', () => {
  it('keeps online display extrapolation off inside server-authoritative siege collisions', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/!isTerritorySiegePos\(pe\.pos\.x\)/);
  });

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
      control: { kind: 'ram', ramId: 1 },
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

  it('keeps ordinary players outside deployed ram colliders but leaves the operator anchored', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    const origin = territorySiegeOrigin(0);
    const ram = { id: 7, x: 0, z: 27 };
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
      rams: [ram],
    });
    const pushed = territorySimResolveGate(
      host,
      1,
      origin.x,
      origin.z + 27,
      { x: origin.x, z: origin.z + 27 },
      0.6,
    );
    expect(Math.hypot(pushed.x - origin.x, pushed.z - (origin.z + 27))).toBeGreaterThan(3.2);

    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: { kind: 'ram', ramId: 7 },
      rams: [ram],
    });
    expect(
      territorySimResolveGate(
        host,
        1,
        origin.x,
        origin.z + 27,
        { x: origin.x, z: origin.z + 27 },
        0.6,
      ),
    ).toEqual({ x: origin.x, z: origin.z + 27 });
  });

  it('sweeps intact wall segments and permits only a destroyed segment as a breach', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    const origin = territorySiegeOrigin(0);
    const wall = territorySiegeWallSegmentPlacements()['left:3'];
    const outsideX = origin.x + wall.x - 5;
    const insideX = origin.x + wall.x + 5;
    const z = origin.z + wall.z;
    const team: TerritorySimTeam = {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
      wallHealth: [{ id: 'left:3', hp: 100 }],
    };
    host.setTerritorySiegeTeam(1, team);
    expect(territorySimResolveGate(host, 1, outsideX, z, { x: insideX, z }, 0.6).x).toBeLessThan(
      origin.x + wall.x,
    );

    host.setTerritorySiegeTeam(1, {
      ...team,
      wallHealth: [{ id: 'left:3', hp: 0 }],
    });
    expect(territorySimResolveGate(host, 1, outsideX, z, { x: insideX, z }, 0.6)).toEqual({
      x: insideX,
      z,
    });
  });

  it('does not eject an attacker who legitimately entered through a wall breach', () => {
    class Host {}
    installTerritorySim(Host.prototype);
    const host = new Host() as Host & {
      setTerritorySiegeTeam(pid: number, team: TerritorySimTeam | null): void;
    };
    const origin = territorySiegeOrigin(0);
    host.setTerritorySiegeTeam(1, {
      warId: 'war-1',
      side: 'attacker',
      slot: 0,
      gateOpen: false,
      control: null,
      wallHealth: [{ id: 'left:3', hp: 0 }],
    });
    const courtyard = { x: origin.x, z: origin.z - 20 };
    expect(territorySimResolveGate(host, 1, courtyard.x, courtyard.z + 1, courtyard, 0.6)).toEqual(
      courtyard,
    );
  });
});
