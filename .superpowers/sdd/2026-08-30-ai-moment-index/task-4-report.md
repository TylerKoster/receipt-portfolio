# Task 4 recovery implementer report

## Cycle-03 reserved-domain live-source repair — 2026-08-30

### Status and authority

PASS — bounded local integration candidate with an opt-in live reachability
observation and a real Chromium built-page journey. No merge, push, tag, deploy,
fetch, rebase, reset, stash, clean, ingestion/onboarding change, transcript or
caption retrieval, media save, screenshot/frame save, outreach, or other product
lane change was performed.

- Branch: `ops/video-moment-search-cycle-20260830-03`
- Starting HEAD: `363ef7dbd29da928442c7ad6823c5c50abd095c9`
- Final repair commit: reported by the implementer after this report is committed.
- Fixed query: `robots control`
- First result: `moment-robots-control`
- Stored integer second: `132`
- Exact anchor:
  `https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132`

### Test-first RED evidence

1. Explicit timestamp strategy:

   `npm test -- --run packages/video-moment-core/src/search.test.ts`

   Expected exit 1; 10 tests passed and the new regression failed because the
   explicit direct-media source produced `?t=132` instead of `#t=132`. The
   companion assertion proved the existing abstract fixture still expected and
   retained query-parameter timestamp behavior.

2. Public fixture, deterministic rights record, and ranked build:

   - `npm test -- --run sites/video-moment-search/site.test.ts` → expected exit
     1; 16 passed and 3 failed on the missing fragment, missing reviewed result,
     and intentionally incomplete source-rights evidence placeholder.
   - `npm test -- --run test/integration/video-moment-search-build.test.ts` →
     expected exit 1; 1 passed and 1 failed because `robots control` had no
     ranked first result.

3. Operational fact validators:

   `npm test -- --run scripts/video-moment-validation.test.ts`

   Expected exit 1; all 4 initial fact-validator assertions failed against the
   compile scaffold. Subsequent bounded regression cycles also reproduced and
   fixed the Windows `npx.cmd` `spawn EINVAL`, the Playwright CLI page-function
   syntax requirement, and missing 206 media-response validation.

4. Real-browser race evidence:

   The first executable browser run failed before launch with `spawn EINVAL`.
   After the tested Windows launcher repair, a run reached the native media
   document but timed out because the gate waited for the fragment before
   pausing. A diagnostic run then captured every expected fact except the
   initial ±1 second threshold: `currentTime=133.376393`, with exact `#t=132`
   location/current source, `duration=907.299`, `readyState=4`, `seeking=false`,
   `paused=true`, `error=null`, and `427x240`. The bounded final gate documents
   a ≤2.0 second autoplay tolerance and keeps the normal locator click and
   native fragment seek; it never assigns `currentTime`.

5. Experiment receipt drift:

   `npm test -- --run sites/video-moment-search/site.test.ts`

   Expected exit 1; 18 passed and the ledger regression failed because the
   checked-in fixed flow still named `agent evaluation`, `moment-agent-evals`,
   and `video.example`.

### Deterministic source and rights evidence

`fixtures/video-moment-search/commons-source-rights-v1.json` binds:

- Work: `How can we keep robots under control?`
- Attribution: `University of the Netherlands`
- Canonical rights page and immutable revision `oldid=1000389530`
- License: `CC BY-SA 4.0 International` and its canonical license URL
- Official delivery URL, `video/webm`, `24,788,866` bytes, byte ranges, and
  observed duration `907.299`
- Explicit timestamp strategy `media-fragment`, stored second `132`, and exact
  `#t=132` URL
- Commons review record: `LicenseReviewerBot`, `2022-01-18`, confirming stated
  license availability on that date
- Original annotation text and SHA-256
  `080c1bf2566fee9fce3db83f35990d76311eb5e2c2ab22fc2d2daf9c917c5fdd`
- Product boundary: timestamp link plus original editorial annotation only;
  no hosting, embedding, media distribution, transcript distribution,
  endorsement claim, or inferred permission

