# Video Moment Search: 90-day operator runbook

## Scope and evidence status

`experiment-ledger.json` is the ranked 90-day operator source. It supplements, and does not replace, the released historical public artifact at `sites/video-moment-search/product-experiment-ledger.json`.

The local measurement contract is deliberately **not configured**: it discards events and neither sends nor stores them. It has no endpoint, analytics SDK, cookies, local storage, query persistence, URL query state, fingerprinting, raw query text, email address, or cross-site identifier. No data means unknown or blocked, never zero demand.

The released preview is a heuristic regression gate only. It does not establish usability, demand, creator participation, referral outcomes, task completion, revenue, or a paid pilot.

## Ranked operating sequence

1. **Creator authorization (rank 1).** Verify source identity and authority attestation, covered URLs and content, rights, commercial/excerpt/expiry/revocation terms, and caption provenance. Quarantine any ambiguity. A creator preview must allow inspection, correction, and removal. Publication follows only passing evidence; attributable campaign evidence follows only approved measurement. The continuation gate is **3 authorized creators and 100 covered videos**.
2. **Corpus growth (rank 2).** Admit only rights-validated moments with exact timestamp routing, correction/removal review, and source evidence. The continuation gate is **500 verified moments**.
3. **Researcher relevance (rank 3).** The controlled benchmark at `researcher-relevance-benchmark.json` spans ten admitted moments: 7/7/6 controlled cases for the established moments and six cases for each of the seven added moments. Its 62 positive and four unrelated negative cases use synthetic benchmark strings rather than raw user queries, and check top-three retrieval, exact integer-second timestamp routing, and unrelated zero-result controls. Apply the **>=80% top-three relevance** heuristic gate and record the controlled fixture-regression timestamp error and zero-result values only. It does not establish general relevance, usability, users, demand, task completion, time-to-value, creator/referral outcomes, conversion, or revenue.
4. **Exact-moment routing (rank 4).** After measurement is explicitly approved, evaluate **>=30% exact-moment click rate among successful searches**. A click is not task completion. Stop on an observed timestamp landing error or a rate below the gate.
5. **Non-branded discovery (rank 5).** Only after approval, use the provisional bounded observation target of **100 non-branded impressions in 90 days**. This is not a demand claim.
6. **Offer interest (rank 6).** Only after approval, use the provisional bounded observation target of **10 offer clicks in 90 days**. This is not revenue or demand proof.
7. **Paid-pilot evidence (rank 7).** The continuation gate is **one paid pilot or credible signed paid commitment within 90 days**. It remains unknown/blocked until primary evidence exists.

## Controlled query-recovery integrity gate

This fixed synthetic gate covers only the three server-rendered controls: `robots control`, `generative AI`, and `AI industry society`. It uses the admitted public index and exact ordinary source timestamp links; it neither fetches new sources nor creates user, demand, usability, task-completion, or outcome evidence.

- Metric: **deterministic controlled-query recovery integrity**.
- Baseline: one prose example is visible; zero-result recovery is generic; the other two admitted moments have no executable example control.
- Target: **3/3 controls recover from an unrelated zero-result state to the expected unique moment at 132/18/75 with timestamp landing error 0, native navigations 0, extra requests 0, and retained or transmitted measurement data 0**.
- Stop: any wrong/multiple result, timestamp mismatch, native navigation, query/history/storage/telemetry persistence, extra network destination, loss of the server fallback, unsupported or transcript-derived example, or prohibited outcome claim.
- Evidence boundary: `sites/video-moment-search/site.test.ts` exercises the shipped client payload and stored exact timestamp links. This fixed synthetic recovery gate is not user research or evidence of any user outcome.

## Controlled literal match-explanation gate

This deterministic synthetic gate verifies only that dynamic search cards name the already-admitted field(s) containing literal query tokens: Source title, Topics, or Original editorial annotation. It preserves the same ranked results and exact stored timestamp links; server-rendered initial results, creator-review cards, L&D handoff cards, zero-result state, and unavailable-index fallback show no reason.

