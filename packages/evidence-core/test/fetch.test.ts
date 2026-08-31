import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPinnedLookup,
  FetchBoundaryError,
  fetchAllowedSource as fetchAllowedSourceWithResolver,
  type FetchAllowedSourceOptions,
  type FetchImplementation,
  type RawFetch,
} from '../src/fetch.js';
import type { SourceManifest } from '../src/index.js';
import {
  resolveDryRunOutputPath,
  runCli,
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
  allowedMediaTypes: ['application/json'],
  maxBytes: 16,
  timeoutMs: 1_000,
  publisherName: 'Receipt Portfolio Tests',
  sourceClass: 'official-primary',
  extractionSelector: '$',
  extractionContractId: 'search-status-events-v1',
  cadence: 'daily',
  noiseExclusions: [],
  normalizerId: 'status-json-v1',
  diffStrategyId: 'event-list-v1',
  schemaId: 'search-status-public-v1',
  publicationMode: 'auto-facts-only',
  licenseNote: 'Controlled test manifest.',
  enabled: true,
};

function fetchAllowedSource(
  sourceManifest: SourceManifest,
  options: FetchAllowedSourceOptions = {},
): Promise<RawFetch> {
  return fetchAllowedSourceWithResolver(sourceManifest, {
    ...options,
    resolver:
      options.resolver ??
      (async () => [{ address: '93.184.216.34', family: 4 as const }]),
  });
}

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

