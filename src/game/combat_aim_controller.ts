import { actionCameraScreenPoint } from '../ui/action_camera_anchor';
import type { CombatAimIntent } from './combat_aim';
import {
  normalizeCombatAimPitch,
  pointAlongCombatAim,
  resolveCombatAimIntent,
  resolveCombatAimPitch,
} from './combat_aim';

interface CombatAimInput {
  readonly camYaw: number;
  readonly camPitch: number;
  combatAimUsesFacing(): boolean;
  cursorPoint(): { x: number; y: number } | null;
}

interface CombatAimPlayer {
  pos: { x: number; y: number; z: number };
  facing: number;
}

interface CombatAimMeta {
  combatAimAngle?: number;
  combatAimPitch?: number;
}

interface CombatAimOnlineSink {
  setCombatAimAngle(angle: number): void;
  setCombatAimPitch(pitch: number): void;
  setMouselookFacing(facing: number): void;
  flushInput(): boolean;
}

export interface CombatAimControllerDeps {
  canvas: Pick<HTMLCanvasElement, 'getBoundingClientRect'>;
  input: CombatAimInput;
  player(): CombatAimPlayer;
  groundPoint(clientX: number, clientY: number, planeY: number): { x: number; z: number } | null;
  screenRayDirection(clientX: number, clientY: number): { x: number; y: number; z: number } | null;
  entityAimPoint(clientX: number, clientY: number): { x: number; y: number; z: number } | null;
  projectileLaunchHeight: number;
  offlineMeta(): CombatAimMeta | null;
  online(): CombatAimOnlineSink | null;
}

export interface CombatAimController {
  screenPoint(): { x: number; y: number } | null;
  current(): CombatAimIntent;
  point(): { x: number; z: number; pitch: number };
  sync(): void;
}

/** Resolves and synchronizes cursor or facing aim without coupling main.ts to the wire sink. */
export function createCombatAimController(deps: CombatAimControllerDeps): CombatAimController {
  function usesFacing(): boolean {
    return deps.input.combatAimUsesFacing();
  }

  function screenPoint(): { x: number; y: number } | null {
    if (!usesFacing()) return deps.input.cursorPoint();
    return actionCameraScreenPoint(deps.canvas.getBoundingClientRect());
  }

  function current(): CombatAimIntent {
    const player = deps.player();
    const useFacing = usesFacing();
    const screen = screenPoint();
    const cursorPoint = screen ? deps.groundPoint(screen.x, screen.y, player.pos.y) : null;
    const cursorRay = screen ? deps.screenRayDirection(screen.x, screen.y) : null;
    const entityPoint = screen ? deps.entityAimPoint(screen.x, screen.y) : null;
    const anchor = actionCameraScreenPoint(deps.canvas.getBoundingClientRect());
    const anchorRay =
      anchor && screen && anchor.x === screen.x && anchor.y === screen.y
        ? cursorRay
        : anchor
          ? deps.screenRayDirection(anchor.x, anchor.y)
          : null;
    const horizontal = resolveCombatAimIntent({
      player: player.pos,
      facing: useFacing ? deps.input.camYaw : player.facing,
      cursorPoint,
      useFacing,
    });
    // A cursor above the horizon has no horizontal-plane intersection. Its
    // ray still carries a valid heading, so use that XZ direction rather than
    // snapping an upward shot back to the old character facing.
    const rayLength = cursorRay ? Math.hypot(cursorRay.x, cursorRay.z) : 0;
    const entityDx = entityPoint ? entityPoint.x - player.pos.x : 0;
    const entityDz = entityPoint ? entityPoint.z - player.pos.z : 0;
    const entityHorizontal = Math.hypot(entityDx, entityDz);
    const hasEntityPoint =
      entityPoint !== null &&
      Number.isFinite(entityPoint.x) &&
      Number.isFinite(entityPoint.y) &&
      Number.isFinite(entityPoint.z) &&
      entityHorizontal > 1e-6;
    const angle = hasEntityPoint
      ? Math.atan2(entityDx, entityDz)
      : !cursorPoint && cursorRay && rayLength > 1e-6
        ? Math.atan2(cursorRay.x, cursorRay.z)
        : horizontal.angle;
    const pitch = hasEntityPoint
      ? normalizeCombatAimPitch(
          Math.atan2(
            entityPoint.y - (player.pos.y + deps.projectileLaunchHeight),
            entityHorizontal,
          ),
        )
      : resolveCombatAimPitch({
          cameraPitch: deps.input.camPitch,
          cursorRay,
          anchorRay,
        });
    return {
      ...horizontal,
      source: !useFacing && cursorRay && rayLength > 1e-6 ? 'cursor' : horizontal.source,
      point: hasEntityPoint ? { x: entityPoint.x, z: entityPoint.z } : horizontal.point,
      angle,
      pitch,
    };
  }

  return {
    screenPoint,
    current,
    point() {
      const aim = current();
      return {
        ...(aim.point ?? pointAlongCombatAim(deps.player().pos, aim.angle)),
        pitch: aim.pitch,
      };
    },
    sync() {
      const aim = current();
      const offlineMeta = deps.offlineMeta();
      if (offlineMeta) {
        offlineMeta.combatAimAngle = aim.angle;
        offlineMeta.combatAimPitch = aim.pitch;
      }
      const online = deps.online();
      if (!online) return;
      online.setCombatAimAngle(aim.angle);
      online.setCombatAimPitch(aim.pitch);
      if (usesFacing()) online.setMouselookFacing(deps.input.camYaw);
      online.flushInput();
    },
  };
}
