# AI Moment Index product lane

## Ownership and authority

The permanent AI Moment Index product worktree is
`.worktrees/video-moment-search-operator`. Its operator owns only the product
paths assigned to the candidate: `fixtures/video-moment-search/`,
`packages/video-moment-core/`, `sites/video-moment-search/`,
`docs/video-moment-search/`, and their focused tests. Shared release workflows,
the primary checkout, `main`, release tags, pushes, and deployment remain the
serial release coordinator's authority.

An operator may prepare one immutable candidate receipt, but never merges,
pushes, tags, deploys, or triggers another product lane. Controlled fixtures
and synthetic personas are regression inputs, not demand or usability evidence.
Measurement remains discard-only and not configured; it neither transmits nor
retains events and is not evidence.

## Candidate receipt and coordinator acknowledgement

Every candidate receipt records these immutable fields:

- `product`: `video-moment-search`;
- `baseCommit` and `candidateCommit`;
- `ownedPaths` and the exact changed-path list;
- controlled fixture identifiers and source-rights verdict;
- focused, combined, evidence, build, manifest, audit, and diff-check results;
- independent-review verdicts, remaining findings, and residual limits;
- last-known-good commit, release tag when available, and build-manifest digest.

The coordinator deduplicates by `candidateCommit`, integrates one accepted
receipt at a time, reruns the combined release gates, and returns either an
acknowledgement with the accepted `main` commit and release evidence or a
bounded failure packet. A failure packet names the failed gate, exact command,
diagnostics location, candidate and base commits, and whether the previous
release remains healthy. It never authorizes the operator to bypass a gate or
publish a substitute.

## Branch rotation and recovery

After coordinator acknowledgement only, the operator preserves the candidate
branch as evidence and rotates this permanent worktree to a new branch from the
acknowledged `main` head. An unacknowledged or failed branch is preserved for
diagnosis; it is not reset, rewritten, merged, or deployed by the operator.

On a failed release or failed public-health check, preserve the candidate,
failure packet, and last-known-good release evidence. Restore the latest known
good hosted release through the coordinator's human-controlled recovery path,
then rerun the three public checks: the AI Moment Index home page,
`videos/robots-under-control/`, and `moments/moment-robots-control/`. The two
representative public documents must each retain the ordinary source media
fragment `#t=132`. The controlled corpus contains one admitted moment; no lane
work invents a second moment or downloads/scrapes media.
