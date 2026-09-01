# Evidence-Bound Product Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable, fail-closed static product-blog infrastructure while publishing no product post at v0.1.56.

**Architecture:** Product lanes own fixed-path registries under their existing site directories. Shared code validates the registry union atomically, renders admitted static pages and Atom, and derives the exact sitemap/build inventory used by both the builder and manifest verifier.

**Tech Stack:** TypeScript 5.9, Node.js 24, Vitest, existing static HTML/CSP renderer, deterministic JSON and SHA-256 utilities.

**Spec:** `docs/superpowers/specs/2026-08-31-evidence-bound-product-blog-design.md`

## Global Constraints

- Production discovers only `search-receipt`, `skill-ledger`, `video-moment-search`, and `workflow-test-lab` registry paths.
- Missing registries are empty; controlled fixtures are test-only and never published.
- Validate the full registry union before writing public output.
- No script, form, storage, telemetry, account, runtime network client, current-status claim, or causation claim.
- Preserve current four-product routes, atomic staging/rollback, deterministic manifests, CSP, and AI Moment Index `#t=132` behavior.

---

### Task 1: Fail-closed blog contract and union validator

**Files:**

- Create: `sites/shared/blog.ts`
- Create: `sites/shared/blog.test.ts`
- Create: `fixtures/shared/controlled-blog-registry-v1.json`
- Create: `fixtures/shared/controlled-blog-registry-invalid-v1.json`

**Interfaces:**

- Produces: `ProductBlogRegistry`, `ValidatedBlogRegistryUnion`, and `validateProductBlogRegistries(registries: readonly unknown[]): BlogValidationResult`.
- Produces: fixed `PRODUCT_BLOG_SITE_IDS` and fixed per-site internal-prefix/external-host link policy.

- [ ] **Step 1: Write failing tests for the controlled valid fixture and every fail-closed diagnostic.**

```ts
expect(validateProductBlogRegistries([validFixture])).toMatchObject({
  ok: true,
});
expect(validateProductBlogRegistries([withoutSources])).toMatchDiagnostic(
  'BLOG_SOURCE_BINDING_MISSING',
);
expect(validateProductBlogRegistries([currentClaim])).toMatchDiagnostic(
  'BLOG_CURRENT_STATUS_CLAIM',
);
expect(validateProductBlogRegistries([causalClaim])).toMatchDiagnostic(
  'BLOG_CAUSATION_CLAIM',
);
expect(validateProductBlogRegistries([badLink])).toMatchDiagnostic(
  'BLOG_LINK_NOT_ALLOWLISTED',
);
```

- [ ] **Step 2: Run `npx vitest run sites/shared/blog.test.ts` and verify module-not-found RED.**
- [ ] **Step 3: Implement strict structural validation, canonical UTC date round-trip, `modifiedAt >= publishedAt`, source-reference closure, fixed link policy, claim detection, and union duplicate checks.**
- [ ] **Step 4: Run the focused test and verify GREEN.**
- [ ] **Step 5: Commit contract, fixtures, and tests with `feat(blog): validate evidence-bound product registries`.**

### Task 2: Static index, post, Atom, and route derivation

**Files:**

- Modify: `sites/shared/blog.ts`
- Modify: `sites/shared/blog.test.ts`

**Interfaces:**

- Produces: `renderProductBlogIndex(site, registry, baseUrl)`, `renderProductBlogPost(site, post, baseUrl)`, `renderProductBlogAtom(site, registry, baseUrl)`, and `productBlogRoutes(union)`.

- [ ] **Step 1: Add failing assertions for self-canonicals, unique title/description, dates, author/editorial disclosure, escaped content, source links, Atom entry ids/dates, sitemap paths, and absence of scripts/forms.**
- [ ] **Step 2: Run `npx vitest run sites/shared/blog.test.ts` and verify missing-renderer RED.**
- [ ] **Step 3: Implement rendering through `renderStaticPage`, XML escaping, deterministic published/slug ordering, and exact route derivation.**
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Commit with `feat(blog): render static product blog routes`.**

### Task 3: Fixed product-owned registry discovery

**Files:**

- Modify: `sites/shared/blog.ts`
- Modify: `sites/shared/blog.test.ts`

**Interfaces:**

- Produces: `loadProductBlogRegistries(root: string): Promise<BlogValidationResult>` reading only `sites/<PRODUCT_BLOG_SITE_IDS[n]>/blog-registry.json`.

- [ ] **Step 1: Add failing temporary-root tests proving missing/empty registries produce an admitted empty union, a Search registry stays in Search namespace, an unapproved or mismatched site id is rejected, and one invalid product rejects the entire union.**
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Implement fixed-path reads with ENOENT-as-empty only; propagate every other read/parse error and validate the union once.**
- [ ] **Step 4: Run focused tests and verify GREEN.**
- [ ] **Step 5: Commit with `feat(blog): discover product-owned registries`.**

### Task 4: Atomic shared build, sitemap, and exact manifest inventory

**Files:**

- Modify: `scripts/build-sites.ts`
- Modify: `scripts/hash-build.ts`
- Modify: `sites/shared/render.ts`
- Modify: `test/integration/site-build.test.ts`
- Modify: `test/integration/build-manifest.test.ts`

**Interfaces:**

- `BuildOptions` accepts a test-only `blogRegistryRoot` defaulting to the repository root.
- `hashPublicBuild(outputDirectory, options?)` derives exact blog paths from the same fixed registries.

- [ ] **Step 1: Add failing integration tests using a temporary Search-owned registry root. Assert only Search blog index/feed/post and sitemap entries emit, another site cannot claim Search, invalid content leaves prior output unchanged, missing registries preserve exact inventory, and arbitrary unregistered blog paths are rejected.**
- [ ] **Step 2: Run focused integration tests and verify RED.**
- [ ] **Step 3: Load and validate the union before any writes in `writeSiteTree`; emit admitted blog directories/files and merge exact routes into the product sitemap.**
- [ ] **Step 4: Change strict manifest admission from broad patterns to the exact validated `productBlogRoutes` inventory, preserving fixed required files and symlink rejection.**
- [ ] **Step 5: Run focused integration tests and verify GREEN, including existing `#t=132` assertions.**
- [ ] **Step 6: Commit with `feat(blog): integrate exact product blog inventory`.**

### Task 5: Repository-wide verification and independent review

**Files:**

- No production changes expected.

**Interfaces:**

- Consumes all prior task outputs.

- [ ] **Step 1: Run `npx prettier --check .`, `npm run check`, focused blog tests, full `npm test -- --run`, and `npm run test:integration`.**
- [ ] **Step 2: Run fixture collection, `evidence -- verify --all`, mutation detection, two builds, and compare build-manifest digests.**
- [ ] **Step 3: Run `npm audit --omit=dev` and `git diff --check`.**
- [ ] **Step 4: Obtain an independent read-only review for contract safety, ownership, atomicity, escaping/XML, inventory exactness, and regressions; fix findings test-first in a bounded commit.**
- [ ] **Step 5: Report immutable base/head, exact paths, validation counts, known limits, and cherry-pick instructions; do not push, tag, merge, or deploy.**
