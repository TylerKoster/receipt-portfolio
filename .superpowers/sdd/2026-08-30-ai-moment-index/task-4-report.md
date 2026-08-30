# Task 4 recovery implementer report

## Status

PASS — locally verified integration candidate only. No merge, push, tag, deploy, fetch/rebase, network source, transcript scrape, media download, ingestion port, or other lane edit was performed.

- Branch: `ops/video-moment-search-cycle-20260830-02`
- Starting base and pre-commit HEAD: `0ac06f1161e598056b3d8b6b1e84e85b680e724e`
- Reviewed port source: `61014ed8e55809afe6bef1eae03c20480a18e012`
- Final candidate commit: reported by the implementer after this report is committed.

## Exact reviewed port

All seven allowed paths were restored byte-for-byte from `61014ed8e55809afe6bef1eae03c20480a18e012`; `git hash-object` matched the source commit blob for every path:

- `fixtures/video-moment-search/authorized-ai-video-v1.json`
- `packages/video-moment-core/package.json`
- `packages/video-moment-core/src/contracts.test.ts`
- `packages/video-moment-core/src/contracts.ts`
- `packages/video-moment-core/src/index.ts`
- `packages/video-moment-core/src/search.test.ts`
- `packages/video-moment-core/src/search.ts`

No Task 3 ingestion, manifests, quarantine, evidence-core, shared timeout, or unrelated cycle-01 path was ported.

## RED evidence

1. Ported focused baseline:

   `npm test -- --run packages/video-moment-core/src/contracts.test.ts packages/video-moment-core/src/search.test.ts`

   Result: exit 0; 2 files and 23 tests passed.

2. Public-surface RED:

   `npm test -- --run sites/video-moment-search/site.test.ts`

   Result: expected exit 1; suite failed because `./render.js` did not exist.

3. Atomic-build RED:

   `npm test -- --run test/integration/video-moment-search-build.test.ts`

   Result: expected exit 1; suite failed because `../../sites/video-moment-search/search-client.js` did not exist.

4. First combined GREEN:

   `npm test -- --run sites/video-moment-search/site.test.ts test/integration/video-moment-search-build.test.ts`

   Result: exit 0; 2 files and 12 tests passed.

5. Full-suite integration regression found and corrected:

   `npm test -- --run`

   Initial result: 297 passed, 1 failed. The existing isolated compiled-runtime test copied legacy non-TypeScript assets but not the new controlled fixture/style, causing `ENOENT` for `fixtures/video-moment-search/authorized-ai-video-v1.json`.

   Corrective result:

   `npm test -- --run test/integration/site-build.test.ts`

   Exit 0; all 28 atomic/production builder tests passed after the isolated-runtime packaging fixture copied the two new required non-TypeScript assets.

## Final fresh gates

- Focused contract/search/site: `npm test -- --run packages/video-moment-core/src/contracts.test.ts packages/video-moment-core/src/search.test.ts sites/video-moment-search/site.test.ts` → exit 0; 3 files, 33 tests passed.
- Focused integration: `npm test -- --run test/integration/video-moment-search-build.test.ts` → exit 0; 1 file, 2 tests passed.
- Static check: `npm run check` → exit 0; TypeScript and ESLint passed.
- Full suite: `npm test -- --run` → exit 0; 28 files, 298 tests passed.
- Production build prerequisite: `npm run evidence -- collect-fixtures` and `npm run evidence -- verify --all` → exit 0 using only committed local fixtures.
- Production build: `npm run build` → exit 0.
- Whitespace gate: `git diff --check` → exit 0; only Git's existing LF-to-CRLF working-copy warnings were printed.

## Built behavior proof

The production CLI build emitted:

- `dist/sites/video-moment-search/index.html` — 4,732 bytes
- `dist/sites/video-moment-search/search-index.json` — 875 bytes
- `dist/sites/video-moment-search/search-client.js` — 5,226 bytes
- `dist/sites/video-moment-search/styles.css` — 2,918 bytes

Behavioral inspection of the emitted index through the compiled public search function produced:

- Query: `agent evaluation`
- First moment: `moment-agent-evals`
- Anchor: `https://video.example/watch/agent-evals?t=132`
- Every emitted result: parsed `t` equals the stored integer `startSeconds`; fixed fixture proof was `stored=132`, `anchor=132`, `equal=true`.

The route includes an explicit label, Enter/button form submission, `aria-live`, visible-focus and narrow-screen CSS, reduced-motion handling, server-rendered initial results, deterministic empty/zero/error recovery, text-only client rendering, malformed URL rejection, and no query URL/storage/telemetry state.

## Experiment evidence

`sites/video-moment-search/product-experiment-ledger.json` records:

