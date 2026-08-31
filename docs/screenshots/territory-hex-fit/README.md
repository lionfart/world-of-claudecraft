# Territory hex artwork fit - 2026-08-31

Verdict: READY WITH NOTES. Scope is the working-tree diff against
`b990f11a804fb1bd2386e3ca33100a1f70695d70`; no simulation, resource yields,
biome placement, ownership, or siege rules changed.

## Fix

The 36 newly authored resource sprites had a 256×384 canvas but their painted
hex stopped around row 322. The renderer correctly expected a footprint from
row 123 to 384. Applying an atlas hex mask and then extending the same Sharp
pipeline caused the mask to apply against the extended canvas, clipping the
lower 62 pixels. Sharp documents that image operations precede composition:
[compositing operation order](https://sharp.pixelplumbing.com/api-composite/).

- Re-sliced the existing temperate, snow, and desert resource atlases, completing
  the hex mask before adding transparent headroom. Corrected row extraction and
  retained white snow inside the terrain instead of treating it as background.
- Rebuilt all 36 public resource images and 3 keep levels. Small irregular
  perimeter gaps and keep corners receive the matching terrain texture at build
  time. The original foreground artwork stays upright and readable.
- The builder rejects incorrectly sized resources and truncated bottom tips.
- Versioned image requests with `hex-fit-2` invalidate old cached bitmaps.
- Runtime rendering is unchanged: one bitmap draw per hex, same image dimensions,
  same 80-image shared loading batch, no runtime pixel processing or extra layers.

Regenerate shipping images with `npm run assets:territory-transitions`.

## Evidence

The new pixel regression initially failed: `woodTier1` had **31.9784%** missing
interior opacity. The final test decodes all 39 shipping resource/keep images,
samples more than 48,000 interior pixels per image, and requires less than 0.1%
missing opacity (excluding only the 2px antialiased boundary).

Browser verification used the actual `TerritoryMapPainter.artTiles` renderer with
all 36 resource combinations and 3 keep levels. A bright pink diagnostic
underlay exposes holes. Checked radii 24, 42, and 64px; no console errors/warnings.
The fine pale grid outlines are deliberate diagnostic guides, not empty strips.

- [Before](before.png)
- [After, all variants](after.png)
- [Overview](overview.png)
- [Close-up](close-up.png)

## Checks

- `npm run assets:territory-transitions`: PASS. Repeating the build changed zero
  bitmap hashes. Production `dist/territory_map` contains the corrected images.
- `npx vitest run tests/territory_map_art.test.ts tests/territory_map_view.test.ts`:
  PASS, 18 tests, including cache invalidation/shared-batch behavior.
- `npx biome check scripts/build_territory_transition_atlas.mjs src/ui/territory_map_art.ts tests/territory_map_art.test.ts`:
  PASS after formatting the touched files.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS (existing dynamic-import/chunk warnings remain).
- `npm run security:gate`: PASS, zero high-severity findings after priors.
- Expanded art/view/architecture/HUD-budget/duplicate-test pass: 281 passed,
  4 skipped, 1 failed. The failure is the pre-existing missing
  `guild_territory_view.ts` registration in the architecture pure-core allowlist;
  neither that view nor the architecture test is changed here.
- `npm run ci:changed` and `npm run gate`: FAIL on existing broad-branch Biome
  debt (1,817 errors, 3,946 warnings, 51 infos), comparing against
  `origin/release/v0.39.0`. The full gate stops at this step. This is not a claim
  of a fully green repository gate.
- `git diff --check`: PASS.

Read-only `woc_frontend` and `woc_test_coverage` reviews found no blocking issues.
Coverage note: pixel tests assert shipping output; the builder's invalid-input
rejection branches do not yet have dedicated automated tests. Live multiplayer,
mobile-device gameplay, and post-deploy checks are left to the user as requested.
