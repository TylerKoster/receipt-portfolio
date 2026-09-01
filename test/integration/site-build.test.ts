import { execFile } from 'node:child_process';
import type { PathLike, RmOptions } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalJson,
  createReceipt,
  evaluatePublication,
  manifestSha256,
  sha256,
  type Receipt,
  validateManifest,
} from '../../packages/evidence-core/src/index.js';
import {
  buildSites,
  EVIDENCE_DIRECTORY_ENV,
  OUTPUT_DIRECTORY_ENV,
  PUBLIC_BASE_URL_ENV,
} from '../../scripts/build-sites.js';
import { hashPublicBuild } from '../../scripts/hash-build.js';
import { collectFixturePair } from '../../scripts/evidence-cli.js';
import { searchReceiptSite } from '../../sites/search-receipt/index.js';
import type { ProductBlogRegistry } from '../../sites/shared/blog.js';
import { escapeHtml, renderSite } from '../../sites/shared/render.js';
import { skillLedgerSite } from '../../sites/skill-ledger/index.js';
import {
  MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION,
  admitMicrosoftSkillCreatorObservation,
  type MicrosoftSkillCreatorObservation,
} from '../../sites/skill-ledger/microsoft-skill-creator-source-observation.js';
import {
  CONTROLLED_PUBLIC_SKILL_RECORDS,
  filterPublicSkillLedgerRecords,
  type PublicSkillLedgerRecord,
} from '../../sites/skill-ledger/public-inventory-adapter.js';
import { workflowTestLabSite } from '../../sites/workflow-test-lab/index.js';
import { copyCanonicalSearchEvidence } from '../support/canonical-search-evidence.js';

vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );

  return { ...actual, rm: vi.fn(actual.rm) };
});

const realFileSystem =
  await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const mockedRm = vi.mocked(rm);

const CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; style-src 'self'; script-src 'none'\">";
const SEARCH_RECEIPT_CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; style-src 'self'; script-src 'self'\">";
const SITE_HEADINGS = {
  'search-receipt': 'Search Receipt',
  'skill-ledger': 'SkillLedger',
  'workflow-test-lab': 'Workflow Test Lab',
} as const;
const SITE_DEFINITIONS = [
  searchReceiptSite,
  workflowTestLabSite,
  skillLedgerSite,
] as const;
const BACKUP_OWNER_MARKER = '.receipt-portfolio-backup-owner.json';
// Full TypeScript compilation can contend with other Vitest workers in CI.
const PRODUCTION_BUILD_SUBPROCESS_TIMEOUT_MS = 15_000;

const execFileAsync = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const require = createRequire(import.meta.url);
const temporaryDirectories: string[] = [];
let testEvidenceDirectory: string;
let outputDirectory: string;

type ProductionBuildExecutor = (
  command: string,
  arguments_: readonly string[],
  options: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
  },
) => Promise<unknown>;

const executeProductionBuild: ProductionBuildExecutor = async (
  command,
  arguments_,
  options,
) => {
  await execFileAsync(command, [...arguments_], options);
};

async function searchReceiptEntries(): Promise<
  readonly { readonly path: string; readonly receipt: Receipt }[]
> {
  const directory = join(testEvidenceDirectory, 'receipts', 'search-receipt');
  return Promise.all(
    (await readdir(directory)).map(async (name) => ({
      path: join(directory, name),
      receipt: JSON.parse(
        await readFile(join(directory, name), 'utf8'),
      ) as Receipt,
    })),
  );
}

async function searchReceiptEntryByIdentity(
  sourceId: string,
  sequence: number,
): Promise<{ readonly path: string; readonly receipt: Receipt }> {
  const matchingEntries = (await searchReceiptEntries()).filter(
    ({ receipt }) =>
      receipt.payload.sourceId === sourceId &&
      receipt.payload.sequence === sequence,
  );
  if (matchingEntries.length !== 1) {
    throw new Error(
      `Expected exactly one Search Receipt entry for ${sourceId} sequence ${sequence}; found ${matchingEntries.length}.`,
    );
  }
  return matchingEntries[0]!;
}

async function collectAcceptedFixtures(): Promise<void> {
  await collectFixturePair(
    'search-receipt',
    'status-v1.json',
    'status-v2.json',
    { evidenceDirectory: testEvidenceDirectory },
  );
  await collectFixturePair(
    'workflow-test-lab',
    undefined,
    'structured-extraction-v1.json',
    { evidenceDirectory: testEvidenceDirectory },
  );
  await collectFixturePair(
    'skill-ledger',
    undefined,
    'skill-inventory-v1.json',
    { evidenceDirectory: testEvidenceDirectory },
  );
  await copyCanonicalSearchEvidence(testEvidenceDirectory);
  const observedAt = '2026-08-31T04:32:41.239Z';
  const observation: MicrosoftSkillCreatorObservation = {
    observedAt,
    source: {
      repository: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.repository,
      commit: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.commit,
      path: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.path,
      rawUrl: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.rawUrl,
      publisher: MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.publisher,
    },
    inheritedLicense: {
      ...MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense,
    },
    raw: { ...MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.raw },
    declaredMetadata: {
      name: 'skill-creator',
      description:
        'Guide for creating effective skills for AI coding agents working with Azure SDKs and Microsoft Foundry services. Use when creating new skills or updating existing skills.',
    },
  };
  const manifest = validateManifest(
    JSON.parse(
      await readFile(
        join(
          projectRoot,
          'manifests',
          'skill-ledger',
          'microsoft-skill-creator.json',
        ),
        'utf8',
      ),
    ),
  );
  const publicFacts = admitMicrosoftSkillCreatorObservation(observation);
  const rawBytes = Buffer.from(canonicalJson(observation), 'utf8');
  const normalizedBytes = Buffer.from(canonicalJson(publicFacts), 'utf8');
  const rawSha256 = sha256(rawBytes);
  const normalizedSha256 = sha256(normalizedBytes);
  const gateInputs = {
    manifestValid: true,
    enabled: true,
    publicationMode: 'auto-facts-only' as const,
    evidenceClass: 'live-source' as const,
    rawSha256,
    normalizedSha256,
    ambiguous: false,
    diffRatio: 0,
  };
  const policy = evaluatePublication(gateInputs);
  const receipt = createReceipt({
    siteId: 'skill-ledger',
    sourceId: manifest.sourceId,
    observedAt,
    sourceUrl: manifest.endpoint,
    manifestSha256: manifestSha256(manifest),
    rawSha256,
    normalizedSha256,
    rawObjectPath: `objects/raw/${rawSha256}.bin`,
    normalizedObjectPath: `objects/normalized/${normalizedSha256}.json`,
    sequence: 1,
    topicSlug: 'skill-creator',
    provenance: {
      evidenceClass: 'live-source',
      publicationMode: manifest.publicationMode,
      publisherName: manifest.publisherName,
      sourceClass: manifest.sourceClass,
      extractionSelector: manifest.extractionSelector,
      extractionContractId: manifest.extractionContractId,
      normalizerId: manifest.normalizerId,
      diffStrategyId: manifest.diffStrategyId,
      schemaId: manifest.schemaId,
    },
    publicFacts,
    interpretation: 'Controlled integration evidence.',
    unknowns: ['This integration fixture is not a live source observation.'],
    correction: { kind: 'original' },
    gateInputs,
    policy: {
      decision: policy.decision,
      reasonCodes: [...policy.reasonCodes],
    },
  });
  const files = [
    [join(testEvidenceDirectory, receipt.payload.rawObjectPath), rawBytes],
    [
      join(testEvidenceDirectory, receipt.payload.normalizedObjectPath),
      normalizedBytes,
    ],
    [
      join(
        testEvidenceDirectory,
        'manifests',
        `${receipt.payload.manifestSha256}.json`,
      ),
      Buffer.from(canonicalJson(manifest), 'utf8'),
    ],
    [
      join(
        testEvidenceDirectory,
        'receipts',
        'skill-ledger',
        `${receipt.id}.json`,
      ),
      Buffer.from(canonicalJson(receipt), 'utf8'),
    ],
  ] as const;
  await Promise.all(
    files.map(async ([path, bytes]) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    }),
  );
}