- Classification: `SIMULATED_HEURISTIC_REGRESSION_EVIDENCE`
- Baseline: production route returned 404 before this candidate.
- Target: 100% deterministic fixed-flow completion; expected moment in the top three; zero timestamp landing error.
- Stop rule: stop if any result lacks validated rights or exact source-time routing.
- Boundary: simulated-user results are heuristic regressions, not usability or demand evidence; no user, demand, or revenue measurement exists.

## Changed path inventory

Task 4 additions:

- `sites/video-moment-search/index.ts`
- `sites/video-moment-search/search-client.ts`
- `sites/video-moment-search/render.ts`
- `sites/video-moment-search/styles.css`
- `sites/video-moment-search/site.test.ts`
- `sites/video-moment-search/product-experiment-ledger.json`
- `test/integration/video-moment-search-build.test.ts`

Minimal existing-path wiring:

- `scripts/build-sites.ts`
- `sites/shared/render.ts`
- `test/integration/site-build.test.ts`

Required report:

- `.superpowers/sdd/2026-08-30-ai-moment-index/task-4-report.md`

The three receipt sites retain their existing nonempty accepted-evidence loop and atomic staging/replacement. Direct `buildSites` callers default to the legacy three-site output; the production CLI and explicit experiment option emit the fourth route.

## Residual limits and concerns

- This is a local integration candidate over one explicit local-test-license fixture, not a live creator library, creator permission claim, public source, deploy, or production readiness.
- `video.example` is a controlled example URL; the build does not establish a reachable public destination.
- No real users, assistive-technology session, usability result, demand, conversion, or revenue evidence exists. Automated semantic/accessibility assertions are not a WCAG conformance claim.
- No Task 3 ingestion or live source admission exists; adding any result requires the existing corpus validator to accept rights coverage and exact source-time routing.
- The production build requires the repository's documented local receipt collection/verification precondition because accepted main intentionally contains only `evidence/.gitkeep`.
- An initial mechanical patch targeted the generated chat workspace because the patch tool ignored the shell workdir. Those exact accidental files were removed before implementation; final checks confirmed both accidental paths absent and all task files confined to this worktree.

## Independent-review fix round 1

### Heads and scope

- Old candidate head: `10388c3ef26d481e7e20cdbca0c97ab24fc6a2f1`
- Passing executable-fix head: `99c505794072e2bb92cc6c0bba262b0a98c31140`
- Exact executable paths changed:
  - `sites/video-moment-search/search-client.ts`
  - `sites/video-moment-search/site.test.ts`
- This report is the only additional documentation path changed after the executable-fix commit.

No other product lane, package, fixture, builder, ingestion, evidence-core, or shared path changed in this fix round.

### RED evidence

Command:

`npm test -- --run sites/video-moment-search/site.test.ts`

Result: expected exit 1; 10 existing tests passed and all 5 new shipped-payload regressions failed:

- Submitted `agent evaluation` rendered no client article or anchor.
- Shipped result order was empty instead of helper phrase-bonus order.
- Wrong-shaped loaded JSON left the error state hidden.
- A pre-load fallback remained visible after later valid loading.
- A controlled submit-time DOM write error escaped uncaught.

The runtime harness executes the exact `VIDEO_MOMENT_SEARCH_CLIENT` string in `node:vm` with deterministic DOM and deferred-fetch doubles; it does not test a reimplemented search helper and adds no runtime dependency.

### GREEN behavior evidence

Focused site command:

`npm test -- --run sites/video-moment-search/site.test.ts`

Result: exit 0; 1 file and 15 tests passed. The exact shipped payload now proves:

- Typed/submitted `agent evaluation` renders `moment-agent-evals` first.
- Its ordinary anchor href is exactly `https://video.example/watch/agent-evals?t=132`.
- Unicode property and whitespace regexes tokenize the binding query at runtime.
- Phrase bonuses and deterministic video-slug/start-second/moment-ID tie breakers match the exported helper/core contract for the multi-entry reorder fixture.
- Every public-index field used by rendering is validated before the index is accepted.
- Wrong-shaped, partially malformed, invalid source, and invalid timestamp entries enter the actionable fallback rather than a genuine zero-result or uncaught submit error.
- A pre-load fallback clears after a later valid fetch, and the fixed query then completes.
- Unexpected submit-time rendering errors enter the same fallback while the server-rendered initial-result sentinel remains unchanged.
- Query text remains absent from URLs, storage, and telemetry.

### Final fresh fix-round gates