The corpus labels the source text as `editorial-annotation`, not a caption or
transcript. Existing caption-backed abstract fixtures retain their old default
contract and query-parameter timestamp behavior.

### Final fresh deterministic gates

- Scoped core/public/operational:
  `npm test -- --run packages/video-moment-core/src/contracts.test.ts packages/video-moment-core/src/search.test.ts sites/video-moment-search/site.test.ts scripts/video-moment-validation.test.ts`
  → exit 0; 4 files and 50/50 tests passed.
- Combined build integration:
  `npm test -- --run test/integration/video-moment-search-build.test.ts test/integration/site-build.test.ts`
  → exit 0; 2 files and 30/30 tests passed.
- Static check: `npm run check` → exit 0; TypeScript and ESLint passed.
- Full suite: `npm test -- --run` → exit 0; 29 files and 317/317 tests passed.
- Local evidence collection: `npm run evidence -- collect-fixtures` → exit 0.
- Canonical local evidence verification: `npm run evidence -- verify --all` →
  exit 0.
- Production build: `npm run build` → exit 0.
- Emitted client syntax:
  `node --check dist/sites/video-moment-search/search-client.js` → exit 0.

### Opt-in live read-only source gate

Command:

`$env:AI_MOMENT_SOURCE_LIVE_CHECK='1'; npm run check:video-moment-source-live`

Exit 0. The gate made exactly one `GET` request with `Range: bytes=0-0`,
disabled redirects, cancelled the response stream after headers, and reported
`responseBodyRead=false` and `responseBodySaved=false`.

- Status: `206`
- Final URL: exact official Wikimedia delivery URL
- `Content-Type: video/webm`
- `Accept-Ranges: bytes`
- `Content-Length: 1`
- `Content-Range: bytes 0-0/24788866`

This is non-hermetic reachability evidence, not a rights inference.

### Real Chromium built-page journey

Command:

`$env:AI_MOMENT_BROWSER_LIVE_CHECK='1'; npm run check:video-moment-browser-live`

Exit 0. The local gate served only the four built AI Moment Index assets and
used the exact repository dependency `@playwright/cli` `0.1.18` through its
local Node entry point. The external browser cache prerequisite observed for
this gate was
`C:\Users\Tkost\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`;
the same pinned launcher reported Chromium `151.0.7922.174` and user agent
`HeadlessChrome/151.0.0.0`. Offline `npm ci --ignore-scripts` reproduced the
CLI package but did not provision that external browser cache. Chromium:

1. entered `robots control` and submitted with Enter;
2. observed one visible ranked result, first `moment-robots-control`;
3. used a normal Playwright locator click on the first ordinary anchor;
4. navigated to the exact official Wikimedia `#t=132` URL; and
5. observed the native media state without a programmatic time assignment.

Final facts:

- Anchor, `location.href`, and `currentSrc`: exact `#t=132` URL
- `currentTime=132`; documented tolerance ≤2.0 seconds; observed error 0
- `duration=907.299`, `seeking=false`, `readyState=4`, `paused=true`,
  `error=null`, `427x240`
- Media response: `206`,
  `Content-Range: bytes 3801088-24788865/24788866`,
  `Accept-Ranges: bytes`, `Content-Type: video/webm`
- Activation classification: `normal-anchor-click`
- No media, caption, transcript, screenshot, or frame was saved

### Changed paths for this repair

- `fixtures/video-moment-search/authorized-ai-video-v1.json`
- `fixtures/video-moment-search/commons-source-rights-v1.json`
- `package.json`
- `packages/video-moment-core/src/contracts.ts`
- `packages/video-moment-core/src/search.ts`
- `packages/video-moment-core/src/search.test.ts`
- `scripts/video-moment-browser-check.ts`
- `scripts/video-moment-live-source-check.ts`
- `scripts/video-moment-validation.ts`
- `scripts/video-moment-validation.test.ts`
- `sites/video-moment-search/index.ts`
- `sites/video-moment-search/product-experiment-ledger.json`
- `sites/video-moment-search/render.ts`
- `sites/video-moment-search/search-client.ts`
- `sites/video-moment-search/site.test.ts`
- `test/integration/video-moment-search-build.test.ts`
- `.superpowers/sdd/2026-08-30-ai-moment-index/task-4-report.md`