async function fileInventory(
  directory: string,
): Promise<Record<string, string>> {
  const inventory: Record<string, string> = {};

  async function visit(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        inventory[relative(directory, path).split(sep).join('/')] = (
          await readFile(path)
        ).toString('base64');
      }
    }
  }

  await visit(directory);
  return inventory;
}

async function writeBlogRegistryRoot(
  root: string,
  siteId: string,
  fixtureName: string,
  alignToOwnedSite = true,
): Promise<void> {
  const destination = join(root, 'sites', siteId, 'blog-registry.json');
  await mkdir(dirname(destination), { recursive: true });
  const registry = JSON.parse(
    await readFile(
      join(projectRoot, 'fixtures', 'shared', fixtureName),
      'utf8',
    ),
  ) as ProductBlogRegistry;
  if (alignToOwnedSite && registry.posts.length > 0) {
    registry.siteId = siteId as ProductBlogRegistry['siteId'];
    const receiptDirectory = join(testEvidenceDirectory, 'receipts', siteId);
    const receipts = (await Promise.all(
      (await readdir(receiptDirectory)).map(async (name) =>
        JSON.parse(await readFile(join(receiptDirectory, name), 'utf8')),
      ),
    )) as Receipt[];
    const receipt =
      receipts.find((value) =>
        value.payload.sourceUrl.startsWith(
          'https://raw.githubusercontent.com/',
        ),
      ) ?? receipts[0]!;
    const binding = registry.posts[0]!.sourceBindings[0]!;
    binding.receiptId = receipt.id;
    binding.sourceId = receipt.payload.sourceId;
    binding.url = receipt.payload.sourceUrl;
    binding.observedAt = receipt.payload.observedAt;
    binding.sha256 = receipt.payload.rawSha256;
    for (const section of registry.posts[0]!.sections) {
      for (const paragraph of section.paragraphs) {
        paragraph.sourceBindingIds = [binding.sourceId];
      }
    }
    registry.posts[0]!.feedId = `urn:receipt-portfolio:${siteId}:controlled-blog-post`;
    if (siteId === 'skill-ledger') {
      registry.posts[0]!.links = [
        {
          label: 'Open SkillLedger inventory',
          href: '/skill-ledger/inventory/',
          kind: 'internal',
        },
        {
          label: 'Inspect the admitted source',
          href: receipt.payload.sourceUrl,
          kind: 'external',
        },
      ];
    }
  }
  await writeFile(destination, JSON.stringify(registry));
}

async function runProductionBuild(options?: {
  readonly executor?: ProductionBuildExecutor;
  readonly evidenceDirectory?: string;
  readonly outputDirectory?: string;
  readonly publicBaseUrl?: string;
  readonly runtimeDirectory?: string;
}): Promise<void> {
  const command = options?.runtimeDirectory
    ? process.execPath
    : process.platform === 'win32'
      ? (process.env.ComSpec ?? 'cmd.exe')
      : 'npm';
  const arguments_ = options?.runtimeDirectory
    ? [join(options.runtimeDirectory, 'scripts', 'build-sites.js')]
    : process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm run build']
      : ['run', 'build'];
  await (options?.executor ?? executeProductionBuild)(command, arguments_, {
    cwd: projectRoot,
    env: {
      ...process.env,
      [EVIDENCE_DIRECTORY_ENV]:
        options?.evidenceDirectory ?? testEvidenceDirectory,
      [OUTPUT_DIRECTORY_ENV]: options?.outputDirectory ?? outputDirectory,
      ...(options?.publicBaseUrl === undefined
        ? {}
        : { [PUBLIC_BASE_URL_ENV]: options.publicBaseUrl }),
    },
  });
}

async function compileIsolatedProductionRuntime(
  runtimeDirectory: string,
): Promise<void> {
  const tscBin = require.resolve('typescript/bin/tsc');
  await execFileAsync(
    process.execPath,
    [tscBin, '-p', 'tsconfig.json', '--outDir', runtimeDirectory],
    { cwd: projectRoot },
  );
}

beforeEach(async () => {
  mockedRm.mockImplementation(realFileSystem.rm);
  const directory = await mkdtemp(join(tmpdir(), 'receipt-sites-'));
  temporaryDirectories.push(directory);
  testEvidenceDirectory = join(directory, 'evidence');
  outputDirectory = join(directory, 'sites');
  await collectAcceptedFixtures();
});

