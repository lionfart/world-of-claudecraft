// Focused client-side projectile hitch diagnostic. It compares an idle window,
// the pooled generic ballistic renderer, and authored projectile ability VFX in
// one fresh headed hardware-GPU session. No server or account is required.
import fs from 'node:fs';
import path from 'node:path';
import {
  closeHitchBrowser,
  openHitchBrowser,
  runMeasuredWindow,
} from './lib/perf_hitch_browser.mjs';

const gameUrl = process.env.GAME_URL ?? 'http://localhost:5173';
const preset = process.env.GFX ?? 'high';
const outPath = process.env.OUT ?? 'tmp/projectile-hitch/report.json';
const windowSpec = (name) => ({ name, warmupMs: 2_000, measureMs: 9_000 });

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
}

function summarize(raw) {
  const frameTimes = raw.frames
    .filter((frame) => frame.atMs - frame.dtMs >= raw.warmupBoundaryMs)
    .map((frame) => frame.dtMs)
    .filter(Number.isFinite);
  const renderer = raw.report?.renderer ?? null;
  const prewarm = renderer?.prewarm ?? null;
  const abilityEntry = prewarm?.manifestEntries?.find(
    (entry) => entry.id === 'vfx.ability-primitives',
  );
  const abilityResume = prewarm?.resume?.entries?.find(
    (entry) => entry.id === 'vfx.ability-primitives',
  );
  return {
    name: raw.name,
    frames: frameTimes.length,
    long50: frameTimes.filter((value) => value >= 50).length,
    long100: frameTimes.filter((value) => value >= 100).length,
    worstFrameMs: frameTimes.length ? Math.max(...frameTimes) : null,
    p99FrameMs: percentile(frameTimes, 0.99),
    programCompiles: raw.newProgramKeys?.length ?? null,
    texturesCreated:
      raw.counterBaseline && raw.counterPeaks
        ? Math.max(0, raw.counterPeaks.textures - raw.counterBaseline.textures)
        : null,
    // This counter is the renderer's pooled CHARACTER visual cache, not the
    // ability primitive pools. Retain it only as background-noise context.
    characterVisualPoolGrowth:
      raw.counterBaseline && raw.counterPeaks
        ? Math.max(0, raw.counterPeaks.pooledVisuals - raw.counterBaseline.pooledVisuals)
        : null,
    settledHeapDeltaMb: raw.settledHeap?.deltaMb ?? null,
    renderer: renderer
      ? {
          tier: renderer.tier,
          glRenderer: renderer.glRenderer,
          phaseMs: renderer.phaseMs,
          programs: renderer.programs,
          textures: renderer.textures,
          prewarm: prewarm
            ? {
                elapsedMs: prewarm.elapsedMs,
                timedOut: prewarm.timedOut,
                abilityEntry: abilityEntry ?? null,
                resume: prewarm.resume
                  ? {
                      status: prewarm.resume.status,
                      plannedUnits: prewarm.resume.plannedUnits,
                      startedUnits: prewarm.resume.startedUnits,
                      abilityEntry: abilityResume ?? null,
                    }
                  : null,
              }
            : null,
        }
      : null,
    pageErrors: raw.pageErrors ?? [],
    consoleErrors: raw.consoleErrors ?? [],
  };
}

async function emitProjectiles(page, authored) {
  return page.evaluate(async (withAuthoredVfx) => {
    const game = window.__game;
    const player = game.world.player;
    const target = [...game.world.entities.values()].find(
      (entity) => entity.kind === 'mob' && !entity.dead,
    );
    if (!target) throw new Error('projectile probe could not find a live mob');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const before = game.abilityVfxStats?.() ?? {};
    const handlerTimesMs = [];

    for (let index = 0; index < 6; index += 1) {
      const trajectoryId = `projectile-hitch:${withAuthoredVfx ? 'authored' : 'generic'}:${index}`;
      const dx = target.pos.x - player.pos.x;
      const dz = target.pos.z - player.pos.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      const ability = withAuthoredVfx ? (index % 2 === 0 ? 'frostbolt' : 'fireball') : undefined;
      const school = index % 2 === 0 ? 'frost' : 'fire';
      const launch = {
        type: 'projectileLaunch',
        trajectoryId,
        sourceId: player.id,
        x: player.pos.x,
        z: player.pos.z,
        dirX: dx / length,
        dirZ: dz / length,
        speed: 26,
        maxDistance: Math.min(18, length),
        radius: 0.2,
        school,
        ability,
      };
      let startedAt = performance.now();
      game.hud.handleEvents([launch]);
      handlerTimesMs.push(performance.now() - startedAt);
      await sleep(420);
      startedAt = performance.now();
      game.hud.handleEvents([
        {
          type: 'projectileImpact',
          trajectoryId,
          x: target.pos.x,
          z: target.pos.z,
          targetId: target.id,
          reason: 'entity',
        },
      ]);
      handlerTimesMs.push(performance.now() - startedAt);
      await sleep(850);
    }

    const after = game.abilityVfxStats?.() ?? {};
    return { before, after, handlerTimesMs };
  }, authored);
}

const session = await openHitchBrowser({
  mode: 'offline',
  preset,
  gameUrl,
  serverUrl: 'http://127.0.0.1:8787',
});

try {
  const raw = [];
  raw.push(await runMeasuredWindow(session, windowSpec('idle'), async () => {}));

  let genericEvents;
  raw.push(
    await runMeasuredWindow(session, windowSpec('generic-projectile'), async () => {
      genericEvents = await emitProjectiles(session.profiler.page, false);
    }),
  );

  let authoredEvents;
  raw.push(
    await runMeasuredWindow(session, windowSpec('authored-projectile'), async () => {
      authoredEvents = await emitProjectiles(session.profiler.page, true);
    }),
  );

  const scenarios = raw.map(summarize);
  const report = {
    kind: 'projectile-hitch-probe',
    version: 1,
    at: new Date().toISOString(),
    gameUrl,
    preset,
    browserVersion: session.browserVersion,
    scenarios,
    eventHandlers: {
      generic: genericEvents?.handlerTimesMs ?? [],
      authored: authoredEvents?.handlerTimesMs ?? [],
    },
    vfxStats: {
      generic: { before: genericEvents?.before ?? {}, after: genericEvents?.after ?? {} },
      authored: { before: authoredEvents?.before ?? {}, after: authoredEvents?.after ?? {} },
    },
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await closeHitchBrowser(session);
}