### Residual limits

- Wikimedia availability and response headers can change independently of this
  commit; deterministic tests remain separate from opt-in live observations.
- The original annotation identifies a timestamped review point using only the
  work title and source record. It makes no claim about what is said or shown at
  02:12 and is not transcript-derived.
- Chromium necessarily received ephemeral byte ranges to load the native media
  document for the required journey; the gate saved no audiovisual bytes,
  captions, transcript, screenshot, or frame.
- This is one reviewed-source local integration candidate, not ingestion,
  creator onboarding, a live library, endorsement, deployment, real-user
  usability, demand, conversion, or revenue evidence.

## Cycle-03 independent-review fixes

### Scope and heads

- Reviewed head: `59401ef248e8092bc90183124b2cfbf913263cfb`
- Fix commit: reported by the implementer after this report is committed.
- Scope remained limited to explicit review-evidence binding, public evidence
  rendering, pinned browser tooling, and strict media-range validation.
- No source selection, annotation, timestamp, query, live-request boundary,
  ingestion/onboarding path, merge, push, tag, or deploy changed.

### Review-fix RED evidence

1. Rights/review classification and drift:

   `npm test -- --run sites/video-moment-search/site.test.ts`

   Expected exit 1; 18 tests passed and 3 failed:

   - The public grant lacked explicit `reviewEvidence` binding to the checked-in
     evidence ID, license identifier/URL, rights URLs, reviewer/date, and
     product boundary.
   - License-note drift and permission-verification date drift returned no
     diagnostics.
   - A media-fragment entry with review fields removed was still labeled
     `Reviewed public source`, proving timestamp syntax incorrectly conferred
     review status.

2. Pinned browser tool and range semantics:

   `npm test -- --run scripts/video-moment-validation.test.ts`

   Expected exit 1; 8 tests passed and 4 failed:

   - The Windows launcher still resolved through the npm `npx-cli.js` path.
   - The exact Playwright package contract validator was unimplemented.
   - `bytes 9-8/24788866` and
     `bytes 0-24788866/24788866` incorrectly passed the old regex-only
     Content-Range check.

### GREEN implementation evidence

- `VideoRecord.reviewEvidenceId` explicitly binds a video to a reviewed-source
  evidence record.
- `RightsGrant.reviewEvidence` now carries classification
  `reviewed-public-source`, evidence ID, license identifier/URL, canonical and
  immutable rights URLs, reviewer/date, and the included/excluded product
  boundary.
- Corpus validation rejects:
  - license-note divergence from the review evidence;
  - permission-verification date divergence from the review date; and
  - video/grant review-evidence ID mismatch.
- The public serializer derives `Reviewed public source`, rights status,
  verification date, and provenance from explicit `reviewEvidence`, never from
  `timestampStrategy`. A media-fragment record without review evidence retains
  the non-reviewed controlled-fixture classification.
- Server and shipped client results expose and validate the evidence ID,
  license identifier/URL, canonical rights page, immutable rights revision,
  reviewer/date, and product boundary. Deterministic tests bind these values
  directly to `commons-source-rights-v1.json` and include negative grant drift.
- Media Content-Range validation now parses start, end, and total as safe
  integers and requires `0 <= start <= end < total == 24,788,866`.

### Deterministic Playwright provisioning

- Added exact dev dependency `@playwright/cli: 0.1.18`.
- `package-lock.json` pins its tarball integrity and exact transitive
  Playwright packages.
- The gate reads and validates the installed package name, exact version, and
  bin mapping before launch.
- The gate directly runs
  `node_modules/@playwright/cli/playwright-cli.js` with Node. It contains no
  `npx`, `--yes`, `--package`, implicit `latest`, or cache-miss installation
  path.
- `npm ci --dry-run --ignore-scripts --offline --json` → exit 0; no changes.
- `npm ci --ignore-scripts --offline` → exit 0; 162 packages installed from
  the local cache, 165 audited, and 0 vulnerabilities reported. Lifecycle
  scripts and network were disabled.

