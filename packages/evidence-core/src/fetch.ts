import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { Readable } from 'node:stream';
import { sha256 } from './canonical-json.js';
import {
  MAX_RESPONSE_BYTES,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  type SourceManifest,
} from './manifest.js';

export type FetchErrorCode =
  | 'ENDPOINT_INVALID'
  | 'ENDPOINT_HTTPS_REQUIRED'
  | 'ENDPOINT_USERINFO_FORBIDDEN'
  | 'ENDPOINT_HOST_NOT_ALLOWED'
  | 'ENDPOINT_IP_FORBIDDEN'
  | 'ENDPOINT_RESOLUTION_FAILED'
  | 'INVALID_TIMEOUT'
  | 'INVALID_MAX_BYTES'
  | 'REDIRECT_REJECTED'
  | 'FETCH_TIMEOUT'
  | 'FETCH_FAILED'
  | 'HTTP_STATUS_REJECTED'
  | 'MEDIA_TYPE_REJECTED'
  | 'CONTENT_LENGTH_INVALID'
  | 'MAX_BYTES_EXCEEDED'
  | 'RESPONSE_BODY_INVALID';

export class FetchBoundaryError extends Error {
  readonly code: FetchErrorCode;

  constructor(code: FetchErrorCode, message: string) {
    super(message);
    this.name = 'FetchBoundaryError';
    this.code = code;
  }
}

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

export type HostResolver = (
  hostname: string,
) => Promise<readonly ResolvedAddress[]>;

export type PinnedConnectionImplementation = (
  endpoint: URL,
  address: ResolvedAddress,
  init: RequestInit,
) => Promise<Response>;

export interface FetchAllowedSourceOptions {
  readonly fetchImplementation?: FetchImplementation;
  readonly resolver?: HostResolver;
  readonly connectionImplementation?: PinnedConnectionImplementation;
  readonly now?: () => Date;
}

export interface RawFetch {
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly mediaType: string;
  readonly status: number;
  readonly byteCount: number;
  readonly rawSha256: string;
  readonly bytes: Uint8Array;
}

const FORBIDDEN_IPV4_CIDRS = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10
  [0x7f000000, 8], // 127.0.0.0/8
  [0xa9fe0000, 16], // 169.254.0.0/16
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0000000, 24], // 192.0.0.0/24
  [0xc0000200, 24], // 192.0.2.0/24
  [0xc0586300, 24], // 192.88.99.0/24
  [0xc0a80000, 16], // 192.168.0.0/16
  [0xc6120000, 15], // 198.18.0.0/15
  [0xc6336400, 24], // 198.51.100.0/24
  [0xcb007100, 24], // 203.0.113.0/24
  [0xe0000000, 3], // 224.0.0.0/3
] as const;

function ipv4Value(octets: readonly number[]): number {
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function isForbiddenIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);

  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }

  const value = ipv4Value(octets);
  return FORBIDDEN_IPV4_CIDRS.some(
    ([network, prefixLength]) =>
      value >= network && value < network + 2 ** (32 - prefixLength),
  );
}

