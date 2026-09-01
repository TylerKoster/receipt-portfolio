# Video Library Indexing Service strategy

Date: 2026-09-01

## Decision

Receipt Portfolio is no longer operated as four equal commercial products.
The active product is a service that turns an owner-authorized video library
into a searchable, citation-ready knowledge asset without requiring primary
video rehosting.

AI Moment Index remains the working public proof of exact-moment retrieval.
The intended service combines:

- owner-authorized, cross-platform library ingestion;
- private phrase, semantic, and question-based retrieval;
- answers linked to the exact source and stored timestamp;
- creator review, correction, supersession, removal, and publication control;
- optional creator-owned public discovery pages;
- source, license, transcript, version, and currentness records;
- monthly synchronization and source-drift monitoring;
- reuse exports and truthful acquisition or conversion measurement.

The service owns metadata, authorized transcripts, moment records, retrieval,
governance, public pages, and analytics. Existing video hosts retain the media
bytes unless later customer evidence justifies an optional hosting product.

## Portfolio disposition

| Prior product     | Decision                                                            | Reusable assets                                                                                                                   | New role                                                                                                                         |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| AI Moment Index   | Expand                                                              | Exact-moment contracts, search, creator review, rights evidence, public routes, discovery artifacts                               | Active product and public proof                                                                                                  |
| Search Receipt    | Park as a standalone product                                        | Allowlisted source observation, immutable receipts, change detection, corrections, feeds, source-bound static publishing          | Library Health: detect source removal, replacement, transcript drift, broken routing, expired rights, and correction state       |
| Workflow Test Lab | Retire from active product development; preserve legacy public demo | Deterministic fixtures, negative constraints, mutation tests, simulated query-to-timestamp flows                                  | Retrieval QA Lab: regression and relevance evaluation for ingestion, ranking, timestamp routing, privacy, and publication        |
| SkillLedger       | Park as a standalone product                                        | Commit-pinned source designation, license evidence, exact-field allowlists, no-execution boundary, public/private admission rules | Connector and Rights Registry: validate source connectors and media/transcript/publication authority before ingestion or release |

Parking and retirement do not delete history, worktrees, evidence, releases, or
source code. They stop independent product expansion and hourly feature loops.
Absorption occurs only through bounded, reviewed changes owned by the active
service or shared infrastructure.

## Customer

The primary initial customer is a B2B webinar or podcast publisher with
approximately 50 to 500 already-public long-form videos, an existing commercial
funnel, repeated archive-retrieval work, and authority over the indexed
material. Expert-led creators and small content teams with the same operating
profile are included in this beachhead. Agencies are a later adjacent pilot
because raw-footage search, client-rights chains, storage-location catalogs,
and editing-system exports materially expand the product.

The service is not initially for hobby libraries, arbitrary third-party
YouTube scraping, enterprise learning platforms already committed to a video
CMS, full broadcast media-asset management, or customers whose primary need is
cheap video storage.

## Commercial offer

The first offer is a managed pilot, not self-service SaaS:

1. Connect one owner-authorized existing library without moving the videos.
2. Index a bounded catalog and establish a creator-approved retrieval benchmark.
3. Deliver private search and exact-moment cited answers.
4. Review and approve a bounded set of public moments or watch pages.
5. Synchronize additions, corrections, removals, and source changes.
6. Report retrieval quality, time saved, reuse, public discovery, and qualified interest without inventing missing metrics.

Initial pricing hypotheses are $2,500 to $5,000 setup plus $300 to $750 per
month for a creator library, and $4,000 to $8,000 setup plus $500 to $1,250 per
month for a webinar authority library. These are experiment inputs, not proven
willingness-to-pay evidence.

## Product gates

No pilot content enters the service until a pre-ingestion authority and data
contract records, separately:

- source owner and customer authority;
- speaker, guest, likeness, voice, transcript, caption, thumbnail, embed, and
  public-excerpt authority where applicable;
- which fields and media may remain private, be processed by named external
  transcription or model providers, or become public;
- customer content and derived-data storage locations;
- tenant isolation, access controls or inherited ACLs, encryption, backups,
  export, retention, query/event retention, and verified deletion behavior;
- source revocation, customer termination, correction, and downstream deletion
  propagation.

Owner authorization for a channel or folder does not automatically establish
authority over every speaker, transcript, derivative, processor, or publication
surface.

Question answering is a separate integrity gate from retrieval. Every factual
answer span must bind to admitted source, version, and time evidence. The
service abstains when evidence is insufficient or contradictory. Corrected,
superseded, removed, revoked, or deleted moments must disappear from retrieval,
answers, caches, exports, and public output. Benchmarks evaluate retrieval and
answer grounding separately and include abstention, contradiction, correction,
revocation, and deletion cases.

The next implementation sequence is:

1. the pre-ingestion authority, processor, privacy, retention, and deletion contract;
2. owner-authorized library import and deletion propagation;
3. a tenant-isolated private library with exact-moment search;
4. fail-closed cited answers and independent grounding evaluation;
5. a creator review queue for approve, correct, supersede, remove, or keep private;
6. source-version and timestamp-drift monitoring;
7. creator-owned public watch, topic, collection, and search surfaces;
8. useful exports for editors, writers, support, or training;
9. privacy-reviewed product measurement and a paid-pilot intake path;
10. recurring synchronization and maintenance reporting.

Generic visual polish, microcopy-only experiments, additional controlled
records, or more public pages do not outrank these gates unless they repair a
verified defect blocking a customer outcome.

## Success and stop rules

Continue productization when a paid pilot demonstrates all of the following:

- at least 90% precision on a creator-approved 30-query benchmark;
- timestamp error no greater than five seconds;
- at least 30% less time spent locating reusable material;
- at least five moments reused in real work during the pilot;
- repeat weekly archive use appropriate to the customer's workflow;
- willingness to pay for recurring synchronization and maintenance.

Stop or materially reframe the service when a customer's existing Vimeo,
Wistia, OpusSearch, Castmagic, or similar workflow already solves the job; the
library is searched only once; review cost exceeds customer value; customers
want clipping or storage but not retrieval and governance; or public output
would become thin transcript pages.

Deterministic tests, synthetic panels, public route health, indexed pages, and
source availability are necessary evidence but are not customer demand,
conversion, willingness to pay, or revenue.