### Final fresh review-fix gates

- Scoped core/public/operational:
  `npm test -- --run packages/video-moment-core/src/contracts.test.ts packages/video-moment-core/src/search.test.ts sites/video-moment-search/site.test.ts scripts/video-moment-validation.test.ts`
  → exit 0; 4 files and 57/57 tests passed.
- Combined build integration:
  `npm test -- --run test/integration/video-moment-search-build.test.ts test/integration/site-build.test.ts`
  → exit 0; 2 files and 30/30 tests passed.
- Static check: `npm run check` → exit 0; TypeScript and ESLint passed.
- Full suite: `npm test -- --run` → exit 0; 29 files and 324/324 tests passed.
- Evidence collection: `npm run evidence -- collect-fixtures` → exit 0.
- Evidence verification: `npm run evidence -- verify --all` → exit 0.
- Production build: `npm run build` → exit 0.
- Opt-in one-byte source check → exit 0 with the unchanged exact 206,
  `video/webm`, byte-range, one-byte, and 24,788,866-byte total facts.
- Pinned local Chromium gate → exit 0. It retained Enter submission and a
  normal Playwright locator click, made no `currentTime` assignment, and
  observed the exact `#t=132` location/current source, `currentTime=132`,
  `duration=907.299`, healthy paused native media state, and parsed
  `Content-Range: bytes 3801088-24788865/24788866`.

### Review-fix changed paths

- `fixtures/video-moment-search/authorized-ai-video-v1.json`
- `package.json`
- `package-lock.json`
- `packages/video-moment-core/src/contracts.ts`
- `packages/video-moment-core/src/index.ts`
- `scripts/video-moment-browser-check.ts`
- `scripts/video-moment-validation.ts`
- `scripts/video-moment-validation.test.ts`
- `sites/video-moment-search/render.ts`
- `sites/video-moment-search/search-client.ts`
- `sites/video-moment-search/site.test.ts`
- `.superpowers/sdd/2026-08-30-ai-moment-index/task-4-report.md`

### Review-fix residual limits

- The exact pinned CLI removes implicit package drift but the browser and
  Wikimedia availability remain non-hermetic external observations.
- Review classification binds a recorded Commons review and immutable rights
  revision. It remains evidence of the stated license record, not inferred
  permission, endorsement, source content at 02:12, or current availability.
- All prior one-source, no-transcript/media-save, no-user, no-demand, no-revenue,
  and no-deploy limits remain.

## Cycle-03 second independent re-review fixes

### Scope and RED evidence

- Reviewed head: `1beabac74804240326b0bc71751709a3eacf2df0`.
- Scope remained limited to fail-closed page copy, public claim/evidence
  consistency, tests, and this report.
- `npm test -- --run sites/video-moment-search/site.test.ts` → expected exit 1;
  21 tests passed and 2 failed:
  - A corpus that still validated after removing `reviewEvidenceId` and
    `reviewEvidence` received unconditional reviewed-source meta, search,
    outcome, rights-boundary, and initial-results language.
  - The TypeScript public-index helper accepted a selected-fixture entry after
    its structured review evidence was removed while the redundant reviewed
    confidence, rights, date, and provenance claims remained.
- The contradiction regression also defined reviewer, review-date, license,
  evidence-ID, and direct-provenance drift cases for both the TypeScript helper
  and emitted browser IIFE.

### GREEN implementation

- Static site definition copy is neutral. Search-shell reviewed language is
  emitted only when every initial public entry has validated structured review
  evidence; otherwise the search heading, recovery status, rights boundary,
  outcome, and initial-results heading remain controlled-fixture language.
- Evidence-less media-fragment entries therefore receive no `reviewed source`,
  `Commons-reviewed`, `reviewed Commons`, `search the reviewed`, or
  `initial reviewed moments` claim. The selected fixture continues to expose
  its exact evidence ID, license and URLs, immutable rights revision,
  reviewer/date, and product boundary on the rendered result.
