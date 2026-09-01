# Video Library Indexing Service / AI Moment Index lane

This lane contract implements
`../product/2026-09-01-video-library-service-strategy.md` under the release
authority in `receipt-portfolio-release-topology.md`. Those documents supersede
the earlier three-moment-only product boundary. AI Moment Index remains the
public proof; the active product direction is an owner-authorized video-library
indexing service.

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
The currently shipped measurement adapter remains discard-only and not
configured. A later privacy-reviewed measurement adapter requires an explicit
event schema, notice and consent decision, retention/deletion policy, access
boundary, deterministic tests, and coordinator integration. Until that gate
passes, no transmitted or retained product event may be inferred.

## Private-library authority and security gate

No customer or pilot content may be ingested from a source, storage location,
account, transcript, caption, or media package until a reviewed contract binds:

- customer and source-owner authority;
- speaker, guest, likeness, voice, transcript, caption, thumbnail, embed,
  excerpt, and publication authority where applicable;
- admitted private and public fields;
- any external transcription, embedding, model, analytics, storage, or backup
  processor and permitted data egress;
- tenant isolation, authentication, authorization or inherited ACLs,
  encryption, retention, backups, export, query/event retention, and incident
  handling;
- verified revocation, correction, customer termination, source deletion, cache
  invalidation, derived-data deletion, and downstream public-removal behavior.

Authority over a channel or folder is not authority over every speaker,
transcript, derivative, processor, or publication surface. Unclear authority is
held private or rejected; it is never inferred from public availability.

## Retrieval and answer-grounding gate

Retrieval and generated answers are evaluated separately. Every factual answer
span must bind to admitted source, source version, and exact time evidence. The
service abstains when evidence is absent, insufficient, conflicting, stale,
revoked, corrected, removed, or outside the admitted customer boundary.

Corrections, supersession, revocation, and deletion must propagate to private
search, generated answers, caches, exports, feeds, sitemaps, and public pages.
The deterministic benchmark includes expected retrieval, exact timestamp,
abstention, contradiction, correction, supersession, access denial, revocation,
and deletion cases. A correct link alone does not prove that an answer is
supported.

## Heartbeat and bounded recovery

The AI Moment Index operator runs an hourly recovery and experiment-progress
poll. It is subordinate to the event-driven immutable-candidate-receipt handoff:
a completed candidate wakes the serial release coordinator rather than waiting
for the next hourly poll. The heartbeat may inspect its own lane's source,
fixture, experiment, validation, and failure state, but cannot trigger, modify,
or take authority over another lane.

A blocker creates a bounded failure packet for only the blocked operation. It
does not halt unrelated safe work: the operator continues the next safe,
rights-bounded experiment or recovery check while preserving the blocked
operation and its evidence for coordinator review.

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
fragment `#t=132`. Those recovery checks identify the last-known-good original
three moments: robots control at `#t=132`, the KI-Campus generative-AI interface
at `#t=18`, and the World Economic Forum industry/society panel at `#t=75`.

The accepted rights-reviewed proof corpus contains ten moments: 3 established
plus 7 authorized additions. The additions are the robots-outsmart question at
`#t=20`, robot visual learning at `#t=300`, robot reward learning at `#t=435`,
medical-AI hospital setting at `#t=5`, symptom inputs at `#t=25`, decision paths
at `#t=50`, and clinician-patient communication at `#t=80`. Additional records
are permitted only through the private-library authority, security, evidence,
and publication gates above plus explicit coordinator authority. The lane never
scrapes unauthorized transcripts, downloads audiovisual media without explicit
authority, infers rights, or performs an unplanned admission.
