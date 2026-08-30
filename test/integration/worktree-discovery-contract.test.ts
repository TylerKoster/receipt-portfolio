import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const discoveryTestPath = fileURLToPath(
  new URL('./worktree-discovery.test.ts', import.meta.url),
);

describe('worktree discovery regression-test contract', () => {
  it('does not recursively launch the full or integration test suites', async () => {
    const source = await readFile(discoveryTestPath, 'utf8');

    expect(source).not.toContain("['test', '--', '--run']");
    expect(source).not.toContain("['run', 'test:integration']");
  });
});
