import { isIP } from 'node:net';
import { sha256 } from './canonical-json.js';
import type { SourceManifest } from './manifest.js';

const MAX_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 5_000_000;

export type FetchErrorCode =
  | 'ENDPOINT_INVALID'
  | 'ENDPOINT_HTTPS_REQUIRED'
  | 'ENDPOINT_USERINFO_FORBIDDEN'
  | 'ENDPOINT_HOST_NOT_ALLOWED'
  | 'ENDPOINT_IP_FORBIDDEN'
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

export interface FetchAllowedSourceOptions {
  readonly fetchImplementation?: FetchImplementation;
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

function isForbiddenIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);

  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }

  const [first, second, third] = octets as [number, number, number, number];

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
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

  const ranges = [
    [0n, 96],
    [0xffffn << 32n, 96],
    [0x64ff9bn << 96n, 96],
    [0x100n << 112n, 64],
    [0x20010002n << 96n, 48],
    [0x20010010n << 96n, 28],
    [0x20010020n << 96n, 28],
    [0x20010db8n << 96n, 32],
    [0xfcn << 120n, 7],
    [0xfe8n << 116n, 10],
    [0xfecn << 116n, 10],
    [0xffn << 120n, 8],
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

  if (!manifest.allowedHosts.includes(endpoint.host)) {
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

function validateBounds(manifest: SourceManifest): void {
  if (
    !Number.isInteger(manifest.timeoutMs) ||
    manifest.timeoutMs <= 0 ||
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
  switch (manifest.kind) {
    case 'json':
    case 'fixture':
    case 'archive-fixture':
      return ['application/json'];
    case 'rss':
      return [
        'application/atom+xml',
        'application/rss+xml',
        'application/xml',
        'text/xml',
      ];
  }
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

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (!(value instanceof Uint8Array)) {
      await reader.cancel();
      throw new FetchBoundaryError(
        'RESPONSE_BODY_INVALID',
        'Response body yielded an invalid byte chunk',
      );
    }

    byteCount += value.byteLength;

    if (byteCount > maxBytes) {
      await reader.cancel();
      throw new FetchBoundaryError(
        'MAX_BYTES_EXCEEDED',
        'Response exceeds manifest maxBytes',
      );
    }

    chunks.push(value.slice());
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
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
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;

  try {
    let response: Response;

    try {
      response = await fetchImplementation(endpoint, {
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
    if (error instanceof FetchBoundaryError) {
      throw error;
    }

    if (controller.signal.aborted) {
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
