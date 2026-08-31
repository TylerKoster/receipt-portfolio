import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  canonicalJson,
  type Receipt,
} from '../packages/evidence-core/src/index.js';
import {
  buildSearchIndex,
  type VideoCorpus,
} from '../packages/video-moment-core/src/index.js';
import { searchReceiptSite } from '../sites/search-receipt/index.js';
import {
  renderSearchReceiptDecisionAidDiscovery,
  type SourceBoundDecisionAidDiscovery,
} from '../sites/search-receipt/render-decision-aid-discovery.js';
import {
  renderSearchReceiptEvergreenGuide,
  type SourceBoundEvergreenGuide,
} from '../sites/search-receipt/render-evergreen-guide.js';
import {
  renderSearchReceiptInvestigationWorksheet,
  type SourceBoundInvestigationWorksheet,
} from '../sites/search-receipt/render-investigation-worksheet.js';
import { validateSourceBoundDecisionAidDiscovery } from '../sites/search-receipt/source-bound-decision-aid-discovery.js';
import { validateSourceBoundEvergreenGuide } from '../sites/search-receipt/source-bound-evergreen-guide.js';
import { validateSourceBoundInvestigationWorksheet } from '../sites/search-receipt/source-bound-investigation-worksheet.js';
import { PORTFOLIO_FAVICON } from '../sites/shared/favicon.js';
import {
  DEFAULT_PUBLIC_BASE_URL,
  normalizePublicBaseUrl,
  renderMethodology,
  renderPortfolioHub,
  renderPortfolioRobots,
  renderPortfolioSitemapIndex,
  renderReceiptDetail,
  renderRobots,
  renderSite,
  renderSitemap,
  renderSources,
  renderTopic,
} from '../sites/shared/render.js';
import {
  renderSkillLedgerPublicInventory,
  skillLedgerSite,
} from '../sites/skill-ledger/index.js';
import type { SourceBoundPublicSkillLedgerRecord } from '../sites/skill-ledger/public-inventory-adapter.js';
import { videoMomentSearchSite } from '../sites/video-moment-search/index.js';
import { VIDEO_MOMENT_SEARCH_CLIENT } from '../sites/video-moment-search/search-client.js';
import {
  renderCreatorPage,
  renderMomentPage,
  renderVideoPage,
  renderVideoMomentHome,
  serializePublicSearchIndex,
} from '../sites/video-moment-search/render.js';
import {
  renderAtomFeed,
  renderSitemap as renderVideoMomentSitemap,
  renderSitemapIndex as renderVideoMomentSitemapIndex,
} from '../sites/video-moment-search/seo.js';
import { validateCommonsSourceEvidence } from '../sites/video-moment-search/source-evidence.js';
import { workflowTestLabSite } from '../sites/workflow-test-lab/index.js';
import { loadVerifiedReceipts } from './evidence-cli.js';

const SITE_DEFINITIONS = [
  searchReceiptSite,
  workflowTestLabSite,
  skillLedgerSite,
] as const;
const CLEANUP_RETRY_DELAYS_MS = [25, 100] as const;
const BACKUP_OWNER_MARKER = '.receipt-portfolio-backup-owner.json';
const BACKUP_OWNER = 'receipt-portfolio-static-site-builder';
const BACKUP_FORMAT_VERSION = 2;
export const PUBLIC_BASE_URL_ENV = 'RECEIPT_PORTFOLIO_BASE_URL';
export const EVIDENCE_DIRECTORY_ENV = 'RECEIPT_PORTFOLIO_EVIDENCE_DIR';
export const OUTPUT_DIRECTORY_ENV = 'RECEIPT_PORTFOLIO_OUTPUT_DIR';

function projectRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const parentDirectory = dirname(moduleDirectory);
  if (basename(parentDirectory) === 'dist') return dirname(parentDirectory);
  const grandparentDirectory = dirname(parentDirectory);
  return basename(grandparentDirectory) === 'dist'
    ? dirname(grandparentDirectory)
    : parentDirectory;
}

function missingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function cleanupErrorCode(error: unknown): string {
  return error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : 'UNKNOWN';
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
    : resolve(left) === resolve(right);
}

async function ensureTrustedRealDirectory(path: string): Promise<string> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let current = root;
  for (const segment of absolute
    .slice(root.length)
    .split(sep)
    .filter(Boolean)) {
    current = join(current, segment);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      if (!missingPath(error)) throw error;
      await mkdir(current);
      stats = await lstat(current);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(
        `Output ancestor must not be symbolic or reparse-linked: ${current}`,
      );
    }
  }
  const canonical = await realpath(absolute);
  if (!samePath(canonical, absolute)) {
    throw new Error(
      `Output ancestor canonical path changed through a link: ${absolute}`,
    );
  }
  return canonical;
}

async function inspectOptionalRealDirectory(
  path: string,
  label: string,
): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(
        `${label} must not be symbolic, junction-backed, or non-directory: ${path}`,
      );
    }
    const canonical = await realpath(path);
    if (!samePath(canonical, path)) {
      throw new Error(
        `${label} canonical path does not match its requested path: ${path}`,
      );
    }
    return true;
  } catch (error) {
    if (missingPath(error)) return false;
    throw error;
  }
}

async function rejectLinkedTree(path: string): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Owned cleanup tree contains a symbolic or reparse entry: ${entryPath}`,
      );
    }
    if (entry.isDirectory()) await rejectLinkedTree(entryPath);
    else if (!entry.isFile()) {
      throw new Error(
        `Owned cleanup tree contains a non-regular entry: ${entryPath}`,
      );
    }
  }
}

function backupMarker(
  canonicalParentPath: string,
  canonicalOutputPath: string,
  canonicalRecoveryPath: string,
): object {
  return {
    canonicalOutputPath,
    canonicalParentPath,
    canonicalRecoveryPath,
    formatVersion: BACKUP_FORMAT_VERSION,
    owner: BACKUP_OWNER,
  };
}

type BackupOwnership =
  | { readonly status: 'absent' }
  | { readonly status: 'owned' }
  | { readonly status: 'unowned'; readonly reason: string };

async function inspectBackupOwnership(
  backupDirectory: string,
  canonicalParentPath: string,
  canonicalOutputPath: string,
): Promise<BackupOwnership> {
  let exists: boolean;
  try {
    exists = await inspectOptionalRealDirectory(
      backupDirectory,
      'Recovery entry',
    );
  } catch (error) {
    return {
      status: 'unowned',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (!exists) return { status: 'absent' };

  const canonicalRecoveryPath = resolve(
    canonicalParentPath,
    basename(backupDirectory),
  );
  try {
    if (!samePath(await realpath(backupDirectory), canonicalRecoveryPath)) {
      return {
        status: 'unowned',
        reason: 'recovery real path is outside the trusted parent',
      };
    }
    const markerPath = join(backupDirectory, BACKUP_OWNER_MARKER);
    const markerStats = await lstat(markerPath);
    if (markerStats.isSymbolicLink() || !markerStats.isFile()) {
      return {
        status: 'unowned',
        reason: 'owner marker is not a regular file',
      };
    }
    const expected = Buffer.from(
      canonicalJson(
        backupMarker(
          canonicalParentPath,
          canonicalOutputPath,
          canonicalRecoveryPath,
        ),
      ),
      'utf8',
    );
    if (!(await readFile(markerPath)).equals(expected)) {
      return {
        status: 'unowned',
        reason: 'owner marker does not bind canonical paths',
      };
    }
    await rejectLinkedTree(backupDirectory);
    return { status: 'owned' };
  } catch (error) {
    return {
      status: 'unowned',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

type CleanupResult =
  | { readonly cleaned: true }
  | {
      readonly cleaned: false;
      readonly kind: 'cleanup-failed' | 'unowned';
      readonly error: unknown;
    };

async function removeOwnedBackupWithRetries(
  backupDirectory: string,
  canonicalParentPath: string,
  canonicalOutputPath: string,
): Promise<CleanupResult> {
  for (
    let attempt = 0;
    attempt <= CLEANUP_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    const ownership = await inspectBackupOwnership(
      backupDirectory,
      canonicalParentPath,
      canonicalOutputPath,
    );
    if (ownership.status === 'absent') return { cleaned: true };
    if (ownership.status === 'unowned') {
      return {
        cleaned: false,
        kind: 'unowned',
        error: new Error(ownership.reason),
      };
    }
    try {
      await rm(backupDirectory, { force: true, recursive: true });
      return { cleaned: true };
    } catch (error) {
      if (missingPath(error)) return { cleaned: true };
      const retryDelay = CLEANUP_RETRY_DELAYS_MS[attempt];
      if (
        retryDelay === undefined ||
        !['EACCES', 'EBUSY', 'ENOTEMPTY', 'EPERM'].includes(
          cleanupErrorCode(error),
        )
      ) {
        return { cleaned: false, kind: 'cleanup-failed', error };
      }
      await delay(retryDelay);
    }
  }
  throw new Error('Unreachable cleanup retry state');
}

async function verifyOwnedStaging(
  stagingDirectory: string,
  canonicalParentPath: string,
): Promise<void> {
  await inspectOptionalRealDirectory(stagingDirectory, 'Staging entry');
  if (
    dirname(resolve(stagingDirectory)) !== resolve(canonicalParentPath) ||
    !samePath(await realpath(stagingDirectory), stagingDirectory)
  ) {
    throw new Error(
      'Staging entry is outside its trusted canonical output parent',
    );
  }
  await rejectLinkedTree(stagingDirectory);
}

async function writeSiteTree(
  outputDirectory: string,
  receipts: readonly Receipt[],
  publicBaseUrl: string,
  includeVideoMomentSearch: boolean,
): Promise<void> {
  const [
    searchDecisionAid,
    searchGuide,
    searchWorksheet,
    searchStatusManifest,
    searchCentralManifest,
  ] = await Promise.all([
    readFile(
      join(
        projectRoot(),
        'sites',
        'search-receipt',
        'source-bound-decision-aid-discovery.json',
      ),
      'utf8',
    ).then((content) => JSON.parse(content) as SourceBoundDecisionAidDiscovery),
    readFile(
      join(
        projectRoot(),
        'sites',
        'search-receipt',
        'source-bound-evergreen-guide.json',
      ),
      'utf8',
    ).then((content) => JSON.parse(content) as SourceBoundEvergreenGuide),
    readFile(
      join(
        projectRoot(),
        'sites',
        'search-receipt',
        'source-bound-investigation-worksheet.json',
      ),
      'utf8',
    ).then(
      (content) => JSON.parse(content) as SourceBoundInvestigationWorksheet,
    ),
    readFile(
      join(
        projectRoot(),
        'manifests',
        'search-receipt',
        'google-search-status.json',
      ),
      'utf8',
    ).then(
      (content) =>
        JSON.parse(content) as { sourceId: string; endpoint: string },
    ),
    readFile(
      join(
        projectRoot(),
        'manifests',
        'search-receipt',
        'google-search-central-blog.json',
      ),
      'utf8',
    ).then(
      (content) =>
        JSON.parse(content) as { sourceId: string; endpoint: string },
    ),
  ]);
  const guideValidation = validateSourceBoundEvergreenGuide(searchGuide, {
    [searchStatusManifest.sourceId]: searchStatusManifest,
    [searchCentralManifest.sourceId]: searchCentralManifest,
  });
  if (!guideValidation.ok) {
    throw new Error(
      `Search Receipt evergreen guide is not admitted: ${guideValidation.diagnostics.join(', ')}`,
    );
  }
  const worksheetValidation = validateSourceBoundInvestigationWorksheet(
    searchWorksheet,
    {
      [searchStatusManifest.sourceId]: searchStatusManifest,
      [searchCentralManifest.sourceId]: searchCentralManifest,
    },
  );
  if (!worksheetValidation.ok) {
    throw new Error(
      `Search Receipt investigation worksheet is not admitted: ${worksheetValidation.diagnostics.join(', ')}`,
    );
  }
  const decisionAidValidation = validateSourceBoundDecisionAidDiscovery(
    searchDecisionAid,
    {
      [searchStatusManifest.sourceId]: searchStatusManifest,
    },
  );
  if (!decisionAidValidation.ok) {
    throw new Error(
      `Search Receipt decision aid is not admitted: ${decisionAidValidation.diagnostics.join(', ')}`,
    );
  }
  const decisionAidPath = `${searchDecisionAid.metadata.canonicalSlugProposal}/`;
  const guidePath = `${searchGuide.metadata.canonicalSlugProposal}/`;
  const worksheetPath = `${searchWorksheet.metadata.canonicalSlugProposal}/`;
  const sourceBoundSkillRecords: SourceBoundPublicSkillLedgerRecord[] = receipts
    .filter(
      (receipt) =>
        receipt.payload.siteId === 'skill-ledger' &&
        receipt.payload.policy.decision === 'PASS' &&
        receipt.payload.publicFacts.kind === 'skill-source-metadata' &&
        receipt.payload.provenance.evidenceClass === 'live-source' &&
        receipt.payload.provenance.extractionContractId ===
          'skill-declared-metadata-v1' &&
        receipt.payload.provenance.schemaId ===
          'skill-source-metadata-public-v1',
    )
    .map((receipt) => {
      const facts = receipt.payload.publicFacts;
      if (facts.kind !== 'skill-source-metadata') {
        throw new Error('Skill source facts changed during build mapping');
      }
      return {
        receiptId: receipt.id,
        evidenceClass: 'source-bound-observation',
        source: {
          sourceId: receipt.payload.sourceId,
          url: receipt.payload.sourceUrl,
          observedAt: receipt.payload.observedAt,
          publisher: receipt.payload.provenance.publisherName,
          repository: facts.sourceRepository,
          commit: facts.sourceCommit,
          path: facts.sourcePath,
        },
        hashes: {
          manifestSha256: receipt.payload.manifestSha256,
          rawSha256: receipt.payload.rawSha256,
          normalizedSha256: receipt.payload.normalizedSha256,
        },
        declaredMetadata: {
          packageId: facts.packageId,
          description: facts.description,
          license: facts.declaredLicense,
          contentsSha256: facts.contentsSha256,
        },
        inheritedLicense: {
          url: facts.inheritedLicenseUrl,
          sha256: facts.inheritedLicenseSha256,
        },
        coverage: {
          manifest: 'not-assessed',
          dependencies: 'not-assessed',
          staticSignals: 'not-assessed',
          instructionBody: 'not-published-or-executed',
        },
        boundary: facts.boundary,
      };
    });
  const sourceBoundSkillDataModule = `export const SOURCE_BOUND_PUBLIC_SKILL_RECORDS = ${canonicalJson(sourceBoundSkillRecords).replaceAll('<', '\\u003c')};\n`;
  const includedSites = includeVideoMomentSearch
    ? [...SITE_DEFINITIONS, videoMomentSearchSite]
    : SITE_DEFINITIONS;

  await writeFile(join(outputDirectory, 'favicon.ico'), PORTFOLIO_FAVICON);
  await copyFile(
    join(projectRoot(), 'sites', 'shared', 'styles.css'),
    join(outputDirectory, 'portfolio.css'),
  );
  await writeFile(
    join(outputDirectory, 'index.html'),
    renderPortfolioHub(includedSites, publicBaseUrl),
  );
  await Promise.all([
    writeFile(
      join(outputDirectory, 'robots.txt'),
      renderPortfolioRobots(publicBaseUrl),
    ),
    writeFile(
      join(outputDirectory, 'sitemap.xml'),
      renderPortfolioSitemapIndex(includedSites, publicBaseUrl),
    ),
  ]);
  for (const site of SITE_DEFINITIONS) {
    const directory = join(outputDirectory, site.siteId);
    const visible = receipts.filter(
      (receipt) =>
        receipt.payload.siteId === site.siteId &&
        receipt.payload.policy.decision === 'PASS',
    );
    if (visible.length === 0) {
      throw new Error(
        `Public build requires nonempty accepted evidence for ${site.siteId}`,
      );
    }
    await mkdir(join(directory, 'methodology'), { recursive: true });
    await mkdir(join(directory, 'sources'), { recursive: true });
    await copyFile(
      join(projectRoot(), 'sites', 'shared', 'styles.css'),
      join(directory, 'styles.css'),
    );
    if (site.siteId === 'search-receipt') {
      await mkdir(
        join(
          directory,
          ...searchDecisionAid.metadata.canonicalSlugProposal
            .split('/')
            .filter((segment) => segment !== ''),
        ),
        { recursive: true },
      );
      await mkdir(
        join(
          directory,
          ...searchGuide.metadata.canonicalSlugProposal
            .split('/')
            .filter((segment) => segment !== ''),
        ),
        { recursive: true },
      );
      await mkdir(
        join(
          directory,
          ...searchWorksheet.metadata.canonicalSlugProposal
            .split('/')
            .filter((segment) => segment !== ''),
        ),
        { recursive: true },
      );
      await Promise.all([
        copyFile(
          join(projectRoot(), 'sites', 'search-receipt', 'search-interface.js'),
          join(directory, 'search-interface.js'),
        ),
        copyFile(
          join(
            projectRoot(),
            'sites',
            'search-receipt',
            'search-interface.css',
          ),
          join(directory, 'search-interface.css'),
        ),
        copyFile(
          join(
            projectRoot(),
            'sites',
            'search-receipt',
            'investigation-worksheet.js',
          ),
          join(directory, 'investigation-worksheet.js'),
        ),
        writeFile(
          join(
            directory,
            ...searchDecisionAid.metadata.canonicalSlugProposal
              .split('/')
              .filter((segment) => segment !== ''),
            'index.html',
          ),
          renderSearchReceiptDecisionAidDiscovery(
            site,
            searchDecisionAid,
            publicBaseUrl,
          ),
        ),
        writeFile(
          join(
            directory,
            ...searchGuide.metadata.canonicalSlugProposal
              .split('/')
              .filter((segment) => segment !== ''),
            'index.html',
          ),
          renderSearchReceiptEvergreenGuide(site, searchGuide, publicBaseUrl),
        ),
        writeFile(
          join(
            directory,
            ...searchWorksheet.metadata.canonicalSlugProposal
              .split('/')
              .filter((segment) => segment !== ''),
            'index.html',
          ),
          renderSearchReceiptInvestigationWorksheet(
            site,
            searchWorksheet,
            publicBaseUrl,
          ),
        ),
      ]);
    }
    if (site.siteId === 'skill-ledger') {
      await mkdir(join(directory, 'inventory'), { recursive: true });
      await Promise.all([
        copyFile(
          join(
            projectRoot(),
            'sites',
            'skill-ledger',
            'public-inventory-adapter.js',
          ),
          join(directory, 'public-inventory-adapter.js'),
        ),
        copyFile(
          join(
            projectRoot(),
            'sites',
            'skill-ledger',
            'public-inventory-bootstrap.js',
          ),
          join(directory, 'public-inventory-bootstrap.js'),
        ),
        writeFile(
          join(directory, 'public-inventory-data.js'),
          sourceBoundSkillDataModule,
        ),
        writeFile(
          join(directory, 'inventory', 'index.html'),
          renderSkillLedgerPublicInventory(publicBaseUrl),
        ),
      ]);
    }
    await writeFile(
      join(directory, 'index.html'),
      renderSite(
        site,
        visible,
        publicBaseUrl,
        site.siteId === 'search-receipt'
          ? {
              featuredDecisionAid: {
                path: decisionAidPath,
                title: searchDecisionAid.metadata.title,
                description: searchDecisionAid.metadata.description,
                label: 'Choose the right resource',
              },
              featuredGuide: {
                path: guidePath,
                title: searchGuide.metadata.title,
                description: searchGuide.metadata.description,
              },
              featuredUtility: {
                path: worksheetPath,
                title: searchWorksheet.metadata.title,
                description: searchWorksheet.metadata.description,
                label: 'Open the private worksheet',
              },
            }
          : site.siteId === 'skill-ledger'
            ? {
                featuredUtility: {
                  path: '/inventory/',
                  title: 'Filter and compare source-bound skill metadata',
                  description:
                    'Search one immutable Microsoft source observation alongside clearly labeled controlled examples, without installing or executing a skill.',
                  label: 'Open the interactive inventory',
                },
              }
            : {},
      ),
    );
    await writeFile(
      join(directory, 'methodology', 'index.html'),
      renderMethodology(site, publicBaseUrl),
    );
    await writeFile(
      join(directory, 'sources', 'index.html'),
      renderSources(site, visible, publicBaseUrl),
    );
    await writeFile(
      join(directory, 'sitemap.xml'),
      renderSitemap(
        site,
        visible,
        publicBaseUrl,
        site.siteId === 'search-receipt'
          ? [decisionAidPath, guidePath, worksheetPath]
          : site.siteId === 'skill-ledger'
            ? ['/inventory/']
            : [],
      ),
    );
    await writeFile(
      join(directory, 'robots.txt'),
      renderRobots(site, publicBaseUrl),
    );

    for (const receipt of visible) {
      const receiptDirectory = join(directory, 'receipts', receipt.id);
      await mkdir(receiptDirectory, { recursive: true });
      await writeFile(
        join(receiptDirectory, 'index.html'),
        renderReceiptDetail(site, receipt, publicBaseUrl),
      );
    }
    const topics = [
      ...new Set(visible.map((receipt) => receipt.payload.topicSlug)),
    ].sort();
    for (const topic of topics) {
      const topicDirectory = join(directory, 'topics', topic);
      await mkdir(topicDirectory, { recursive: true });
      await writeFile(
        join(topicDirectory, 'index.html'),
        renderTopic(site, topic, visible, publicBaseUrl),
      );
    }
  }
  if (includeVideoMomentSearch) {
    const [fixture, sourceRightsEvidence] = await Promise.all([
      readFile(
        join(
          projectRoot(),
          'fixtures',
          'video-moment-search',
          'authorized-ai-video-v1.json',
        ),
        'utf8',
      ).then((content) => JSON.parse(content) as VideoCorpus),
      readFile(
        join(
          projectRoot(),
          'fixtures',
          'video-moment-search',
          'commons-source-rights-v1.json',
        ),
        'utf8',
      ).then((content) => JSON.parse(content) as unknown),
    ]);
    const sourceEvidenceValidation = validateCommonsSourceEvidence(
      fixture,
      sourceRightsEvidence,
    );
    if (!sourceEvidenceValidation.ok) {
      throw new Error(
        `AI Moment Index source evidence is not admitted: ${sourceEvidenceValidation.diagnostics.join(', ')}`,
      );
    }
    const index = buildSearchIndex(fixture);
    const directory = join(outputDirectory, videoMomentSearchSite.siteId);
    await mkdir(directory, { recursive: true });
    await Promise.all([
      writeFile(
        join(directory, 'index.html'),
        renderVideoMomentHome(
          fixture,
          index,
          publicBaseUrl,
          sourceRightsEvidence,
        ),
      ),
      writeFile(
        join(directory, 'search-index.json'),
        canonicalJson(
          serializePublicSearchIndex(fixture, index, sourceRightsEvidence),
        ),
      ),
      writeFile(
        join(directory, 'search-client.js'),
        VIDEO_MOMENT_SEARCH_CLIENT,
      ),
      copyFile(
        join(projectRoot(), 'sites', 'video-moment-search', 'styles.css'),
        join(directory, 'styles.css'),
      ),
    ]);

    const publicVideos = new Map(
      index.entries.map((entry) => [entry.video.id, entry.video]),
    );
    const publicMoments = new Map(
      index.entries.map((entry) => [entry.moment.id, entry.moment]),
    );
    const publicCreatorIds = new Set(
      index.entries.map((entry) => entry.video.creatorId),
    );

    await Promise.all([
      writeFile(
        join(directory, 'sitemap.xml'),
        renderVideoMomentSitemap(fixture, publicBaseUrl),
      ),
      writeFile(
        join(directory, 'sitemap-index.xml'),
        renderVideoMomentSitemapIndex(publicBaseUrl),
      ),
      writeFile(
        join(directory, 'feed.xml'),
        renderAtomFeed(fixture, publicBaseUrl),
      ),
    ]);

    for (const video of publicVideos.values()) {
      const pageDirectory = join(directory, 'videos', video.slug);
      await mkdir(pageDirectory, { recursive: true });
      await writeFile(
        join(pageDirectory, 'index.html'),
        renderVideoPage(fixture, index, video.id, publicBaseUrl),
      );
    }
    for (const moment of publicMoments.values()) {
      const pageDirectory = join(directory, 'moments', moment.id);
      await mkdir(pageDirectory, { recursive: true });
      await writeFile(
        join(pageDirectory, 'index.html'),
        renderMomentPage(fixture, index, moment.id, publicBaseUrl),
      );
    }
    for (const creatorId of publicCreatorIds) {
      const pageDirectory = join(directory, 'creators', creatorId);
      await mkdir(pageDirectory, { recursive: true });
      await writeFile(
        join(pageDirectory, 'index.html'),
        renderCreatorPage(fixture, index, creatorId, publicBaseUrl),
      );
    }
  }
}

async function replaceOutput(
  stagingDirectory: string,
  outputDirectory: string,
  canonicalParentPath: string,
): Promise<void> {
  const canonicalOutputPath = resolve(
    canonicalParentPath,
    basename(outputDirectory),
  );
  const backupDirectory = `${outputDirectory}.previous`;
  await inspectOptionalRealDirectory(outputDirectory, 'Output root');
  const staleCleanup = await removeOwnedBackupWithRetries(
    backupDirectory,
    canonicalParentPath,
    canonicalOutputPath,
  );
  if (!staleCleanup.cleaned) {
    throw new Error(
      staleCleanup.kind === 'unowned'
        ? `Recovery sibling is not builder-owned: ${backupDirectory}`
        : `Cannot clear prior site output cleanup debt at ${backupDirectory}`,
      { cause: staleCleanup.error },
    );
  }
  await verifyOwnedStaging(stagingDirectory, canonicalParentPath);

  let previousOutputMoved = false;
  try {
    await rename(outputDirectory, backupDirectory);
    previousOutputMoved = true;
  } catch (error) {
    if (!missingPath(error)) throw error;
  }

  try {
    await verifyOwnedStaging(stagingDirectory, canonicalParentPath);
    await rename(stagingDirectory, outputDirectory);
  } catch (replacementError) {
    if (previousOutputMoved) {
      try {
        await rename(backupDirectory, outputDirectory);
      } catch (rollbackError) {
        throw new AggregateError(
          [replacementError, rollbackError],
          'Site output replacement and rollback both failed',
        );
      }
    }
    throw replacementError;
  }

  if (previousOutputMoved) {
    const canonicalRecoveryPath = resolve(
      canonicalParentPath,
      basename(backupDirectory),
    );
    try {
      await inspectOptionalRealDirectory(backupDirectory, 'Recovery entry');
      await writeFile(
        join(backupDirectory, BACKUP_OWNER_MARKER),
        canonicalJson(
          backupMarker(
            canonicalParentPath,
            canonicalOutputPath,
            canonicalRecoveryPath,
          ),
        ),
        { encoding: 'utf8', flag: 'wx' },
      );
    } catch (error) {
      console.warn(
        `SITE_OUTPUT_UNOWNED_RECOVERY: published ${outputDirectory}; retained previous tree at ${backupDirectory}; owner marker failed with ${cleanupErrorCode(error)}`,
      );
      return;
    }
    const cleanup = await removeOwnedBackupWithRetries(
      backupDirectory,
      canonicalParentPath,
      canonicalOutputPath,
    );
    if (!cleanup.cleaned) {
      console.warn(
        `SITE_OUTPUT_CLEANUP_DEBT: published ${outputDirectory}; retained previous tree at ${backupDirectory}; cleanup failed with ${cleanupErrorCode(cleanup.error)}`,
      );
    }
  }
}

export async function buildSites(options: {
  evidenceDirectory: string;
  outputDirectory: string;
  publicBaseUrl?: string;
  trustedWorkspaceDirectory?: string;
  includeVideoMomentSearch?: boolean;
}): Promise<void> {
  const publicBaseUrl = normalizePublicBaseUrl(
    options.publicBaseUrl ?? DEFAULT_PUBLIC_BASE_URL,
  );
  const receipts = await loadVerifiedReceipts(options.evidenceDirectory);
  const outputDirectory = resolve(options.outputDirectory);
  const trustedWorkspaceDirectory = await ensureTrustedRealDirectory(
    options.trustedWorkspaceDirectory ??
      dirname(resolve(options.evidenceDirectory)),
  );
  const workspaceRelativeOutput = relative(
    trustedWorkspaceDirectory,
    outputDirectory,
  );
  if (
    workspaceRelativeOutput === '' ||
    workspaceRelativeOutput === '..' ||
    workspaceRelativeOutput.startsWith(`..${sep}`) ||
    isAbsolute(workspaceRelativeOutput)
  ) {
    throw new Error(
      'Output root must be a strict descendant within the trusted workspace contract',
    );
  }
  const canonicalParentPath = await ensureTrustedRealDirectory(
    dirname(outputDirectory),
  );
  await inspectOptionalRealDirectory(outputDirectory, 'Output root');
  const backupDirectory = `${outputDirectory}.previous`;
  try {
    const backupStats = await lstat(backupDirectory);
    if (backupStats.isSymbolicLink()) {
      throw new Error(
        `Recovery entry must not be symbolic or reparse-linked: ${backupDirectory}`,
      );
    }
  } catch (error) {
    if (!missingPath(error)) throw error;
  }
  const stagingDirectory = await mkdtemp(
    join(canonicalParentPath, `.${basename(outputDirectory)}-stage-`),
  );
  try {
    await verifyOwnedStaging(stagingDirectory, canonicalParentPath);
    await writeSiteTree(
      stagingDirectory,
      receipts,
      publicBaseUrl,
      options.includeVideoMomentSearch ?? false,
    );
    await replaceOutput(stagingDirectory, outputDirectory, canonicalParentPath);
  } catch (error) {
    try {
      await verifyOwnedStaging(stagingDirectory, canonicalParentPath);
      await rm(stagingDirectory, { force: true, recursive: true });
    } catch (cleanupError) {
      if (!missingPath(cleanupError)) {
        throw new AggregateError(
          [error, cleanupError],
          'Site build failed and owned staging cleanup could not be verified',
        );
      }
    }
    throw error;
  }
}

async function runBuild(): Promise<void> {
  const root = projectRoot();
  await buildSites({
    evidenceDirectory: resolve(
      root,
      process.env[EVIDENCE_DIRECTORY_ENV] ?? 'evidence',
    ),
    outputDirectory: resolve(
      root,
      process.env[OUTPUT_DIRECTORY_ENV] ?? join('dist', 'sites'),
    ),
    publicBaseUrl: process.env[PUBLIC_BASE_URL_ENV],
    includeVideoMomentSearch: true,
  });
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  pathToFileURL(resolve(invokedPath)).href === import.meta.url
) {
  runBuild().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