function nonClosingResponse(options: {
  readonly contentType?: string;
  readonly contentLength?: string;
  readonly status?: number;
}): { readonly response: Response; readonly wasCanceled: () => boolean } {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      canceled = true;
    },
  });

  return {
    response: responseOf(body, options),
    wasCanceled: () => canceled,
  };
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
  it('prefers a validated IPv4 address from a dual-stack public result', async () => {
    let selectedAddress:
      { readonly address: string; readonly family: 4 | 6 } | undefined;

    await fetchAllowedSource(baseManifest, {
      resolver: async () => [
        { address: '2606:4700:4700::1111', family: 6 },
        { address: '8.8.8.8', family: 4 },
      ],
      connectionImplementation: async (_endpoint, address) => {
        selectedAddress = address;
        return responseOf('abc', { contentType: 'application/json' });
      },
    });

    expect(selectedAddress).toEqual({ address: '8.8.8.8', family: 4 });
  });

  it('retains a validated IPv6-only result', async () => {
    let selectedAddress:
      { readonly address: string; readonly family: 4 | 6 } | undefined;

    await fetchAllowedSource(baseManifest, {
      resolver: async () => [{ address: '2606:4700:4700::1111', family: 6 }],
      connectionImplementation: async (_endpoint, address) => {
        selectedAddress = address;
        return responseOf('abc', { contentType: 'application/json' });
      },
    });

    expect(selectedAddress).toEqual({
      address: '2606:4700:4700::1111',
      family: 6,
    });
  });

  it('rejects a dual-stack result when either address is forbidden', async () => {
    await expect(
      fetchAllowedSource(baseManifest, {
        resolver: async () => [
          { address: '8.8.8.8', family: 4 },
          { address: 'fd00::1', family: 6 },
        ],
        connectionImplementation: async () => {
          throw new Error('CONNECTION_SHOULD_NOT_BE_ATTEMPTED');
        },
      }),
    ).rejects.toMatchObject({ code: 'ENDPOINT_IP_FORBIDDEN' });
  });

  it('delivers a pinned DNS answer asynchronously', async () => {
    const lookup = createPinnedLookup({ address: '8.8.8.8', family: 4 });
    let synchronous = true;
    const result = new Promise<{
      readonly address: string;
      readonly family: number;
      readonly synchronous: boolean;
    }>((resolveResult, rejectResult) => {
      lookup('example.invalid', {}, (error, address, family) => {
        if (error !== null) {
          rejectResult(error);
          return;
        }
        if (Array.isArray(address) || family === undefined) {
          rejectResult(new Error('expected one pinned address'));
          return;
        }
        resolveResult({ address, family, synchronous });
      });
    });
    synchronous = false;

    await expect(result).resolves.toEqual({
      address: '8.8.8.8',
      family: 4,
      synchronous: false,
    });
  });

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

  it.each([
    ['private IPv4', 'https://10.0.0.1/status.json', '10.0.0.1'],
    ['carrier-grade NAT IPv4', 'https://100.64.0.1/status.json', '100.64.0.1'],
    ['link-local IPv4', 'https://169.254.1.1/status.json', '169.254.1.1'],
    ['documentation IPv4', 'https://192.0.2.1/status.json', '192.0.2.1'],
    ['multicast IPv4', 'https://224.0.0.1/status.json', '224.0.0.1'],
    ['IPv6 loopback', 'https://[::1]/status.json', '[::1]'],
    ['IPv6 unique-local', 'https://[fd00::1]/status.json', '[fd00::1]'],
    ['IPv6 link-local', 'https://[fe80::1]/status.json', '[fe80::1]'],
    [
      'IPv4-mapped IPv6 loopback',
      'https://[::ffff:127.0.0.1]/status.json',
      '[::ffff:7f00:1]',
    ],
    [
      'integer-form IPv4 loopback normalized by URL',
      'https://2130706433/status.json',
      '127.0.0.1',
    ],
  ])('rejects %s literal address', async (_name, endpoint, allowedHost) => {
    await expect(
      fetchAllowedSource(manifest({ endpoint, allowedHosts: [allowedHost] }), {
        fetchImplementation: async () => {
          throw new Error('NETWORK_SHOULD_NOT_BE_CALLED');
        },
      }),
    ).rejects.toMatchObject({ code: 'ENDPOINT_IP_FORBIDDEN' });
  });

  it.each([
    ['an unlisted explicit port', 'https://example.invalid:8443/status.json'],
    ['an unlisted trailing-dot host', 'https://example.invalid./status.json'],
  ])('rejects %s as a distinct host boundary', async (_name, endpoint) => {
    await expect(
      fetchAllowedSource(manifest({ endpoint }), {
        fetchImplementation: async () => {
          throw new Error('NETWORK_SHOULD_NOT_BE_CALLED');
        },
      }),
    ).rejects.toMatchObject({ code: 'ENDPOINT_HOST_NOT_ALLOWED' });
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

  it.each([
    [
      'redirect',
      { status: 302, contentType: 'application/json' },
      'REDIRECT_REJECTED',
    ],
    [
      'non-success status',
      { status: 503, contentType: 'application/json' },
      'HTTP_STATUS_REJECTED',
    ],
    [
      'mismatched media type',
      { status: 200, contentType: 'text/html' },
      'MEDIA_TYPE_REJECTED',
    ],
    [
      'invalid content length',
      {
        status: 200,
        contentType: 'application/json',
        contentLength: 'invalid',
      },
      'CONTENT_LENGTH_INVALID',
    ],
    [
      'declared oversized body',
      {
        status: 200,
        contentType: 'application/json',
        contentLength: '17',
      },
      'MAX_BYTES_EXCEEDED',
    ],
  ] as const)(
    'releases the response and timer after %s rejection',
    async (_name, responseOptions, errorCode) => {
      vi.useFakeTimers();
      const controlled = nonClosingResponse(responseOptions);
      let requestSignal: AbortSignal | null | undefined;
      const fetchImplementation: FetchImplementation = async (_input, init) => {
        requestSignal = init?.signal;
        return controlled.response;
      };

      await expect(
        fetchAllowedSource(baseManifest, { fetchImplementation }),
      ).rejects.toMatchObject({ code: errorCode });

      expect(requestSignal?.aborted).toBe(true);
      expect(controlled.wasCanceled()).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not await a non-settling response cancellation hook', async () => {
    let canceled = false;
    let requestSignal: AbortSignal | null | undefined;
    const response = responseOf(
      new ReadableStream<Uint8Array>({
        cancel() {
          canceled = true;
          return new Promise<void>(() => undefined);
        },
      }),
      { status: 503, contentType: 'application/json' },
    );
    const fetchImplementation: FetchImplementation = async (_input, init) => {
      requestSignal = init?.signal;
      return response;
    };
    const fetchResult = fetchAllowedSource(baseManifest, {
      fetchImplementation,
    }).then(
      () => ({ settled: true, code: 'UNEXPECTED_SUCCESS' }),
      (error: unknown) => ({
        settled: true,
        code:
          error instanceof FetchBoundaryError ? error.code : 'UNKNOWN_ERROR',
      }),
    );
    const result = await Promise.race([
      fetchResult,
      new Promise<{ readonly settled: false; readonly code: 'STILL_PENDING' }>(
        (resolvePending) =>
          setImmediate(() =>
            resolvePending({ settled: false, code: 'STILL_PENDING' }),
          ),
      ),
    ]);

    expect(result).toEqual({ settled: true, code: 'HTTP_STATUS_REJECTED' });
    expect(canceled).toBe(true);
    expect(requestSignal?.aborted).toBe(true);
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

  it('requires a bounded positive maxBytes value', async () => {
    for (const maxBytes of [undefined, 0, 5_000_001, Number.NaN]) {
      const sourceManifest = {
        ...baseManifest,
        maxBytes,
      } as unknown as SourceManifest;

      await expect(
        fetchAllowedSource(sourceManifest, {
          fetchImplementation: fetchReturning(
            responseOf('abc', { contentType: 'application/json' }),
          ),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MAX_BYTES' });
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

  it.each(['-1', '1.5', '9007199254740992'])(
    'rejects malformed or overflowing content-length %s',
    async (contentLength) => {
      await expect(
        fetchAllowedSource(baseManifest, {
          fetchImplementation: fetchReturning(
            responseOf('abc', {
              contentLength,
              contentType: 'application/json',
            }),
          ),
        }),
      ).rejects.toMatchObject({ code: 'CONTENT_LENGTH_INVALID' });
    },
  );

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

  it('aborts and clears the timer when response streaming fails', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    const response = responseOf(
      new ReadableStream<Uint8Array>({
        pull() {
          throw new Error('stream failure');
        },
      }),
      { contentType: 'application/json' },
    );
    const fetchImplementation: FetchImplementation = async (_input, init) => {
      requestSignal = init?.signal;
      return response;
    };

    await expect(
      fetchAllowedSource(baseManifest, { fetchImplementation }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' });
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
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
  it('writes a sanitized failure report when a dual-stack connection fails', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    let selectedAddress:
      { readonly address: string; readonly family: 4 | 6 } | undefined;
    const result = await runDryRunLive({
      projectDirectory,
      manifests: [baseManifest],
      fetchSource: (sourceManifest) =>
        fetchAllowedSourceWithResolver(sourceManifest, {
          resolver: async () => [
            { address: '2606:4700:4700::1111', family: 6 },
            { address: '8.8.8.8', family: 4 },
          ],
          connectionImplementation: async (_endpoint, address) => {
            selectedAddress = address;
            const error = new Error(
              'connect ENETUNREACH 8.8.8.8 source-secret',
            ) as Error & { code: string };
            error.code = 'ENETUNREACH';
            throw error;
          },
        }),
    });
    const reportBytes = await readFile(result.outputPath, 'utf8');
    const report = JSON.parse(reportBytes) as {
      readonly results: readonly Record<string, unknown>[];
    };

    expect(selectedAddress).toEqual({ address: '8.8.8.8', family: 4 });
    expect(result.exitCode).toBe(1);
    expect(report.results[0]).toMatchObject({
      errorCode: 'FETCH_FAILED',
      message: 'Source fetch failed',
      status: 'FAILED',
    });
    expect(reportBytes).not.toContain('ENETUNREACH');
    expect(reportBytes).not.toContain('8.8.8.8');
    expect(reportBytes).not.toContain('source-secret');
  });

  it.each([
    ['enabled success', true, false, 0, 'SUCCESS'],
    ['enabled fetch rejection', true, true, 1, 'FAILED'],
    ['disabled source', false, false, 1, 'FAILED'],
  ] as const)(
    'uses a secret-free display URL for %s without changing the request endpoint',
    async (_name, enabled, rejectFetch, expectedExitCode, expectedStatus) => {
      const projectDirectory = await mkdtemp(
        join(tmpdir(), 'receipt-dry-run-'),
      );
      temporaryDirectories.push(projectDirectory);
      const requestEndpoint =
        'https://example.invalid/status.json?api_key=query-secret-123&public_flag=allowed-value#fragment-secret-456';
      let observedRequestEndpoint: string | undefined;
      const sourceManifest = manifest({
        endpoint: requestEndpoint,
        enabled,
      });
      const result = await runDryRunLive({
        projectDirectory,
        manifests: [sourceManifest],
        fetchSource: async (requestedManifest) => {
          observedRequestEndpoint = requestedManifest.endpoint;

          if (rejectFetch) {
            throw new FetchBoundaryError(
              'ENDPOINT_HOST_NOT_ALLOWED',
              'sensitive endpoint details must not reach the report',
            );
          }

          return successfulRawFetch(
            requestedManifest,
            new TextEncoder().encode('abc'),
          );
        },
      });
      const reportBytes = await readFile(result.outputPath, 'utf8');
      const report = JSON.parse(reportBytes) as {
        readonly results: readonly Record<string, unknown>[];
      };

      expect(result.exitCode).toBe(expectedExitCode);
      expect(report.results[0]).toMatchObject({
        sourceUrl: 'https://example.invalid/status.json',
        status: expectedStatus,
      });
      expect(observedRequestEndpoint).toBe(
        enabled ? requestEndpoint : undefined,
      );
      for (const secret of [
        'api_key',
        'query-secret-123',
        'public_flag',
        'allowed-value',
        'fragment-secret-456',
      ]) {
        expect(reportBytes).not.toContain(secret);
      }
    },
  );

  it('sanitizes the report when the real fetch boundary rejects a literal endpoint', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    const result = await runDryRunLive({
      projectDirectory,
      manifests: [
        manifest({
          endpoint:
            'https://127.0.0.1/status.json?api_key=boundary-query-secret#boundary-fragment-secret',
          allowedHosts: ['127.0.0.1'],
        }),
      ],
    });
    const reportBytes = await readFile(result.outputPath, 'utf8');
    const report = JSON.parse(reportBytes) as {
      readonly results: readonly Record<string, unknown>[];
    };

    expect(result.exitCode).toBe(1);
    expect(report.results[0]).toMatchObject({
      errorCode: 'ENDPOINT_IP_FORBIDDEN',
      sourceUrl: 'https://127.0.0.1/status.json',
      status: 'FAILED',
    });
    expect(reportBytes).not.toContain('api_key');
    expect(reportBytes).not.toContain('boundary-query-secret');
    expect(reportBytes).not.toContain('boundary-fragment-secret');
  });

  it('sanitizes a parseable endpoint when another field fails manifest validation', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    const manifestDirectory = join(
      projectDirectory,
      'manifests',
      'search-receipt',
    );
    await mkdir(manifestDirectory, { recursive: true });
    const requestEndpoint =
      'https://example.invalid/status.json?signature=validation-query-secret#validation-fragment-secret';
    await writeFile(
      join(manifestDirectory, 'schema-invalid.json'),
      JSON.stringify(
        manifest({
          sourceId: 'INVALID SOURCE',
          endpoint: requestEndpoint,
        }),
      ),
      'utf8',
    );

    const exitCode = await runCli(['dry-run-live'], {
      projectDirectory,
      fetchSource: async () => {
        throw new Error('invalid manifest reached fetch');
      },
    });
    const reportBytes = await readFile(
      join(projectDirectory, 'artifacts', 'dry-run-live-report.json'),
      'utf8',
    );
    const report = JSON.parse(reportBytes) as {
      readonly results: readonly Record<string, unknown>[];
    };

    expect(exitCode).toBe(1);
    expect(report.results).toEqual([
      {
        errorCode: 'MANIFEST_SCHEMA_INVALID',
        manifestId: 'manifests/search-receipt/schema-invalid.json',
        message: 'Manifest schema is invalid',
        sourceUrl: 'https://example.invalid/status.json',
        status: 'FAILED',
      },
    ]);
    expect(reportBytes).not.toContain('signature');
    expect(reportBytes).not.toContain('validation-query-secret');
    expect(reportBytes).not.toContain('validation-fragment-secret');
  });

  it('quarantines enabled and disabled credential-bearing manifests without retaining credentials', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    const manifestDirectory = join(
      projectDirectory,
      'manifests',
      'search-receipt',
    );
    await mkdir(manifestDirectory, { recursive: true });
    const credentialEndpoint =
      'https://review-user:review-password@example.invalid/status.json?api_key=query-secret-123#fragment-secret-456';
    await writeFile(
      join(manifestDirectory, '00-enabled-userinfo.json'),
      JSON.stringify(
        manifest({
          sourceId: 'enabled-userinfo',
          endpoint: credentialEndpoint,
          enabled: true,
        }),
      ),
      'utf8',
    );
    await writeFile(
      join(manifestDirectory, '01-disabled-userinfo.json'),
      JSON.stringify(
        manifest({
          sourceId: 'disabled-userinfo',
          endpoint: credentialEndpoint,
          enabled: false,
        }),
      ),
      'utf8',
    );

    const exitCode = await runCli(['dry-run-live'], {
      projectDirectory,
      fetchSource: async () => {
        throw new Error('credential-bearing manifest reached fetch');
      },
    });
    const reportBytes = await readFile(
      join(projectDirectory, 'artifacts', 'dry-run-live-report.json'),
      'utf8',
    );
    const report = JSON.parse(reportBytes) as {
      readonly results: readonly Record<string, unknown>[];
    };

    expect(exitCode).toBe(1);
    expect(report.results).toEqual([
      {
        errorCode: 'MANIFEST_SCHEMA_INVALID',
        manifestId: 'manifests/search-receipt/00-enabled-userinfo.json',
        message: 'Manifest schema is invalid',
        status: 'FAILED',
      },
      {
        errorCode: 'MANIFEST_SCHEMA_INVALID',
        manifestId: 'manifests/search-receipt/01-disabled-userinfo.json',
        message: 'Manifest schema is invalid',
        status: 'FAILED',
      },
    ]);
    expect(reportBytes).not.toContain('review-user');
    expect(reportBytes).not.toContain('review-password');
    expect(reportBytes).not.toContain('api_key');
    expect(reportBytes).not.toContain('query-secret-123');
    expect(reportBytes).not.toContain('fragment-secret-456');
    expect(reportBytes).not.toContain(credentialEndpoint);
  });

  it('quarantines invalid manifest files while observing valid sources', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    const manifestDirectory = join(
      projectDirectory,
      'manifests',
      'search-receipt',
    );
    await mkdir(manifestDirectory, { recursive: true });
    await writeFile(
      join(manifestDirectory, '00-valid.json'),
      JSON.stringify(manifest({ sourceId: 'valid-source' })),
      'utf8',
    );
    await writeFile(
      join(manifestDirectory, '01-malformed.json'),
      '{"sourceId":"malformed-source",',
      'utf8',
    );
    await writeFile(
      join(manifestDirectory, '02-schema-invalid.json'),
      JSON.stringify(manifest({ sourceId: 'INVALID SOURCE' })),
      'utf8',
    );

    const exitCode = await runCli(
      ['dry-run-live', '--output', 'artifacts/mixed-manifest-report.json'],
      {
        projectDirectory,
        fetchSource: async (sourceManifest) =>
          successfulRawFetch(sourceManifest, new TextEncoder().encode('abc')),
      },
    );
    const reportPath = join(
      projectDirectory,
      'artifacts',
      'mixed-manifest-report.json',
    );
    const reportBytes = await readFile(reportPath, 'utf8');
    const report = JSON.parse(reportBytes) as {
      readonly results: readonly Record<string, unknown>[];
    };

    expect(exitCode).toBe(1);
    expect(report.results).toEqual([
      {
        byteCount: 3,
        manifestId: 'manifests/search-receipt/00-valid.json',
        mediaType: 'application/json',
        observedAt: '2026-08-29T18:00:00.000Z',
        rawSha256:
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        responseStatus: 200,
        siteId: 'search-receipt',
        sourceId: 'valid-source',
        sourceUrl: 'https://example.invalid/status.json',
        status: 'SUCCESS',
      },
      {
        errorCode: 'MANIFEST_JSON_INVALID',
        manifestId: 'manifests/search-receipt/01-malformed.json',
        message: 'Manifest JSON is invalid',
        status: 'FAILED',
      },
      {
        errorCode: 'MANIFEST_SCHEMA_INVALID',
        manifestId: 'manifests/search-receipt/02-schema-invalid.json',
        message: 'Manifest schema is invalid',
        sourceUrl: 'https://example.invalid/status.json',
        status: 'FAILED',
      },
    ]);
    expect(await readdir(join(projectDirectory, 'artifacts'))).toEqual([
      'mixed-manifest-report.json',
    ]);
  });

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

  it('refuses a nested artifacts directory that redirects writes into evidence', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    const evidenceDirectory = join(projectDirectory, 'evidence');
    await mkdir(evidenceDirectory);
    await mkdir(join(projectDirectory, 'artifacts'));
    await symlink(
      evidenceDirectory,
      join(projectDirectory, 'artifacts', 'nested'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      runDryRunLive({
        projectDirectory,
        output: 'artifacts/nested/report.json',
        manifests: [baseManifest],
        fetchSource: async (sourceManifest) =>
          successfulRawFetch(sourceManifest, new TextEncoder().encode('abc')),
      }),
    ).rejects.toThrow(/symbolic|junction|directory boundary/i);
    expect(await readdir(evidenceDirectory)).toEqual([]);
  });

  it('refuses an existing linked output target without changing its referent', async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), 'receipt-dry-run-'));
    temporaryDirectories.push(projectDirectory);
    const artifactsDirectory = join(projectDirectory, 'artifacts');
    const evidenceDirectory = join(projectDirectory, 'evidence');
    const evidencePath = join(evidenceDirectory, 'sentinel.json');
    await mkdir(artifactsDirectory);
    await mkdir(evidenceDirectory);
    await writeFile(evidencePath, '{"unchanged":true}', 'utf8');
    await symlink(
      evidenceDirectory,
      join(artifactsDirectory, 'report.json'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    await expect(
      runDryRunLive({
        projectDirectory,
        output: 'artifacts/report.json',
        manifests: [baseManifest],
        fetchSource: async (sourceManifest) =>
          successfulRawFetch(sourceManifest, new TextEncoder().encode('abc')),
      }),
    ).rejects.toThrow(/regular file/i);
    expect(await readFile(evidencePath, 'utf8')).toBe('{"unchanged":true}');
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
