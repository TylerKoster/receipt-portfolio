# Video Moment Search: 90-day operator runbook

## Scope and evidence status

`experiment-ledger.json` is the ranked 90-day operator source. It supplements, and does not replace, the released historical public artifact at `sites/video-moment-search/product-experiment-ledger.json`.

The local measurement contract is deliberately **not configured**: it discards events and neither sends nor stores them. It has no endpoint, analytics SDK, cookies, local storage, query persistence, URL query state, fingerprinting, raw query text, email address, or cross-site identifier. No data means unknown or blocked, never zero demand.

The released preview is a heuristic regression gate only. It does not establish usability, demand, creator participation, referral outcomes, task completion, revenue, or a paid pilot.

## Ranked operating sequence

1. **Creator authorization (rank 1).** Verify source identity and authority attestation, covered URLs and content, rights, commercial/excerpt/expiry/revocation terms, and caption provenance. Quarantine any ambiguity. A creator preview must allow inspection, correction, and removal. Publication follows only passing evidence; attributable campaign evidence follows only approved measurement. The continuation gate is **3 authorized creators and 100 covered videos**.
2. **Corpus growth (rank 2).** Admit only rights-validated moments with exact timestamp routing, correction/removal review, and source evidence. The continuation gate is **500 verified moments**.
3. **Researcher relevance (rank 3).** The controlled benchmark at `researcher-relevance-benchmark.json` is a retrieval regression over one admitted moment: it uses synthetic benchmark strings rather than raw user queries, checks top-three retrieval, exact timestamp routing, and unrelated zero-result controls. Apply the **>=80% top-three relevance** heuristic gate and record fixture-regression timestamp error and zero-result values only. It is not general relevance, usability, demand, measured time-to-value, creator, referral, conversion, or revenue evidence.
4. **Exact-moment routing (rank 4).** After measurement is explicitly approved, evaluate **>=30% exact-moment click rate among successful searches**. A click is not task completion. Stop on an observed timestamp landing error or a rate below the gate.
5. **Non-branded discovery (rank 5).** Only after approval, use the provisional bounded observation target of **100 non-branded impressions in 90 days**. This is not a demand claim.
6. **Offer interest (rank 6).** Only after approval, use the provisional bounded observation target of **10 offer clicks in 90 days**. This is not revenue or demand proof.
7. **Paid-pilot evidence (rank 7).** The continuation gate is **one paid pilot or credible signed paid commitment within 90 days**. It remains unknown/blocked until primary evidence exists.

## Persona boundaries

- **Applied-AI researcher:** the preview-testable heuristic route above; no usability or task-completion claim.
- **Creator:** bounded source and rights review, preview inspect/correct/remove, then publication only after passing evidence. No production submission system is part of this slice.
- **L&D lead:** approved-library search plus adjacent context, saved/shared timestamped lists, and permissions verification are proposed flows. They are not yet testable and must not be presented as delivered capability or user evidence.

## Measurement review

Review the required metrics together: top-three relevance, timestamp landing error, zero-result rate, exact-moment click rate, correction rate, creator referral clicks, task completion, and time-to-value. Any later measurement approval must preserve the allowlist and explicitly document a lawful endpoint before recording. Until then, do not transmit or retain events.
