import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../.github/workflows/collect-dry-run.yml', import.meta.url),
  'utf8',
);
const verifyWorkflow = readFileSync(
  new URL('../../.github/workflows/verify.yml', import.meta.url),
  'utf8',
);
const deployWorkflowUrl = new URL(
  '../../.github/workflows/deploy-pages.yml',
  import.meta.url,
);
const deployWorkflow = existsSync(deployWorkflowUrl)
  ? readFileSync(deployWorkflowUrl, 'utf8')
  : '';

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

describe('GitHub Pages deployment boundary', () => {
  it('runs only for main pushes and explicit manual dispatch', () => {
    expect(deployWorkflow).toMatch(
      /on:\r?\n\s+push:\r?\n\s+branches:\r?\n\s+- main\r?\n\s+workflow_dispatch:/,
    );
    expect(deployWorkflow).not.toMatch(/pull_request|schedule:/);
  });

  it('uses exact least-privilege permissions in each job', () => {
    const buildStart = deployWorkflow.indexOf('  build:');
    const deployStart = deployWorkflow.indexOf('  deploy:');
    const buildJob = deployWorkflow.slice(buildStart, deployStart);
    const deployJob = deployWorkflow.slice(deployStart);

    expect(buildStart).toBeGreaterThan(-1);
    expect(deployStart).toBeGreaterThan(buildStart);
    expect(buildJob).toMatch(
      /permissions:\r?\n\s+contents: read\r?\n\s+(?:timeout-minutes|runs-on):/,
    );
    expect(buildJob).not.toMatch(/pages:|id-token:|actions:/);
    expect(deployJob).toMatch(
      /permissions:\r?\n\s+contents: read\r?\n\s+pages: write\r?\n\s+id-token: write\r?\n/,
    );
    expect(deployJob).not.toMatch(/contents: write|actions: write/);
    expect(deployWorkflow).not.toMatch(
      /secrets\.|github\.token|pull_request_target|git\s+(?:commit|push)|release\b|contents: write/,
    );
  });

  it('uses the required supported action majors and repository Node setup major', () => {
    expect(deployWorkflow).toContain('actions/checkout@v6');
    expect(deployWorkflow).toContain('actions/setup-node@v4');
    expect(deployWorkflow).toContain('actions/configure-pages@v5');
    expect(deployWorkflow).toContain('actions/upload-pages-artifact@v4');
    expect(deployWorkflow).toContain('actions/deploy-pages@v4');
  });

  it('orders every local gate before configuring and uploading only the static site tree', () => {
    const orderedGates = [
      'npm ci',
      'npm run check',
      'npm test -- --run',
      'npm run evidence -- collect-fixtures',
      'npm run evidence -- verify --all',
      'npm run evidence -- test-mutation',
      'npm run build',
      'npm run build:manifest',
      'actions/configure-pages@v5',
      'actions/upload-pages-artifact@v4',
    ];
    let previous = -1;
    for (const gate of orderedGates) {
      const current = deployWorkflow.indexOf(gate);
      expect(current, gate).toBeGreaterThan(previous);
      previous = current;
    }
    expect(deployWorkflow).toContain(
      'RECEIPT_PORTFOLIO_BASE_URL: https://tylerkoster.github.io/receipt-portfolio/',
    );
    expect(deployWorkflow).toMatch(
      /actions\/upload-pages-artifact@v4[\s\S]*?with:\r?\n\s+path: dist\/sites(?:\r?\n|$)/,
    );
  });

  it('deploys only the successful build artifact through the github-pages environment', () => {
    const deployStart = deployWorkflow.indexOf('  deploy:');
    const deployJob = deployWorkflow.slice(deployStart);
    expect(deployJob).toMatch(/needs: build/);
    expect(deployJob).toMatch(
      /environment:\r?\n\s+name: github-pages\r?\n\s+url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/,
    );
    expect(deployJob).toContain('id: deployment');
    expect(deployWorkflow).toMatch(
      /concurrency:\r?\n\s+group: pages\r?\n\s+cancel-in-progress: false/,
    );
  });
});
