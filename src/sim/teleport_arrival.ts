import type { Entity } from './types';

// Land settled: no carried-over jump/dodge/forced-movement arc or fall distance
// from the far side. Besides preventing fall damage, this is the hard boundary
// that keeps a charge, leap, Valkyr flight, climb or horizontal air impulse from
// continuing to drive the body after an instance-scale teleport.
export function settleTeleportArrival(p: Entity): void {
  p.vx = 0;
  p.vz = 0;
  p.vy = 0;
  p.dodgeRemaining = 0;
  p.dodgeDirX = 0;
  p.dodgeDirZ = 0;
  p.chargeTargetId = null;
  p.chargeTimeLeft = 0;
  p.chargePath = [];
  p.followTargetId = null;
  if (p.leap !== undefined) p.leap = null;
  if (p.valkyrsCalling !== undefined) p.valkyrsCalling = null;
  if (p.climb !== undefined) p.climb = null;
  p.jumping = false;
  p.onGround = true;
  p.fallStartY = p.pos.y;
}
