# Video Moment Index candidate gate

**Lane:** Workflow Test Lab  
**Recorded:** 2026-08-29  
**Status:** `BLOCKED_BY_EVIDENCE_PACKAGE`  
**Decision:** Do not replace, expand, or re-position Workflow Test Lab around a
Video Moment Index.

## Scope and boundary

This is a research gate for a possible workflow experiment, not a source
admission, product specification, fixture, receipt, or publication decision.
It changes no public page, shared evidence schema, source manifest, or release
state.

The current Workflow Test Lab product is a fixture-only library of original,
narrowly tested workflow records. It explicitly does not extend a stored
observation beyond its named fixture and task family. See
`sites/workflow-test-lab/index.ts` at commit `31ad273`.

## Evidence reviewed

### Verified facts

- The repository has no `Video Moment Index` document, source URL, creator
  identity, consent record, source-rights record, timestamped fixture, customer
  research result, or prior candidate decision as of this gate.
- Workflow Test Lab currently permits only a project-original, rights-cleared,
  fixture-only source with the `workflow-experiment-v1` contract. See
  `manifests/workflow-test-lab/structured-extraction.json` at commit `31ad273`.
- The U.S. Copyright Office describes fair use as a fact-specific doctrine, not
  a preset amount of a work that may be used without permission. Its Fair Use
  Index includes audiovisual indexing cases but says the index is not legal
  advice. [Copyright Office Fair Use Index](https://copyright.gov/fair-use/)

### Inferences

- A generic transcript-and-timestamp index is technically feasible, but that
  does not establish permission to collect, reproduce, display, or charge for
  any particular creator's video or transcript.
- A general-purpose workflow-template offering is already publicly available,
  so a Video Moment Index has no demonstrated differentiation from indexing
  automation merely by linking to moments. [Example workflow template](https://n8n.io/workflows/3184-process-youtube-transcripts-with-apify-openai-and-pinecone-database)

### Unknowns that block admission

1. The candidate creator, primary source URL, intended user, and proposed
   record shape.
2. Written creator authorization covering discovery, ingestion, normalization,
   timestamped links, searchable display, and any paid use.
3. Ownership or licensed rights for the video, transcript/captions, title,
   thumbnail, description, and timestamps.
4. A rights-cleared sample that can prove timestamp accuracy and indexability.
5. Evidence that an identified audience would pay for this decision support.
6. A differentiated user decision that is not served by generic transcript
   retrieval or workflow automation.

## Deterministic admission rubric

All gates below must pass for a named candidate before an implementation or a
reversible portfolio-change recommendation may be made. A missing item is a
`BLOCK`, never an assumed pass.

| Gate               | Required evidence                                                                                                          | Pass rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creator consent    | Dated, attributable, revocable written permission; exact source URLs; allowed uses; revocation contact and verified signal | Every proposed record is covered, and the permission includes searchable timestamp links and the proposed commercial posture. A dated identity-verification record must tie the signer and revocation contact to their claimed rights and every source URL before consent passes. A valid revocation is acknowledged within one business day, stops new collection and public access within two business days, and records whether every remaining source-derived copy was destroyed or retained only for a documented legal obligation. |
| Source rights      | Rights-holder or license record for every displayed or retained content type                                               | No record relies on an unverified fair-use conclusion or platform availability as permission.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Timestamp accuracy | Rights-cleared fixture with canonical video ID, start/end seconds, source URL, and expected moment label                   | Integer second values are nonnegative, start is less than end, and deep-link parameters equal the stored start. An independent validator must replay every proposed fixture record and verify the intended moment begins within plus or minus two seconds of the stored start; their dated result must identify the fixture hash and each checked record.                                                                                                                                                                                |
| Indexability       | Primary-source access record plus no-login, no-bypass collection path                                                      | The named allowed host, media type, retrieval method, and cached fixture pass the existing allowlist and hostile-data boundaries.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Willingness to pay | Pre-registered, consent-respecting demand test tied to one user decision and price                                         | The owner-defined success or stop threshold is recorded before outreach; observed results, denominator, period, and privacy boundary are retained without calling interest a sale.                                                                                                                                                                                                                                                                                                                                                       |
| Differentiation    | Comparable-alternative review and a task rubric                                                                            | A named decision, audience, and measurable outcome remain unavailable or materially less reliable with the alternatives reviewed.                                                                                                                                                                                                                                                                                                                                                                                                        |

## Safe next action

Keep Workflow Test Lab unchanged. A future candidate package may be considered
only after it supplies the six evidence bundles above and a project-original,
rights-cleared fixture. If that package exists, the next task is a fixture-only
spike that tests the rubric in isolation; it must not collect live video,
publish a record, replace the existing workflow experiment, or initiate a paid
test without separate authority.
