/**
 * Keeps authored ability VFX off the live render path until every prewarm
 * unit for that attempt has completed. The generic pooled projectile remains
 * available while this gate is closed, so a slow or failed warmup degrades
 * presentation instead of turning the first combat input into a frame hitch.
 */
export class AbilityVfxPrewarmGate {
  private ready = false;
  private failed = false;

  begin(): void {
    this.ready = false;
    this.failed = false;
  }

  fail(): void {
    this.failed = true;
    this.ready = false;
  }

  complete(): void {
    if (!this.failed) this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  readyValue<T>(value: T): T | undefined {
    return this.ready ? value : undefined;
  }

  failEntry(entryId: string): void {
    if (entryId === 'vfx.ability-primitives') this.fail();
  }
}
