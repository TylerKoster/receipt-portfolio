import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  sha256,
  type RawFetch,
  type SourceManifest,
} from '../packages/evidence-core/src/index.js';
import { MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION } from '../sites/skill-ledger/microsoft-skill-creator-source-observation.js';
import {
  collectFixturePair,
  collectMicrosoftSkillCreatorObservation,
  withEvidenceSourceLock,
} from './evidence-cli.js';

const temporaryDirectories: string[] = [];
const observedAt = '2026-08-31T04:32:41.239Z';

function mismatchedFetch(manifest: SourceManifest): RawFetch {
  const bytes = new Uint8Array([1]);
  return {
    sourceUrl: manifest.endpoint,
    observedAt,
    mediaType: 'text/plain',
    status: 200,
    byteCount: bytes.byteLength,
    rawSha256: sha256(bytes),
    bytes,
  };
}

async function expectNoPublishedEvidence(evidenceDirectory: string) {
  await expect(access(join(evidenceDirectory, 'receipts'))).rejects.toThrow();
  await expect(access(join(evidenceDirectory, 'objects'))).rejects.toThrow();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Microsoft Skill Creator evidence collection', () => {
  it('requests exactly both pinned endpoints and rejects bytes that do not match the designation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-source-'));
    temporaryDirectories.push(directory);
    const evidenceDirectory = join(directory, 'evidence');
    const requested: string[] = [];

    await expect(
      collectMicrosoftSkillCreatorObservation({
        evidenceDirectory,
        fetchSource: async (manifest) => {
          requested.push(manifest.endpoint);
          return mismatchedFetch(manifest);
        },
      }),
    ).rejects.toThrow(/SOURCE_OBSERVATION_NOT_ADMITTED/);
    expect(requested).toEqual([
      MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.rawUrl,
      MICROSOFT_SKILL_CREATOR_SOURCE_DESIGNATION.inheritedLicense.referenceUrl,
    ]);
    await expectNoPublishedEvidence(evidenceDirectory);
  });

  it.each(['source', 'license'] as const)(
    'writes no receipt or object when the %s fetch fails',
    async (failedRole) => {
      const directory = await mkdtemp(join(tmpdir(), 'skill-source-fail-'));
      temporaryDirectories.push(directory);
      const evidenceDirectory = join(directory, 'evidence');

      await expect(
        collectMicrosoftSkillCreatorObservation({
          evidenceDirectory,
          fetchSource: async (manifest) => {
            const isLicense = manifest.endpoint.endsWith('/LICENSE');
            if (
              (failedRole === 'license' && isLicense) ||
              (failedRole === 'source' && !isLicense)
            ) {
              throw new Error(`${failedRole} unavailable`);
            }
            return mismatchedFetch(manifest);
          },
        }),
      ).rejects.toThrow(`${failedRole} unavailable`);
      await expectNoPublishedEvidence(evidenceDirectory);
    },
  );

  it('serializes concurrent actions for the same evidence source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-source-lock-'));
    temporaryDirectories.push(directory);
    let active = 0;
    let maximumActive = 0;
    const order: string[] = [];
    const action = (label: string) =>
      withEvidenceSourceLock(directory, 'microsoft-skill-creator', async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        order.push(`${label}-start`);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 35));
        order.push(`${label}-end`);
        active -= 1;
      });

    await Promise.all([action('first'), action('second')]);
    expect(maximumActive).toBe(1);
    expect(order).toHaveLength(4);
    const firstStart = order.indexOf('first-start');
    const firstEnd = order.indexOf('first-end');
    const secondStart = order.indexOf('second-start');
    const secondEnd = order.indexOf('second-end');
    expect(firstStart).toBeLessThan(firstEnd);
    expect(secondStart).toBeLessThan(secondEnd);
    expect(firstEnd < secondStart || secondEnd < firstStart).toBe(true);
  });

  it('fully verifies existing evidence before fetching or appending', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-source-corrupt-'));
    temporaryDirectories.push(directory);
    const evidenceDirectory = join(directory, 'evidence');
    await collectFixturePair(
      'skill-ledger',
      undefined,
      'skill-inventory-v1.json',
      { evidenceDirectory },
    );
    const receiptDirectory = join(
      evidenceDirectory,
      'receipts',
      'skill-ledger',
    );
    const [receiptName] = await readdir(receiptDirectory);
    if (receiptName === undefined) throw new Error('expected fixture receipt');
    const receiptPath = join(receiptDirectory, receiptName);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8')) as {
      payload: { sequence: number };
    };
    receipt.payload.sequence = 2;
    await writeFile(receiptPath, JSON.stringify(receipt));
    const fetchSource = vi.fn(async (manifest: SourceManifest) =>
      mismatchedFetch(manifest),
    );

    await expect(
      collectMicrosoftSkillCreatorObservation({
        evidenceDirectory,
        fetchSource,
      }),
    ).rejects.toThrow();
    expect(fetchSource).not.toHaveBeenCalled();
  });
});
