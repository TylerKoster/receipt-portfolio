# Receipt Portfolio

Receipt Portfolio now operates one active commercial product direction with
three preserved legacy surfaces. The active managed-pilot experiment is a
video-library indexing service; AI Moment Index is its working public proof.
The prior products remain preserved as legacy public demonstrations without an
active availability SLA while their strongest infrastructure is absorbed
through reviewed changes rather than continued as separate businesses:

- **Video Library Indexing Service / AI Moment Index** is the active product.
  It is being expanded from a rights-bounded exact-moment search proof into an
  owner-authorized library service with private cited retrieval, creator review,
  optional public discovery, corrections, synchronization, and measurable
  commercial pilots.
- **Search Receipt** is parked as a standalone product. Its source observation,
  correction, feed, and evidence capabilities are candidates for video-library
  health and source-drift monitoring.
- **Workflow Test Lab** is retired from active development and retained as a
  legacy public demonstration. Its deterministic fixtures and negative tests
  are candidates for an internal Retrieval QA Lab.
- **SkillLedger** is parked as a standalone product. Its immutable-source,
  license, allowlist, and no-execution controls are candidates for connector and
  rights admission.

The disposition, customer, commercial offer, product gates, and stop rules are
recorded in `docs/product/2026-09-01-video-library-service-strategy.md`.

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

The accepted repository release is `v0.1.70` at `024c497`. The shipped proof
retains the deterministic `robots control` to `moment-robots-control` flow and
the stored `#t=132` destination contract. Repository acceptance is not current
public-health, indexing, customer, demand, conversion, or revenue evidence;
those outcomes require their own observed records. The service strategy is
forward-looking and does not imply that private multi-tenant ingestion, cited
answers, synchronization, or paid-pilot operation has already shipped.
