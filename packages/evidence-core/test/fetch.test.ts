import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FetchBoundaryError,
  fetchAllowedSource,
  type FetchImplementation,
  type RawFetch,
} from '../src/fetch.js';
import type { SourceManifest } from '../src/index.js';
import {
  resolveDryRunOutputPath,
  runDryRunLive,
} from '../../../scripts/evidence-cli.js';

const fixedTime = new Date('2026-08-29T18:00:00.000Z');
const temporaryDirectories: string[] = [];

const baseManifest: SourceManifest = {
  siteId: 'search-receipt',
  sourceId: 'google-search-status',
  kind: 'json',
  endpoint: 'https://example.invalid/status.json',
  allowedHosts: ['example.invalid'],
  maxBytes: 16,
  timeoutMs: 1_000,
  normalizerId: 'status-json-v1',
  diffStrategyId: 'event-list-v1',
  publicationMode: 'hold-only',
  licenseNote: 'Controlled test manifest.',
  enabled: true,
};

function manifest(
  overrides: Partial<SourceManifest> & Record<string, unknown> = {},
): SourceManifest {
  return { ...baseManifest, ...overrides } as SourceManifest;
}

function responseOf(
  body: BodyInit | null,
  options: {
    readonly contentType?: string;
    readonly contentLength?: string;
    readonly status?: number;
  } = {},
): Response {
  const headers = new Headers();

  if (options.contentType !== undefined) {
    headers.set('content-type', options.contentType);
  }

  if (options.contentLength !== undefined) {
    headers.set('content-length', options.contentLength);
  }

  return new Response(body, {
    headers,
    status: options.status ?? 200,
  });
}

function fetchReturning(response: Response): FetchImplementation {
  return async () => response;
}

function streamingResponse(
  chunks: readonly Uint8Array[],
  contentType = 'application/json',
): Response {
  return responseOf(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    { contentType },
  );
}

