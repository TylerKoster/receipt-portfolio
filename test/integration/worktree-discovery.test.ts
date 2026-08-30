import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { configDefaults } from 'vitest/config';
import { runVitestDiscoveryProbe } from '../support/worktree-discovery-command.js';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const realFileSystem =
  await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

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

async function createSentinel(
  root: string,
  owner: string,
  writer: (
    path: string,
    data: string,
    encoding: 'utf8',
  ) => Promise<unknown> = writeFile,
): Promise<boolean> {
  const parent = dirname(root);
  let parentCreated = false;
  let rootCreated = false;
  try {
    parentCreated = (await mkdir(parent, { recursive: true })) !== undefined;
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
    rootCreated = true;
    await writer(join(root, '.sentinel-owner'), owner, 'utf8');
    await mkdir(join(root, 'sites'));
    await mkdir(join(root, 'test', 'integration'), { recursive: true });
    await writer(
      join(root, 'sites', 'sentinel-invalid.ts'),
      'export const deliberatelyInvalid = ;\n',
      'utf8',
    );
    await writer(
      join(root, 'test', 'integration', 'sentinel-failure.test.ts'),
      `import { expect, it } from 'vitest';\nit('must never discover a nested worktree test', () => { expect('nested').toBe('active-root'); });\n`,
      'utf8',
    );
    return parentCreated;
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    if (rootCreated) {
      try {
        await realFileSystem.rm(root, { force: true, recursive: true });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    try {
      await removeCreatedEmptyParent(parent, parentCreated);
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Discovery sentinel setup and cleanup both failed',
      );
    }
    throw error;
  }
}

async function removeSentinel(
  root: string,
  owner: string,
  expectedParents: readonly string[] = [
    resolve(projectRoot, '.worktrees'),
    resolve(projectRoot, 'worktrees'),
  ],
): Promise<void> {
  if (await missing(root)) return;
  if (
    !expectedParents
      .map((expectedParent) => resolve(expectedParent))
      .includes(resolve(dirname(root))) ||
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
  await realFileSystem.rm(root, { force: true, recursive: true });
}

async function removeCreatedEmptyParent(
  path: string,
  createdByInvocation: boolean,
): Promise<void> {
  if (!createdByInvocation) return;

  const retryDelays = [0, 25, 100, 250, 500, 1_000] as const;
  for (const [index, retryDelay] of retryDelays.entries()) {
    if (retryDelay > 0) await delay(retryDelay);
    try {
      await rmdir(path);
      return;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        if (error.code === 'ENOENT') return;
        if (error.code === 'ENOTEMPTY' && index < retryDelays.length - 1) {
          continue;
        }
        if (error.code === 'ENOTEMPTY') return;
      }
      throw error;
    }
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

  it('self-cleans a sentinel root after partial setup failure', async () => {
    const invocationToken = `${process.pid}-${randomUUID()}`;
    const owner = `receipt-portfolio-tool-discovery-sentinel-v2:${invocationToken}`;
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), 'receipt-discovery-partial-'),
    );
    const parent = join(temporaryRoot, 'worktrees');
    const root = join(parent, `sentinel-worktree-${invocationToken}`);
    const failingWriter = async (): Promise<never> => {
      throw new Error('synthetic sentinel setup failure');
    };

    try {
      await expect(
        createSentinel(root, owner, failingWriter),
      ).rejects.toThrow('synthetic sentinel setup failure');
      await expect(missing(root)).resolves.toBe(true);
      await expect(missing(parent)).resolves.toBe(true);
    } finally {
      if (!(await missing(root))) await removeSentinel(root, owner);
      await realFileSystem.rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('removes only an empty parent created by this invocation', async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), 'receipt-discovery-created-parent-'),
    );
    const parent = join(temporaryRoot, 'worktrees');
    const root = join(parent, `sentinel-worktree-${randomUUID()}`);
    const owner = `receipt-portfolio-tool-discovery-sentinel-v2:${randomUUID()}`;

    try {
      const parentCreated = await createSentinel(root, owner);
      expect(parentCreated).toBe(true);
      await removeSentinel(root, owner, [parent]);
      await removeCreatedEmptyParent(parent, parentCreated === true);
      await expect(missing(parent)).resolves.toBe(true);
    } finally {
      await realFileSystem.rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('preserves a preexisting empty sentinel parent', async () => {
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), 'receipt-discovery-existing-parent-'),
    );
    const parent = join(temporaryRoot, '.worktrees');
    const root = join(parent, `sentinel-worktree-${randomUUID()}`);
    const owner = `receipt-portfolio-tool-discovery-sentinel-v2:${randomUUID()}`;
    await mkdir(parent);

    try {
      const parentCreated = await createSentinel(root, owner);
      expect(parentCreated).toBe(false);
      await removeSentinel(root, owner, [parent]);
      await removeCreatedEmptyParent(parent, parentCreated === true);
      await expect(missing(parent)).resolves.toBe(false);
    } finally {
      await realFileSystem.rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('keeps bounded ESLint, Vitest, and TypeScript discovery inside the active root', async () => {
    const invocationToken = `${process.pid}-${randomUUID()}`;
    const owner = `receipt-portfolio-tool-discovery-sentinel-v2:${invocationToken}`;
    const sentinelRoots = [
      join(projectRoot, '.worktrees', `sentinel-worktree-${invocationToken}`),
      join(projectRoot, 'worktrees', `sentinel-worktree-${invocationToken}`),
    ] as const;
    const createdRoots: string[] = [];
    const createdParents = new Map<string, boolean>();

    try {
      for (const root of sentinelRoots) {
        const parent = dirname(root);
        const parentCreated = await createSentinel(root, owner);
        createdParents.set(
          parent,
          (createdParents.get(parent) ?? false) || parentCreated,
        );
        createdRoots.push(root);
      }

      const invalidSourcePaths = sentinelRoots.map((root) =>
        join(root, 'sites', 'sentinel-invalid.ts'),
      );
      const eslint = new ESLint({ warnIgnored: false });
      expect(await eslint.lintFiles(invalidSourcePaths)).toEqual([]);

      const configPath = join(projectRoot, 'tsconfig.json');
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      expect(configFile.error).toBeUndefined();
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        projectRoot,
      );
      expect(parsedConfig.errors).toEqual([]);
      expect(
        parsedConfig.fileNames.some((fileName) =>
          invalidSourcePaths.includes(fileName),
        ),
      ).toBe(false);

      const vitestBin = require.resolve('vitest/vitest.mjs');
      const sentinelTestPaths = sentinelRoots.map((root) =>
        join(root, 'test', 'integration', 'sentinel-failure.test.ts'),
      ) as [string, string];
      const result = await runVitestDiscoveryProbe(
        vitestBin,
        sentinelTestPaths,
        projectRoot,
      );
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toMatch(/no test files found/i);
    } finally {
      for (const root of createdRoots.toReversed()) {
        await removeSentinel(root, owner);
      }
      for (const [parent, parentCreated] of [...createdParents].toReversed()) {
        await removeCreatedEmptyParent(parent, parentCreated);
      }
    }
  }, 45_000);
});
