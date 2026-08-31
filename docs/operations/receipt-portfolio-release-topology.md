# Receipt portfolio release topology

The release coordinator is the sole writer for the primary checkout, `main`,
release tags, pushes, GitHub Pages deployment, and cross-product integration.
Product operators work concurrently only in their permanent lanes and submit
immutable candidate receipts for serialized integration.

## Permanent lanes

| Product           | Worktree                                  | Coordinator handoff         |
| ----------------- | ----------------------------------------- | --------------------------- |
| Search Receipt    | `.worktrees/search-receipt-operator`      | Immutable candidate receipt |
| Workflow Test Lab | `.worktrees/workflow-test-lab-operator`   | Immutable candidate receipt |
| SkillLedger       | `.worktrees/skillledger-operator`         | Immutable candidate receipt |
| AI Moment Index   | `.worktrees/video-moment-search-operator` | Immutable candidate receipt |

Each receipt binds a base and candidate commit, owned paths, validation and
review evidence, residual limits, and last-known-good recovery reference. The
coordinator acknowledges an accepted receipt with the integrated `main` commit
and release evidence, or returns a bounded failure packet. Only an
acknowledgement permits branch rotation from the accepted `main` head.

## Fourth-site release contract

The verification and Pages build jobs collect the controlled fixtures and run
the focused AI Moment Index build contract before the existing evidence,
mutation, deterministic-build, manifest, and atomic artifact gates. The Pages
deploy job remains dependent on a successful read-only build and retains its
existing narrowly scoped Pages and identity permissions.

After deployment, a dependent read-only public-health job checks the AI Moment
Index home route and its canonical video and moment documents. The video and
moment documents must retain the ordinary source fragment `#t=132`. Those
checks verify published routing only; they do not make a demand, usability,
measurement, creator, or revenue claim.

## Recovery boundary

The coordinator preserves the failed candidate and its evidence, restores the
last known-good release through the human-controlled host path, and rechecks
the public health routes before reopening release work. Candidate operators do
not merge, push, tag, deploy, or trigger other lanes during recovery.