function successfulRawFetch(
  sourceManifest: SourceManifest,
  bytes: Uint8Array,
): RawFetch {
  return {
    sourceUrl: sourceManifest.endpoint,
    observedAt: fixedTime.toISOString(),
    mediaType: 'application/json',
    status: 200,
    byteCount: bytes.byteLength,
    rawSha256:
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    bytes,
  };
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('bounded public-source fetch', () => {
  it.each([
    [
      'non-HTTPS endpoint',
      manifest({ endpoint: 'http://example.invalid/status.json' }),
      'ENDPOINT_HTTPS_REQUIRED',
    ],
    [
      'endpoint user information',
      manifest({ endpoint: 'https://user:secret@example.invalid/status.json' }),
      'ENDPOINT_USERINFO_FORBIDDEN',
    ],
    [
      'unlisted endpoint host',
      manifest({ endpoint: 'https://other.invalid/status.json' }),
      'ENDPOINT_HOST_NOT_ALLOWED',
    ],
    [
      'literal loopback address',
      manifest({
        endpoint: 'https://127.0.0.1/status.json',
        allowedHosts: ['127.0.0.1'],
      }),
      'ENDPOINT_IP_FORBIDDEN',
    ],
  ])('rejects %s before fetching', async (_name, sourceManifest, code) => {
    await expect(
      fetchAllowedSource(sourceManifest, {
        fetchImplementation: async () => {
          throw new Error('NETWORK_SHOULD_NOT_BE_CALLED');
        },
      }),
    ).rejects.toMatchObject({ code });
  });

  it('rejects a redirect response instead of following it', async () => {
    await expect(
      fetchAllowedSource(baseManifest, {
        fetchImplementation: fetchReturning(
          responseOf(null, { status: 302, contentType: 'application/json' }),
        ),
      }),
    ).rejects.toMatchObject({ code: 'REDIRECT_REJECTED' });
  });

  it('requires a bounded positive timeout', async () => {
    for (const timeoutMs of [undefined, 0, 30_001, Number.NaN]) {
      const sourceManifest = {
        ...baseManifest,
        timeoutMs,
      } as unknown as SourceManifest;

      await expect(
        fetchAllowedSource(sourceManifest, {
          fetchImplementation: fetchReturning(
            responseOf('abc', { contentType: 'application/json' }),
          ),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_TIMEOUT' });
    }
  });

  it('aborts a fetch when the manifest timeout expires', async () => {
    vi.useFakeTimers();
    const sourceManifest = manifest({ timeoutMs: 100 });
    const fetchImplementation: FetchImplementation = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (signal === undefined || signal === null) {
          reject(new Error('missing abort signal'));
          return;
        }

        signal.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      });

    const fetchPromise = fetchAllowedSource(sourceManifest, {
      fetchImplementation,
    });
    const rejection = expect(fetchPromise).rejects.toMatchObject({
      code: 'FETCH_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
  });

  it('rejects a response outside the 200-299 range', async () => {
    await expect(
      fetchAllowedSource(baseManifest, {
        fetchImplementation: fetchReturning(
          responseOf('unavailable', {
            contentType: 'application/json',
            status: 503,
          }),
        ),
      }),
    ).rejects.toMatchObject({ code: 'HTTP_STATUS_REJECTED' });
  });

  it.each(['application/octet-stream', 'text/html', undefined])(
    'rejects unsafe or mismatched media type %s',
    async (contentType) => {
      await expect(
        fetchAllowedSource(baseManifest, {
          fetchImplementation: fetchReturning(
            responseOf('abc', { contentType }),
          ),
        }),
      ).rejects.toMatchObject({ code: 'MEDIA_TYPE_REJECTED' });
    },
  );

  it('rejects a declared oversized body before reading it', async () => {
    await expect(
      fetchAllowedSource(baseManifest, {
        fetchImplementation: fetchReturning(
          responseOf('abc', {
            contentLength: '17',
            contentType: 'application/json',
          }),
        ),
      }),
    ).rejects.toMatchObject({ code: 'MAX_BYTES_EXCEEDED' });
  });

  it('rejects a streamed body as soon as it exceeds maxBytes', async () => {
    await expect(
      fetchAllowedSource(baseManifest, {
        fetchImplementation: fetchReturning(
          streamingResponse([
            new TextEncoder().encode('0123456789'),
            new TextEncoder().encode('abcdefg'),
          ]),
        ),
      }),
    ).rejects.toMatchObject({ code: 'MAX_BYTES_EXCEEDED' });
  });

  it('returns bounded raw bytes and literal digest metadata without parsing', async () => {
    const fetchImplementation: FetchImplementation = async (_input, init) => {
      if (init?.redirect !== 'error' || init.signal === undefined) {
        return responseOf(null, {
          contentType: 'application/json',
          status: 302,
        });
      }

      return streamingResponse(
        [new TextEncoder().encode('a'), new TextEncoder().encode('bc')],
        'application/json; charset=utf-8',
      );
    };

    const result = await fetchAllowedSource(baseManifest, {
      fetchImplementation,
      now: () => fixedTime,
    });

    expect(result).toEqual({
      sourceUrl: 'https://example.invalid/status.json',
      observedAt: '2026-08-29T18:00:00.000Z',
      mediaType: 'application/json',
      status: 200,
      byteCount: 3,
      rawSha256:
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      bytes: new TextEncoder().encode('abc'),
    });
  });
});

describe('live dry-run report', () => {
  it('continues after failure, sorts results, omits bodies, and changes no evidence bytes', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    const evidencePath = join(
      projectDirectory,
      'evidence',
      'receipts',
      'sentinel.json',
    );
    await mkdir(join(projectDirectory, 'evidence', 'receipts'), {
      recursive: true,
    });
    await writeFile(evidencePath, '{"unchanged":true}', 'utf8');

    const manifests = [
      manifest({ sourceId: 'z-source' }),
      manifest({ sourceId: 'a-source' }),
    ];
    const fetchSource = async (
      sourceManifest: SourceManifest,
    ): Promise<RawFetch> => {
      if (sourceManifest.sourceId === 'a-source') {
        throw new Error('secret response body and stack');
      }

      return successfulRawFetch(
        sourceManifest,
        new TextEncoder().encode('secret response body'),
      );
    };

    const result = await runDryRunLive({
      projectDirectory,
      output: 'artifacts/controlled-report.json',
      manifests,
      fetchSource,
    });
    const reportBytes = await readFile(result.outputPath, 'utf8');
    const report = JSON.parse(reportBytes) as {
      readonly results: readonly Record<string, unknown>[];
    };

    expect(result.exitCode).toBe(1);
    expect(report.results.map((entry) => entry.sourceId)).toEqual([
      'a-source',
      'z-source',
    ]);
    expect(report.results[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'FETCH_FAILED',
      message: 'Source fetch failed',
    });
    expect(report.results[1]).toMatchObject({
      status: 'SUCCESS',
      byteCount: 20,
      rawSha256:
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    });
    expect(reportBytes).not.toContain('secret response body');
    expect(reportBytes).not.toContain('stack');
    expect(await readFile(evidencePath, 'utf8')).toBe('{"unchanged":true}');
    expect(
      await readdir(join(projectDirectory, 'evidence', 'receipts')),
    ).toEqual(['sentinel.json']);
    expect(await readdir(join(projectDirectory, 'artifacts'))).toEqual([
      'controlled-report.json',
    ]);
  });

  it.each([
    '../outside.json',
    'artifacts/../evidence/receipt.json',
    'artifacts/report.txt',
    'report.json',
  ])('rejects unsafe output path %s', (output) => {
    expect(() => resolveDryRunOutputPath('C:\\repo', output)).toThrow(
      /artifacts|traversal|json/i,
    );
  });

  it('rejects an absolute output path', () => {
    const absoluteOutput = isAbsolute('C:\\outside.json')
      ? 'C:\\outside.json'
      : '/outside.json';

    expect(() => resolveDryRunOutputPath('C:\\repo', absoluteOutput)).toThrow(
      /absolute/i,
    );
  });

  it('refuses an artifacts directory that redirects writes into evidence', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    const evidenceDirectory = join(projectDirectory, 'evidence');
    await mkdir(evidenceDirectory);
    await symlink(
      evidenceDirectory,
      join(projectDirectory, 'artifacts'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      runDryRunLive({
        projectDirectory,
        manifests: [baseManifest],
        fetchSource: async (sourceManifest) =>
          successfulRawFetch(sourceManifest, new TextEncoder().encode('abc')),
      }),
    ).rejects.toThrow(/symbolic|junction|directory boundary/i);
    expect(await readdir(evidenceDirectory)).toEqual([]);
  });

  it('preserves a bounded fetch error code without retaining arbitrary data', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    const fetchSource = async (): Promise<RawFetch> => {
      throw new FetchBoundaryError(
        'MAX_BYTES_EXCEEDED',
        'Response exceeds manifest maxBytes',
      );
    };

    const result = await runDryRunLive({
      projectDirectory,
      output: 'artifacts/failure.json',
      manifests: [baseManifest],
      fetchSource,
    });
    const report = JSON.parse(await readFile(result.outputPath, 'utf8')) as {
      readonly results: readonly Record<string, unknown>[];
    };

    expect(result.exitCode).toBe(1);
    expect(report.results[0]).toMatchObject({
      errorCode: 'MAX_BYTES_EXCEEDED',
      message: 'Response exceeds manifest maxBytes',
    });
  });
});
