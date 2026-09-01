# Receipt portfolio release topology

This document is the current authority for the one-product operating model and
the preserved legacy lanes. It supersedes the older equal four-product model.
The collection and rollback mechanics in `automation-and-rollback.md` remain
applicable unless this topology states otherwise.

The release coordinator is the sole writer for the primary checkout, `main`,
release tags, pushes, GitHub Pages deployment, and cross-product integration.
The video-library service operator submits immutable candidate receipts for
serialized integration. The three legacy lanes remain preserved but paused;
they do not independently generate product features or releases.

## Permanent lanes

| Lane                                                   | Worktree                                  | State                                                      | Role                                                                                    |
| ------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Video Library Indexing Service / AI Moment Index proof | `.worktrees/video-moment-search-operator` | Active                                                     | Commercial product and immutable candidate receipts                                     |
| Search Receipt                                         | `.worktrees/search-receipt-operator`      | Parked                                                     | Source, correction, feed, and drift capabilities available for reviewed absorption      |
| Workflow Test Lab                                      | Preserved history and fixtures            | Active development retired; legacy demonstration preserved | Internal retrieval QA assets available for reviewed absorption                          |
| SkillLedger                                            | `.worktrees/skillledger-operator`         | Parked                                                     | Source, license, allowlist, and no-execution controls available for reviewed absorption |

Each active-product receipt binds a base and candidate commit, owned paths,
validation and review evidence, residual limits, and last-known-good recovery reference. The
coordinator acknowledges an accepted receipt with the integrated `main` commit
and release evidence, or returns a bounded failure packet. Only an
acknowledgement permits branch rotation from the accepted `main` head.

## Active-service release contract

The verification and Pages build jobs collect the controlled fixtures and run
the focused video-library/AI Moment Index build contract before the existing evidence,
mutation, deterministic-build, manifest, and atomic artifact gates. The Pages
deploy job remains dependent on a successful read-only build and retains its
existing narrowly scoped Pages and identity permissions.

After deployment, a dependent read-only public-health job checks the AI Moment
Index home route and its canonical video and moment documents. The video and
moment documents must retain the ordinary source fragment `#t=132`. Those
checks verify published routing only; they do not make a demand, usability,
measurement, creator, or revenue claim.

## Legacy-lane absorption boundary

Reusable code does not move merely because a legacy lane is parked. An active
service or shared-infrastructure candidate must name the exact capability,
preserve its evidence and security boundaries, add customer-relevant tests, and
pass independent review. Legacy public positioning, experiment ledgers, and
revenue hypotheses are not inherited by the active product.

Legacy code, artifacts, and released routes are preserved, but they do not have
an active availability SLA. The coordinator may use a minimal home-route check
to detect a shared deployment regression; that check does not reactivate a
legacy product or authorize feature work.

## Recovery boundary

The coordinator preserves the failed candidate and its evidence, restores the
last known-good release through the human-controlled host path, and rechecks
the public health routes before reopening release work. The active candidate
operator does not merge, push, tag, deploy, or trigger a legacy lane during
recovery.
