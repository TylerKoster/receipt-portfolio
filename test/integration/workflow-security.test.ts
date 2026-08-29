import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../.github/workflows/collect-dry-run.yml', import.meta.url),
  'utf8',
);
const verifyWorkflow = readFileSync(
  new URL('../../.github/workflows/verify.yml', import.meta.url),
  'utf8',
);

function configuredManifests(): readonly Record<string, unknown>[] {
  const manifestsRoot = new URL('../../manifests/', import.meta.url);
  return readdirSync(manifestsRoot, { withFileTypes: true }).flatMap((site) =>
    readdirSync(new URL(`${site.name}/`, manifestsRoot), {
      withFileTypes: true,
    }).map(
      (entry) =>
        JSON.parse(
          readFileSync(
            new URL(`${site.name}/${entry.name}`, manifestsRoot),
            'utf8',
          ),
        ) as Record<string, unknown>,
    ),
  );
}

describe('scheduled dry-run workflow boundary', () => {
  it('has at least one enabled approved Search source that the live dry-run can execute', () => {
    expect(
      configuredManifests().some(
        (manifest) =>
          manifest.siteId === 'search-receipt' &&
          manifest.enabled === true &&
          manifest.publicationMode === 'auto-facts-only' &&
          typeof manifest.endpoint === 'string' &&
          /^https:\/\/(?:status\.search\.google\.com|developers\.google\.com)\//.test(
            manifest.endpoint,
          ),
      ),
    ).toBe(true);
  });

  it('bounds the complete collection job to fifteen minutes', () => {
    expect(workflow).toMatch(
      /collect-dry-run:\r?\n\s+timeout-minutes: 15\r?\n\s+runs-on:/,
    );
  });

  it('uploads the report before restoring a captured nonzero status', () => {
    const collectionIndex = workflow.indexOf('id: dry_run');
    const uploadIndex = workflow.indexOf('name: Upload dry-run report');
    const failureIndex = workflow.indexOf(
      'name: Preserve source-failure status',
    );

    expect(collectionIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(collectionIndex);
    expect(failureIndex).toBeGreaterThan(uploadIndex);
    expect(workflow.slice(uploadIndex, failureIndex)).toContain('if: always()');
    expect(workflow.slice(failureIndex)).toContain('if: always()');
    expect(workflow).toContain(
      'DRY_RUN_EXIT_CODE: ${{ steps.dry_run.outputs.exit_code }}',
    );
  });
});

describe('verification workflow evidence lifecycle', () => {
  it('collects a nonempty deterministic example inventory before verification', () => {
    const collectIndex = verifyWorkflow.indexOf('evidence -- collect-fixtures');
    const verifyIndex = verifyWorkflow.indexOf('evidence -- verify --all');
    expect(collectIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeGreaterThan(collectIndex);
    expect(verifyWorkflow).toContain('test-mutation');
  });

  it('builds cleanly twice and compares complete build manifests', () => {
    expect(verifyWorkflow.match(/^\s+npm run build\s*$/gm)).toHaveLength(2);
    expect(verifyWorkflow.match(/npm run build:manifest\b/g)).toHaveLength(2);
    expect(verifyWorkflow).toMatch(/cmp|Compare-Object|diff\s/);
    expect(verifyWorkflow).toContain('rm -rf dist/sites');
  });
});
