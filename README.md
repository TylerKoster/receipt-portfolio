# Receipt Portfolio

Receipt Portfolio is a local static release candidate for four distinct,
source-bound products that share maintainable release infrastructure. The
first three products are controlled evidence demonstrations built from
authenticated fixtures; scheduled dry-run manifests separately admit approved
official Search sources without publishing them:

- **Search Receipt** records confirmed source changes for independent site
  owners without claiming that ordinary search movement proves a platform
  update.
- **Workflow Test Lab** presents original, fixture-checked workflow recipes and
  their limits; it is not a universal benchmark or copied prompt directory.
- **SkillLedger** presents non-executing metadata about repository-hosted skill
  packages; it does not install, run, trust, certify, or rank them.
- **AI Moment Index** is a working rights-bounded search utility that returns
  reviewed moments and routes each result to the stored integer timestamp in
  its ordinary source URL. Its current corpus remains a narrow reviewed
  example, not evidence of creator demand, nationwide coverage, or revenue.

## Local commands

Use Node.js 24 and the locked dependency graph:

```powershell
npm ci
npm run evidence -- collect-fixtures
npm run evidence -- verify --all
npm run build
npm run build:manifest
```

The build defaults to the local placeholder base
`https://receipt-portfolio.example/`. A production-shaped local build uses the
strict CLI environment adapter:

```powershell
$env:RECEIPT_PORTFOLIO_BASE_URL='https://tylerkoster.github.io/receipt-portfolio/'
npm run build
```

The adapter accepts only an absolute HTTPS URL without userinfo, query, or
fragment and normalizes it to one trailing slash. It is a build input; source
and receipt data cannot select or alter it.

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
- `dist/sites/` contains the root portfolio hub and discovery files plus four
  product directories. The first three products expose their controlled
  receipt, methodology, source, topic, sitemap, robots, and stylesheet
  surfaces. AI Moment Index exposes its search assets, evidence-safe canonical
  video, moment, and creator pages, normal sitemap, and exact-moment Atom feed.
  The hub is a deployment shell, not an additional evidence product. The build
  manifest hashes only this strict, nonempty public inventory and requires all
  four product directories plus root `robots.txt` and root `sitemap.xml`.
- `artifacts/` contains internal run reports such as the live-source dry-run;
  those reports are not receipts and are not public site records.

Only source-bound records with an explicit recomputed `PASS` gate decision
render. Controlled fixtures can pass only through authenticated
`fixture-example` mode and are labeled as non-live examples on every public
surface. Disabled and hold-only manifests cannot yield production `PASS`
receipts. `REVIEW_REQUIRED` and `REJECTED` records stay out of public output.
Fetched material is treated as hostile data, never executed, and never rendered
as source HTML.

AI Moment Index admits only reviewed creator-supplied, creator-authorized,
public-domain, or explicitly licensed metadata and timed-caption packages. The
accepted boundary does not authorize hosting, embedding, or distributing media,
and public availability is never inferred to be permission. Absent source
fields stay absent: no video sitemap is emitted until reviewed evidence supplies
a stable thumbnail and an authorized player or embed location.

## Release status

The repository contains a gated GitHub Pages production adapter for these four
paths:

- `https://tylerkoster.github.io/receipt-portfolio/search-receipt/`
- `https://tylerkoster.github.io/receipt-portfolio/workflow-test-lab/`
- `https://tylerkoster.github.io/receipt-portfolio/skill-ledger/`
- `https://tylerkoster.github.io/receipt-portfolio/video-moment-search/`

The AI Moment Index route and its accepted v0.1.36 behaviors are released and
were publicly verified: the fixed query `robots control` returns
`moment-robots-control`, source navigation preserves the stored integer
timestamp `#t=132`, canonical moment discovery and the normal sitemap/feed are
available, and `video-sitemap.xml` is intentionally absent. This Task 6 branch
only prepares the next atomic four-product build candidate; a local
production-base build is not evidence that its new root discovery files have
been deployed.
