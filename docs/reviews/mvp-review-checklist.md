# Receipt Portfolio MVP review checklist

## Review identity

- Exact base commit under review:
  `365477e30e49ec87665e470b0230ed872c110ac2`.
- Candidate under validation: that exact commit plus the Task 7 working-tree
  implementation and documentation diff. The Task 7 commit cannot name itself;
  its final SHA is retained in the ignored Task 7 report and is the ref for the
  subsequent whole-branch review.
- Validation time (UTC): `2026-08-29T19:52:30.561Z`.

## Release checks

- [x] Every rendered receipt card has source URL, observed time, raw hash,
      normalized hash, manifest hash, and explicit gate decision. The validation
      scan found 4 cards and all 6 required fields on each card.
- [x] Fetched content is never executed or rendered as source HTML. The full
      suite includes hostile-markup escaping, invalid-link containment,
      response-boundary, and non-execution paths.
- [x] Byte/content, predecessor, and filename mutations are detected in an
      isolated copy, and canonical `evidence/` remains unchanged.
- [x] Both workflow files declare read-only contents permission; the prohibited
      deployment, push, release, publish, write-permission, and provider-command
      scan found 0 matches.
- [x] All three sites build from the controlled fixture evidence without a
      network request; the strict public inventory contains 6 files.
- [ ] Release rollback restores a prior tagged release without rewriting receipts.

## Validation record

| Command or check                                                                              | Result                                                                                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `$env:npm_config_offline='true'; npm ci`                                                      | Exit 0; 158 packages added; 160 packages audited; 0 vulnerabilities. Offline mode prevented registry access. |
| `npm run check`                                                                               | Exit 0; TypeScript no-emit and ESLint passed.                                                                |
| `npm test -- --run test/integration/pipeline.test.ts test/integration/build-manifest.test.ts` | 2 files, 22 tests passed.                                                                                    |
| `npm test -- --run`                                                                           | 9 files, 126 tests passed.                                                                                   |
| `npm run test:integration`                                                                    | 4 files, 35 tests passed.                                                                                    |
| `npm run evidence -- collect-fixtures`                                                        | Exit 0; 4 local fixture receipt files present.                                                               |
| `npm run evidence -- verify --all`                                                            | Exit 0; canonical receipt tree verified.                                                                     |
| `npm run build`                                                                               | Exit 0; compiler output remained under `dist/runtime/`; public output was replaced at `dist/sites/`.         |
| `npm run evidence -- test-mutation`                                                           | `MUTATION_CHECK PASS detected=3/3 byte-content,predecessor,filename canonical=unchanged`.                    |
| Two consecutive `npm run build` + `npm run build:manifest` runs                               | Both returned `0eec1c971311123446f822d76c589cc52645d7ddc57f43486584cafe3131000c`.                            |
| Workflow prohibited-pattern scan                                                              | 2 workflow files; 2 read-only contents declarations; 0 prohibited matches.                                   |
| Scoped `npx --no-install prettier --check` over every Task 7 file                             | Exit 0; all matched files use Prettier style.                                                                |
| `git diff --check`                                                                            | Exit 0; no whitespace errors.                                                                                |

## Known limits and deployment status

- Fixture inputs are controlled local examples. Their success is not live
  source truth, current source health, provider execution, or public
  availability.
- No live-source dry-run was performed during this no-network validation.
- A repository-wide Prettier check still reports the pre-existing `AGENTS.md`,
  approved design spec, and implementation plan. Task 7 leaves those governing
  files unchanged and validates formatting over every file in its own diff.
- `npm ci` reported 0 known vulnerabilities but warned that the resolved ESLint
  `9.39.5` release is no longer supported. Dependency maintenance is a separate
  bounded task; Task 7 does not change the locked dependency graph.
- No hosting provider, deployment remote, account, or credential is configured.
  Deployment status is **not attempted / not hosted**.
- The hourly Codex heartbeat states local orchestration intent only. It does not
  prove GitHub Actions or provider execution.
- No release tag exists. The rollback check remains open, and `v0.1.0` is
  deliberately withheld until a final whole-branch review and controller
  validation authorize tagging.
