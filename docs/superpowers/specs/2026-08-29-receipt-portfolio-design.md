# Receipt Portfolio Design

## Status and decision record

This design is approved for implementation by the product owner on 2026-08-29. It authorizes three distinct, automation-maintained sites built on one shared evidence engine. Revenue is an experiment, not a promised outcome.

## Problem

Most automated content projects expand thin, unverified pages. That conflicts with Google guidance and creates high maintenance cost. Generic page-change monitoring is also crowded. The portfolio must instead turn verifiable, recurring source changes into useful, source-bound records for narrow audiences.

## Portfolio

### 1. Search Receipt

**Audience:** independent site owners and small SEO agencies.

**Decision supported:** whether an official search-system change is confirmed, what changed, and whether a site owner should investigate.

**Initial sources:** Google Search Central Blog/RSS, Google Search Status Dashboard/RSS/history, a small allowlist of Google Search documentation pages, and official Search Console announcements.

**Wedge:** a source-pinned before/after receipt with an explicit fact, inference, and unknowns section. It does not claim that normal SERP movement is a confirmed Google update.

**Revenue hypothesis:** free source receipts and weekly digest build returning readership; an agency alert feed and client-ready impact brief become paid only after repeat demand is observed.

### 2. Workflow Test Lab

**Audience:** practical AI users who need a repeatable AI workflow for one defined task family, not a viral prompt collection.

**Decision supported:** whether an original prompt recipe is fit for a stated purpose and limitations.

**Content model:** a deliberately small, original experiment library for one machine-checkable workflow family selected during implementation. Each card holds a structured task, required inputs, model-neutral prompt, expected output shape, negative constraints, rights-cleared fixture, deterministic rubric, observed limitations, model/configuration receipt, and revision history. External material is a discovery signal or cited technique, never scraped/copied prompt inventory.

**Wedge:** test evidence and transparent scope. It does not claim to be a top-prompt directory, a universal benchmark, or an MCP. A card may say that it has only been checked against a named fixture; it never calls a prompt universally "best."

**Revenue hypothesis:** a free, narrow lab validates whether users value reproducible task recipes; a later paid team workspace could offer maintained task packs, regression notices, and downloadable quality rubrics. No payment or login capability is part of the first release.

### 3. SkillLedger

**Audience:** agent builders evaluating reusable, repository-hosted skills.

**Decision supported:** whether a publicly available skill package is maintainable and safe enough to inspect before adoption.

**Content model:** a non-executing metadata ledger of allowlisted open-source skill repositories. Each record reports source URL, declared license, last activity, manifest presence, declared dependencies, contents hash, and static-risk flags. It does not execute a skill, install a package, or certify security.

**Wedge:** provenance and declared posture rather than a larger directory. A source update becomes a receipt showing only observed metadata/change facts and clearly marked static analysis. It never rates a skill as safe, trusted, or certified.

**Revenue hypothesis:** free source ledger earns discovery traffic; later paid offerings could include portfolio watchlists and due-diligence exports only if people request them.

## Shared architecture

The project is a TypeScript monorepo with four independently testable layers:

1. `packages/receipt-engine`: pure domain library. It validates source manifests, normalizes public source content, hashes canonical snapshots, classifies changes, builds immutable receipt records, and applies publication gates.
2. `packages/site-data`: static, validated JSON generated from the engine. Website applications only render this data; they never fetch untrusted sources at page request time.
3. `sites/search-receipt`, `sites/workflow-test-lab`, and `sites/skill-ledger`: separate static applications sharing basic display components but retaining site-specific copy, content model, and URL space.
4. `.github/workflows`: scheduled jobs run source fetches, tests, validation, and build. A failed job opens no public receipt. Deployment is deliberately separate from source collection.

The engine uses content-addressed snapshot files. A receipt stores the old and new content hashes, observed time, source identifier, extraction version, change classification, and public fields. Existing receipts are append-only. Corrections produce a new receipt that links to the corrected record; records are never silently overwritten.

