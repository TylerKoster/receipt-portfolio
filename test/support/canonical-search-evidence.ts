import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVerifiedReceipts } from '../../scripts/evidence-cli.js';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));

export const trackedCanonicalEvidenceDirectory = join(projectRoot, 'evidence');

const PINNED_OFFICIAL_SEARCH_RECEIPTS = new Map([
  [
    '754c45ef8cf59a085e5e4edd0a11136b6fc7ede71f94f399b45b16a629f06960',
    {
      sourceId: 'google-search-status',
      sourceUrl: 'https://status.search.google.com/incidents.json',
    },
  ],
  [
    'fb99243b2f13791e98ee43e8424c235e73568b0272693db5f12790481994b361',
    {
      sourceId: 'google-search-central-blog',
      sourceUrl: 'https://feeds.feedburner.com/blogspot/amDG',
    },
  ],
]);

export interface CopyCanonicalSearchEvidenceOptions {
  readonly sourceDirectory?: string;
}

function portableRelativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

export async function copyCanonicalSearchEvidence(
  destinationDirectory: string,
  options: CopyCanonicalSearchEvidenceOptions = {},
): Promise<readonly string[]> {
  const sourceDirectory =
    options.sourceDirectory ?? trackedCanonicalEvidenceDirectory;

  try {
    const verifiedReceipts = await loadVerifiedReceipts(sourceDirectory, {
      expectedSiteIds: ['search-receipt'],
    });
    const receipts = verifiedReceipts.filter((receipt) =>
      PINNED_OFFICIAL_SEARCH_RECEIPTS.has(receipt.id),
    );
    if (
      receipts.length !== PINNED_OFFICIAL_SEARCH_RECEIPTS.size ||
      receipts.some((receipt) => {
        const pinned = PINNED_OFFICIAL_SEARCH_RECEIPTS.get(receipt.id);
        return (
          pinned === undefined ||
          receipt.payload.siteId !== 'search-receipt' ||
          receipt.payload.policy.decision !== 'PASS' ||
          receipt.payload.sourceId !== pinned.sourceId ||
          receipt.payload.sourceUrl !== pinned.sourceUrl
        );
      })
    ) {
      throw new Error(
        'The canonical receipt inventory is not the approved official Search pair',
      );
    }

    const sourcePaths = receipts.flatMap((receipt) => [
      join(
        sourceDirectory,
        'receipts',
        receipt.payload.siteId,
        `${receipt.id}.json`,
      ),
      join(sourceDirectory, receipt.payload.rawObjectPath),
      join(sourceDirectory, receipt.payload.normalizedObjectPath),
      join(
        sourceDirectory,
        'manifests',
        `${receipt.payload.manifestSha256}.json`,
      ),
    ]);
    const relativePaths = [
      ...new Set(
        sourcePaths.map((path) => portableRelativePath(sourceDirectory, path)),
      ),
    ].sort();

    await Promise.all(
      relativePaths.map(async (relativePath) => {
        const sourcePath = join(sourceDirectory, ...relativePath.split('/'));
        const destinationPath = join(
          destinationDirectory,
          ...relativePath.split('/'),
        );
        const bytes = await readFile(sourcePath);
        await mkdir(dirname(destinationPath), { recursive: true });
        await writeFile(destinationPath, bytes);
      }),
    );

    return relativePaths;
  } catch (error) {
    throw new Error('Canonical Search evidence could not be copied safely', {
      cause: error,
    });
  }
}
