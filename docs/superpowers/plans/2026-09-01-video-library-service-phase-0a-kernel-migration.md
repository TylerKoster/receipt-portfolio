# Video Library Service Phase 0A Kernel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the accepted rights-safe AI Moment Index corpus behind explicit clocks, provider-neutral ports, tenant-safe PostgreSQL canary persistence, and a sanitized database projection without changing any public route, content, search result, or timestamp behavior.

**Architecture:** Preserve the existing static proof as the regression oracle while adding a TypeScript modular-monolith service boundary. The operational database never feeds the public builder directly: a tenant-scoped canary projector emits an explicit-field, canary-only snapshot into an isolated temporary comparison tree. Phase 0A supports fixture publication and compare-only validation; the existing fixture remains the only emitted public input. Selectable snapshot publication, rollback from a snapshot, and customer authority remain blocked until Phase 0B supplies signed authorization and tombstone controls.

**Tech Stack:** Node.js 24, TypeScript 5.9, Zod 4, Vitest 3, PostgreSQL 17, `pg`, React/Vite and Fastify package shells, existing deterministic static publisher and evidence core. `pgvector` is explicitly deferred until the Phase 1 retrieval plan requires and tests it.

**Spec:** `docs/product/2026-09-01-video-library-indexing-service-technical-prd.md`

## Global Constraints

- Planning base is `83d4dc14cb82a11a67cd963c29dd5dfa5e314027`; execution begins from a freshly verified accepted `origin/main` only after coordinator disposition of pending AI Moment Index corpus candidate `042614fc8c9f4c4c6470d6609a44963b9d470a9c`, then records that exact execution base in the Phase 0A traceability manifest.
- Preserve untracked `.codebase-memory/`, `.playwright-cli/`, `artifacts/`, and `output/`; never stage, clean, reset, or inspect their contents for this work.
- No customer OAuth, customer content, production credential, live processor, deployment cutover, or paid service action is authorized in Phase 0A.
- Every Phase 0A tenant, source admission, import receipt, and snapshot is constrained to `CANARY_FIXTURE_ONLY`; it cannot satisfy customer authority, approval, or publication eligibility.
- Import the complete rights-safe corpus and admitted evidence manifest at the accepted execution base; derive cardinalities from validated records rather than hardcoding them. The original three exact-moment routes remain mandatory regression anchors, including `moment-robots-control` at 132 seconds.
- Original media bytes remain outside the repository, database, object storage, and build artifacts.
- All customer-owned database tables carry `tenant_id`, composite tenant foreign keys, and forced PostgreSQL RLS.
- Database UUIDv7 primary keys coexist with immutable current public aliases such as `moment-robots-control`.
- Public publisher imports the strict positive-field publication contract and never imports persistence or operational domain objects.
- Domain/provider code treats transcripts and source fields as untrusted data and never executes them.
- Every validation/build entry receives an explicit `Clock`; ambient time is allowed only in `SystemClock` at composition roots.
- Each task follows red → minimal green → relevant regression → independent task review → commit.
- Existing unit, integration, evidence, mutation, deterministic-build, deployment, and exact-timestamp behavior may not regress.
- All generated Phase 0A proof files use a fresh OS temporary directory created for that command. Fixed paths under preserved `artifacts/` or `output/` are forbidden.
- Phase 0A completion is machine-classified separately from full Phase 0 and customer readiness; a Phase 0A `PASS` cannot be promoted to either.

## File and dependency map

```text
packages/domain
  Owns clocks, provider-operation invariants, provider-neutral video types and policies.
packages/connectors
  Owns source connector port only; no live connector in Phase 0A.
packages/retrieval
  Owns transcription/generation/embedding/reranker ports and deterministic test fakes. No live provider.
packages/persistence
  Owns PostgreSQL migrations, non-constructible tenant transactions, canary importer and projector.
packages/publication-contract
  Owns explicit public DTOs; it does not import persistence or whole operational domain schemas.
apps/api
  Compilable Fastify shell with liveness only; no customer route.
apps/worker
  Compilable worker shell plus canary import command.
apps/private-web
  Compilable React/Vite shell only; no simulated customer claim.
apps/public-publisher
  Owns snapshot parsing and isolated parity comparison. It emits fixture output only in Phase 0A.
```

Dependency direction:

```text
domain <- connectors
domain <- retrieval
domain <- persistence
publication-contract <- persistence
publication-contract <- public-publisher
domain + persistence <- worker
domain <- api

Forbidden:
domain -> persistence/provider/apps
public-publisher -> persistence
private-web -> persistence/connectors
connectors/retrieval -> apps
```

---

### Task 1: Establish Phase 0A workspace boundaries

**Files:**

- Create: `test/phase0/workspace-layout.test.ts`
- Create: `test/phase0/workspace-import-boundaries.test.ts`
- Create: `apps/api/src/app.test.ts`
- Create: `apps/worker/src/worker.test.ts`
- Create: `apps/private-web/src/app.test.tsx`
- Create: `apps/api/package.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/main.ts`
- Create: `apps/private-web/package.json`
- Create: `apps/private-web/index.html`
- Create: `apps/private-web/src/main.tsx`
- Create: `apps/private-web/src/app.tsx`
- Create: `apps/worker/package.json`
- Create: `apps/worker/src/worker.ts`
- Create: `apps/worker/src/main.ts`
- Create: `apps/public-publisher/package.json`
- Create: `apps/public-publisher/src/index.ts`
- Create: `packages/domain/package.json`
- Create: `packages/domain/src/index.ts`
- Create: `packages/connectors/package.json`
- Create: `packages/connectors/src/index.ts`
- Create: `packages/retrieval/package.json`
- Create: `packages/retrieval/src/index.ts`
- Create: `packages/persistence/package.json`
- Create: `packages/persistence/src/index.ts`
- Create: `packages/publication-contract/package.json`
- Create: `packages/publication-contract/src/index.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`

**Interfaces:**

- Produces workspace packages `@receipt/domain`, `@receipt/connectors`, `@receipt/retrieval`, `@receipt/persistence`, and `@receipt/publication-contract`.
- Produces application packages `@receipt/video-library-api`, `@receipt/video-library-worker`, `@receipt/video-library-private-web`, and `@receipt/video-library-public-publisher`.
- The API exposes only `buildApp(): FastifyInstance` and `GET /health/live -> { status: 'ok' }`.
- The worker exposes `createWorker(): { start(): Promise<void>; stop(): Promise<void> }` with no jobs registered.
- Every app defines a real `build` script. API injection proves liveness, worker lifecycle is idempotent, private-web emits a production bundle with a title/main/keyboard-focus baseline, and public-publisher has a compiled CLI entry.

