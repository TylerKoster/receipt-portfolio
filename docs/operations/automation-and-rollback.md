# Automation and rollback

## Collection boundary

Scheduled collection is read-only and dry-run only. It fetches only enabled,
allowlisted public HTTPS source manifests through the bounded source fetcher and
writes a sanitized report to `artifacts/dry-run-live-report.json`. It does not
normalize source bytes, change the evidence ledger, create a receipt, render a
site, publish content, or use a repository credential.

Each source is reported independently. A timeout, redirect, unsafe media type,
oversized response, non-success status, invalid boundary, or disabled manifest
produces a `FAILED` report entry. The run continues to report the remaining
sources, uploads the report artifact, and finishes with a failure status if any
source failed.

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

## Safe rollback

Rollback restores the previously verified static build or hosted release. It
does not rewind, mutate, or regenerate the append-only receipt ledger. Preserve
the failed candidate and its validation record separately, restore the
last-good release through the host's human-controlled release mechanism, and
then verify the restored pages before reopening the release path.
