export const TERRITORY_SIEGE_RESULT_PRESENTATION_MS = 5_000;

/** Whole seconds shown before the participant returns to their saved position. */
export function territorySiegeResultReturnIn(returnAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((returnAtMs - nowMs) / 1_000));
}
