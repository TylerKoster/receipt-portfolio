import { describe, expect, it, vi } from 'vitest';
import {
  fetchAllowedSource,
  type FetchAllowedSourceOptions,
  type SourceManifest,
} from '../src/index.js';

const manifest = {
  siteId: 'search-receipt',
  sourceId: 'official-status',
  kind: 'json',
  endpoint: 'https://status.search.google.com/incidents.json',
  allowedHosts: ['status.search.google.com'],
  allowedMediaTypes: ['application/json'],
  maxBytes: 50_000,
  timeoutMs: 5_000,
  normalizerId: 'status-json-v1',
  diffStrategyId: 'event-list-v1',
  schemaId: 'search-status-public-v1',
  publisherName: 'Google',
  sourceClass: 'official-primary',
  extractionSelector: '$[*]',
  extractionContractId: 'search-status-events-v1',
  cadence: 'daily',
  noiseExclusions: [],
  publicationMode: 'auto-facts-only',
  licenseNote: 'Official public status data.',
  enabled: true,
} as unknown as SourceManifest;

function response(): Response {
  return new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function options(addresses: readonly { address: string; family: 4 | 6 }[]) {
  return {
    resolver: vi.fn(async () => addresses),
    fetchImplementation: vi.fn(async () => response()),
  } as unknown as FetchAllowedSourceOptions;
}

describe('resolved and pinned fetch boundary', () => {
  it.each([
    ['loopback', [{ address: '127.0.0.1', family: 4 }]],
    ['private', [{ address: '10.0.0.7', family: 4 }]],
    ['reserved IPv6', [{ address: '4000::1', family: 6 }]],
    [
      'mixed',
      [
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.7', family: 4 },
      ],
    ],
  ] as const)(
    'rejects %s DNS results before connection',
    async (_name, addresses) => {
      const boundaryOptions = options(addresses);
      await expect(
        fetchAllowedSource(manifest, boundaryOptions),
      ).rejects.toMatchObject({
        code: 'ENDPOINT_IP_FORBIDDEN',
      });
      expect(boundaryOptions.fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it('rejects localhost through the resolver seam', async () => {
    const boundaryOptions = options([{ address: '::1', family: 6 }]);
    await expect(
      fetchAllowedSource(
        {
          ...manifest,
          endpoint: 'https://localhost/status.json',
          allowedHosts: ['localhost'],
        },
        boundaryOptions,
      ),
    ).rejects.toMatchObject({ code: 'ENDPOINT_IP_FORBIDDEN' });
  });

  it('passes one validated public address to the pinned connection and never uses the legacy fetch seam', async () => {
    const connectionImplementation = vi.fn(
      async (endpoint: URL, address: { address: string; family: 4 | 6 }) => {
        void endpoint;
        void address;
        return response();
      },
    );
    const fetchImplementation = vi.fn(async () => {
      throw new Error('un-pinned fetch seam must not be used');
    });
    const result = await fetchAllowedSource(manifest, {
      resolver: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ],
      connectionImplementation,
      fetchImplementation,
    } as unknown as FetchAllowedSourceOptions);

    expect(result.status).toBe(200);
    expect(connectionImplementation).toHaveBeenCalledTimes(1);
    expect(connectionImplementation.mock.calls[0]?.[1]).toMatchObject({
      address: '2606:2800:220:1:248:1893:25c8:1946',
      family: 6,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    [99, false],
    [100, true],
    [30_000, true],
    [30_001, false],
  ] as const)(
    'enforces the shared exported timeout boundary at %i',
    async (timeoutMs, valid) => {
      const operation = fetchAllowedSource({ ...manifest, timeoutMs }, {
        resolver: async () => [{ address: '93.184.216.34', family: 4 }],
        connectionImplementation: async () => response(),
        fetchImplementation: async () => response(),
      } as unknown as FetchAllowedSourceOptions);

      if (valid)
        await expect(operation).resolves.toMatchObject({ status: 200 });
      else
        await expect(operation).rejects.toMatchObject({
          code: 'INVALID_TIMEOUT',
        });
    },
  );
});
