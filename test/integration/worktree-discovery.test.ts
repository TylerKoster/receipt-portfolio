import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { configDefaults } from 'vitest/config';

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const probeEnvironment = 'RECEIPT_PORTFOLIO_DISCOVERY_PROBE';

interface CommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly output: string;
}

async function missing(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return true;
    }
    throw error;
  }
}

async function createSentinel(root: string, owner: string): Promise<void> {
  const parent = dirname(root);
  await mkdir(parent, { recursive: true });
  const parentStats = await lstat(parent);
  if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
    throw new Error(
      `Discovery sentinel parent must be a real directory: ${parent}`,
    );
  }
  if (resolve(await realpath(parent)) !== resolve(parent)) {
    throw new Error(
      `Discovery sentinel parent changed through a link: ${parent}`,
    );
  }

  await mkdir(root);
  await writeFile(join(root, '.sentinel-owner'), owner, 'utf8');
  await mkdir(join(root, 'sites'));
  await mkdir(join(root, 'test', 'integration'), { recursive: true });
  await writeFile(
    join(root, 'sites', 'sentinel-invalid.ts'),
    'export const deliberatelyInvalid = ;\n',
    'utf8',
  );
  await writeFile(
    join(root, 'test', 'integration', 'sentinel-failure.test.ts'),
    `import { expect, it } from 'vitest';\nit('must never discover a nested worktree test', () => { expect('nested').toBe('active-root'); });\n`,
    'utf8',
  );
}

async function removeSentinel(root: string, owner: string): Promise<void> {
  if (await missing(root)) return;
  const expectedParents = [
    resolve(projectRoot, '.worktrees'),
    resolve(projectRoot, 'worktrees'),
  ];
  if (
    !expectedParents.includes(resolve(dirname(root))) ||
    resolve(await realpath(root)) !== resolve(root)
  ) {
    throw new Error(`Refusing unsafe discovery sentinel cleanup: ${root}`);
  }
  const rootStats = await lstat(root);
  const markerStats = await lstat(join(root, '.sentinel-owner'));
  if (
    rootStats.isSymbolicLink() ||
    !rootStats.isDirectory() ||
    markerStats.isSymbolicLink() ||
    !markerStats.isFile() ||
    (await readFile(join(root, '.sentinel-owner'), 'utf8')) !== owner
  ) {
    throw new Error(`Refusing unowned discovery sentinel cleanup: ${root}`);
  }
  await rm(root, { force: true, recursive: true });
}

async function runNpm(arguments_: readonly string[]): Promise<CommandResult> {
  const command =
    process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const commandArguments =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `npm ${arguments_.join(' ')}`]
      : [...arguments_];
  const display = `npm ${arguments_.join(' ')}`;
  try {
    const result = await execFileAsync(command, commandArguments, {
      cwd: projectRoot,
      env: { ...process.env, [probeEnvironment]: '1' },
      timeout: 120_000,
    });
    return {
      command: display,
      exitCode: 0,
      output: `${result.stdout}\n${result.stderr}`,
    };
  } catch (error) {
    const failure = error as {
      readonly code?: number | string;
      readonly stdout?: string;
      readonly stderr?: string;
    };
    return {
      command: display,
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
      output: `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`,
    };
  }
}

describe('nested development worktree discovery boundary', () => {
  it('declares both ESLint worktree ignores', async () => {
    const eslintConfiguration = (await import('../../eslint.config.mjs'))
      .default as readonly { readonly ignores?: readonly string[] }[];
    const ignores = eslintConfiguration.flatMap((entry) => entry.ignores ?? []);
    expect(ignores).toEqual(
      expect.arrayContaining(['.worktrees/**', 'worktrees/**']),
    );
  });

  it('extends Vitest defaults with both worktree exclusions', async () => {
    const configUrl = new URL('../../vitest.config.ts', import.meta.url);
    expect(existsSync(configUrl), 'tracked vitest.config.ts').toBe(true);
    if (!existsSync(configUrl)) return;
    const configuration = (await import(configUrl.href)).default as {
      readonly test?: { readonly exclude?: readonly string[] };
    };
    const exclusions = configuration.test?.exclude ?? [];
    expect(exclusions).toEqual(
      expect.arrayContaining([
        ...configDefaults.exclude,
        '**/.worktrees/**',
        '**/worktrees/**',
      ]),
    );
  });

  it('keeps TypeScript discovery rooted in active source directories', async () => {
    const configuration = JSON.parse(
      await readFile(join(projectRoot, 'tsconfig.json'), 'utf8'),
    ) as { readonly include?: readonly string[] };
    expect(configuration.include).not.toBeUndefined();
    expect(
      configuration.include?.every((pattern) =>
        /^(?:packages|scripts|sites)\//.test(pattern),
      ),
    ).toBe(true);
  });

  it('keeps exact lint, full-test, and integration commands inside the active root', async () => {
    if (process.env[probeEnvironment] === '1') return;

    const invocationToken = `${process.pid}-${randomUUID()}`;
    const owner = `receipt-portfolio-tool-discovery-sentinel-v1:${invocationToken}`;
    const sentinelRoots = [
      join(projectRoot, '.worktrees', `sentinel-worktree-${invocationToken}`),
      join(projectRoot, 'worktrees', `sentinel-worktree-${invocationToken}`),
    ] as const;
    const createdRoots: string[] = [];

    try {
      for (const root of sentinelRoots) {
        await createSentinel(root, owner);
        createdRoots.push(root);
      }
      const commands = [
        ['run', 'check'],
        ['test', '--', '--run'],
        ['run', 'test:integration'],
      ] as const;
      const results: CommandResult[] = [];
      for (const command of commands) results.push(await runNpm(command));

      for (const result of results) {
        expect
          .soft(result.exitCode, `${result.command}\n${result.output}`)
          .toBe(0);
      }
      for (const result of results.slice(1)) {
        expect(result.output).toContain('worktree-discovery.test.ts');
        expect(result.output).not.toContain('sentinel-failure.test.ts');
      }
    } finally {
      for (const root of createdRoots.toReversed()) {
        await removeSentinel(root, owner);
      }
    }
  }, 390_000);
});