## Source admission policy

Every source needs a `SourceManifest` record with:

- stable source identifier and canonical URL;
- public access method (RSS, JSON, or ordinary public HTML);
- owner/publisher and source class;
- permitted extraction selector or feed field;
- check cadence and timeout;
- attribution/usage notes;
- content-noise exclusions;
- expected parser and schema version;
- explicit enabled/disabled state.

Only public pages and feeds are admissible. The system does not log in, work around paywalls, scrape social media posts as source truth, execute scripts from a source, or ingest private data. Workflow Test Lab only publishes original content created for this project; imported external prompts are disallowed unless their license and attribution are separately reviewed.

## Automation lifecycle

1. Scheduled fetch reads source manifests and requests one public URL/feed per source under bounded timeouts.
2. Parser extracts only allowed fields, removes configured volatile fragments, normalizes Unicode/whitespace, and computes SHA-256.
3. Engine compares against the latest successful snapshot. Identical content records a healthy check and stops.
4. A changed snapshot produces a structured diff. Parser or schema failures are quarantined with a reason; they cannot create a public entry.
5. A site-specific classifier sets a conservative change category. Ambiguous or policy-sensitive changes are held and omitted from public publishing; the system does not need a person to make a speculative classification.
6. Publication gate requires a valid manifest, a complete old/new evidence pair (except a first-seen source record), a source URL, observed time, hash pair, category, and attribution. Automated publication is limited to source facts and explicitly excludes causal traffic claims, prescriptive advice, and unverified impact statements.
7. On success, a static receipt data file and topic index are generated. The static site builds from validated data only.
8. A weekly maintenance job reports source health, false-positive holds, build success, page count, and experiment metrics. It proposes reversible improvements but never silently changes source policy.

## Website requirements

Each site has a fast static home page, methodology page, source list, receipt/detail pages, topic/category pages, and explicit empty/error states. Every receipt visibly separates:

- verified source facts;
- bounded interpretation;
- unknowns and non-claims;
- source and time observed;
- how to report a correction.

Accessibility baseline: semantic headings, descriptive links, keyboard-operable controls, no color-only meaning, valid contrast, and a no-JavaScript readable core. SEO baseline: descriptive titles, canonical URLs, sitemap, robots policy, and structured `Article` data only for actual receipt pages.

## Security boundaries

- Treat all fetched content as hostile input.
- Never render source HTML without escaping/sanitization; snapshot raw content separately from the static page model.
- Enforce allowlisted HTTPS URLs; block loopback, private IP ranges, redirects to unapproved hosts, non-HTTP schemes, and oversized responses.
- Do not execute fetched skills or repository code. SkillLedger performs static metadata inspection only.
- Keep automated commits separate from deployment credentials. The first release contains no user accounts, payments, webhooks, or secrets.

## Experiment and stop conditions

For the first 90 days after each public launch, the portfolio records: recurring visitors, email/digest opt-ins where implemented, return rate, direct requests for paid capability, source failure rate, and correction rate.

- Expand a site only if source health stays above 95%, correction rate stays below 2%, and it has evidence of recurring user value.
- Rework the source/category or pause the site if it produces repeated low-value/noisy receipts or no recurring-use evidence.
- Do not add checkout, login, paid ads, affiliate links, or lead routing until the corresponding demand experiment is explicitly approved.

## First release boundary

The first release proves the platform with fully local fixture data and the complete engine/data/site pipeline. It ships one factual example data set per site, source manifests and validation rules, scheduled workflow definitions, and a live-source dry-run command. The initial Search Receipt allowlist is Google Search Status JSON, Google documentation-update RSS, Google Search Central Blog RSS, Google crawling changelog RSS, and Google Search Console data-anomaly notices. Source facts may be published automatically only where the manifest permits; ambiguous material is held rather than improvised. Public deployment is enabled only after hosting destination and automation credentials are verified in the implementation review.
