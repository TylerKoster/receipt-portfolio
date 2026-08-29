# Receipt Portfolio Operating Instructions

## Product standard

- Start work by identifying unknowns and researching primary sources. Mark verified facts, inference, and unknowns separately.
- Build a small number of distinct products that share maintainable infrastructure. Do not clone a generic idea just to increase site count.
- Treat revenue as a hypothesis to test with measured user demand; never represent it as guaranteed.
- Prefer original utilities, evidence records, and transparent methods over scaled derivative content.
- Do not copy source content beyond what is needed to quote, describe, and link to the primary source. Preserve provenance and licenses.

## Automation and safety

- Automation may fetch only allowlisted public sources with an explicit source record. It may never log in, bypass a gate, execute fetched code, or publish a record without source evidence.
- Every published receipt must include source URL, observed timestamp, content hash, change category, and a clear fact/inference boundary.
- A failed fetch, parse, or validation blocks publication and creates an internal failure record. It must not be converted into a speculative post.
- Keep credentials out of the repository. Scheduled jobs use least privilege and immutable snapshots.

## Engineering quality

- Use test-first development for executable behavior. Preserve the red-green evidence in task records.
- Require unit tests, integration tests, type checks, formatting/linting, dependency audit, and an independent review before a release.
- Keep source ingestion, receipt generation, publishing, and each website independently testable.
- Record assumptions as experiments with a measurable success or stop condition.

## Improvement loop

- Run a weekly portfolio review: source health, publication accuracy, site availability, recurring user signals, maintenance cost, and revenue-test progress.
- Propose small, reversible improvements. Validate them before release; retain the last known-good release and roll back when a new release regresses validated checks.