- Each public entry now carries structured corpus, rights-grant, and cue lineage.
  Both the TypeScript helper and emitted IIFE derive the exact expected
  confidence, rights status, verification date, and provenance from that
  lineage plus `reviewEvidence` and reject any mismatch.
- Without review evidence, both runtimes require the neutral controlled-fixture
  confidence and exact neutral lineage provenance and reject reviewed text.
- Hostile parity tests cover missing evidence with a reviewed label, reviewer
  drift, date drift, license drift, evidence-ID drift, and direct provenance
  drift; a companion case binds each entry's corpus lineage to the enclosing
  public index. Every case is rejected by both runtimes.

### Final fresh second-review gates

- Focused page/client RED-to-GREEN:
  `npm test -- --run sites/video-moment-search/site.test.ts` → exit 0; 23/23
  tests passed.
- Scoped core/public/operational:
  `npm test -- --run packages/video-moment-core/src/contracts.test.ts packages/video-moment-core/src/search.test.ts sites/video-moment-search/site.test.ts scripts/video-moment-validation.test.ts`
  → exit 0; 4 files and 59/59 tests passed.
- Combined build integration:
  `npm test -- --run test/integration/video-moment-search-build.test.ts test/integration/site-build.test.ts`
  → exit 0; 2 files and 30/30 tests passed.
- Static check: `npm run check` → exit 0.
- Offline package reproduction:
  - `npm ci --dry-run --ignore-scripts --offline --json` → exit 0; no changes.
  - `npm ci --ignore-scripts --offline` → exit 0; 162 packages installed, 165
    audited, 0 vulnerabilities.
- A first full-suite run made concurrently with the static check hit the
  unrelated five-second worktree-discovery import timeout after 325 passes.
  The required isolated rerun, `npm test -- --run`, exited 0 with 29 files and
  326/326 tests passed.
- `npm run evidence -- collect-fixtures` → exit 0.
- `npm run evidence -- verify --all` → exit 0.
- `npm run build` → exit 0.
- Opt-in one-byte source check → exit 0: 206, `video/webm`, `Accept-Ranges:
  bytes`, `Content-Length: 1`, `Content-Range: bytes 0-0/24788866`, response
  body read false, response body saved false.
- Pinned Chromium built-page gate → exit 0: query `robots control`, one visible
  result, first `moment-robots-control`, normal Playwright locator click on the
  ordinary exact `#t=132` anchor, exact location/current source, current time
  132, duration 907.299, ready state 4, seeking false, paused true, no error,
  427x240, and media 206 with
  `Content-Range: bytes 3801088-24788865/24788866`.

### Browser prerequisite and residual limits

- Repository tooling is pinned to `@playwright/cli` `0.1.18`; there is no
  `npx`, implicit-latest, or registry path in the gate.
- The gate still requires the separately present external browser cache at
  `C:\Users\Tkost\AppData\Local\ms-playwright\chromium-1234\chrome-win64\chrome.exe`.
  The pinned launcher observed Chromium `151.0.7922.174`
  (`HeadlessChrome/151.0.0.0`). Browser-cache presence, Chromium execution,
  Wikimedia availability, and live media responses remain non-hermetic.
- No `currentTime` assignment occurred. No captions, transcripts, media,
  screenshots, or frames were saved, and no source-content claim at 02:12 is
  made.
- All prior rights, one-source, no-ingestion, no-user, no-demand, no-revenue,
  no-deploy, and no-external-effect limits remain.

### Second-review changed paths

- `sites/video-moment-search/index.ts`
- `sites/video-moment-search/render.ts`
- `sites/video-moment-search/search-client.ts`
- `sites/video-moment-search/site.test.ts`
- `.superpowers/sdd/2026-08-30-ai-moment-index/task-4-report.md`

## Cycle-03 third re-review substance fix

### Scope and RED evidence

- Reviewed head: `8dca58120328e3bb90bfecd2c44c02c734fb4220`.
- Scope remained limited to public review-evidence substance validation, hostile
  parity tests, and this tracked report.