- [ ] **Step 1: Write the failing workspace-boundary test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const required = [
  'apps/api/package.json',
  'apps/worker/package.json',
  'apps/private-web/package.json',
  'apps/public-publisher/package.json',
  'packages/domain/package.json',
  'packages/connectors/package.json',
  'packages/retrieval/package.json',
  'packages/persistence/package.json',
  'packages/publication-contract/package.json',
] as const;

describe('Phase 0A workspace layout', () => {
  it('declares every deployment and package boundary with a unique name', () => {
    const names = required.map(
      (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8')).name,
    );
    expect(new Set(names).size).toBe(required.length);
  });

  it('keeps the public publisher independent from persistence', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'apps/public-publisher/package.json'), 'utf8'),
    );
    expect(manifest.dependencies?.['@receipt/persistence']).toBeUndefined();
    expect(
      manifest.dependencies?.['@receipt/publication-contract'],
    ).toBeDefined();
  });
});
```

`workspace-import-boundaries.test.ts` must parse production imports (static, dynamic, and relative) and enforce every edge in the dependency map, not merely manifest dependencies. It rejects public-publisher → persistence, domain → persistence/apps/providers, private-web → persistence/connectors, connectors/retrieval → apps, and any app imported by a package.

- [ ] **Step 2: Run the test and verify the missing workspace failure**

Run: `npx vitest run test/phase0/workspace-layout.test.ts`

Expected: FAIL because the application/package manifests do not exist.

- [ ] **Step 3: Add minimal package shells and root workspace configuration**

Use this root workspace shape:

```json
{
  "workspaces": ["apps/*", "packages/*", "sites/*"]
}
```

Use strict private ESM package manifests. The public-publisher dependencies are exactly:

```json
{
  "@receipt/publication-contract": "0.1.0",
  "@receipt/video-moment-core": "0.1.0",
  "zod": "^4.1.11"
}
```

Add `apps/**/*.ts` and `apps/**/*.tsx` to `tsconfig.json`. Use `jsx: "react-jsx"`; add pinned React/Vite/Fastify dependencies only to their application manifests. Add package-specific `build` scripts plus API injection, worker lifecycle, private-web semantic/accessibility shell, and publisher CLI smoke tests. Do not add a database driver until Task 4.

- [ ] **Step 4: Lock dependencies and run the scoped gates**

Run:

```powershell
npm install --ignore-scripts
npx vitest run test/phase0/workspace-layout.test.ts test/phase0/workspace-import-boundaries.test.ts apps/api/src/app.test.ts apps/worker/src/worker.test.ts apps/private-web/src/app.test.tsx
npm run build --workspaces --if-present
npm run check
```

Expected: layout test PASS and all package entrypoints compile.

- [ ] **Step 5: Run the full legacy suite**

Run: `npm test -- --run`

Expected: all pre-existing tests PASS; no static product output changes.

- [ ] **Step 6: Request independent task review and commit**

Commit:

```powershell
git add package.json package-lock.json tsconfig.json apps packages/domain packages/connectors packages/retrieval packages/persistence packages/publication-contract test/phase0/workspace-layout.test.ts test/phase0/workspace-import-boundaries.test.ts
git commit -m "chore(service): add phase zero workspace skeleton"
```

---

### Task 2: Define provider-neutral, fail-closed operation ports

**Files:**

- Create: `packages/domain/src/provider-operation.ts`
- Create: `packages/domain/src/provider-operation.test.ts`
- Create: `packages/domain/src/provider-types.ts`
- Create: `packages/domain/src/clock.ts`
- Create: `packages/connectors/src/source-connector.ts`
- Create: `packages/retrieval/src/authorized-object-reference.ts`
- Create: `packages/retrieval/src/transcription-provider.ts`
- Create: `packages/retrieval/src/generation-provider.ts`
- Create: `packages/retrieval/src/embedding-provider.ts`
- Create: `packages/retrieval/src/reranker-provider.ts`
- Create: `test/phase0/provider-boundaries.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/connectors/src/index.ts`
- Modify: `packages/retrieval/src/index.ts`

**Interfaces:**

```ts
export interface ProviderOperationContext {
  readonly tenantId: string;
  readonly libraryId: string;
  readonly authorityBindingIds: readonly string[];
  readonly idempotencyKey: string;
  readonly deadline: Date;
  readonly costCeilingMicros: number;
  readonly signal: AbortSignal;
}

export interface ProviderOperationReceipt {
  readonly tenantId: string;
  readonly libraryId: string;
  readonly authorityBindingIds: readonly string[];
  readonly idempotencyKey: string;
  readonly operationContextSha256: string;
  readonly provider: string;
  readonly purpose: string;
  readonly operationId: string;
  readonly requestSha256: string;
  readonly responseSha256: string;
  readonly modelOrApiVersion: string;
  readonly region: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly retainedUntil: string | null;
  readonly deletionState: 'not_applicable' | 'pending' | 'confirmed';
  readonly costMicros: number;
}

export type ProviderResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly receipt: ProviderOperationReceipt;
    }
  | {
      readonly ok: false;
      readonly code: string;
      readonly retryable: boolean;
      readonly receipt: ProviderOperationReceipt;
    };

