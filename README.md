# Receipt Portfolio

Receipt Portfolio is a local static release candidate for three source-bound
products that share one evidence engine. The public build uses authenticated
controlled examples; scheduled dry-run manifests separately admit approved
official Search sources without publishing them:

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

The fixture collection command creates append-only raw and normalized objects,
canonical manifest snapshots, and linked local receipt files. Verification
checks strict schemas, exact paths and inventory, object bytes, admitted
manifest bindings, recomputed publication policy, source-local sequence and
correction semantics, and canonical receipt bytes. The build command compiles
runtime code into `dist/runtime/` and replaces the complete public tree at
`dist/sites/` only beneath a verified canonical parent. The manifest command
prints one SHA-256 digest for the exact sorted public file inventory;
unexpected, missing, or symbolic entries fail the command.

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
  `evidence/objects/` contains exact raw bytes and canonical normalized JSON;
  `evidence/manifests/` contains the canonical admitted manifest snapshots
  bound by those receipts. Existing objects and receipts are never repaired by
  rewriting them.
- `dist/runtime/` contains compiler output and command implementations. It is
  not public site output.
- `dist/sites/` contains each site's home, methodology, source list,
  receipt-detail, topic, sitemap, robots, and stylesheet surfaces. The build
  manifest hashes only this strict, nonempty public inventory.
- `artifacts/` contains internal run reports such as the live-source dry-run;
  those reports are not receipts and are not public site records.

Only source-bound records with an explicit recomputed `PASS` gate decision
render. Controlled fixtures can pass only through authenticated
`fixture-example` mode and are labeled as non-live examples on every public
surface. Disabled and hold-only manifests cannot yield production `PASS`
receipts. `REVIEW_REQUIRED` and `REJECTED` records stay out of public output.
Fetched material is treated as hostile data, never executed, and never rendered
as source HTML.

## Release status

This is a validated local release candidate. It is not publicly hosted: no
hosting provider, deployment remote, or deployment credential is configured.
