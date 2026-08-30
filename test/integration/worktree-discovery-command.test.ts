import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVitestDiscoveryArgv } from '../support/worktree-discovery-command.js';

describe('bounded Vitest discovery command', () => {
  it('targets only the two invocation-unique excluded sentinel tests', () => {
    const token = '4242-11111111-2222-4333-8444-555555555555';
    const projectRoot = join('C:', 'isolated-receipt-portfolio');
    const sentinelTestPaths = [
      join(
        projectRoot,
        '.worktrees',
        `sentinel-worktree-${token}`,
        'test',
        'integration',
        'sentinel-failure.test.ts',
      ),
      join(
        projectRoot,
        'worktrees',
        `sentinel-worktree-${token}`,
        'test',
        'integration',
        'sentinel-failure.test.ts',
      ),
    ] as const;

    const argv = buildVitestDiscoveryArgv('vitest-bin.mjs', sentinelTestPaths);

    expect(argv).toEqual([
      'vitest-bin.mjs',
      'run',
      ...sentinelTestPaths,
      '--passWithNoTests',
    ]);
    expect(argv.slice(2, -1)).toEqual(sentinelTestPaths);
    expect(argv).not.toContain('test/integration');
    expect(argv).not.toContain('test');
    expect(argv.every((argument) => !/[?*]/.test(argument))).toBe(true);
  });
});