function parseIpv6(hostname: string): bigint | undefined {
  const halves = hostname.toLowerCase().split('::');

  if (halves.length > 2) {
    return undefined;
  }

  const parseHalf = (value: string): number[] | undefined => {
    if (value.length === 0) {
      return [];
    }

    const groups: number[] = [];

    for (const part of value.split(':')) {
      if (!/^[a-f0-9]{1,4}$/.test(part)) {
        return undefined;
      }

      groups.push(Number.parseInt(part, 16));
    }

    return groups;
  };

  const left = parseHalf(halves[0] ?? '');
  const right = parseHalf(halves[1] ?? '');

  if (left === undefined || right === undefined) {
    return undefined;
  }

  const missing = 8 - left.length - right.length;

  if (
    (halves.length === 1 && missing !== 0) ||
    (halves.length === 2 && missing < 1)
  ) {
    return undefined;
  }

  const groups = [...left, ...Array<number>(missing).fill(0), ...right];

  if (groups.length !== 8) {
    return undefined;
  }

  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function isInIpv6Range(
  value: bigint,
  prefix: bigint,
  prefixLength: number,
): boolean {
  const shift = BigInt(128 - prefixLength);
  return value >> shift === prefix >> shift;
}

function isForbiddenIpv6(hostname: string): boolean {
  const value = parseIpv6(hostname);

  if (value === undefined) {
    return true;
  }

  const globalUnicast = isInIpv6Range(value, 0x2n << 124n, 3);
  if (!globalUnicast) return true;

  const ranges = [
    [0x2001n << 112n, 23],
    [0x20010db8n << 96n, 32],
    [0x2002n << 112n, 16],
    [0x3fffn << 112n, 20],
  ] as const;

  return ranges.some(([prefix, prefixLength]) =>
    isInIpv6Range(value, prefix, prefixLength),
  );
}

function endpointUrl(manifest: SourceManifest): URL {
  let endpoint: URL;

  try {
    endpoint = new URL(manifest.endpoint);
  } catch {
    throw new FetchBoundaryError(
      'ENDPOINT_INVALID',
      'Source endpoint must be an absolute URL',
    );
  }

  if (endpoint.protocol !== 'https:') {
    throw new FetchBoundaryError(
      'ENDPOINT_HTTPS_REQUIRED',
      'Source endpoint must use HTTPS',
    );
  }

  if (endpoint.username.length > 0 || endpoint.password.length > 0) {
    throw new FetchBoundaryError(
      'ENDPOINT_USERINFO_FORBIDDEN',
      'Source endpoint must not contain user information',
    );
  }

  if (
    endpoint.port !== '' ||
    !manifest.allowedHosts.includes(endpoint.hostname)
  ) {
    throw new FetchBoundaryError(
      'ENDPOINT_HOST_NOT_ALLOWED',
      'Source endpoint host is not allowlisted',
    );
  }

  const hostname = endpoint.hostname.replace(/^\[|\]$/g, '');
  const ipVersion = isIP(hostname);

  if (
    (ipVersion === 4 && isForbiddenIpv4(hostname)) ||
    (ipVersion === 6 && isForbiddenIpv6(hostname))
  ) {
    throw new FetchBoundaryError(
      'ENDPOINT_IP_FORBIDDEN',
      'Source endpoint uses a forbidden IP literal',
    );
  }

  return endpoint;
}

function addressForbidden(address: ResolvedAddress): boolean {
  return address.family === 4
    ? isIP(address.address) !== 4 || isForbiddenIpv4(address.address)
    : isIP(address.address) !== 6 || isForbiddenIpv6(address.address);
}

async function defaultResolver(hostname: string): Promise<ResolvedAddress[]> {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers
    .filter(
      (answer): answer is { address: string; family: 4 | 6 } =>
        answer.family === 4 || answer.family === 6,
    )
    .map(({ address, family }) => ({ address, family }));
}

async function resolvedPublicAddress(
  endpoint: URL,
  resolver: HostResolver,
  signal: AbortSignal,
): Promise<ResolvedAddress> {
  const hostname = endpoint.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(hostname);
  let addresses: readonly ResolvedAddress[];

  try {
    addresses =
      literalFamily === 4 || literalFamily === 6
        ? [{ address: hostname, family: literalFamily }]
        : await new Promise<readonly ResolvedAddress[]>(
            (resolvePromise, rejectPromise) => {
              const onAbort = () =>
                rejectPromise(
                  new FetchBoundaryError(
                    'FETCH_TIMEOUT',
                    'Source fetch exceeded the manifest timeout',
                  ),
                );
              if (signal.aborted) {
                onAbort();
                return;
              }
              signal.addEventListener('abort', onAbort, { once: true });
              resolver(hostname).then(
                (value) => {
                  signal.removeEventListener('abort', onAbort);
                  resolvePromise(value);
                },
                (error: unknown) => {
                  signal.removeEventListener('abort', onAbort);
                  rejectPromise(error);
                },
              );
            },
          );
  } catch {
    if (signal.aborted) {
      throw new FetchBoundaryError(
        'FETCH_TIMEOUT',
        'Source fetch exceeded the manifest timeout',
      );
    }
    throw new FetchBoundaryError(
      'ENDPOINT_RESOLUTION_FAILED',
      'Source endpoint hostname could not be resolved',
    );
  }

  if (addresses.length === 0) {
    throw new FetchBoundaryError(
      'ENDPOINT_RESOLUTION_FAILED',
      'Source endpoint hostname resolved to no addresses',
    );
  }
  if (addresses.some(addressForbidden)) {
    throw new FetchBoundaryError(
      'ENDPOINT_IP_FORBIDDEN',
      'Source endpoint resolves to a forbidden or mixed address set',
    );
  }

  return [...addresses].sort(
    (left, right) =>
      left.family - right.family || left.address.localeCompare(right.address),
  )[0]!;
}

type PinnedLookupCallback = ((
  error: Error | null,
  address: string,
  family: 4 | 6,
) => void) &
  ((error: Error | null, addresses: readonly ResolvedAddress[]) => void);

export function createPinnedLookup(address: ResolvedAddress): LookupFunction {
  return ((
    _hostname: string,
    options: unknown,
    callback: PinnedLookupCallback,
  ) => {
    queueMicrotask(() => {
      if (
        typeof options === 'object' &&
        options !== null &&
        'all' in options &&
        options.all === true
      ) {
        callback(null, [address]);
      } else {
        callback(null, address.address, address.family);
      }
    });
  }) as LookupFunction;
}

function pinnedHttpsConnection(
  endpoint: URL,
  address: ResolvedAddress,
  init: RequestInit,
): Promise<Response> {
  return new Promise((resolvePromise, rejectPromise) => {
    const pinnedLookup = createPinnedLookup(address);
    const request = httpsRequest(
      endpoint,
      {
        agent: false,
        family: address.family,
        lookup: pinnedLookup,
        method: 'GET',
        servername: endpoint.hostname,
        signal: init.signal ?? undefined,
        headers: { accept: '*/*', 'user-agent': 'receipt-portfolio/0.1' },
      },
      (incoming) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }
        const status = incoming.statusCode ?? 0;
        const body =
          status === 204 || status === 304
            ? null
            : (Readable.toWeb(
                incoming,
              ) as unknown as ReadableStream<Uint8Array>);
        resolvePromise(new Response(body, { headers, status }));
      },
    );
    request.once('error', rejectPromise);
    request.end();
  });
}

