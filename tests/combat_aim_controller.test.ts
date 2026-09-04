import { describe, expect, it, vi } from 'vitest';
import { createCombatAimController } from '../src/game/combat_aim_controller';

describe('combat aim controller', () => {
  it('uses the real canvas rect for cursor aim and synchronizes the current angle', () => {
    const meta: { combatAimAngle?: number; combatAimPitch?: number } = {};
    const online = {
      setCombatAimAngle: vi.fn(),
      setCombatAimPitch: vi.fn(),
      setMouselookFacing: vi.fn(),
      flushInput: vi.fn(() => true),
    };
    const groundPoint = vi.fn(() => ({ x: 3, z: 4 }));
    const controller = createCombatAimController({
      canvas: {
        getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 100 }) as DOMRect,
      },
      input: {
        camYaw: 0.75,
        camPitch: 0.32,
        combatAimUsesFacing: () => false,
        cursorPoint: () => ({ x: 170, y: 90 }),
      },
      player: () => ({ pos: { x: 0, y: 2, z: 0 }, facing: 0.25 }),
      groundPoint,
      screenRayDirection: (_x, y) =>
        y === 90 ? { x: 0, y: 0.5, z: 1 } : { x: 0, y: 0, z: 1 },
      entityAimPoint: () => null,
      projectileLaunchHeight: 0.7,
      offlineMeta: () => meta,
      online: () => online,
    });

    expect(controller.screenPoint()).toEqual({ x: 170, y: 90 });
    expect(controller.current()).toMatchObject({ source: 'cursor', point: { x: 3, z: 4 } });
    controller.sync();
    expect(groundPoint).toHaveBeenCalledWith(170, 90, 2);
    expect(meta.combatAimAngle).toBeCloseTo(Math.atan2(3, 4));
    expect(online.setCombatAimAngle).toHaveBeenCalledWith(meta.combatAimAngle);
    expect(meta.combatAimPitch).toBeGreaterThan(0);
    expect(online.setCombatAimPitch).toHaveBeenCalledWith(meta.combatAimPitch);
    expect(online.setMouselookFacing).not.toHaveBeenCalled();
    expect(online.flushInput).toHaveBeenCalledTimes(1);
  });

  it('uses the raised action-camera anchor and camera facing while mouselook owns aim', () => {
    const online = {
      setCombatAimAngle: vi.fn(),
      setCombatAimPitch: vi.fn(),
      setMouselookFacing: vi.fn(),
      flushInput: vi.fn(() => true),
    };
    const controller = createCombatAimController({
      canvas: {
        getBoundingClientRect: () => ({ left: 40, top: 20, width: 320, height: 180 }) as DOMRect,
      },
      input: {
        camYaw: 1.2,
        camPitch: 0.32,
        combatAimUsesFacing: () => true,
        cursorPoint: () => ({ x: 1, y: 1 }),
      },
      player: () => ({ pos: { x: 2, y: 3, z: 4 }, facing: -0.5 }),
      groundPoint: () => ({ x: 99, z: 99 }),
      screenRayDirection: () => ({ x: 0, y: -0.2, z: 1 }),
      entityAimPoint: () => null,
      projectileLaunchHeight: 0.7,
      offlineMeta: () => null,
      online: () => online,
    });

    expect(controller.screenPoint()).toEqual({ x: 200, y: 95.6 });
    expect(controller.current()).toMatchObject({ source: 'facing', angle: 1.2, pitch: 0, point: null });
    controller.sync();
    expect(online.setMouselookFacing).toHaveBeenCalledWith(1.2);
  });

  it('falls back to facing and level pitch when the screen ray is unavailable', () => {
    const controller = createCombatAimController({
      canvas: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 180 }) as DOMRect,
      },
      input: {
        camYaw: 0.8,
        camPitch: -0.2,
        combatAimUsesFacing: () => false,
        cursorPoint: () => ({ x: 100, y: 50 }),
      },
      player: () => ({ pos: { x: 0, y: 0, z: 0 }, facing: -0.4 }),
      groundPoint: () => null,
      screenRayDirection: () => null,
      entityAimPoint: () => null,
      projectileLaunchHeight: 0.7,
      offlineMeta: () => null,
      online: () => null,
    });

    expect(controller.current()).toMatchObject({ source: 'facing', angle: -0.4, pitch: 0 });
  });

  it('converges the player launch ray on the exact 3D entity contact point', () => {
    const controller = createCombatAimController({
      canvas: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 180 }) as DOMRect,
      },
      input: {
        camYaw: 0,
        camPitch: 0.32,
        combatAimUsesFacing: () => false,
        cursorPoint: () => ({ x: 160, y: 40 }),
      },
      player: () => ({ pos: { x: 2, y: 1, z: 3 }, facing: -0.6 }),
      groundPoint: () => ({ x: 80, z: 80 }),
      screenRayDirection: () => ({ x: 0, y: 0.9, z: 0.1 }),
      entityAimPoint: () => ({ x: 5, y: 5, z: 15 }),
      projectileLaunchHeight: 0.7,
      offlineMeta: () => null,
      online: () => null,
    });

    const aim = controller.current();
    const horizontal = Math.hypot(3, 12);
    expect(aim.source).toBe('cursor');
    expect(aim.point).toEqual({ x: 5, z: 15 });
    expect(aim.angle).toBeCloseTo(Math.atan2(3, 12));
    expect(aim.pitch).toBeCloseTo(Math.atan2(5 - 1.7, horizontal));
  });
});