afterEach(async () => {
  mockedRm.mockImplementation(realFileSystem.rm);
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('static receipt site build', () => {
  it('includes the tracked official Search evidence in temporary build evidence', async () => {
    const receipts = await searchReceiptEntries();

    expect(
      receipts
        .map(({ receipt }) => receipt.payload.sourceId)
        .filter((sourceId) =>
          ['google-search-central-blog', 'google-search-status'].includes(
            sourceId,
          ),
        )
        .sort(),
    ).toEqual(['google-search-central-blog', 'google-search-status']);
  });

  it('emits blog routes only for the product-owned admitted registry', async () => {
    const registryRoot = join(dirname(outputDirectory), 'blog-registry-root');
    await writeBlogRegistryRoot(
      registryRoot,
      'skill-ledger',
      'controlled-blog-registry-v1.json',
    );

    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
      blogRegistryRoot: registryRoot,
      includeVideoMomentSearch: true,
    });

    const inventory = Object.keys(await fileInventory(outputDirectory));
    expect(inventory).toEqual(
      expect.arrayContaining([
        'skill-ledger/blog/index.html',
        'skill-ledger/blog/feed.xml',
        'skill-ledger/blog/controlled-search-handoff-checklist/index.html',
      ]),
    );
    expect(
      inventory.some((path) => path.startsWith('search-receipt/blog/')),
    ).toBe(false);
    await expect(
      readFile(join(outputDirectory, 'skill-ledger', 'sitemap.xml'), 'utf8'),
    ).resolves.toContain(
      '/skill-ledger/blog/controlled-search-handoff-checklist/',
    );
    const manifest = await hashPublicBuild(outputDirectory, {
      blogRegistryRoot: registryRoot,
      evidenceDirectory: testEvidenceDirectory,
    });
    expect(manifest.inventory.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        'skill-ledger/blog/feed.xml',
        'skill-ledger/blog/index.html',
        'skill-ledger/blog/controlled-search-handoff-checklist/index.html',
      ]),
    );
    await rm(join(outputDirectory, 'skill-ledger', 'blog', 'feed.xml'));
    await expect(
      hashPublicBuild(outputDirectory, {
        blogRegistryRoot: registryRoot,
        evidenceDirectory: testEvidenceDirectory,
      }),
    ).rejects.toThrow(/incomplete public output/i);
  });

  it('rejects a cross-namespace product registry and preserves the published tree', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const before = await fileInventory(outputDirectory);
    const registryRoot = join(dirname(outputDirectory), 'invalid-blog-root');
    await writeBlogRegistryRoot(
      registryRoot,
      'skill-ledger',
      'controlled-blog-registry-v1.json',
      false,
    );

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
        blogRegistryRoot: registryRoot,
      }),
    ).rejects.toThrow(/namespace/i);
    expect(await fileInventory(outputDirectory)).toEqual(before);
  });

  it.each([
    [
      'missing object',
      (
        binding: ProductBlogRegistry['posts'][number]['sourceBindings'][number],
      ) => (binding.receiptId = 'c'.repeat(64)),
    ],
    [
      'digest mismatch',
      (
        binding: ProductBlogRegistry['posts'][number]['sourceBindings'][number],
      ) => (binding.sha256 = 'd'.repeat(64)),
    ],
    [
      'URL mismatch',
      (
        binding: ProductBlogRegistry['posts'][number]['sourceBindings'][number],
      ) =>
        (binding.url =
          'https://raw.githubusercontent.com/microsoft/skills/other/SKILL.md'),
    ],
    [
      'timestamp mismatch',
      (
        binding: ProductBlogRegistry['posts'][number]['sourceBindings'][number],
      ) => (binding.observedAt = '2026-08-30T00:00:00.000Z'),
    ],
  ])(
    'preserves the prior output for blog evidence %s',
    async (_label, mutate) => {
      await buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
      });
      const before = await fileInventory(outputDirectory);
      const registryRoot = join(
        dirname(outputDirectory),
        'evidence-failure-blog-root',
      );
      await writeBlogRegistryRoot(
        registryRoot,
        'skill-ledger',
        'controlled-blog-registry-v1.json',
      );
      const registryPath = join(
        registryRoot,
        'sites',
        'skill-ledger',
        'blog-registry.json',
      );
      const registry = JSON.parse(
        await readFile(registryPath, 'utf8'),
      ) as ProductBlogRegistry;
      mutate(registry.posts[0]!.sourceBindings[0]!);
      await writeFile(registryPath, JSON.stringify(registry));

      await expect(
        buildSites({
          evidenceDirectory: testEvidenceDirectory,
          outputDirectory,
          blogRegistryRoot: registryRoot,
        }),
      ).rejects.toThrow(/BLOG_EVIDENCE_/u);
      expect(await fileInventory(outputDirectory)).toEqual(before);
    },
  );

  it('keeps missing and empty product registries byte-compatible', async () => {
    const missingRegistryRoot = join(
      dirname(outputDirectory),
      'missing-blog-root',
    );
    const emptyOutput = join(dirname(outputDirectory), 'empty-registry-sites');
    const emptyRegistryRoot = join(dirname(outputDirectory), 'empty-blog-root');
    await mkdir(join(emptyRegistryRoot, 'sites', 'search-receipt'), {
      recursive: true,
    });
    await writeFile(
      join(emptyRegistryRoot, 'sites', 'search-receipt', 'blog-registry.json'),
      JSON.stringify({
        schemaVersion: 1,
        siteId: 'search-receipt',
        title: 'Empty product-owned blog',
        description: 'No posts have been admitted.',
        posts: [],
      }),
    );

    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
      blogRegistryRoot: missingRegistryRoot,
    });
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory: emptyOutput,
      blogRegistryRoot: emptyRegistryRoot,
    });

    expect(await fileInventory(emptyOutput)).toEqual(
      await fileInventory(outputDirectory),
    );
  });

  it('keeps scheduled publication metadata separate from source observations', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const scheduledPublicationAt = '2026-09-01T15:15:00.000Z';
    const statusObservedAt = '2026-09-01T14:05:27.778Z';
    const feedObservedAt = '2026-09-01T14:05:27.745Z';
    const [page, atom] = await Promise.all([
      readFile(
        join(
          outputDirectory,
          'search-receipt',
          'blog',
          'separate-google-search-status-from-site-evidence',
          'index.html',
        ),
        'utf8',
      ),
      readFile(
        join(outputDirectory, 'search-receipt', 'blog', 'feed.xml'),
        'utf8',
      ),
    ]);

    expect(page).toContain(
      `<time datetime="${scheduledPublicationAt}">${scheduledPublicationAt}</time>`,
    );
    expect(page).toContain(`"datePublished":"${scheduledPublicationAt}"`);
    expect(page).toContain(`"dateModified":"${scheduledPublicationAt}"`);
    expect(atom).toContain(`<published>${scheduledPublicationAt}</published>`);
    expect(atom).toContain(`<updated>${scheduledPublicationAt}</updated>`);
    expect(page).toContain(
      `<time datetime="${statusObservedAt}">${statusObservedAt}</time>`,
    );
    expect(page).toContain(
      `<time datetime="${feedObservedAt}">${feedObservedAt}</time>`,
    );
  });

  it('preserves the prior output when the bound raw evidence object is missing', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const before = await fileInventory(outputDirectory);
    const registryRoot = join(
      dirname(outputDirectory),
      'missing-raw-blog-root',
    );
    await writeBlogRegistryRoot(
      registryRoot,
      'skill-ledger',
      'controlled-blog-registry-v1.json',
    );
    const registry = JSON.parse(
      await readFile(
        join(registryRoot, 'sites', 'skill-ledger', 'blog-registry.json'),
        'utf8',
      ),
    ) as ProductBlogRegistry;
    const receiptId = registry.posts[0]!.sourceBindings[0]!.receiptId;
    const receipt = JSON.parse(
      await readFile(
        join(
          testEvidenceDirectory,
          'receipts',
          'skill-ledger',
          `${receiptId}.json`,
        ),
        'utf8',
      ),
    ) as Receipt;
    await rm(join(testEvidenceDirectory, receipt.payload.rawObjectPath));

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
        blogRegistryRoot: registryRoot,
      }),
    ).rejects.toThrow();
    expect(await fileInventory(outputDirectory)).toEqual(before);
  });

  it('rejects the trusted workspace itself as an output root', async () => {
    const trustedWorkspaceDirectory = join(
      dirname(outputDirectory),
      'trusted-workspace-root',
    );
    await mkdir(trustedWorkspaceDirectory);
    const sentinel = join(trustedWorkspaceDirectory, 'workspace-sentinel.txt');
    await writeFile(sentinel, 'workspace');

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory: trustedWorkspaceDirectory,
        trustedWorkspaceDirectory,
      }),
    ).rejects.toThrow(/strict descendant|workspace contract/i);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('workspace');
  });

  it('rejects a linked output ancestor and preserves the external sentinel', async () => {
    const root = dirname(outputDirectory);
    const project = join(root, 'linked-ancestor-project');
    const external = join(root, 'linked-ancestor-external');
    await mkdir(project);
    await mkdir(join(external, 'sites'), { recursive: true });
    const sentinel = join(external, 'sites', 'outside-sentinel.txt');
    await writeFile(sentinel, 'outside');
    await symlink(
      external,
      join(project, 'dist'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory: join(project, 'dist', 'sites'),
      }),
    ).rejects.toThrow(/symbolic|reparse|linked|ancestor/i);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('outside');
  });

  it('rejects a linked output root and preserves the external sentinel', async () => {
    const root = dirname(outputDirectory);
    const project = join(root, 'linked-root-project');
    const external = join(root, 'linked-root-external');
    await mkdir(project);
    await mkdir(external);
    const sentinel = join(external, 'outside-sentinel.txt');
    await writeFile(sentinel, 'outside');
    const linkedOutput = join(project, 'sites');
    await symlink(
      external,
      linkedOutput,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory: linkedOutput,
      }),
    ).rejects.toThrow(/symbolic|reparse|linked|output root/i);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('outside');
  });

  it('rejects a linked recovery entry and preserves the external sentinel', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const external = join(dirname(outputDirectory), 'linked-recovery-external');
    await mkdir(external);
    const sentinel = join(external, 'outside-sentinel.txt');
    await writeFile(sentinel, 'outside');
    await symlink(
      external,
      `${outputDirectory}.previous`,
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      buildSites({ evidenceDirectory: testEvidenceDirectory, outputDirectory }),
    ).rejects.toThrow(/recovery|symbolic|reparse|linked|owned/i);
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('outside');
  });

  it('renders one named static home page per portfolio site', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    for (const [siteId, heading] of Object.entries(SITE_HEADINGS)) {
      await expect(
        readFile(join(outputDirectory, siteId, 'index.html'), 'utf8'),
      ).resolves.toContain(heading);
    }
  });

  it.each([
    'http://tylerkoster.github.io/receipt-portfolio/',
    '/receipt-portfolio/',
    'https://user@tylerkoster.github.io/receipt-portfolio/',
    'https://tylerkoster.github.io/receipt-portfolio/?',
    'https://tylerkoster.github.io/receipt-portfolio/#',
    'https://tylerkoster.github.io/receipt-portfolio/?#',
    'https://tylerkoster.github.io/receipt-portfolio/?preview=true',
    'https://tylerkoster.github.io/receipt-portfolio/#preview',
  ])('rejects the invalid public base URL %s', async (publicBaseUrl) => {
    const options = {
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
      publicBaseUrl,
    };

    await expect(buildSites(options)).rejects.toThrow(/public base|https/i);
  });

  it('uses the local placeholder base by default', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const home = await readFile(
      join(outputDirectory, 'search-receipt', 'index.html'),
      'utf8',
    );
    expect(home).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/search-receipt/">',
    );
    expect(home).toContain('href="/search-receipt/styles.css"');
  });

  it('publishes the admitted Search Receipt evergreen guide and discovery links', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const [home, guide, sitemap] = await Promise.all([
      readFile(join(outputDirectory, 'search-receipt', 'index.html'), 'utf8'),
      readFile(
        join(
          outputDirectory,
          'search-receipt',
          'guides',
          'is-google-search-down-or-my-site',
          'index.html',
        ),
        'utf8',
      ),
      readFile(join(outputDirectory, 'search-receipt', 'sitemap.xml'), 'utf8'),
    ]);

    expect(home).toContain(
      'href="/search-receipt/guides/is-google-search-down-or-my-site/"',
    );
    expect(guide).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/search-receipt/guides/is-google-search-down-or-my-site/">',
    );
    expect(guide).toContain('"@type":"FAQPage"');
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/search-receipt/guides/is-google-search-down-or-my-site/</loc>',
    );
  });

  it('publishes the admitted Search Receipt investigation worksheet as an enterable route', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const [home, worksheet, emittedClient, sourceClient, sitemap] =
      await Promise.all([
        readFile(join(outputDirectory, 'search-receipt', 'index.html'), 'utf8'),
        readFile(
          join(
            outputDirectory,
            'search-receipt',
            'worksheets',
            'compare-google-search-status-with-site-evidence',
            'index.html',
          ),
          'utf8',
        ),
        readFile(
          join(outputDirectory, 'search-receipt', 'investigation-worksheet.js'),
          'utf8',
        ),
        readFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'investigation-worksheet.js',
          ),
          'utf8',
        ),
        readFile(
          join(outputDirectory, 'search-receipt', 'sitemap.xml'),
          'utf8',
        ),
      ]);

    expect(emittedClient).toBe(sourceClient);
    expect(home).toContain(
      'href="/search-receipt/worksheets/compare-google-search-status-with-site-evidence/"',
    );
    expect(worksheet).toContain('data-investigation-worksheet');
    expect(worksheet).toContain('data-worksheet-field');
    expect(worksheet).toContain(
      '<script type="module" src="/search-receipt/investigation-worksheet.js"></script>',
    );
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/search-receipt/worksheets/compare-google-search-status-with-site-evidence/</loc>',
    );
  });

  it('publishes and crosslinks the admitted Search Receipt decision aid', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const [home, decisionAid, sitemap] = await Promise.all([
      readFile(join(outputDirectory, 'search-receipt', 'index.html'), 'utf8'),
      readFile(
        join(
          outputDirectory,
          'search-receipt',
          'discover',
          'choose-google-search-guide-or-worksheet',
          'index.html',
        ),
        'utf8',
      ),
      readFile(join(outputDirectory, 'search-receipt', 'sitemap.xml'), 'utf8'),
    ]);

    expect(home).toContain(
      'href="/search-receipt/discover/choose-google-search-guide-or-worksheet/"',
    );
    expect(decisionAid).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/search-receipt/discover/choose-google-search-guide-or-worksheet/">',
    );
    expect(decisionAid.match(/data-decision-aid-route/g)).toHaveLength(2);
    expect(decisionAid).toContain(
      'href="/search-receipt/guides/is-google-search-down-or-my-site/"',
    );
    expect(decisionAid).toContain(
      'href="/search-receipt/worksheets/compare-google-search-status-with-site-evidence/"',
    );
    expect(decisionAid).not.toContain('<script type="module"');
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/search-receipt/discover/choose-google-search-guide-or-worksheet/</loc>',
    );
  });

  it('publishes and crosslinks the admitted Search Receipt investigation handoff', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const [home, handoff, sitemap] = await Promise.all([
      readFile(join(outputDirectory, 'search-receipt', 'index.html'), 'utf8'),
      readFile(
        join(
          outputDirectory,
          'search-receipt',
          'checklists',
          'record-before-escalating-google-search-change',
          'index.html',
        ),
        'utf8',
      ),
      readFile(join(outputDirectory, 'search-receipt', 'sitemap.xml'), 'utf8'),
    ]);

    expect(home).toContain(
      'href="/search-receipt/checklists/record-before-escalating-google-search-change/"',
    );
    expect(handoff).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/search-receipt/checklists/record-before-escalating-google-search-change/">',
    );
    expect(handoff).toContain('data-investigation-handoff');
    expect(handoff.match(/<h3>Step [1-4]<\/h3>/g)).toHaveLength(4);
    expect(handoff).toContain(
      'href="https://status.search.google.com/incidents.json"',
    );
    expect(handoff).toContain(
      'href="https://feeds.feedburner.com/blogspot/amDG"',
    );
    expect(handoff).not.toContain('<form');
    expect(handoff).not.toContain('<script type="module"');
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/search-receipt/checklists/record-before-escalating-google-search-change/</loc>',
    );
  });

  it('publishes the controlled SkillLedger inventory as a first-party interactive route', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const [
      portfolio,
      home,
      inventory,
      emittedAdapter,
      sourceAdapter,
      sourceData,
      bootstrap,
      sitemap,
    ] = await Promise.all([
      readFile(join(outputDirectory, 'index.html'), 'utf8'),
      readFile(join(outputDirectory, 'skill-ledger', 'index.html'), 'utf8'),
      readFile(
        join(outputDirectory, 'skill-ledger', 'inventory', 'index.html'),
        'utf8',
      ),
      readFile(
        join(outputDirectory, 'skill-ledger', 'public-inventory-adapter.js'),
        'utf8',
      ),
      readFile(
        join(
          projectRoot,
          'sites',
          'skill-ledger',
          'public-inventory-adapter.js',
        ),
        'utf8',
      ),
      readFile(
        join(outputDirectory, 'skill-ledger', 'public-inventory-data.js'),
        'utf8',
      ),
      readFile(
        join(outputDirectory, 'skill-ledger', 'public-inventory-bootstrap.js'),
        'utf8',
      ),
      readFile(join(outputDirectory, 'skill-ledger', 'sitemap.xml'), 'utf8'),
    ]);

    expect(emittedAdapter).toBe(sourceAdapter);
    expect(inventory).toContain(
      '<link rel="canonical" href="https://receipt-portfolio.example/skill-ledger/inventory/">',
    );
    expect(inventory).toContain('data-skill-ledger-public-inventory');
    expect(inventory).toContain(
      '<script type="module" src="/skill-ledger/public-inventory-bootstrap.js"></script>',
    );
    expect(sourceData).toContain('microsoft-skill-creator');
    expect(sourceData).toContain('7066b58141d8cc66f39356b2ee5bb64d428dcf17');
    expect(sourceData).toContain('source-bound-observation');
    expect(sourceData).not.toContain('##');
    expect(bootstrap).toContain('SOURCE_BOUND_PUBLIC_SKILL_RECORDS');
    const emittedRecords = JSON.parse(
      sourceData
        .replace('export const SOURCE_BOUND_PUBLIC_SKILL_RECORDS = ', '')
        .replace(/;\s*$/u, ''),
    ) as PublicSkillLedgerRecord[];
    expect(emittedRecords).toHaveLength(1);
    expect(emittedRecords[0]).toMatchObject({
      evidenceClass: 'source-bound-observation',
      source: { publisher: 'Microsoft' },
      declaredMetadata: { packageId: 'skill-creator' },
    });
    const completeInventory = [
      ...emittedRecords,
      ...CONTROLLED_PUBLIC_SKILL_RECORDS,
    ];
    expect(completeInventory).toHaveLength(3);
    expect(
      filterPublicSkillLedgerRecords(completeInventory, {
        query: 'skill-creator',
      }).map((record) => record.receiptId),
    ).toEqual([emittedRecords[0]?.receiptId]);
    expect(inventory).toContain("script-src 'self'");
    expect(home).toContain('href="/skill-ledger/inventory/"');
    expect(home).toContain('Open the interactive inventory');
    expect(portfolio).toContain(
      'href="/skill-ledger/inventory/">Open the interactive inventory</a>',
    );
    expect(inventory).toContain('>Inventory</a>');
    expect(sitemap).toContain(
      '<loc>https://receipt-portfolio.example/skill-ledger/inventory/</loc>',
    );

    await expect(
      readFile(
        join(
          outputDirectory,
          'workflow-test-lab',
          'public-inventory-adapter.js',
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('normalizes a production base and includes its project path exactly once on every URL surface', async () => {
    const publicBaseUrl = 'https://tylerkoster.github.io/receipt-portfolio////';
    const productionBase = 'https://tylerkoster.github.io/receipt-portfolio/';
    const projectPath = '/receipt-portfolio/';
    const options = {
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
      publicBaseUrl,
    };
    await buildSites(options);

    for (const siteId of Object.keys(SITE_HEADINGS)) {
      const siteBase = `${productionBase}${siteId}/`;
      const home = await readFile(
        join(outputDirectory, siteId, 'index.html'),
        'utf8',
      );
      const sitemap = await readFile(
        join(outputDirectory, siteId, 'sitemap.xml'),
        'utf8',
      );
      const robots = await readFile(
        join(outputDirectory, siteId, 'robots.txt'),
        'utf8',
      );
      const receiptIds = await readdir(
        join(outputDirectory, siteId, 'receipts'),
      );
      const receiptId = receiptIds[0]!;
      const detail = await readFile(
        join(outputDirectory, siteId, 'receipts', receiptId, 'index.html'),
        'utf8',
      );
      const topicSlugs = await readdir(join(outputDirectory, siteId, 'topics'));
      const nestedPages = await Promise.all([
        readFile(
          join(outputDirectory, siteId, 'methodology', 'index.html'),
          'utf8',
        ),
        readFile(
          join(outputDirectory, siteId, 'sources', 'index.html'),
          'utf8',
        ),
        readFile(
          join(outputDirectory, siteId, 'topics', topicSlugs[0]!, 'index.html'),
          'utf8',
        ),
        Promise.resolve(detail),
      ]);

      expect(home).toContain(`<link rel="canonical" href="${siteBase}">`);
      expect(home).toContain(`href="${projectPath}${siteId}/styles.css"`);
      expect(sitemap).toContain(`<loc>${siteBase}receipts/${receiptId}/</loc>`);
      expect(robots).toContain(`Sitemap: ${siteBase}sitemap.xml`);
      expect(detail).toContain(`"url":"${siteBase}receipts/${receiptId}/"`);
      expect(detail).toContain(`href="${projectPath}${siteId}/methodology/"`);
      expect(detail).toContain(`href="${projectPath}${siteId}/styles.css"`);
      for (const nestedPage of nestedPages) {
        expect(nestedPage).toContain(
          `href="${projectPath}${siteId}/methodology/"`,
        );
        expect(nestedPage).toContain(
          `href="${projectPath}${siteId}/styles.css"`,
        );
        expect(nestedPage).not.toContain(
          '/receipt-portfolio/receipt-portfolio/',
        );
      }
      for (const href of detail.matchAll(/href="(\/[^"#]*)"/g)) {
        expect(href[1]).toMatch(/^\/receipt-portfolio\//);
      }
      expect(`${home}\n${sitemap}\n${robots}\n${detail}`).not.toContain(
        '/receipt-portfolio/receipt-portfolio/',
      );
    }
  });

  it('renders one root portfolio hub alongside exactly three product directories', async () => {
    const options = {
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
      publicBaseUrl: 'https://tylerkoster.github.io/receipt-portfolio/',
    };
    await buildSites(options);

    const entries = await readdir(outputDirectory, { withFileTypes: true });
    expect(
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    ).toEqual(Object.keys(SITE_HEADINGS).sort());
    expect(
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
    ).toEqual([
      'favicon.ico',
      'index.html',
      'portfolio.css',
      'robots.txt',
      'sitemap.xml',
    ]);

    const hub = await readFile(join(outputDirectory, 'index.html'), 'utf8');
    expect(hub).toContain('Evidence receipt portfolio');
    expect(hub).toContain(
      'Controlled examples are not live or current source evidence.',
    );
    expect(hub).toContain('How to use this portfolio');
    expect(hub).toContain('Shared controlled-example boundary');
    expect(hub).toContain(
      'They are not live or current evidence, diagnoses, safety assessments, adoption recommendations, user results, demand, or revenue evidence.',
    );
    expect(hub).toContain(
      '<link rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/">',
    );
    expect(hub).toContain('href="/receipt-portfolio/portfolio.css"');
    expect(hub).toContain('href="/receipt-portfolio/favicon.ico"');
    expect(hub).not.toContain('frame-ancestors');
    for (const site of SITE_DEFINITIONS) {
      expect(hub).toContain(`<strong>For:</strong> ${site.audience}`);
      expect(hub).toContain(`<strong>Use it when:</strong> ${site.useCase}`);
      const expectedActionPath =
        site.primaryAction.path === undefined
          ? `/receipt-portfolio/${site.siteId}/#${site.primaryAction.targetId}`
          : `/receipt-portfolio/${site.siteId}${site.primaryAction.path}`;
      expect(hub).toContain(
        `<a class="primary-action" href="${expectedActionPath}">${site.primaryAction.label}</a>`,
      );
    }
    expect(hub).not.toContain('<strong>Use it to:</strong>');
    expect(hub).toContain('Content-Security-Policy');
    expect(hub).not.toMatch(/<script\b|<img\b|https?:\/\/[^"']+\.(?:css|js)/i);
  });

  it('replaces arbitrary stale roots and files with exactly three standalone sites', async () => {
    await mkdir(join(outputDirectory, 'obsolete-root'), { recursive: true });
    await writeFile(join(outputDirectory, 'obsolete-root', 'old.html'), 'old');

    for (const siteId of Object.keys(SITE_HEADINGS)) {
      await mkdir(join(outputDirectory, siteId), { recursive: true });
      await writeFile(join(outputDirectory, siteId, 'obsolete.js'), 'old');
    }

    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    const entries = await readdir(outputDirectory, { withFileTypes: true });
    expect(
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    ).toEqual(Object.keys(SITE_HEADINGS).sort());
    expect(
      entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
    ).toEqual([
      'favicon.ico',
      'index.html',
      'portfolio.css',
      'robots.txt',
      'sitemap.xml',
    ]);

    for (const siteId of Object.keys(SITE_HEADINGS)) {
      const html = await readFile(
        join(outputDirectory, siteId, 'index.html'),
        'utf8',
      );
      const styles = await readFile(
        join(outputDirectory, siteId, 'styles.css'),
        'utf8',
      );
      expect(html).toContain(
        siteId === 'search-receipt' ? SEARCH_RECEIPT_CSP : CSP,
      );
      expect(html).not.toContain('frame-ancestors');
      expect(html).toContain('href="/favicon.ico"');
      expect(html).toContain(`href="/${siteId}/styles.css"`);
      expect(styles).toContain('--accent');
      if (siteId !== 'search-receipt') {
        expect(styles).toBe(
          await readFile(
            join(projectRoot, 'sites', 'shared', 'styles.css'),
            'utf8',
          ),
        );
      }
    }

    const inventory = Object.keys(await fileInventory(outputDirectory));
    for (const siteId of Object.keys(SITE_HEADINGS)) {
      expect(inventory).toEqual(
        expect.arrayContaining([
          `${siteId}/index.html`,
          `${siteId}/methodology/index.html`,
          `${siteId}/sources/index.html`,
          `${siteId}/sitemap.xml`,
          `${siteId}/robots.txt`,
          `${siteId}/styles.css`,
        ]),
      );
    }
    expect(inventory.some((path) => /\/receipts\//.test(path))).toBe(true);
    expect(inventory.some((path) => /\/topics\//.test(path))).toBe(true);
    expect(inventory).toContain('search-receipt/search-interface.js');
    expect(inventory).toContain('search-receipt/search-interface.css');
    expect(inventory).not.toContain('workflow-test-lab/search-interface.js');
    expect(inventory).not.toContain('skill-ledger/search-interface.js');
    expect(inventory).not.toContain('workflow-test-lab/search-interface.css');
    expect(inventory).not.toContain('skill-ledger/search-interface.css');
    expect(inventory).toContain('favicon.ico');
    const favicon = await readFile(join(outputDirectory, 'favicon.ico'));
    expect([...favicon.subarray(0, 6)]).toEqual([0, 0, 1, 0, 1, 0]);
    expect(favicon.length).toBeGreaterThan(22);
  });

  it('makes an incremental build byte-equal to a clean build after evidence changes', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    await mkdir(join(outputDirectory, 'obsolete-root'), { recursive: true });
    await writeFile(join(outputDirectory, 'obsolete-root', 'old.html'), 'old');
    await writeFile(
      join(outputDirectory, 'search-receipt', 'obsolete.js'),
      'old',
    );

    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const incrementalInventory = await fileInventory(outputDirectory);
    const cleanOutputDirectory = join(dirname(outputDirectory), 'clean-sites');
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory: cleanOutputDirectory,
    });

    expect(incrementalInventory).toEqual(
      await fileInventory(cleanOutputDirectory),
    );
  });

  it('refuses an unrelated recovery sibling without changing either tree', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const publicInventory = await fileInventory(outputDirectory);
    const backupDirectory = `${outputDirectory}.previous`;
    await mkdir(backupDirectory, { recursive: true });
    await writeFile(
      join(backupDirectory, 'unrelated-sentinel.txt'),
      'must remain',
    );
    const unrelatedInventory = await fileInventory(backupDirectory);

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
      }),
    ).rejects.toThrow(/not builder-owned/i);

    expect(await fileInventory(outputDirectory)).toEqual(publicInventory);
    expect(await fileInventory(backupDirectory)).toEqual(unrelatedInventory);
    expect(
      (await readdir(dirname(outputDirectory))).filter((name) =>
        name.startsWith(`.${basename(outputDirectory)}-stage-`),
      ),
    ).toEqual([]);
  });

  it('reports post-install cleanup debt without failing publication and clears it next run', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });
    const previousInventory = await fileInventory(outputDirectory);
    const cleanupError = Object.assign(new Error('simulated locked backup'), {
      code: 'EPERM',
    });
    mockedRm.mockImplementation(
      async (path: PathLike, options?: RmOptions): Promise<void> => {
        if (String(path).endsWith('.previous')) {
          try {
            await realFileSystem.stat(path);
          } catch (error) {
            if (
              error instanceof Error &&
              'code' in error &&
              error.code === 'ENOENT'
            ) {
              return realFileSystem.rm(path, options);
            }

            throw error;
          }

          throw cleanupError;
        }

        return realFileSystem.rm(path, options);
      },
    );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
      }),
    ).resolves.toBeUndefined();

    const backupDirectory = `${outputDirectory}.previous`;
    expect(
      await readFile(
        join(outputDirectory, 'search-receipt', 'index.html'),
        'utf8',
      ),
    ).toContain('Controlled fixture example');
    const marker = JSON.parse(
      await readFile(join(backupDirectory, BACKUP_OWNER_MARKER), 'utf8'),
    ) as unknown;
    expect(marker).toEqual({
      canonicalOutputPath: resolve(outputDirectory),
      canonicalParentPath: resolve(dirname(outputDirectory)),
      canonicalRecoveryPath: resolve(backupDirectory),
      formatVersion: 2,
      owner: 'receipt-portfolio-static-site-builder',
    });
    const backupInventory = await fileInventory(backupDirectory);
    delete backupInventory[BACKUP_OWNER_MARKER];
    expect(backupInventory).toEqual(previousInventory);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('SITE_OUTPUT_CLEANUP_DEBT'),
    );

    const publishedInventory = await fileInventory(outputDirectory);
    const recoveryInventory = await fileInventory(backupDirectory);
    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
      }),
    ).rejects.toThrow(/Cannot clear prior site output cleanup debt/);
    expect(await fileInventory(outputDirectory)).toEqual(publishedInventory);
    expect(await fileInventory(backupDirectory)).toEqual(recoveryInventory);
    expect(
      (await readdir(dirname(outputDirectory))).filter((name) =>
        name.startsWith(`.${basename(outputDirectory)}-stage-`),
      ),
    ).toEqual([]);

    mockedRm.mockImplementation(realFileSystem.rm);
    warning.mockRestore();
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
    });

    await expect(readdir(backupDirectory)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(
      await readFile(
        join(outputDirectory, 'search-receipt', 'index.html'),
        'utf8',
      ),
    ).toContain('Controlled fixture example');
  });

  it(
    'keeps compiler artifacts outside the real production site output',
    async () => {
      const canonicalEvidenceDirectory = join(projectRoot, 'evidence');
      const originalEvidence = await fileInventory(canonicalEvidenceDirectory);
      await runProductionBuild();

      expect(await fileInventory(canonicalEvidenceDirectory)).toEqual(
        originalEvidence,
      );

      const inventory = Object.keys(await fileInventory(outputDirectory));
      expect(inventory).toContain('search-receipt/methodology/index.html');
      expect(inventory).toContain('skill-ledger/sources/index.html');
      expect(inventory).toContain('workflow-test-lab/sitemap.xml');
      expect(inventory).toContain('video-moment-search/index.html');
      expect(inventory).toContain('video-moment-search/sitemap.xml');
      expect(inventory).toContain('robots.txt');
      expect(inventory).toContain('sitemap.xml');
      expect(inventory.some((path) => /\/receipts\//.test(path))).toBe(true);
      await expect(
        readFile(
          join(projectRoot, 'dist', 'runtime', 'scripts', 'build-sites.js'),
          'utf8',
        ),
      ).resolves.toContain('buildSites');
    },
    PRODUCTION_BUILD_SUBPROCESS_TIMEOUT_MS,
  );

  it(
    'uses the CLI environment adapter for the production Pages base',
    async () => {
      await runProductionBuild({
        publicBaseUrl: 'https://tylerkoster.github.io/receipt-portfolio/',
      });

      const home = await readFile(
        join(outputDirectory, 'search-receipt', 'index.html'),
        'utf8',
      );
      expect(home).toContain(
        '<link rel="canonical" href="https://tylerkoster.github.io/receipt-portfolio/search-receipt/">',
      );
      expect(home).toContain(
        'href="/receipt-portfolio/search-receipt/styles.css"',
      );
    },
    PRODUCTION_BUILD_SUBPROCESS_TIMEOUT_MS,
  );

  it('runs an isolated compiled runtime without invoking npm compilation', async () => {
    const isolatedRuntime = join(dirname(outputDirectory), 'runtime-a');
    const calls: unknown[][] = [];

    await runProductionBuild({
      executor: async (command, arguments_, options) => {
        calls.push([command, arguments_, options.cwd]);
      },
      runtimeDirectory: isolatedRuntime,
    });

    expect(calls).toEqual([
      [
        process.execPath,
        [join(isolatedRuntime, 'scripts', 'build-sites.js')],
        projectRoot,
      ],
    ]);
  });

  it(
    'keeps canonical evidence byte-equal across concurrent production-build processes',
    async () => {
      const canonicalEvidenceDirectory = join(projectRoot, 'evidence');
      const originalEvidence = await fileInventory(canonicalEvidenceDirectory);
      await realFileSystem.mkdir(join(projectRoot, 'dist'), {
        recursive: true,
      });
      const isolatedRuntimeRoot = await realFileSystem.mkdtemp(
        join(projectRoot, 'dist', '.concurrent-runtime-'),
      );
      temporaryDirectories.push(isolatedRuntimeRoot);
      const firstOutput = join(isolatedRuntimeRoot, 'output-a');
      const secondOutput = join(isolatedRuntimeRoot, 'output-b');
      const compiledRuntime = join(
        isolatedRuntimeRoot,
        'compiled-runtime-source',
      );
      const firstRuntime = join(isolatedRuntimeRoot, 'runtime-a');
      const secondRuntime = join(isolatedRuntimeRoot, 'runtime-b');
      const firstEvidence = join(isolatedRuntimeRoot, 'evidence-a');
      const secondEvidence = join(isolatedRuntimeRoot, 'evidence-b');
      const acceptedFixtureEvidence = await fileInventory(
        testEvidenceDirectory,
      );
      await Promise.all([
        realFileSystem.cp(testEvidenceDirectory, firstEvidence, {
          recursive: true,
        }),
        realFileSystem.cp(testEvidenceDirectory, secondEvidence, {
          recursive: true,
        }),
      ]);

      await compileIsolatedProductionRuntime(compiledRuntime);
      await Promise.all([
        realFileSystem.cp(compiledRuntime, firstRuntime, { recursive: true }),
        realFileSystem.cp(compiledRuntime, secondRuntime, { recursive: true }),
      ]);
      await Promise.all([
        realFileSystem.cp(
          join(projectRoot, 'manifests'),
          join(firstRuntime, 'manifests'),
          { recursive: true },
        ),
        realFileSystem.cp(
          join(projectRoot, 'manifests'),
          join(secondRuntime, 'manifests'),
          { recursive: true },
        ),
      ]);
      await Promise.all([
        realFileSystem.mkdir(
          join(firstRuntime, 'fixtures', 'video-moment-search'),
          { recursive: true },
        ),
        realFileSystem.mkdir(
          join(secondRuntime, 'fixtures', 'video-moment-search'),
          { recursive: true },
        ),
      ]);
      await Promise.all([
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'source-bound-investigation-handoff.json',
          ),
          join(
            firstRuntime,
            'sites',
            'search-receipt',
            'source-bound-investigation-handoff.json',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'source-bound-investigation-handoff.json',
          ),
          join(
            secondRuntime,
            'sites',
            'search-receipt',
            'source-bound-investigation-handoff.json',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'fixtures',
            'video-moment-search',
            'authorized-ai-video-v1.json',
          ),
          join(
            firstRuntime,
            'fixtures',
            'video-moment-search',
            'authorized-ai-video-v1.json',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'fixtures',
            'video-moment-search',
            'authorized-ai-video-v1.json',
          ),
          join(
            secondRuntime,
            'fixtures',
            'video-moment-search',
            'authorized-ai-video-v1.json',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'fixtures',
            'video-moment-search',
            'video-source-evidence-manifest-v2.json',
          ),
          join(
            firstRuntime,
            'fixtures',
            'video-moment-search',
            'video-source-evidence-manifest-v2.json',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'fixtures',
            'video-moment-search',
            'video-source-evidence-manifest-v2.json',
          ),
          join(
            secondRuntime,
            'fixtures',
            'video-moment-search',
            'video-source-evidence-manifest-v2.json',
          ),
        ),
        realFileSystem.copyFile(
          join(projectRoot, 'sites', 'video-moment-search', 'styles.css'),
          join(firstRuntime, 'sites', 'video-moment-search', 'styles.css'),
        ),
        realFileSystem.copyFile(
          join(projectRoot, 'sites', 'video-moment-search', 'styles.css'),
          join(secondRuntime, 'sites', 'video-moment-search', 'styles.css'),
        ),
      ]);
      await Promise.all([
        realFileSystem.copyFile(
          join(projectRoot, 'sites', 'shared', 'styles.css'),
          join(firstRuntime, 'sites', 'shared', 'styles.css'),
        ),
        realFileSystem.copyFile(
          join(projectRoot, 'sites', 'shared', 'styles.css'),
          join(secondRuntime, 'sites', 'shared', 'styles.css'),
        ),
      ]);
      await Promise.all([
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'skill-ledger',
            'public-inventory-adapter.js',
          ),
          join(
            firstRuntime,
            'sites',
            'skill-ledger',
            'public-inventory-adapter.js',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'skill-ledger',
            'public-inventory-adapter.js',
          ),
          join(
            secondRuntime,
            'sites',
            'skill-ledger',
            'public-inventory-adapter.js',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'skill-ledger',
            'public-inventory-bootstrap.js',
          ),
          join(
            firstRuntime,
            'sites',
            'skill-ledger',
            'public-inventory-bootstrap.js',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'skill-ledger',
            'public-inventory-bootstrap.js',
          ),
          join(
            secondRuntime,
            'sites',
            'skill-ledger',
            'public-inventory-bootstrap.js',
          ),
        ),
      ]);
      await Promise.all([
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'source-bound-decision-aid-discovery.json',
          ),
          join(
            firstRuntime,
            'sites',
            'search-receipt',
            'source-bound-decision-aid-discovery.json',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'source-bound-decision-aid-discovery.json',
          ),
          join(
            secondRuntime,
            'sites',
            'search-receipt',
            'source-bound-decision-aid-discovery.json',
          ),
        ),
        realFileSystem.copyFile(
          join(projectRoot, 'sites', 'search-receipt', 'search-interface.js'),
          join(firstRuntime, 'sites', 'search-receipt', 'search-interface.js'),
        ),
        realFileSystem.copyFile(
          join(projectRoot, 'sites', 'search-receipt', 'search-interface.js'),
          join(secondRuntime, 'sites', 'search-receipt', 'search-interface.js'),
        ),
        realFileSystem.copyFile(
          join(projectRoot, 'sites', 'search-receipt', 'search-interface.css'),
          join(firstRuntime, 'sites', 'search-receipt', 'search-interface.css'),
        ),
        realFileSystem.copyFile(
          join(projectRoot, 'sites', 'search-receipt', 'search-interface.css'),
          join(
            secondRuntime,
            'sites',
            'search-receipt',
            'search-interface.css',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'investigation-worksheet.js',
          ),
          join(
            firstRuntime,
            'sites',
            'search-receipt',
            'investigation-worksheet.js',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'investigation-worksheet.js',
          ),
          join(
            secondRuntime,
            'sites',
            'search-receipt',
            'investigation-worksheet.js',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'source-bound-evergreen-guide.json',
          ),
          join(
            firstRuntime,
            'sites',
            'search-receipt',
            'source-bound-evergreen-guide.json',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'source-bound-evergreen-guide.json',
          ),
          join(
            secondRuntime,
            'sites',
            'search-receipt',
            'source-bound-evergreen-guide.json',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'source-bound-investigation-worksheet.json',
          ),
          join(
            firstRuntime,
            'sites',
            'search-receipt',
            'source-bound-investigation-worksheet.json',
          ),
        ),
        realFileSystem.copyFile(
          join(
            projectRoot,
            'sites',
            'search-receipt',
            'source-bound-investigation-worksheet.json',
          ),
          join(
            secondRuntime,
            'sites',
            'search-receipt',
            'source-bound-investigation-worksheet.json',
          ),
        ),
      ]);

      const evidenceRootsUsed: string[] = [];
      const recordingExecutor: ProductionBuildExecutor = async (
        command,
        arguments_,
        options,
      ) => {
        evidenceRootsUsed.push(options.env[EVIDENCE_DIRECTORY_ENV] ?? '');
        await executeProductionBuild(command, arguments_, options);
      };
      await Promise.all([
        runProductionBuild({
          evidenceDirectory: firstEvidence,
          executor: recordingExecutor,
          outputDirectory: firstOutput,
          runtimeDirectory: firstRuntime,
        }),
        runProductionBuild({
          evidenceDirectory: secondEvidence,
          executor: recordingExecutor,
          outputDirectory: secondOutput,
          runtimeDirectory: secondRuntime,
        }),
      ]);

      expect(evidenceRootsUsed.sort()).toEqual(
        [firstEvidence, secondEvidence].sort(),
      );
      expect(await fileInventory(firstEvidence)).toEqual(
        acceptedFixtureEvidence,
      );
      expect(await fileInventory(secondEvidence)).toEqual(
        acceptedFixtureEvidence,
      );
      expect(await fileInventory(canonicalEvidenceDirectory)).toEqual(
        originalEvidence,
      );
      await expect(
        readFile(join(firstOutput, 'search-receipt', 'index.html'), 'utf8'),
      ).resolves.toContain('Search Receipt');
      await expect(
        readFile(
          join(firstOutput, 'search-receipt', 'search-interface.js'),
          'utf8',
        ),
      ).resolves.toContain('initializeSearchReceipt');
      await expect(
        readFile(join(secondOutput, 'skill-ledger', 'index.html'), 'utf8'),
      ).resolves.toContain('SkillLedger');
      await expect(
        readFile(join(firstOutput, 'search-receipt', 'index.html'), 'utf8'),
      ).resolves.toContain('Controlled fixture example');
      await expect(
        readFile(join(secondOutput, 'search-receipt', 'index.html'), 'utf8'),
      ).resolves.toContain('Controlled fixture example');
    },
    PRODUCTION_BUILD_SUBPROCESS_TIMEOUT_MS,
  );

  it('omits a REVIEW_REQUIRED record from public rendering', async () => {
    const receipt = (
      await searchReceiptEntryByIdentity('google-search-status-example', 2)
    ).receipt;
    const held = {
      ...receipt,
      payload: {
        ...receipt.payload,
        policy: {
          decision: 'REVIEW_REQUIRED' as const,
          reasonCodes: ['AMBIGUOUS_OR_LARGE_CHANGE'],
        },
      },
    };
    expect(renderSite(searchReceiptSite, [held])).not.toContain(
      receipt.payload.sourceId,
    );
  });

  it('escapes hostile source text rather than rendering markup', async () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );

    const receipt = (
      await searchReceiptEntryByIdentity('google-search-status-example', 2)
    ).receipt;
    const hostile = {
      ...receipt,
      payload: {
        ...receipt.payload,
        publicFacts: {
          ...receipt.payload.publicFacts,
          summary: '<script>alert("receipt")</script>',
        },
      },
    } as Receipt;
    const html = renderSite(searchReceiptSite, [hostile]);
    expect(html).not.toContain('<script>alert("receipt")</script>');
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;receipt&quot;)&lt;/script&gt;',
    );
  });

  it('escapes all five HTML-sensitive characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('rejects a mutated receipt before rendering any public page', async () => {
    await buildSites({
      evidenceDirectory: testEvidenceDirectory,
      outputDirectory,
      includeVideoMomentSearch: true,
      videoMomentValidationNow: new Date('2026-08-31T12:00:00.000Z'),
    });
    const previousInventory = await fileInventory(outputDirectory);
    const entry = await searchReceiptEntryByIdentity(
      'google-search-status-example',
      2,
    );
    const receipt = entry.receipt;
    const path = entry.path;
    const mutatedReceipt = {
      ...receipt,
      payload: { ...receipt.payload, sourceId: 'mutated-source' },
    };
    await writeFile(path, canonicalJson(mutatedReceipt));

    await expect(
      buildSites({
        evidenceDirectory: testEvidenceDirectory,
        outputDirectory,
        includeVideoMomentSearch: true,
        videoMomentValidationNow: new Date('2026-08-31T12:00:00.000Z'),
      }),
    ).rejects.toThrow(/digest/i);
    expect(await fileInventory(outputDirectory)).toEqual(previousInventory);
  });
});