- RED command:
  `npm test -- --run sites/video-moment-search/site.test.ts -t "rejects semantically empty or invalid review evidence"`
  → expected exit 1. The selected public entry remained accepted after its
  evidence ID was changed to an empty string and its redundant rights,
  verification, and provenance strings were regenerated to be internally
  consistent. This proved claim-string consistency alone did not establish
  substantive review evidence.
- The same hostile matrix defined empty license identifier, reviewer, and date;
  malformed and impossible calendar dates; empty included/excluded use arrays;
  and whitespace-only included/excluded members for both the TypeScript helper
  and emitted browser IIFE.

### GREEN implementation

- Both public validators now require trimmed nonempty evidence ID, license
  identifier, reviewer, and product-boundary members.
- Included and excluded product uses must each be a nonempty array of nonempty,
  non-whitespace strings.
- `reviewedOn` must match exact `YYYY-MM-DD` syntax and round-trip as the same
  UTC calendar date, rejecting malformed values and impossible dates such as
  `2022-02-30`.
- License, canonical-rights, and immutable-revision URLs retain the existing
  HTTPS/no-credentials checks.
- Substance validation executes before cross-field claim validation, so
  self-consistently regenerated display strings cannot make empty or invalid
  structured evidence pass.
- The hostile matrix passes identically in the TypeScript helper and the
  emitted IIFE for all ten substance cases.

### Final fresh third-review gates

- Focused page/client suite:
  `npm test -- --run sites/video-moment-search/site.test.ts` → exit 0; 24/24
  tests passed.
- Scoped core/public/operational:
  `npm test -- --run packages/video-moment-core/src/contracts.test.ts packages/video-moment-core/src/search.test.ts sites/video-moment-search/site.test.ts scripts/video-moment-validation.test.ts`
  → exit 0; 4 files and 60/60 tests passed.
- Combined build integration:
  `npm test -- --run test/integration/video-moment-search-build.test.ts test/integration/site-build.test.ts`
  → exit 0; 2 files and 30/30 tests passed.
- Static check: `npm run check` → exit 0.
- Full suite: `npm test -- --run` → exit 0; 29 files and 327/327 tests passed.
- Offline package reproduction:
  - `npm ci --dry-run --ignore-scripts --offline --json` → exit 0; no changes.
  - `npm ci --ignore-scripts --offline` → exit 0; 162 packages installed, 165
    audited, and 0 vulnerabilities.
- `npm run evidence -- collect-fixtures` → exit 0.
- `npm run evidence -- verify --all` → exit 0.
- `npm run build` → exit 0.
- `node --check dist/sites/video-moment-search/search-client.js` → exit 0.
- Opt-in one-byte source check → exit 0: 206, `video/webm`, `Accept-Ranges:
  bytes`, `Content-Length: 1`, `Content-Range: bytes 0-0/24788866`, response
  body read false, response body saved false.
- Pinned Chromium built-page gate → exit 0: query `robots control`, one visible
  result, first `moment-robots-control`, normal Playwright locator click on the
  ordinary exact `#t=132` anchor, exact location/current source, current time
  132, duration 907.299, ready state 4, seeking false, paused true, no error,
  427x240, and media 206 with
  `Content-Range: bytes 3801088-24788865/24788866`.

### Third-review changed paths and limits

- `sites/video-moment-search/search-client.ts`
- `sites/video-moment-search/site.test.ts`
- `.superpowers/sdd/2026-08-30-ai-moment-index/task-4-report.md`
- The same pinned CLI/external Chromium cache, non-hermetic Wikimedia, rights,
  one-source, no-content-claim, no-ingestion, no-user, no-demand, no-revenue,
  and no-deploy limits remain.

## Cycle-03 fourth re-review core/SSR parity fix

### Scope and RED evidence

- Reviewed head: `44d016024033da8a2ad73faa9e5fd0b652e67e1d`.
- Scope remained limited to core review-evidence substance validation, SSR
  fail-closed behavior, shared predicate reuse, tests, and this report.
- RED command:
  `npm test -- --run packages/video-moment-core/src/contracts.test.ts sites/video-moment-search/site.test.ts -t "semantically blank or impossible|before serialization or reviewed SSR"`
  → expected exit 1 with both selected tests failing:
  - Core corpus validation accepted a tab-only reviewer.
  - Corpus validation and server serialization accepted a whitespace-only
    license identifier after the license note was synchronized, leaving
    `Reviewed public source` SSR reachable from substantively invalid evidence.
