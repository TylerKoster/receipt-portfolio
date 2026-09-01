# Automation and rollback

> Historical topology notice (2026-09-01): the independent four-lane operator
> model below is superseded by `receipt-portfolio-release-topology.md` and
> `../product/2026-09-01-video-library-service-strategy.md`. Only the video
> library service lane and serial release coordinator remain active. Search
> Receipt and SkillLedger are parked; Workflow Test Lab is retired from active
> development. The collection, publication, verification, and rollback
> mechanics in this document remain current unless the newer topology states
> otherwise.

## Operator and workflow roles

The portfolio uses four permanent checkouts with single-writer ownership:

- the Search Receipt operator owns `.worktrees/search-receipt-operator` and only
  Search Receipt product paths;
- the Workflow Test Lab operator owns
  `.worktrees/workflow-test-lab-operator` and only Workflow Test Lab product
  paths;
- the SkillLedger operator owns `.worktrees/skillledger-operator` and only
  SkillLedger product paths;
- the release coordinator alone owns the primary checkout and `main`.

Each product operator may run concurrently in its own permanent worktree. A
worktree uses a new branch from the latest accepted `main` for each integration
cycle; the prior branch remains available as evidence. A product operator never
merges, pushes, deploys, or edits shared platform files. It emits an immutable
integration receipt containing the base commit, candidate commit, owned paths,
test evidence, reviewer verdict, and residual limits.

Integration is event-driven and serial. A completed product receipt wakes the
release coordinator; product operators do not trigger one another. The
coordinator deduplicates receipts by candidate commit, integrates one candidate
at a time, runs the combined release gates, deploys a passing `main`, and sends
an acknowledgement or bounded failure packet to the originating operator. Only
after that acknowledgement does the operator rotate its permanent worktree to a
new branch from the accepted release head. The hourly schedules are recovery
polls, not the primary handoff mechanism.

The release coordinator contains source or verification failures, preserves
last-good output, and publishes only source-bound `PASS` records while holding
ambiguous records. It stops only for missing credentials, host, external
authority, or an irreversible or security-sensitive choice without safe
rollback.

That hourly Codex heartbeat is local orchestration intent. It does not prove
that GitHub Actions ran, that a hosting provider received a build, or that a
public site is available. Those systems require their own run records and
provider evidence.

The repository defines three GitHub Actions workflows:

- `.github/workflows/verify.yml` runs on pushes and pull requests. It installs
  locked dependencies, runs static and formatting checks plus the full and
  integration suites, collects and verifies the exact nonempty controlled
  example inventory, runs the mutation gate, and compares two clean build
  manifests with read-only contents permission.
- `.github/workflows/collect-dry-run.yml` runs each Monday at 07:17 UTC and by
  manual dispatch. It performs bounded public-source observation, uploads the
  sanitized report even when a source fails, restores the failure status, and
  has read-only contents permission. It does not commit, push, deploy, or change
  evidence.
- `.github/workflows/deploy-pages.yml` is the separate production adapter. It
  runs only on a push to `main` or manual dispatch, repeats the locked install,
  static check, full test, controlled collection, exact verification, mutation,
  production-base build, and build-manifest gates, then uploads only
  `dist/sites/`. Its build job is read-only; its dependent deploy job receives
  only the GitHub Pages and identity permissions required to deploy the
  artifact.

## Collection boundary

Scheduled collection is read-only and dry-run only. It fetches only enabled,
allowlisted public HTTPS source manifests through the bounded source fetcher and
writes a sanitized report to `artifacts/dry-run-live-report.json`. It does not
normalize source bytes, change the evidence ledger, create a receipt, render a
site, publish content, or use a repository credential.

Each source is reported independently. A timeout, redirect, unsafe media type,
oversized response, non-success status, invalid address boundary, or disabled
manifest produces a `FAILED` report entry. Controlled fixture-example and other
non-live modes are explicitly `SKIPPED` and never fetched by scheduled live
collection. The run continues to report remaining sources, uploads the report,
and finishes with a failure status if any runnable source failed.

## Publication boundary

Automated public output may come only from locally verified, append-only
receipts that pass the evidence and publication gates. Hosting is a separate
release path and is not part of scheduled collection. The Pages workflow is a
code-level adapter, not proof that its host, repository settings, workflow run,
artifact, deployment, or public response has been verified.

The production paths are:

- `https://tylerkoster.github.io/receipt-portfolio/search-receipt/`;
- `https://tylerkoster.github.io/receipt-portfolio/workflow-test-lab/`;
- `https://tylerkoster.github.io/receipt-portfolio/skill-ledger/`.

GitHub Pages deployment run `33285717928` passed on 2026-08-29. The portfolio
root and all three product paths subsequently returned HTTP 200. Hosted status
must still be rechecked after every release; this receipt is not a promise of
future availability.

## Failure containment

Stop and contain on any source-collection, receipt-verification, test, static
check, or build failure. Preserve the failure report and raw diagnostic status,
but do not convert failed or ambiguous input into a public record. Investigate
the source manifest and parser boundary locally, rerun the complete validation
suite, and resume only from a verified state.

The last-good static release and its recovery state must remain available while
a failed candidate is investigated. Never repair a release by rewriting,
renaming, deleting, or silently replacing an existing receipt.

The static builder owns only its requested output, its temporary staging
directories, and a specifically authenticated recovery sibling:

- public output: `dist/sites/`;
- temporary staging: `dist/.sites-stage-*`;
- recovery sibling: `dist/sites.previous/`, but only when its real,
  non-symbolic `.receipt-portfolio-backup-owner.json` marker exactly identifies
  this builder, marker format, canonical output parent, canonical output path,
  and canonical recovery path.

An absent, malformed, symbolic, or mismatched owner marker makes the recovery
sibling unowned. The builder refuses recursive cleanup and preserves both the
public and recovery trees. `evidence/`, `dist/runtime/`, and `artifacts/` are not
builder recovery directories.

## Safe rollback

Rollback restores the previously verified static build or hosted release. It
does not rewind, mutate, or regenerate the append-only receipt ledger. Preserve
the failed candidate and its validation record separately, restore the
last-good release through the host's human-controlled release mechanism, and
then verify the restored pages before reopening the release path.

Record the exact last-known-good commit, annotated release tag when one exists,
and public build-manifest digest in the release evidence. To recover locally,
create a clean checkout or worktree at that exact commit or tag, run `npm ci`,
collect and verify the controlled fixtures, rebuild, and confirm the recorded
manifest digest. Do not reset the failed working tree or rewrite receipts as a
rollback shortcut. Release tags `v0.1.0` and later identify reviewed public
release points; use the newest tag whose workflow and hosted-response evidence
both passed.

## External hosting status

The public repository is `TylerKoster/receipt-portfolio`. GitHub Pages is
configured for workflow deployment with enforced HTTPS. A successful workflow
and HTTP checks are both required for a release receipt; local builds, Codex
heartbeats, and workflow source checks alone do not satisfy hosted verification.
