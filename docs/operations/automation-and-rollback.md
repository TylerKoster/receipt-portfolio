# Automation and rollback

## Operator and workflow roles

The active hourly autonomous operator inspects the implementation ledger, Git
state, and last-known-good commit; continues the next incomplete bounded task
through implementer/review/fix gates; runs deterministic tests, checks, evidence
verification, and builds; commits only passing tasks; attempts configured static
deployment only after release gates; contains source or verification failures,
preserves last-good output, and publishes only source-bound `PASS` records while
holding ambiguous records. It stops only for missing credentials, host, external
authority, or an irreversible or security-sensitive choice without safe
rollback.

That hourly Codex heartbeat is local orchestration intent. It does not prove
that GitHub Actions ran, that a hosting provider received a build, or that a
public site is available. Those systems require their own run records and
provider evidence.

The repository defines two GitHub Actions workflows:

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
release path and is not part of scheduled collection. The current external
prerequisite is human setup and verification of the intended host and account;
until that exists, the repository has no deployment path or credential.

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
rollback shortcut. A release candidate without a reviewed tag can be recovered
only by its exact commit; `v0.1.0` remains unavailable until the whole-branch
review and controller validation authorize tagging.

## External hosting prerequisite

No hosting provider, deployment remote, account, or deployment credential is
configured in this repository. Human selection and verification of the host,
account, remote, least-privilege credential, and rollback mechanism are required
before any static deployment may be attempted. Local builds, Codex heartbeats,
and GitHub verification do not satisfy that prerequisite.
