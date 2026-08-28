import { describe, expect, it } from 'vitest';
import { AbilityVfxPrewarmGate } from '../src/render/ability_vfx/prewarm_gate';

describe('AbilityVfxPrewarmGate', () => {
  it('opens only after a successful prewarm attempt', () => {
    const gate = new AbilityVfxPrewarmGate();
    expect(gate.isReady()).toBe(false);

    gate.begin();
    gate.complete();
    expect(gate.isReady()).toBe(true);
    expect(gate.readyValue('authored')).toBe('authored');
  });

  it('stays closed when any unit fails and can recover on a later attempt', () => {
    const gate = new AbilityVfxPrewarmGate();
    gate.begin();
    gate.fail();
    gate.complete();
    expect(gate.isReady()).toBe(false);
    expect(gate.readyValue('authored')).toBeUndefined();

    gate.begin();
    gate.complete();
    expect(gate.isReady()).toBe(true);
  });

  it('closes only for the owned prewarm entry failure', () => {
    const gate = new AbilityVfxPrewarmGate();
    gate.begin();
    gate.complete();
    gate.failEntry('vfx.weapon-skins');
    expect(gate.isReady()).toBe(true);
    gate.failEntry('vfx.ability-primitives');
    expect(gate.isReady()).toBe(false);
  });
});
