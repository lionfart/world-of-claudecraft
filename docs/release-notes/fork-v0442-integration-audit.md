# Fork v0.44.2 integration audit

Historical integration record, 2026-10-01. The user requested the upstream
release without replacing the latest fork features or resetting test data.

## Parents and preservation

- Fork base: `913cdd0747`, the latest `integrate/v0440-full` checkout.
- Upstream release: `v0.44.2`, `4ff6cb0863`. No v0.45 branch was used.
- Integration checkout: `woc-upstream-v0442-safe`, branch `integrate/v0442-safe`.
- Territory siege simulation, castle visuals, portals, notifications and custom
  UI remain on the fork implementation. Territory prediction dependencies are
  retained alongside the upstream rift-lift dependency.
- Directional and vertical projectile aim, targetless attacks, authored VFX,
  triangular Winterlash darts, mobile casting, skill previews and dodge remain.
- Donation markup, wallet/economy configuration and the locale-entry fallback
  are retained. No database reset, character copy or wallet migration is made.

## Remediation

The previous v0.44.0 movement extraction omitted `advancePlayerDodge` from the
movement driver. `advanceExclusiveMovement` now restores the ancestor's ordering,
horizontal dodge advance, gravity settling and early return. Vanguard movement
tests now distinguish the fork's mobile ordinary spells from stationary long
channels. Vault portal admission is evaluated only after the proximity check,
with a regression test proving distant players do not trigger admission reads.

Conflict resolutions preserve the fork HTML and combine imports/dependencies,
while accepting upstream release metadata, legal-link behavior and content.
Item-art fingerprints and persistence-size fixtures reflect the combined tree.

## Verification and limits

- Frozen pnpm installation, locale generation, typechecks, server build and
  client build passed. Locale generation reported no stale output.
- The final preservation run passed 774 tests across 80 suites. Two suites and
  17 tests requiring database integration were skipped; no disposable test
  database was supplied.
- Architecture, world API parity, movement, dodge, Vanguard, professions blob
  and masterwrought checks passed in the focused resolution run. The final
  item-art consistency repair passed in the preservation run.
- Explicit Biome checking of the actual changed files passed with warnings.
- Item-art machine verification passed. Two builder cleanup tests encountered
  Windows temporary-file EPERM errors; they are not claimed as passes.
- Static supply-chain scanning and specialist merge/database/hot-path reviews
  found no confirmed new issue after remediation. Static review is not a
  runtime package-sandbox audit.
- Both full and selective gates were invoked. The selective planner fell back
  to the full suite. Both were stopped after reproducing existing guard failures,
  not completed or reported green. The old fork independently reproduces the
  same nine client-shell assertions and two monolith-budget failures. No gate,
  budget or assertion was disabled to conceal them.
- Live gameplay/browser acceptance is delegated to the user as requested.
  Real PostgreSQL reward/flair integration and full-gate completion remain open.

Verdict: suitable for an isolated user test preview, not a green release gate.
Keep the integration branch separate from `main` until follow-up acceptance.
