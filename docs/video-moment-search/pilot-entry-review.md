# Future real-customer pilot-entry review packet

## Purpose and non-authority

This is a future real-customer pilot-readiness template to fill only in a separately approved private system. It grants no current demo authority and is not a prerequisite for the private, local-only, fictional, transcript-first demonstration using approved openly licensed material. Current execution instead follows the coordinator-supplied September 2 [Owned Video Library demonstration PRD](C:/Users/Tkost/Documents/ChatGPT/SEO/docs/product/2026-09-02-owned-video-library-demo-prd.md) §14 and its [timeboxed task plan](C:/Users/Tkost/Documents/ChatGPT/SEO/docs/superpowers/plans/2026-09-02-owned-library-timeboxed-delivery.md) §§2 and 5. Those documents are draft implementation direction supplied by the coordinator; they have not been integrated into accepted `main`.

This packet records no customer identity, content, credential, token, source URL, or contract text. A blank template, synthetic example, canary result, OAuth success, or completed form does not grant permission. During the current demonstration, every customer-pilot, paid-order, OAuth, provider, and 40-query requirement in this packet is dormant and non-applicable. Future readiness is only `not_observed` or `blocked`; Phase 0A canary-only success satisfies neither customer authorization gate.

For every packet item, the private system records an immutable evidence reference, SHA-256 hash, version, role/owner, review date, expiry, verdict (`not_observed`, `blocked`, or `ready_for_authorized_review`), missing item, and next safe action. Restriction, expiry, revocation, or deletion invalidates all dependent scopes and derivatives. Public output needs separately opted-in and approved authority.

## Gate A — before OAuth and before metadata fetch

Gate A may use customer assertions/documents but fetches no source metadata, caption, transcript, or media. All items below begin `not_observed` or `blocked` until private evidence is reviewed.

| Required private evidence record            | Required coverage / verdict rule                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0–3 prerequisites and drills          | Named vendor/region/key/retention decisions; RLS, authority blocking, idempotency/outbox, deletion/restore, canary parity, and grounding/invalidation prerequisites have current approved evidence. Canary proof alone does not pass either gate.                                                                    |
| Signed paid order and entitlement           | Signed paid order; plan, processor limits, cost/human planning ceiling, support and termination terms. No order means `blocked`.                                                                                                                                                                                     |
| Roles and secure approvals                  | Named owner, rights, privacy/security, and support contacts; eligible approvers; OIDC/MFA proof for owners, rights admins, operators, and destructive actions.                                                                                                                                                       |
| Authority profile and immutable selectors   | Versioned profile plus immutable source-scope selectors for declared account/channel/playlists and asset IDs; each restriction or stale binding blocks dependent use.                                                                                                                                                |
| Granular subject / field / purpose bindings | Versioned evidence for owner, publisher, speaker, guest, likeness, voice, slide deck, music, transcript, caption, thumbnail, embed, excerpt, export, and media transfer; bind each to subject, selector/asset/version, field, purpose, decision, territory, expiry, and source/version. Missing scope is prohibited. |
| Processor and egress contract               | Named processors/subprocessors, region, DPA, allowed fields/purpose, egress, retention/deletion proof, and no-training terms; a provider lacking any required proof is unavailable.                                                                                                                                  |
| Private-service security and lifecycle      | Tenant ACL/RLS/isolation, encryption/key evidence, storage, retention, backup, export, query/event retention, incident, restore, deletion, tombstone, and support-grant proofs.                                                                                                                                      |
| Preflight boundary                          | Exact least OAuth scopes, no metadata fetched yet, declared preflight retention/cancel cleanup, and no caption/model processing, indexing, or publication.                                                                                                                                                           |

## Gate B — after narrow OAuth preflight, before content processing

After Gate A authorizes the narrow metadata and caption-availability preflight, Gate B evaluates its results; it permits no content processing until it passes. The preflight must not transfer captions to models, transcribe, embed, index, process content, or publish. All items below begin `not_observed` or `blocked`.

| Required private evidence record    | Required coverage / verdict rule                                                                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth and preflight receipt         | Least-scope authorization, immutable preflight run/version, declared host/path behavior, and evidence that only metadata/caption availability was fetched. OAuth success alone is `blocked`.                                                    |
| Deterministic selector resolution   | Resolved source assets/versions and every granular binding; exact selection includes counts, availability, blocked/unmatched/ambiguous assets, cost, and source/version evidence. Unmatched or ambiguous assets are prohibited/quarantined.     |
| Exact selection and cost acceptance | Authorized customer approval of the exact resolved selection and cost ceiling before processing; no general approval substitutes for this acceptance.                                                                                           |
| Cancel and cleanup proof            | Cancel revokes temporary source access and deletes preflight metadata according to policy; record cleanup/retention proof and any unresolved exception.                                                                                         |
| Processing recheck                  | Revalidate subject/field/purpose/source/version bindings, processor/region/DPA/egress/no-training, tenant controls, retention/backups/export/query-event/incident/restore/tombstones, entitlement/cost/support before each dependent operation. |
| Public separation                   | Public output remains off unless a separate opt-in, granular publication approval, and Phase 5 evidence exist; private access never implies public authority.                                                                                   |

## Traceability anchors and dry-run

For a future real-customer pilot, the private reviewer links each evidence record to PRD §7.1 (immutable authority/approval records), §§9.1–9.2 (preflight/connectors), §13.2 (40-query benchmark), §§14.2–14.6 (security, rights, privacy, retention, incident/restore), §§20.1/20.3/20.5 (entry, measures, stop rules), Customer Gates A/B in §21, and §25 (service-pilot definition of done). The future queue is [service-experiment-ledger.md](service-experiment-ledger.md); it does not control the current demonstration.

Future-pilot dry run, no customer evidence: Gate A `blocked`; Gate B `blocked`; customer processing `blocked`; public output `blocked`. The safe future action is a separately approved private-system review, not a connector call or collection activity. These outcomes do not block or authorize the current demonstration.

| Negative tabletop case                     | Verdict   | Next safe action                                                             |
| ------------------------------------------ | --------- | ---------------------------------------------------------------------------- |
| Canary PASS only                           | `blocked` | Obtain all private Gate-A evidence.                                          |
| OAuth success only                         | `blocked` | Complete exact Gate-B selection/cost review.                                 |
| Guest scope unknown                        | `blocked` | Obtain an eligible, versioned guest binding or exclude the scope.            |
| Stale or revoked binding                   | `blocked` | Invalidate dependents; obtain current approval before any reuse.             |
| Private evidence proposed for Git          | `blocked` | Keep it in the approved private system only.                                 |
| All form fields filled but no signed proof | `blocked` | Obtain immutable signed evidence; do not treat form completion as authority. |

Residual limits: this packet records neither an approval nor a customer result. It does not validate vendor claims, contracts, implementation, provider behavior, benchmarks, demand, payment, or recurring value.