- Focused site runtime: `npm test -- --run sites/video-moment-search/site.test.ts` → exit 0; 15/15 passed.
- Focused atomic integration: `npm test -- --run test/integration/video-moment-search-build.test.ts` → exit 0; 2/2 passed.
- Static check: `npm run check` → exit 0; TypeScript and ESLint passed.
- Full suite: `npm test -- --run` → exit 0; 28 files and 303 tests passed.
- Production build: `npm run build` → exit 0.
- Emitted syntax: `node --check dist/sites/video-moment-search/search-client.js` → exit 0.
- Emitted/tested equality probe: built `search-client.js` was byte-equal to `VIDEO_MOMENT_SEARCH_CLIENT`; emitted token and whitespace regex checks were true.
- Working diff: `git diff --check` → exit 0 before the executable-fix commit, with only Git LF-to-CRLF warnings.

### Fix-round residuals and repository state

- The deterministic `node:vm` harness validates shipped payload behavior but is not a real-browser, assistive-technology, usability, or WCAG-conformance result.
- All original fixture-only, no-live-library, no-permission, no-deploy, no-demand, and no-revenue limits remain unchanged.
- After the executable-fix commit, the local remote-tracking comparison showed the branch `ahead 2, behind 1`; no fetch, rebase, merge, or reconciliation was performed because those actions are outside this task's authority.

## Independent-review fix round 2

### Heads and exact paths

- Old round-2 head: `d3c33860600416b09f7617373fabc11cf3cc838c`
- Passing round-2 executable head: `78354cdb5f26bc87d08590afa33c2bbe7f81e4e8`
- Exact executable/test paths changed:
  - `sites/video-moment-search/search-client.ts`
  - `sites/video-moment-search/site.test.ts`
- This report is the only additional documentation path changed after the executable commit.

The accepted core/fixture blobs, builder, route renderer, rights data, query-privacy contract, timestamps, and server-rendered fallback were not changed.

### Round-2 RED evidence

Command:

`npm test -- --run sites/video-moment-search/site.test.ts`

Result: expected exit 1; 17 tests passed and the new immediate-recovery assertion failed. After an early pre-load submit followed by valid deferred loading, the fallback element was hidden but the always-visible status incorrectly remained `Search could not load. The initial reviewed moments remain available below.` instead of the expected truthful ready state.

The additional exact-payload regression coverage for equal-score tie breakers, invalid source/timestamp indexes, rejected fetches, and non-OK fetches passed against the old head and now protects the independently confirmed behavior from future regression.

### Round-2 GREEN behavior evidence

Focused command:

`npm test -- --run sites/video-moment-search/site.test.ts`

Result: exit 0; 1 file and 18 tests passed.

The exact `VIDEO_MOMENT_SEARCH_CLIENT` payload now proves:

- Immediately after valid deferred loading, before a second submit, the fallback is hidden and the `aria-live` status says `Search is ready. Enter a phrase such as “agent evaluation”.`
- A later `agent evaluation` submission still renders `moment-agent-evals` and `https://video.example/watch/agent-evals?t=132`.
- A bounded equal-score fixture compares shipped-IIFE order to `searchPublicIndex` and proves video-slug, then start-second, then moment-ID tie breaks with the literal order `moment-a`, `moment-b`, `moment-c`, `moment-z`.
- Loaded indexes with a `javascript:` source or timestamp mismatch are rejected by the shipped IIFE into the actionable fallback.
- Rejected and non-OK index fetches enter the same fallback while the server-rendered initial-result sentinel remains unchanged.
- Existing phrase-bonus, malformed-shape/field, transient-load, submit-error, query-privacy, rights, and exact-timestamp regressions remain green.

### Round-2 final gates

- Focused shipped-payload site suite: `npm test -- --run sites/video-moment-search/site.test.ts` → exit 0; 18/18 passed.
- Focused atomic integration: `npm test -- --run test/integration/video-moment-search-build.test.ts` → exit 0; 2/2 passed.
- Static check: `npm run check` → exit 0; TypeScript and ESLint passed.
- Full suite: `npm test -- --run` → exit 0; 28 files and 306 tests passed.
- Production build: `npm run build` → exit 0.
- Emitted syntax: `node --check dist/sites/video-moment-search/search-client.js` → exit 0.
- Emitted/tested equality: built `search-client.js` was byte-equal to `VIDEO_MOMENT_SEARCH_CLIENT`, and the emitted ready-status probe was true.
- Diff gate: `git diff --check` → exit 0 before the executable commit, with only Git LF-to-CRLF warnings.

### Round-2 residuals

- The deterministic `node:vm` payload tests remain regression evidence, not a real-browser, assistive-technology, usability, demand, or WCAG-conformance result.
- All controlled-fixture, no-live-library, no-permission, no-deploy, no-demand, and no-revenue limits remain unchanged.
- Independent-main drift is a repository-state residual only: after the executable commit the branch reported `ahead 4, behind 1`. No fetch, merge, rebase, push, tag, deploy, or reconciliation was performed.