- The core matrix also covered blank evidence ID, empty included/excluded uses,
  blank boundary members, and an impossible calendar date. The SSR matrix
  covered whitespace-only license, reviewer, included/excluded members, and an
  impossible date.

### GREEN implementation

- Core now exports `isReviewedSourceEvidenceSubstantive` as the single
  server-side predicate for trimmed nonempty required text, nonempty included
  and excluded arrays with nonblank members, and a strict real UTC calendar
  `YYYY-MM-DD` review date.
- The reviewed-evidence Zod schema refines through that predicate before
  semantic corpus processing. Existing core identifier and HTTPS diagnostics
  remain in force.
- The TypeScript public-entry validator reuses the same core predicate and adds
  its existing HTTPS checks. The emitted IIFE retains the equivalent mirrored
  predicate because it is shipped as a standalone browser payload.
- SSR serialization performs a defensive predicate check after the mandatory
  full corpus validation. Invalid review evidence therefore throws
  `Invalid video corpus` before public-index creation, page rendering, or any
  `Reviewed public source` HTML assignment.
- The selected reviewed fixture remains valid. The existing evidence-less
  legacy corpus test remains valid and receives neutral public copy.

### Final fresh fourth-review gates

- Focused core/SSR suites:
  `npm test -- --run packages/video-moment-core/src/contracts.test.ts sites/video-moment-search/site.test.ts`
  → exit 0; 2 files and 39/39 tests passed.
- Scoped core/public/operational:
  `npm test -- --run packages/video-moment-core/src/contracts.test.ts packages/video-moment-core/src/search.test.ts sites/video-moment-search/site.test.ts scripts/video-moment-validation.test.ts`
  → exit 0; 4 files and 62/62 tests passed.
- Combined build integration:
  `npm test -- --run test/integration/video-moment-search-build.test.ts test/integration/site-build.test.ts`
  → exit 0; 2 files and 30/30 tests passed.
- Static check: `npm run check` → exit 0.
- Full suite: `npm test -- --run` → exit 0; 29 files and 329/329 tests passed.
- Offline package reproduction:
  - `npm ci --dry-run --ignore-scripts --offline --json` → exit 0; no changes.
  - `npm ci --ignore-scripts --offline` → exit 0; 162 packages installed, 165
    audited, and 0 vulnerabilities.
- `npm run evidence -- collect-fixtures` → exit 0.
- `npm run evidence -- verify --all` → exit 0.
- `npm run build` → exit 0.
- `node --check dist/sites/video-moment-search/search-client.js` → exit 0.
- Opt-in one-byte source check → exit 0: 206, `video/webm`, `Accept-Ranges:
  bytes`, `Content-Length: 1`, `Content-Range: bytes 0-0/24788866`, response
  body read false, response body saved false.
- Pinned Chromium built-page gate → exit 0: query `robots control`, one visible
  result, first `moment-robots-control`, normal Playwright locator click on the
  ordinary exact `#t=132` anchor, exact location/current source, current time
  132, duration 907.299, ready state 4, seeking false, paused true, no error,
  427x240, and media 206 with
  `Content-Range: bytes 3801088-24788865/24788866`.

### Fourth-review changed paths and limits

- `packages/video-moment-core/src/contracts.ts`
- `packages/video-moment-core/src/contracts.test.ts`
- `packages/video-moment-core/src/index.ts`
- `sites/video-moment-search/render.ts`
- `sites/video-moment-search/search-client.ts`
- `sites/video-moment-search/site.test.ts`
- `.superpowers/sdd/2026-08-30-ai-moment-index/task-4-report.md`
- The pinned CLI/external Chromium cache, non-hermetic Wikimedia, rights,
  one-source, no-content-claim, no-ingestion, no-user, no-demand, no-revenue,
  and no-deploy limits remain unchanged.

## Preserved cycle-02 history

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
