import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../.github/workflows/collect-dry-run.yml', import.meta.url),
  'utf8',
);

describe('scheduled dry-run workflow boundary', () => {
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