function validateBounds(manifest: SourceManifest): void {
  if (
    !Number.isInteger(manifest.timeoutMs) ||
    manifest.timeoutMs < MIN_TIMEOUT_MS ||
    manifest.timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new FetchBoundaryError(
      'INVALID_TIMEOUT',
      'Manifest timeout must be a bounded positive integer',
    );
  }

  if (
    !Number.isInteger(manifest.maxBytes) ||
    manifest.maxBytes <= 0 ||
    manifest.maxBytes > MAX_RESPONSE_BYTES
  ) {
    throw new FetchBoundaryError(
      'INVALID_MAX_BYTES',
      'Manifest maxBytes must be a bounded positive integer',
    );
  }
}

function configuredMediaTypes(manifest: SourceManifest): readonly string[] {
  return manifest.allowedMediaTypes;
}

function responseMediaType(
  response: Response,
  manifest: SourceManifest,
): string {
  const mediaType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase();

  if (
    mediaType === undefined ||
    !configuredMediaTypes(manifest).includes(mediaType)
  ) {
    throw new FetchBoundaryError(
      'MEDIA_TYPE_REJECTED',
      'Response media type is not configured for this source',
    );
  }

  return mediaType;
}

function declaredContentLength(response: Response, maxBytes: number): void {
  const header = response.headers.get('content-length');

  if (header === null) {
    return;
  }

  if (!/^\d+$/.test(header)) {
    throw new FetchBoundaryError(
      'CONTENT_LENGTH_INVALID',
      'Response content-length is invalid',
    );
  }

  const length = Number(header);

  if (!Number.isSafeInteger(length)) {
    throw new FetchBoundaryError(
      'CONTENT_LENGTH_INVALID',
      'Response content-length is invalid',
    );
  }

  if (length > maxBytes) {
    throw new FetchBoundaryError(
      'MAX_BYTES_EXCEEDED',
      'Response exceeds manifest maxBytes',
    );
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (response.body === null) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!(value instanceof Uint8Array)) {
        throw new FetchBoundaryError(
          'RESPONSE_BODY_INVALID',
          'Response body yielded an invalid byte chunk',
        );
      }

      byteCount += value.byteLength;

      if (byteCount > maxBytes) {
        throw new FetchBoundaryError(
          'MAX_BYTES_EXCEEDED',
          'Response exceeds manifest maxBytes',
        );
      }

      chunks.push(value.slice());
    }
  } catch (error) {
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
      // The original bounded-fetch classification remains authoritative.
    }

    throw error;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function abortAndCancelResponse(
  controller: AbortController,
  response: Response | undefined,
): void {
  controller.abort();

  if (response?.body === null || response?.body.locked === true) {
    return;
  }

  try {
    void response?.body?.cancel().catch(() => undefined);
  } catch {
    // Cleanup cannot replace the original sanitized fetch classification.
  }
}

function isRedirectFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = 'cause' in error ? error.cause : undefined;
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  return /redirect/i.test(`${error.message} ${causeMessage}`);
}

export async function fetchAllowedSource(
  manifest: SourceManifest,
  options: FetchAllowedSourceOptions = {},
): Promise<RawFetch> {
  const endpoint = endpointUrl(manifest);
  validateBounds(manifest);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), manifest.timeoutMs);
  const resolver = options.resolver ?? defaultResolver;
  const connectionImplementation =
    options.connectionImplementation ??
    (options.fetchImplementation === undefined
      ? pinnedHttpsConnection
      : (
          connectionEndpoint: URL,
          _address: ResolvedAddress,
          init: RequestInit,
        ) => options.fetchImplementation!(connectionEndpoint, init));
  let response: Response | undefined;

  try {
    const address = await resolvedPublicAddress(
      endpoint,
      resolver,
      controller.signal,
    );
    if (controller.signal.aborted) {
      throw new FetchBoundaryError(
        'FETCH_TIMEOUT',
        'Source fetch exceeded the manifest timeout',
      );
    }
    try {
      response = await connectionImplementation(endpoint, address, {
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new FetchBoundaryError(
          'FETCH_TIMEOUT',
          'Source fetch exceeded the manifest timeout',
        );
      }

      if (isRedirectFailure(error)) {
        throw new FetchBoundaryError(
          'REDIRECT_REJECTED',
          'Source redirect was rejected',
        );
      }

      throw new FetchBoundaryError('FETCH_FAILED', 'Source fetch failed');
    }

    if (controller.signal.aborted) {
      throw new FetchBoundaryError(
        'FETCH_TIMEOUT',
        'Source fetch exceeded the manifest timeout',
      );
    }

    if (response.status >= 300 && response.status <= 399) {
      throw new FetchBoundaryError(
        'REDIRECT_REJECTED',
        'Source redirect was rejected',
      );
    }

    if (response.status < 200 || response.status > 299) {
      throw new FetchBoundaryError(
        'HTTP_STATUS_REJECTED',
        'Source response status was outside 200-299',
      );
    }

    const mediaType = responseMediaType(response, manifest);
    declaredContentLength(response, manifest.maxBytes);
    const bytes = await readBoundedBody(response, manifest.maxBytes);
    const observedAt = (options.now ?? (() => new Date()))().toISOString();

    return {
      sourceUrl: endpoint.href,
      observedAt,
      mediaType,
      status: response.status,
      byteCount: bytes.byteLength,
      rawSha256: sha256(bytes),
      bytes,
    };
  } catch (error) {
    const timedOut = controller.signal.aborted;
    abortAndCancelResponse(controller, response);

    if (error instanceof FetchBoundaryError) {
      throw error;
    }

    if (timedOut) {
      throw new FetchBoundaryError(
        'FETCH_TIMEOUT',
        'Source fetch exceeded the manifest timeout',
      );
    }

    throw new FetchBoundaryError('FETCH_FAILED', 'Source fetch failed');
  } finally {
    clearTimeout(timeout);
  }
}