## Whole-candidate fix round 3

### Heads and exact paths

- Old round-3 head: `c2a622fc8f7d420c285697c2822fd586005952b5`
- Passing round-3 executable/lock head: `2346e86a023d8d1a047be305b5c4d590093700b7`
- Exact executable/lock/test paths changed:
  - `package-lock.json`
  - `sites/shared/render.ts`
  - `test/integration/video-moment-search-build.test.ts`
- This report is the only additional documentation path changed after the executable/lock commit.

No accepted core/fixture blob, video search renderer/client, builder behavior, rights data, query handling, timestamp route, SSR fallback, ingestion path, or other product lane changed in this round.

### Round-3 RED evidence

Clean-install RED at `c2a622fc8f7d420c285697c2822fd586005952b5`:

`npm ci --dry-run --ignore-scripts --offline --json`

Result: exit 1 on Node `v24.15.0` / npm `11.12.1` with `Missing: @receipt/video-moment-core@0.1.0 from lock file` (reported twice by npm). This blocked the documented clean-install/workflow entry point before verification.

Four-product hub RED after adding the integration assertion:

`npm test -- --run test/integration/video-moment-search-build.test.ts`

Result: expected exit 1; 1 test passed and the enabled four-product build failed because the hub footer contained `not a fourth evidence product` instead of `not an additional evidence product`.

### Mechanical lock repair evidence

Authorized command:

`npm install --package-lock-only --ignore-scripts --offline`

Result: exit 0; no lifecycle scripts or network were used. The exact inspected `package-lock.json` diff was 11 added lines only:

- One `node_modules/@receipt/video-moment-core` workspace link resolving to `packages/video-moment-core`.
- One `packages/video-moment-core` package block with name `@receipt/video-moment-core`, version `0.1.0`, and the existing `zod` dependency range.

No version, resolved URL, integrity value, or unrelated dependency changed.

Post-repair installability:

- `npm ci --dry-run --ignore-scripts --offline --json` → exit 0; exactly one workspace link add for `@receipt/video-moment-core@0.1.0`, zero dependency changes/removals.
- `npm ci --ignore-scripts --offline` → exit 0; 159 packages installed and 162 audited from local cache, zero vulnerabilities reported, no lifecycle scripts or network.

### Round-3 GREEN behavior evidence

- Focused four-product hub integration: `npm test -- --run test/integration/video-moment-search-build.test.ts` → exit 0; 2/2 passed. The emitted hub includes `not an additional evidence product` and excludes `not a fourth evidence product`.
- Three-site direct-builder semantics remain covered by the unchanged first integration test; four-site production semantics remain covered by the enabled build test.

### Round-3 final gates

- Focused core/search/site: `npm test -- --run packages/video-moment-core/src/contracts.test.ts packages/video-moment-core/src/search.test.ts sites/video-moment-search/site.test.ts` → exit 0; 3 files and 41/41 tests passed.
- Combined new plus legacy build integration: `npm test -- --run test/integration/video-moment-search-build.test.ts test/integration/site-build.test.ts` → exit 0; 2 files and 30/30 tests passed.
- Static check: `npm run check` → exit 0; TypeScript and ESLint passed.
- Full suite: `npm test -- --run` → exit 0; 28 files and 306 tests passed.
- Local fixture collection: `npm run evidence -- collect-fixtures` → exit 0.
- Canonical local evidence verification: `npm run evidence -- verify --all` → exit 0.
- Production build: `npm run build` → exit 0.
- Emitted asset syntax: `node --check dist/sites/video-moment-search/search-client.js` → exit 0.
- Emitted/tested equality: built `search-client.js` was byte-equal to `VIDEO_MOMENT_SEARCH_CLIENT`.
- Fixed query proof: first result `moment-agent-evals`; anchor `https://video.example/watch/agent-evals?t=132`; every emitted result timestamp equaled its stored integer start second.
- Hub proof: built hub contained the corrected additional-product boundary and excluded the stale ordinal wording.
- Diff gate: `git diff --check` → exit 0 before the executable/lock commit, with only Git LF-to-CRLF warnings.

### Round-3 residuals and authority boundary

- All controlled-fixture, no-live-library, no-permission, no-deploy, no-usability, no-demand, and no-revenue limits remain unchanged.
- `ecfa046` was not combined or reconciled; its four changed paths are disjoint from this round. The actual post-application combined-head gate remains coordinator-owned.
- Independent-main drift remains repository state only: after the executable/lock commit this branch reported `ahead 6, behind 1`. No fetch, merge, rebase, push, tag, deploy, or reconciliation was performed.
