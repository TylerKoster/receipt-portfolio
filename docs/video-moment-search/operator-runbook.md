# Video Moment Search: 90-day operator runbook

## Scope and evidence status

`experiment-ledger.json` is the ranked 90-day operator source. It supplements, and does not replace, the released historical public artifact at `sites/video-moment-search/product-experiment-ledger.json`.

The local measurement contract is deliberately **not configured**: it discards events and neither sends nor stores them. It has no endpoint, analytics SDK, cookies, local storage, query persistence, URL query state, fingerprinting, raw query text, email address, or cross-site identifier. No data means unknown or blocked, never zero demand.

The released preview is a heuristic regression gate only. It does not establish usability, demand, creator participation, referral outcomes, task completion, revenue, or a paid pilot.

## Ranked operating sequence

1. **Creator authorization (rank 1).** Verify source identity and authority attestation, covered URLs and content, rights, commercial/excerpt/expiry/revocation terms, and caption provenance. Quarantine any ambiguity. A creator preview must allow inspection, correction, and removal. Publication follows only passing evidence; attributable campaign evidence follows only approved measurement. The continuation gate is **3 authorized creators and 100 covered videos**.
2. **Corpus growth (rank 2).** Admit only rights-validated moments with exact timestamp routing, correction/removal review, and source evidence. The continuation gate is **500 verified moments**.
3. **Researcher relevance (rank 3).** The controlled benchmark at `researcher-relevance-benchmark.json` spans the three admitted moments with a controlled 7/7/6 distribution at 132/18/75 seconds: its 20 positive and four unrelated negative cases use synthetic benchmark strings rather than raw user queries, and check top-three retrieval, exact timestamp routing, and unrelated zero-result controls. Apply the **>=80% top-three relevance** heuristic gate and record the controlled 7/7/6 fixture-regression timestamp error and zero-result values only. It does not establish general relevance, usability, users, demand, task completion, time-to-value, creator/referral outcomes, conversion, or revenue.
4. **Exact-moment routing (rank 4).** After measurement is explicitly approved, evaluate **>=30% exact-moment click rate among successful searches**. A click is not task completion. Stop on an observed timestamp landing error or a rate below the gate.
5. **Non-branded discovery (rank 5).** Only after approval, use the provisional bounded observation target of **100 non-branded impressions in 90 days**. This is not a demand claim.
6. **Offer interest (rank 6).** Only after approval, use the provisional bounded observation target of **10 offer clicks in 90 days**. This is not revenue or demand proof.
7. **Paid-pilot evidence (rank 7).** The continuation gate is **one paid pilot or credible signed paid commitment within 90 days**. It remains unknown/blocked until primary evidence exists.

## Persona boundaries

- **Applied-AI researcher:** the preview-testable heuristic route above; no usability or task-completion claim.
- **Creator:** bounded source and rights review, preview inspect/correct/remove, then publication only after passing evidence. No production submission system is part of this slice.
- **L&D lead:** `preview-testable-heuristic` only for controlled-fixture search, stored historical evidence inspection, exact-source context routing, and copying a temporary timestamp list from the open page. Approved enterprise-library search, current permission verification, collaboration or retention, measured task completion, measured time-to-value, usability, and demand remain unsupported.

## Controlled L&D handoff-flow gate

Run the fixed synthetic flow: search `robots control`, confirm the validated result, add its one reviewed moment, inspect the exact source-time and stored historical rights fields in the temporary plain-text handoff, copy it or manually copy the visibly retained text if copy fails, then clear the list and reload to confirm it is empty. The metric is **deterministic synthetic L&D handoff-flow integrity**. The target is one fixed flow with one selected moment, exact serialized timestamp and evidence fields, successful or visibly recoverable copy, clear/reload empty, invalid entries admitted `0`, timestamp landing error `0`, and retained or transmitted measurement data `0`.

Stop if a selected item lacks its exact validated timestamp, substantive stored rights evidence, immutable rights revision, or included/excluded product boundary; if raw query text enters the artifact; if the route gains persistence, telemetry, credentials, another network destination, or new rights evidence; or if any wording implies an approved enterprise library, current permission verification, task completion, time-to-value, usability, demand, creator/referral outcomes, conversion, or revenue. The selection and handoff text are page memory only: no storage, account, cookie, URL/history state, beacon, analytics, download, or external sharing endpoint. This fixed synthetic gate is not user research or evidence of any user outcome.

## Measurement review

Review the required metrics together: top-three relevance, timestamp landing error, zero-result rate, exact-moment click rate, correction rate, creator referral clicks, task completion, and time-to-value. Any later measurement approval must preserve the allowlist and explicitly document a lawful endpoint before recording. Until then, do not transmit or retain events.