export function validateProviderOperationContext(
  context: ProviderOperationContext,
  validation: { readonly clock: Clock },
): readonly string[];
```

Use these exact port shapes (all response variants include a receipt):

```ts
export interface SourceConnector {
  preflight(
    request: ConnectorPreflightRequest,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<ConnectorPreflight>>;
  listAssets(
    request: ListAssetsRequest,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<readonly SourceAssetReference[]>>;
  getMetadata(
    request: GetMetadataRequest,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<SourceAssetMetadata>>;
  getAuthorizedTranscript(
    request: GetTranscriptRequest,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<AuthorizedTranscriptReference | null>>;
  getVersion(
    request: GetVersionRequest,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<SourceVersionReference>>;
  checkAvailability(
    request: AvailabilityRequest,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<AvailabilityResult>>;
  revoke(
    request: RevokeRequest,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<RevocationResult>>;
}

export interface TranscriptionProvider {
  transcribe(
    input: AuthorizedObjectReference,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<TranscriptArtifactReference>>;
}

export interface GenerationProvider {
  generateCandidates(
    input: CandidateGenerationInput,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<readonly CandidateMoment[]>>;
}

export interface EmbeddingProvider {
  embed(
    input: EmbeddingInput,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<readonly number[]>>;
}

export interface RerankerProvider {
  rerank(
    input: RerankInput,
    context: ProviderOperationContext,
  ): Promise<ProviderResult<readonly string[]>>;
}
```

Every named request/result is a closed, exported type in its owning file. `AuthorizedObjectReference` contains only an approved object-store key, byte digest, media type, and byte length; it cannot represent an HTTP URL. `RerankerProvider.rerank` returns only supplied candidate IDs.

- [ ] **Step 1: Write failing contract tests**

Cover these exact diagnostics: `TENANT_REQUIRED`, `LIBRARY_REQUIRED`, `AUTHORITY_BINDINGS_REQUIRED`, `IDEMPOTENCY_KEY_REQUIRED`, `DEADLINE_EXPIRED`, `COST_CEILING_INVALID`, and `ABORT_SIGNAL_REQUIRED`. Add compile/runtime fakes for every port. Prove success and failure receipts bind to the exact operation-context digest and non-secret IDs. Add tests proving a reranker result with an unknown candidate ID is rejected and an external failure without a receipt is rejected.

- [ ] **Step 2: Run the provider tests and verify missing exports**

Run: `npx vitest run packages/domain/src/provider-operation.test.ts test/phase0/provider-boundaries.test.ts`

Expected: FAIL because the contracts and validators do not exist.

- [ ] **Step 3: Implement strict schemas and ports**

Use closed Zod schemas for serializable records and readonly TypeScript interfaces for ports. Sort/deduplicate diagnostics. Reject negative/unsafe integer cost values and noncanonical timestamps. Never include content bodies, credentials, or arbitrary callbacks in an operation context/receipt.

- [ ] **Step 4: Run scoped and static gates**

```powershell
npx vitest run packages/domain/src/provider-operation.test.ts test/phase0/provider-boundaries.test.ts
npm run check
```

Expected: PASS.

- [ ] **Step 5: Review and commit**

```powershell
git add packages/domain packages/connectors packages/retrieval test/phase0/provider-boundaries.test.ts
git commit -m "feat(service): define provider neutral operation ports"
```

---

### Task 3: Extract the explicit-clock compatibility domain

**Files:**

- Create: `packages/domain/src/clock.test.ts`
- Create: `packages/domain/src/video/source.ts`
- Create: `packages/domain/src/video/moment-evidence.ts`
- Create: `packages/domain/src/video/moment.ts`
- Create: `packages/domain/src/video/correction.ts`
- Create: `packages/domain/src/video/canary-admission.ts`
- Create: `packages/domain/src/video/policies.test.ts`
- Create: `packages/domain/src/video/adapters/video-corpus-v1.ts`
- Create: `packages/domain/src/video/adapters/video-corpus-v1.test.ts`
- Create: `test/phase0/no-ambient-clock.test.ts`
- Modify: `packages/video-moment-core/src/contracts.ts`
- Modify: `packages/video-moment-core/src/contracts.test.ts`
- Modify: `packages/video-moment-core/src/search.ts`
- Modify: `packages/video-moment-core/src/search.test.ts`
- Modify: `packages/video-moment-core/src/index.ts`
- Modify: `sites/video-moment-search/source-evidence.ts`
- Modify: `sites/video-moment-search/render.ts`
- Modify: `sites/video-moment-search/seo.ts`
- Modify: `scripts/build-sites.ts`
- Modify: affected tests under `sites/video-moment-search` and `test/integration`

**Interfaces:**

```ts
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date;
}

export class FixedClock implements Clock {
  constructor(instant: string | Date);
  now(): Date;
}

export interface ValidationContext {
  readonly clock: Clock;
}

export function validateVideoCorpus(
  value: unknown,
  context: ValidationContext,
): VideoCorpusValidation;

export type MomentEvidenceSource =
  | {
      readonly kind: 'transcript_segments';
      readonly transcriptId: string;
      readonly firstSegmentId: string;
      readonly lastSegmentId: string;
    }
  | {
      readonly kind: 'editorial_annotation';
      readonly annotationId: string;
      readonly sourceEvidenceRecordId: string;
    };

export interface CanaryAdmission {
  readonly evidenceClass: 'CANARY_FIXTURE_ONLY';
  readonly sourceEvidenceRecordIds: readonly string[];
  readonly publicAlias: string;
}
```

`SystemClock` and `FixedClock` return defensive `Date` copies. `build-sites.ts` creates one `SystemClock` and threads its context into every video validation/render/SEO call. Tests use `FixedClock`. Extract provider-neutral source/version, moment-evidence, correction/supersession, currentness, and canary-admission policies into `packages/domain`; the current Commons-specific code becomes an adapter, not the service kernel. The compatibility adapter maps the current three editorial cues to `editorial_annotation` evidence and never invents transcripts or transcript segments.

- [ ] **Step 1: Write failing clock and wall-time isolation tests**

`clock.test.ts` proves fixed time and defensive copies. `policies.test.ts` proves the evidence-source union, correction/currentness rules, and that canary admissions cannot be customer/public approvals. `no-ambient-clock.test.ts` scans production files in domain, video core, video site, and public publisher and rejects `Date.now()` or zero-argument `new Date()` outside `SystemClock` and the composition-root allowlist.

- [ ] **Step 2: Run tests and confirm the existing ambient-time failure**

Run:

```powershell
npx vitest run packages/domain/src/clock.test.ts packages/domain/src/video/policies.test.ts test/phase0/no-ambient-clock.test.ts
npx vitest run packages/video-moment-core/src/contracts.test.ts
```

Expected: FAIL on existing `Date.now()` and missing context.

- [ ] **Step 3: Implement clock primitives and update signatures**

Replace `Date.now()` in rights expiry with `context.clock.now().getTime()`. Remove default `new Date()` from source evidence, render, SEO, sitemap, feed, and publication validation entrypoints. Implement the provider-neutral policy types and preserve the existing public API through explicit compatibility adapters; do not leave Commons-specific rights logic as the domain policy.

- [ ] **Step 4: Add V1 adapter round-trip test**

The adapter must parse the current strict `VideoCorpusSchema`, preserve public aliases and canonical semantic JSON, and reject additional fields. Use the current fixture and a fixed `2026-09-01T00:00:00.000Z` clock.

- [ ] **Step 5: Run the scoped and full regression gates**

```powershell
npx vitest run packages/domain packages/video-moment-core test/phase0/no-ambient-clock.test.ts
npx vitest run sites/video-moment-search
npm run test:integration
npm run check
```

Expected: PASS with unchanged public behavior.

- [ ] **Step 6: Review and commit**

```powershell
git add packages/domain packages/video-moment-core sites/video-moment-search scripts/build-sites.ts test/phase0 test/integration
git commit -m "refactor(video): require explicit validation clock"
```

---

### Task 4: Add PostgreSQL canary persistence with forced RLS

**Files:**

- Create: `infra/local/compose.yml`
- Create: `packages/persistence/src/database.ts`
- Create: `packages/persistence/src/runtime-role.ts`
- Create: `packages/persistence/src/migrations.ts`
- Create: `packages/persistence/src/tenant-transaction.ts`
- Create: `packages/persistence/migrations/0000_bootstrap.sql`
- Create: `packages/persistence/migrations/0001_tenant_foundation.sql`
- Create: `packages/persistence/migrations/0002_video_canary_projection.sql`
- Create: `packages/persistence/migrations/0003_video_canary_rls.sql`
- Create: `packages/persistence/test/migrations.test.ts`
- Create: `packages/persistence/test/rls.test.ts`
- Modify: `packages/persistence/package.json`
- Modify: `packages/persistence/src/index.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

```ts
export interface TenantExecutionContext {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId: string;
}

declare const tenantTransactionBrand: unique symbol;
export interface TenantScopedTransaction {
  readonly [tenantTransactionBrand]: true;
  readonly tenantId: string;
  query<Row>(statement: TenantSafeStatement<Row>): Promise<readonly Row[]>;
}

export function createMigrationPool(connectionString: string): Pool;
export function createAppPool(connectionString: string): Promise<Pool>;
export function createWorkerPool(connectionString: string): Promise<Pool>;
export function createCanaryProjectorPool(
  connectionString: string,
): Promise<Pool>;

export function withTenantTransaction<T>(
  pool: Pool,
  context: TenantExecutionContext,
  operation: (transaction: TenantScopedTransaction) => Promise<T>,
): Promise<T>;

export async function applyMigrations(
  pool: Pool,
  directory: string,
): Promise<readonly string[]>;
```

Tables: `tenants`, `libraries`, `connectors`, `source_scope_selectors`, `source_assets`, `source_versions`, `source_evidence_records`, `editorial_annotations`, `moments`, `moment_editorial_evidence`, `creators`, `topics`, `moment_creators`, `moment_topics`, `canary_admissions`, `canary_import_receipts`, `canary_quarantine_records`, `publication_snapshots`, and `publication_snapshot_lineage`. Every tenant child contains `tenant_id`; every relationship uses a composite tenant foreign key. `external_key` preserves legacy aliases. `canary_import_receipts` stores `(tenant_id, idempotency_key, input_sha256, result_sha256, status)` under a unique tenant/key constraint. `moment_editorial_evidence` has composite tenant foreign keys to exactly one moment, editorial annotation, and source evidence record; its `evidence_kind` is constrained to `editorial_annotation`. Transcript/segment persistence is explicitly deferred until Phase 1 defines those tenant-safe tables; the provider-neutral domain union does not imply nonexistent Phase 0A foreign keys. Creator/topic joins reconstruct existing public relationships without JSON relationship blobs. Quarantine rows record code, subject external key, and input digest without content bodies.

Every Phase 0A tenant and dependent record has `evidence_class = 'CANARY_FIXTURE_ONLY'` enforced by a check constraint and composite foreign keys. No `approved_public`, customer-authority, or general approval state exists in these migrations. Operational authority profiles, bindings, approvals, signed publication manifests, and revocation watermarks are Phase 0B work.

- [ ] **Step 1: Write failing migration and RLS tests**

Test clean apply, repeat no-op, concurrent advisory-lock serialization, checksum mismatch, missing role-specific URLs, `NOBYPASSRLS` app/worker/projector roles, forced RLS on every tenant table, runtime refusal for superuser/`BYPASSRLS`/table-owner identities, cross-tenant read/insert/update/delete/join denial, missing context, context cleanup, cross-tenant foreign-key rejection, evidence-class rejection, editorial-evidence composite-link rejection, and idempotency-receipt uniqueness.

- [ ] **Step 2: Start PostgreSQL 17 and confirm missing migration failure**

```powershell
docker compose -f infra/local/compose.yml up -d --wait postgres
$env:MIGRATION_DATABASE_URL='postgres://receipt_migrator:receipt_migrator@127.0.0.1:54329/receipt_test'
$env:APP_DATABASE_URL='postgres://receipt_app:receipt_app@127.0.0.1:54329/receipt_test'
$env:WORKER_DATABASE_URL='postgres://receipt_worker:receipt_worker@127.0.0.1:54329/receipt_test'
$env:CANARY_PROJECTOR_DATABASE_URL='postgres://receipt_projector:receipt_projector@127.0.0.1:54329/receipt_test'
npx vitest run packages/persistence/test/migrations.test.ts packages/persistence/test/rls.test.ts
```

Expected: FAIL because migration runner/tables do not exist.

- [ ] **Step 3: Implement migration runner and SQL**

Use a transaction-scoped PostgreSQL advisory lock and `service_schema_migrations(version, sha256, applied_at)`. Reject changed checksums. `withTenantTransaction` must call `set_config(name, value, true)` for `app.tenant_id`, `app.actor_id`, and `app.correlation_id`, verify each setting, expose only the branded transaction wrapper, then commit or roll back. Database owner/migrator is distinct from app/worker/projector roles. Every runtime pool checks `current_user`, `rolsuper`, `rolbypassrls`, and table ownership at startup and refuses privileged identities.

- [ ] **Step 4: Run database and static gates**

```powershell
npx vitest run packages/persistence/test/migrations.test.ts packages/persistence/test/rls.test.ts
npm run check
```

Expected: PASS with zero cross-tenant visibility.

- [ ] **Step 5: Stop local database, review, and commit**

```powershell
docker compose -f infra/local/compose.yml stop postgres
git add infra/local packages/persistence package.json package-lock.json
git commit -m "feat(service): add tenant safe canary persistence"
```

---

### Task 5: Import the current proof into a deterministic canary tenant

**Files:**

- Create: `fixtures/video-moment-search/canary-id-map-v1.json`
- Create: `packages/persistence/src/current-corpus-importer.ts`
- Create: `apps/worker/src/commands/import-current-corpus.ts`
- Create: `test/phase0/current-corpus-import.test.ts`
- Modify: `packages/persistence/src/index.ts`
- Modify: `apps/worker/src/worker.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export interface CurrentCorpusImportInput {
  readonly corpus: VideoCorpus;
  readonly evidenceManifest: VideoSourceEvidenceManifest;
  readonly identityMap: CanaryIdentityMapV1;
  readonly fixtureSha256: string;
  readonly evidenceSha256: string;
  readonly context: ValidationContext;
  readonly idempotencyKey: string;
}

export interface CurrentCorpusImportResult {
  readonly status: 'inserted' | 'unchanged';
  readonly tenantId: string;
  readonly libraryId: string;
  readonly counts: {
    readonly assets: number;
    readonly versions: number;
    readonly annotations: number;
    readonly moments: number;
  };
  readonly corpusSemanticSha256: string;
}

export function importCurrentCorpus(
  transaction: TenantScopedTransaction,
  input: CurrentCorpusImportInput,
): Promise<CurrentCorpusImportResult>;
```

- [ ] **Step 1: Write failing deterministic import tests**

Compute expected counts from the validated accepted corpus and assert database counts equal them exactly; never embed an assumed corpus size in service code. Repeated import is unchanged; array reorder does not change IDs or semantic digest; changed bytes under the same idempotency key returns `IDEMPOTENCY_CONFLICT`; malformed evidence rolls back; missing current-proof admission quarantines and excludes; every inserted row remains `CANARY_FIXTURE_ONLY`; the original three public aliases and timestamps remain unchanged (including `moment-robots-control` at `132`); any newly accepted routes also match fixture output; and editorial annotations use `editorial_annotation` evidence without creating transcripts.

- [ ] **Step 2: Run the test and verify importer absence**

Run: `npx vitest run test/phase0/current-corpus-import.test.ts`

Expected: FAIL due to missing importer/identity map.

- [ ] **Step 3: Add explicit UUIDv7 identity map and importer**

Map every tenant, library, connector, selector, asset, version, evidence record, annotation, moment, creator, topic, relationship, canary admission, and snapshot identity by current immutable external key. Do not derive from array order. Validate both fixtures with the same `FixedClock('2026-09-01T00:00:00.000Z')`; insert through the worker-role pool and branded canary tenant transaction. A canary admission references only the current reviewed source evidence and explicitly cannot represent customer authority or an operational approval.

- [ ] **Step 4: Run import and regression gates**

```powershell
docker compose -f infra/local/compose.yml up -d --wait postgres
$env:MIGRATION_DATABASE_URL='postgres://receipt_migrator:receipt_migrator@127.0.0.1:54329/receipt_test'
$env:WORKER_DATABASE_URL='postgres://receipt_worker:receipt_worker@127.0.0.1:54329/receipt_test'
npm run db:migrate:test
npx vitest run test/phase0/current-corpus-import.test.ts
npm run canary:import -- --clock 2026-09-01T00:00:00.000Z
npm run check
docker compose -f infra/local/compose.yml stop postgres
```

Expected: PASS and second import reports `unchanged`.

- [ ] **Step 5: Review and commit**

```powershell
git add fixtures/video-moment-search/canary-id-map-v1.json packages/persistence apps/worker package.json test/phase0/current-corpus-import.test.ts
git commit -m "feat(service): import current proof into canary tenant"
```

---

### Task 6: Project a strict sanitized public snapshot

**Files:**

- Create: `packages/publication-contract/src/video-moment-snapshot-v1.ts`
- Create: `packages/publication-contract/src/video-moment-snapshot-v1.test.ts`
- Create: `packages/persistence/src/publication-projection.ts`
- Create: `apps/public-publisher/src/publication-input.ts`
- Create: `apps/public-publisher/src/commands/export-canary-snapshot.ts`
- Create: `test/phase0/current-corpus-projection.test.ts`
- Modify: `packages/publication-contract/src/index.ts`
- Modify: `packages/persistence/src/index.ts`
- Modify: `apps/public-publisher/src/index.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export interface PublicVideoMomentSnapshotV1 {
  readonly schemaVersion: 1;
  readonly evidenceClass: 'CANARY_FIXTURE_ONLY';
  readonly snapshotPublicAlias: string;
  readonly contentSha256: string;
  readonly generatedAt: string;
  readonly corpusPublicAlias: string;
  readonly corpusLabel: string;
  readonly videos: readonly PublicVideoV1[];
  readonly moments: readonly PublicMomentV1[];
  readonly creators: readonly PublicCreatorV1[];
  readonly topics: readonly PublicTopicV1[];
  readonly evidenceFacts: readonly PublicEvidenceFactV1[];
}

export interface PublicVideoV1 {
  readonly publicAlias: string;
  readonly slug: string;
  readonly title: string;
  readonly creatorPublicAlias: string;
  readonly creatorName: string;
  readonly ordinarySourceUrl: string;
  readonly durationSeconds: number;
  readonly timestampStrategy: 'media-fragment' | 'query-parameter';
  readonly reviewEvidencePublicAlias: string;
}

export interface PublicMomentV1 {
  readonly publicAlias: string;
  readonly videoPublicAlias: string;
  readonly title: string;
  readonly reviewedAnnotation: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly ordinarySourceUrl: string;
  readonly timestampUrl: string;
  readonly creatorPublicAliases: readonly string[];
  readonly topicPublicAliases: readonly string[];
  readonly sourceEvidencePublicAliases: readonly string[];
  readonly correctionState: 'active' | 'corrected';
  readonly correctsMomentPublicAlias: string | null;
  readonly rightsFactPublicAlias: string;
}

export interface PublicCreatorV1 {
  readonly publicAlias: string;
  readonly name: string;
}

export interface PublicTopicV1 {
  readonly publicAlias: string;
  readonly label: string;
}

export interface PublicNamedRoleV1 {
  readonly publicAlias: string;
  readonly name: string;
  readonly relationship: string;
}

export interface PublicEvidenceFactV1 {
  readonly publicAlias: string;
  readonly manifestRecordPublicAlias: string;
  readonly videoPublicAlias: string;
  readonly momentPublicAlias: string;
  readonly rightsFactPublicAlias: string;
  readonly cuePublicAlias: string;
  readonly workTitle: string;
  readonly publisher: PublicNamedRoleV1;
  readonly uploader: PublicNamedRoleV1;
  readonly attributedCreator: PublicNamedRoleV1;
  readonly rightsAuthority: PublicNamedRoleV1;
  readonly evidenceIssuer: PublicNamedRoleV1;
  readonly canonicalSourceEvidenceUrl: string;
  readonly immutableSourceEvidenceUrl: string;
  readonly licenseIdentifier: string;
  readonly licenseUrl: string;
  readonly allowedUses: {
    readonly commercialUse: boolean;
    readonly excerpts: boolean;
    readonly timestampLinks: boolean;
  };
  readonly maxExcerptCharacters: number;
  readonly licenseNote: string;
  readonly permissionVerifiedAt: string;
  readonly rightsExpiresAt: string;
  readonly delivery: {
    readonly url: string;
    readonly mediaType: string;
    readonly byteLength: number;
    readonly acceptRanges: 'bytes';
    readonly durationSeconds: number;
  };
  readonly timestamp: {
    readonly strategy: 'media-fragment' | 'query-parameter';
    readonly seconds: number;
    readonly url: string;
  };
  readonly historicalLicenseReview: {
    readonly issuer: string;
    readonly reviewer: string;
    readonly reviewedOn: string;
    readonly finding: string;
  };
  readonly observedStatus: {
    readonly status: 'source-record-observed';
    readonly precision: 'date';
    readonly observedOn: string;
    readonly normalizedAt: string;
    readonly expiresAt: string;
    readonly sourcePageRevisionPublicId: string;
    readonly sourcePageRevisionUrl: string;
    readonly sourcePageRevisionAt: string;
  };
  readonly annotation: {
    readonly kind: 'original-editorial';
    readonly text: string;
    readonly sha256: string;
  };
  readonly productBoundary: {
    readonly included: readonly string[];
    readonly excluded: readonly string[];
  };
}

export function parsePublicVideoMomentSnapshotV1(
  value: unknown,
): PublicVideoMomentSnapshotV1;

export function projectPublicVideoMomentSnapshot(
  transaction: TenantScopedTransaction,
  input: { tenantId: string; libraryId: string; context: ValidationContext },
): Promise<PublicVideoMomentSnapshotV1>;
```

All public DTOs above are closed Zod schemas. `snapshotPublicAlias` is content-derived (`phase0a-` plus the first 24 hex characters of the canonical payload digest), never a database UUID or row ID. `packages/publication-contract` may not import `packages/domain`, `packages/persistence`, `VideoCorpus`, or `VideoSourceEvidenceManifest`. The strict snapshot excludes tenant UUIDs, actors, memberships, authority documents, approval notes, credentials, private locators, operational IDs, transcripts, queries, vectors, and storage keys. A recursive forbidden-key scan is defense in depth, not the contract.

- [ ] **Step 1: Write failing schema and projection tests**

Test strict unknown-field rejection, digest recomputation, deterministic order, exact explicit-field semantic equality with the current proof, no forbidden key recursively, rejection of any whole-domain object, dependent-only removal for one withdrawn canary admission, stale-evidence rejection, wrong evidence-class rejection, and schema-version rejection.

- [ ] **Step 2: Run tests and verify missing projector failure**

```powershell
npx vitest run packages/publication-contract/src/video-moment-snapshot-v1.test.ts test/phase0/current-corpus-projection.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement snapshot contract and projector**

Read only through the non-bypass canary-projector role and a branded tenant-scoped transaction. Re-evaluate active version, canary admission, evidence, currentness, correction, and quarantine state; do not evaluate or claim customer authority/approval. Construct every public DTO field by field. Write canary-only snapshot/lineage rows before exporting canonical JSON. Hash the canonical payload with `contentSha256` omitted from its own preimage, then validate on parse.

- [ ] **Step 4: Run projection and privacy gates**

```powershell
docker compose -f infra/local/compose.yml up -d --wait postgres
$env:MIGRATION_DATABASE_URL='postgres://receipt_migrator:receipt_migrator@127.0.0.1:54329/receipt_test'
$env:WORKER_DATABASE_URL='postgres://receipt_worker:receipt_worker@127.0.0.1:54329/receipt_test'
$env:CANARY_PROJECTOR_DATABASE_URL='postgres://receipt_projector:receipt_projector@127.0.0.1:54329/receipt_test'
npm run db:migrate:test
npm run canary:import -- --clock 2026-09-01T00:00:00.000Z
$phase0Temp = Join-Path ([System.IO.Path]::GetTempPath()) ("receipt-phase0a-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $phase0Temp | Out-Null
npx vitest run packages/publication-contract/src/video-moment-snapshot-v1.test.ts test/phase0/current-corpus-projection.test.ts
npm run canary:project -- --clock 2026-09-01T00:00:00.000Z --out (Join-Path $phase0Temp 'publication-snapshot-v1.json')
npm run check
docker compose -f infra/local/compose.yml stop postgres
```

Expected: PASS; artifact is untracked and contains no forbidden field.

- [ ] **Step 5: Review and commit**

```powershell
git add packages/publication-contract packages/persistence apps/public-publisher package.json test/phase0/current-corpus-projection.test.ts
git commit -m "feat(publisher): project canary public snapshot"
```

---

### Task 7: Prove fixture-versus-database public semantic parity

**Files:**

- Create: `apps/public-publisher/src/publish-video-moments.ts`
- Create: `apps/public-publisher/src/compare-current-proof.ts`
- Create: `apps/public-publisher/src/commands/compare-current-proof.ts`
- Create: `test/phase0/current-proof-parity.test.ts`
- Modify: `scripts/build-sites.ts`
- Modify: `test/integration/video-moment-search-build.test.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export interface CurrentProofParityReport {
  readonly fixtureSha256: string;
  readonly snapshotSha256: string;
  readonly routeSetEqual: boolean;
  readonly routeContentHashesEqual: boolean;
  readonly timestampUrlsEqual: boolean;
  readonly searchIndexEqual: boolean;
  readonly feedEqual: boolean;
  readonly sitemapEqual: boolean;
  readonly buildManifestSemanticsEqual: boolean;
  readonly diagnostics: readonly string[];
  readonly ok: boolean;
}

export function compareCurrentProof(
  fixtureTree: string,
  snapshotTree: string,
): Promise<CurrentProofParityReport>;
```

- [ ] **Step 1: Write the failing parity test**

Compare the exact home/video/moment/creator routes, static assets, search index, Atom feed, sitemap and index for every record in the accepted execution-base corpus. Preserve original regression targets `#t=132`, `#t=18`, and `#t=75`, and derive any additional expected timestamp targets from the validated fixture rather than from database output. Compare canonical JSON/search ranking and semantic build-manifest filename/hash mappings. Mutate each class independently and require a named diagnostic.

- [ ] **Step 2: Run test and verify missing comparator failure**

Run: `npx vitest run test/phase0/current-proof-parity.test.ts`

Expected: FAIL.

- [ ] **Step 3: Extract the publisher and implement comparator**

Refactor only the AI Moment emission logic from `build-sites.ts`; preserve other three sites and existing CLI behavior. The fixture adapter and explicit public-DTO snapshot adapter produce the same publication input. Write two fresh temporary output trees. Do not normalize generated file contents; compare exact relative paths and bytes. Filesystem timestamps, owner, ACL, and directory-entry order are outside the tree digest and are the complete ignore list. Any other difference fails.

- [ ] **Step 4: Run parity and full portfolio gates**

```powershell
docker compose -f infra/local/compose.yml up -d --wait postgres
$env:MIGRATION_DATABASE_URL='postgres://receipt_migrator:receipt_migrator@127.0.0.1:54329/receipt_test'
$env:WORKER_DATABASE_URL='postgres://receipt_worker:receipt_worker@127.0.0.1:54329/receipt_test'
$env:CANARY_PROJECTOR_DATABASE_URL='postgres://receipt_projector:receipt_projector@127.0.0.1:54329/receipt_test'
npm run db:migrate:test
npm run canary:import -- --clock 2026-09-01T00:00:00.000Z
$phase0Temp = Join-Path ([System.IO.Path]::GetTempPath()) ("receipt-phase0a-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $phase0Temp | Out-Null
npm run canary:project -- --clock 2026-09-01T00:00:00.000Z --out (Join-Path $phase0Temp 'publication-snapshot-v1.json')
npx vitest run test/phase0/current-proof-parity.test.ts
npm run canary:parity -- --clock 2026-09-01T00:00:00.000Z --snapshot (Join-Path $phase0Temp 'publication-snapshot-v1.json') --report (Join-Path $phase0Temp 'parity-report-v1.json')
npm test -- --run
npm run test:integration
npm run check
docker compose -f infra/local/compose.yml stop postgres
```

Expected: parity `ok: true`; legacy suite PASS.

- [ ] **Step 5: Review and commit**

```powershell
git add apps/public-publisher scripts/build-sites.ts test/phase0/current-proof-parity.test.ts test/integration/video-moment-search-build.test.ts package.json
git commit -m "test(publisher): prove canary publication parity"
```

---

### Task 8: Add compare-only CI and machine-checkable Phase 0A closure

**Files:**

- Create: `apps/public-publisher/src/publication-comparison-mode.ts`
- Create: `apps/public-publisher/src/publication-comparison-mode.test.ts`
- Create: `docs/product/video-library-phase-0a-traceability.json`
- Create: `scripts/verify-phase0a.ts`
- Create: `scripts/verify-phase0a.test.ts`
- Create: `test/phase0/publication-comparison-mode.test.ts`
- Modify: `scripts/build-sites.ts`
- Modify: `.github/workflows/verify.yml`
- Create: `docs/operations/video-library-phase-0a-compare.md`
- Modify: `package.json`

**Interfaces:**

```ts
export type Phase0APublicationMode = 'fixture' | 'compare';

export interface Phase0AComparisonConfiguration {
  readonly mode: Phase0APublicationMode;
  readonly validationInstant: string;
  readonly snapshotPath?: string;
  readonly parityReportPath?: string;
}

export interface Phase0APublicationResult {
  readonly emittedSource: 'fixture';
  readonly emittedTree: string;
  readonly parityReport: CurrentProofParityReport | null;
}

export function buildPublicationWithComparison(
  configuration: Phase0AComparisonConfiguration,
): Promise<Phase0APublicationResult>;
```

`validationInstant` is a canonical UTC string owned and validated by the publication contract. The publisher never imports `Clock`, `ValidationContext`, or another operational-domain type.

`scripts/verify-phase0a.ts` owns this canonical required set independently of the JSON manifest:

```ts
export const REQUIRED_PHASE0A_OBLIGATIONS = {
  'PH0A-ARCH-01': 'PRD 5.1-5.3 modular-monolith boundaries',
  'PH0A-PORT-01': 'PRD 6 and 19 provider-neutral recorded egress',
  'PH0A-CLOCK-01': 'PRD 17 deterministic validation',
  'PH0A-DB-01': 'PRD 7 tenant-safe current-proof persistence',
  'PH0A-RLS-01': 'PRD 14.2 tenant isolation and non-bypass roles',
  'PH0A-IMPORT-01': 'PRD 4 and 21 current-proof migration',
  'PH0A-DTO-01': 'PRD 6.3 and 14 positive public projection',
  'PH0A-PARITY-01': 'PRD 17.2 exact public and timestamp parity',
  'PH0A-COMPARE-01': 'PRD 18 reversible comparison without cutover',
  'PH0A-LEGACY-01': 'PRD 17.3 full legacy release gates',
  'PH0A-SCOPE-01': 'PRD 21 Phase 0 partial-scope boundary',
} as const;
```

Each manifest row must uniquely map one required ID to exact test commands and evidence paths plus `PASS|BLOCKED|FAIL`. `PH0A-SCOPE-01` must be `PASS` only when the manifest separately marks full Phase 0 and customer readiness `BLOCKED`. The validator receives the expected base/head commit IDs from CI, rejects missing/duplicate/unknown IDs, stale commits, nonexistent evidence paths, a non-PASS required obligation, or any claim that Phase 0/customer readiness passed.

- [ ] **Step 1: Write failing comparison and traceability tests**

Test that fixture mode emits fixture output; compare mode requires a valid canary snapshot, builds two isolated trees, refuses a mismatch, writes a path-independent parity report, and still emits fixture output on success. Reject `snapshot` as an unknown mode. Prove no snapshot-selection or rollback code path exists, public-publisher has no persistence/domain imports, and deployment workflow remains fixture-based. The traceability tests exercise every canonical ID and independently reject a deleted row, duplicate row, unknown ID, stale commit, missing evidence path, non-PASS required row, full-Phase-0 PASS, and customer-readiness PASS.

- [ ] **Step 2: Run tests and verify missing orchestration/traceability**

Run: `npx vitest run apps/public-publisher/src/publication-comparison-mode.test.ts test/phase0/publication-comparison-mode.test.ts scripts/verify-phase0a.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement compare-only orchestration**

Add environment variables:

```text
VIDEO_MOMENT_PHASE0A_MODE=fixture|compare
VIDEO_MOMENT_PUBLICATION_SNAPSHOT_PATH=<absolute-or-repo-relative-path>
VIDEO_MOMENT_PARITY_REPORT_PATH=<artifact-path>
```

The first integrated release defaults to `compare` in verification and always emits fixture output. Normal deployment does not accept a snapshot input. Selectable snapshot publication and rollback are absent—not dormant—from Phase 0A. Phase 0B must later provide a signed single-purpose manifest binding tenant, verified host, exact authority-binding IDs, distinct approval IDs, current revocation watermark, payload hash, build commit, expiry, and deployment target; rollback must issue a new manifest against current tombstones.

- [ ] **Step 4: Add CI compare gate without production credentials**

Verification CI starts PostgreSQL 17, migrates with the migrator role, imports with the worker role, projects with the non-bypass projector role, compares output, verifies the Phase 0A traceability manifest, then runs existing evidence/build gates. It uses rights-safe fixtures only and uploads the sanitized parity report as a non-secret artifact. Deployment continues to consume the accepted fixture path only.

- [ ] **Step 5: Run final Phase 0A gates twice**

```powershell
npm ci --ignore-scripts
docker compose -f infra/local/compose.yml up -d --wait postgres
$env:MIGRATION_DATABASE_URL='postgres://receipt_migrator:receipt_migrator@127.0.0.1:54329/receipt_test'
$env:APP_DATABASE_URL='postgres://receipt_app:receipt_app@127.0.0.1:54329/receipt_test'
$env:WORKER_DATABASE_URL='postgres://receipt_worker:receipt_worker@127.0.0.1:54329/receipt_test'
$env:CANARY_PROJECTOR_DATABASE_URL='postgres://receipt_projector:receipt_projector@127.0.0.1:54329/receipt_test'
$phase0Temp = Join-Path ([System.IO.Path]::GetTempPath()) ("receipt-phase0a-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $phase0Temp | Out-Null
npm run db:migrate:test
npm run canary:import -- --clock 2026-09-01T00:00:00.000Z
npm run canary:project -- --clock 2026-09-01T00:00:00.000Z --out (Join-Path $phase0Temp 'publication-snapshot-v1.json')
$env:VIDEO_MOMENT_PHASE0A_MODE='compare'
$env:VIDEO_MOMENT_PUBLICATION_SNAPSHOT_PATH=(Join-Path $phase0Temp 'publication-snapshot-v1.json')
$env:VIDEO_MOMENT_PARITY_REPORT_PATH=(Join-Path $phase0Temp 'parity-report-v1.json')
npm run canary:parity -- --clock 2026-09-01T00:00:00.000Z --snapshot $env:VIDEO_MOMENT_PUBLICATION_SNAPSHOT_PATH --report $env:VIDEO_MOMENT_PARITY_REPORT_PATH
npm run phase0a:verify
npm run check
npm test -- --run
npm run test:integration
npm run build --workspaces --if-present
npm run evidence -- collect-fixtures
npm run evidence -- verify --all
npm run evidence -- test-mutation
npm run build
npm run build:manifest
npm audit --audit-level=high
git diff --check
docker compose -f infra/local/compose.yml stop postgres
```

Repeat from a clean locked install and a different temporary directory. Expected: both runs PASS with identical public manifests and path-independent parity reports. The completion result is Phase 0A `PASS`, full Phase 0 `BLOCKED`, customer readiness `BLOCKED`.

- [ ] **Step 6: Obtain cumulative architecture, security, and regression review**

Review the complete base-to-head diff. Any Critical or Important finding blocks integration. Fix only through a new failing test and bounded commit. Review must explicitly confirm there is no selectable snapshot publication, no customer-authority representation, no privileged runtime database identity, and no whole-domain public snapshot.

- [ ] **Step 7: Commit compare mode**

```powershell
git add apps/public-publisher scripts/build-sites.ts scripts/verify-phase0a.ts scripts/verify-phase0a.test.ts .github/workflows/verify.yml package.json test/phase0/publication-comparison-mode.test.ts docs/operations/video-library-phase-0a-compare.md docs/product/video-library-phase-0a-traceability.json
git commit -m "feat(publisher): add canary compare-only gate"
```

## Phase 0A completion receipt

The immutable integration receipt must include:

- base and eight exact commit IDs;
- exact changed paths and dependency graph evidence;
- PostgreSQL version and migration checksums;
- exact migrator/app/worker/projector role identities plus runtime non-owner/non-superuser/non-bypass checks;
- RLS/composite-tenant/evidence-class negative-test evidence;
- fixed validation clock and no-ambient-time evidence;
- accepted-corpus-derived import counts, identity-map hash, fixture/evidence hashes, and preserved original-three regression anchors;
- explicit-field canary snapshot schema/hash, forbidden-field scan, and proof it imports no whole operational model;
- route, content, timestamp, search, feed, sitemap and manifest parity report;
- two clean locked runs and deterministic build manifests;
- full legacy tests, integration, evidence verification/mutation, build and audit;
- independent task reviews and cumulative no-Critical/no-Important verdict;
- explicit statement that public output still emitted from fixture in compare mode;
- machine-readable Phase 0A `PASS`, full Phase 0 `BLOCKED`, and customer readiness `BLOCKED` traceability result;
- explicit residual blockers for Phase 0B identity/security/control plane, Phase 0C commercial/operations, named vendor ADRs, and any customer activation.

Phase 0A completion does not authorize customer data, production service deployment, selectable snapshot publication, or rollback from a snapshot.