- Metric: **deterministic literal match-explanation integrity**.
- Baseline: ranked results expose no field-level reason.
- Target: **3/3 controlled queries truthful; timestamp landing error 0; false reasons 0; raw-query reflection 0; extra requests 0; retained or transmitted measurement records 0**.
- Stop: any unsupported reason, query reflection, ranking or routing change, persistence or transmission, extra network, fallback loss, semantic relevance claim, or user-outcome claim.
- Evidence boundary: `sites/video-moment-search/site.test.ts` exercises the shipped client payload with the existing synthetic fixture. This is not usability, relevance, demand, conversion, or revenue evidence.

## Controlled creator review preview gate

This page-memory-only preview is a deterministic synthetic integrity gate for the ten admitted reviewed fixture moments. It allows inspection of stored source, creator, interval, exact source timestamp, evidence, license, immutable rights revision, historical review/freshness wording, product boundary, and correction state. It does not submit a library, change a published record, prove creator onboarding, send or store review/referral data, or establish any user outcome.

- Metric: **deterministic controlled creator review-flow integrity**.
- Baseline: the creator persona was not yet preview-testable.
- Target: **10 admitted reviewed moments; exact timestamp landing error 0; correction decisions previewed 1; removal decisions previewed 1; extra requests 0; retained or transmitted measurement records 0**.
- Stop: missing or ambiguous rights evidence, index mutation, wrong timestamp, persistence or transmission, extra network destination, broken search or fallback, or prohibited outcome claims.
- Referral evidence: unavailable — measurement is not configured.

The bounded creator onboarding sequence remains: authorized intake and authority attestation (not implemented), quarantine and operator review, creator inspection, correction/removal approval, publication only after passing evidence, and attributable referral reporting only after an explicitly approved endpoint. Real rights-cleared library submission, publication correction/removal, attributable referral evidence, measured task completion/time-to-value, usability, demand, conversion, and revenue remain blocked or unsupported.

## Corpus expansion verification record

The bounded expansion adds exactly 2 reviewed videos, 7 reviewed one-second moments, 42 controlled positive queries, and 9 indexable HTML routes, producing 19 Video Moment Search HTML routes in total. The same offline review cycle covers all 5 rights records and checks all 10 annotation/timestamp bindings. It adds no creator page: the two sources use existing creator identities. The 500-verified-moment continuation gate remains incomplete, and these deterministic fixture checks provide no real-user, usability, demand, creator-participation, conversion, or revenue evidence.

## Persona boundaries

- **Applied-AI researcher:** the preview-testable heuristic route above; no usability or task-completion claim.
- **Creator:** bounded source and rights review, preview inspect/correct/remove, then publication only after passing evidence. No production submission system is part of this slice.
- **L&D lead:** `preview-testable-heuristic` only for controlled-fixture search, stored historical evidence inspection, exact-source context routing, and copying a temporary timestamp list from the open page. Approved enterprise-library search, current permission verification, collaboration or retention, measured task completion, measured time-to-value, usability, and demand remain unsupported.

## Controlled L&D handoff-flow gate

Run the fixed synthetic flow: search `robots control`, confirm the validated result, add its one reviewed moment, inspect the exact source-time and stored historical rights fields in the temporary plain-text handoff, copy it or manually copy the visibly retained text if copy fails, then clear the list and reload to confirm it is empty. The metric is **deterministic synthetic L&D handoff-flow integrity**. The target is one fixed flow with one selected moment, exact serialized timestamp and evidence fields, successful or visibly recoverable copy, clear/reload empty, invalid entries admitted `0`, timestamp landing error `0`, and retained or transmitted measurement data `0`.

Stop if a selected item lacks its exact validated timestamp, substantive stored rights evidence, immutable rights revision, or included/excluded product boundary; if raw query text enters the artifact; if the route gains persistence, telemetry, credentials, another network destination, or new rights evidence; or if any wording implies an approved enterprise library, current permission verification, task completion, time-to-value, usability, demand, creator/referral outcomes, conversion, or revenue. The selection and handoff text are page memory only: no storage, account, cookie, URL/history state, beacon, analytics, download, or external sharing endpoint. This fixed synthetic gate is not user research or evidence of any user outcome.

## Measurement review

Review the required metrics together: top-three relevance, timestamp landing error, zero-result rate, exact-moment click rate, correction rate, creator referral clicks, task completion, and time-to-value. Any later measurement approval must preserve the allowlist and explicitly document a lawful endpoint before recording. Until then, do not transmit or retain events.
