# Receipt Portfolio

Receipt Portfolio is a fixture-backed, local static release candidate for three
source-bound products that share one evidence engine:

- **Search Receipt** records confirmed source changes for independent site
  owners without claiming that ordinary search movement proves a platform
  update.
- **Workflow Test Lab** presents original, fixture-checked workflow recipes and
  their limits; it is not a universal benchmark or copied prompt directory.
- **SkillLedger** presents non-executing metadata about repository-hosted skill
  packages; it does not install, run, trust, certify, or rank them.

## Local commands

Use Node.js 24 and the locked dependency graph:

```powershell
npm ci
npm run evidence -- collect-fixtures
npm run evidence -- verify --all
npm run build
npm run build:manifest
```

The fixture collection command creates append-only local receipt files. The
verification command checks their canonical bytes, payload digest, and
filename contract. The build command compiles runtime code into `dist/runtime/`
and replaces the complete public tree at `dist/sites/`. The manifest command
prints one SHA-256 digest for the exact sorted public file inventory; unexpected
roots, files, or symlinks fail the command.

Run the isolated mutation check after collecting fixtures:

```powershell
npm run evidence -- test-mutation
```

Run a bounded live-source observation without publishing or changing evidence:

```powershell
npm run evidence -- dry-run-live
```

That last command is the only command above that requests public network
sources. It writes a sanitized observation report to
`artifacts/dry-run-live-report.json` and exits nonzero if any configured source
fails. It does not create receipts or rebuild public output.

## Evidence and output boundaries

- `fixtures/` contains controlled local test inputs. Fixture success is not
  live source truth, current source health, deployment proof, or provider
  readiness.
- `evidence/receipts/` contains generated append-only local receipts.
  `evidence/objects/` and `evidence/indexes/` are reserved generated evidence
  locations. Existing receipts are never repaired by rewriting them.
- `dist/runtime/` contains compiler output and command implementations. It is
  not public site output.
- `dist/sites/` contains exactly the six static public files for the three
  sites. The build manifest hashes only this strict public inventory.
- `artifacts/` contains internal run reports such as the live-source dry-run;
  those reports are not receipts and are not public site records.

Only source-bound records with an explicit `PASS` gate decision render in the
static sites. `REVIEW_REQUIRED` and `REJECTED` records stay out of public output.
Fetched material is treated as hostile data, never executed, and never rendered
as source HTML.

## Release status

This is a validated local release candidate. It is not publicly hosted: no
hosting provider, deployment remote, or deployment credential is configured.
