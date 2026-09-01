import {
  sha256,
  type RawFetch,
  type ReceiptPublicFacts,
  type SourceManifest,
} from '../packages/evidence-core/src/index.js';

function notAdmitted(message: string): never {
  throw new Error(`SOURCE_DATA_NOT_ADMITTED: ${message}`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return notAdmitted(`${name} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(
  value: unknown,
  name: string,
  normalizeWhitespace = false,
): string {
  if (typeof value !== 'string') return notAdmitted(`${name} must be a string`);
  const normalized = normalizeWhitespace
    ? value.replace(/\s+/g, ' ').trim()
    : value.trim();
  if (normalized.length === 0) return notAdmitted(`${name} must not be empty`);
  return normalized;
}

function timestamp(value: unknown, name: string): string {
  const input = requiredString(value, name);
  const date = new Date(input);
  if (Number.isNaN(date.valueOf()))
    return notAdmitted(`${name} is not a timestamp`);
  return date.toISOString();
}

function httpsUrl(value: unknown, name: string): string {
  const input = requiredString(value, name);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return notAdmitted(`${name} is not a URL`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return notAdmitted(`${name} must be a credential-free HTTPS URL`);
  }
  return url.href;
}

function verifyFetchBinding(manifest: SourceManifest, fetched: RawFetch): void {
  if (
    fetched.sourceUrl !== manifest.endpoint ||
    !manifest.allowedMediaTypes.some(
      (mediaType) => mediaType === fetched.mediaType,
    ) ||
    !Number.isInteger(fetched.status) ||
    fetched.status < 200 ||
    fetched.status > 299 ||
    fetched.byteCount !== fetched.bytes.byteLength ||
    fetched.byteCount > manifest.maxBytes ||
    fetched.rawSha256 !== sha256(fetched.bytes) ||
    new Date(fetched.observedAt).toISOString() !== fetched.observedAt
  ) {
    notAdmitted('fetch metadata does not match the admitted source bytes');
  }
}

function normalizeStatus(fetched: RawFetch): ReceiptPublicFacts {
  let input: unknown;
  try {
    input = JSON.parse(Buffer.from(fetched.bytes).toString('utf8'));
  } catch {
    return notAdmitted('status response is not valid JSON');
  }
  if (!Array.isArray(input))
    return notAdmitted('status response must be an array');

  const incidents = input.map((value, index) => {
    const incident = record(value, `incident[${index}]`);
    const end = incident.end;
    const url = httpsUrl(incident.uri, `incident[${index}].uri`);
    if (new URL(url).hostname !== 'status.search.google.com') {
      return notAdmitted(`incident[${index}].uri host is not admitted`);
    }
    return {
      incidentId: requiredString(incident.id, `incident[${index}].id`),
      service: requiredString(
        incident.service_name,
        `incident[${index}].service_name`,
        true,
      ),
      startedAt: timestamp(incident.begin, `incident[${index}].begin`),
      endedAt:
        end === null || end === undefined
          ? null
          : timestamp(end, `incident[${index}].end`),
      updatedAt: timestamp(incident.modified, `incident[${index}].modified`),
      impact: requiredString(
        incident.status_impact,
        `incident[${index}].status_impact`,
      ),
      severity: requiredString(
        incident.severity,
        `incident[${index}].severity`,
      ),
      summary: requiredString(
        incident.external_desc,
        `incident[${index}].external_desc`,
        true,
      ),
      url,
    };
  });
  if (
    new Set(incidents.map((incident) => incident.incidentId)).size !==
    incidents.length
  ) {
    return notAdmitted('status response contains duplicate incident IDs');
  }
  incidents.sort(
    (left, right) =>
      left.startedAt.localeCompare(right.startedAt) ||
      left.incidentId.localeCompare(right.incidentId),
  );
  return {
    kind: 'search-status',
    responseStatus: fetched.status,
    mediaType: 'application/json',
    byteCount: fetched.byteCount,
    incidents,
  };
}

function decodeXml(value: string, name: string): string {
  const withoutCdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const unknownEntity = withoutCdata.match(
    /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[a-fA-F0-9]+);)/,
  );
  if (unknownEntity !== null)
    return notAdmitted(`${name} contains an unknown XML entity`);
  return withoutCdata
    .replace(/&#x([a-fA-F0-9]+);/g, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/&#(\d+);/g, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function elementBody(xml: string, localName: string, name: string): string {
  const pattern = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${localName}\\s*>`,
    'i',
  );
  const match = xml.match(pattern);
  if (match?.[1] === undefined) return notAdmitted(`${name} is missing`);
  return requiredString(
    decodeXml(match[1], name).replace(/<[^>]*>/g, ' '),
    name,
    true,
  );
}

function attributes(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of value.matchAll(pattern)) {
    const key = match[1]?.toLowerCase();
    const rawValue = match[2] ?? match[3];
    if (key !== undefined && rawValue !== undefined) result[key] = rawValue;
  }
  return result;
}

function entryUrl(xml: string, name: string): string {
  const links = [
    ...xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?link\b([^>]*)\/?\s*>/gi),
  ];
  const candidates = links
    .map((match) => attributes(match[1] ?? ''))
    .filter((link) => link.href !== undefined);
  const selected =
    candidates.find((link) => (link.rel ?? 'alternate') === 'alternate') ??
    candidates[0];
  if (selected?.href === undefined) return notAdmitted(`${name} is missing`);
  return httpsUrl(decodeXml(selected.href, name), name);
}

function normalizeFeed(fetched: RawFetch): ReceiptPublicFacts {
  const xml = Buffer.from(fetched.bytes).toString('utf8');
  if (/<!DOCTYPE/i.test(xml) || !/<(?:[A-Za-z_][\w.-]*:)?feed\b/i.test(xml)) {
    return notAdmitted('feed response is not an admitted Atom document');
  }
  const openingEntries =
    xml.match(/<(?:[A-Za-z_][\w.-]*:)?entry\b/gi)?.length ?? 0;
  const entryBlocks = [
    ...xml.matchAll(
      /<(?:[A-Za-z_][\w.-]*:)?entry\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?entry\s*>/gi,
    ),
  ];
  if (openingEntries !== entryBlocks.length) {
    return notAdmitted('feed entry markup is malformed');
  }
  const entries = entryBlocks.map((match, index) => {
    const entry = match[1] ?? '';
    return {
      entryId: elementBody(entry, 'id', `entry[${index}].id`),
      title: elementBody(entry, 'title', `entry[${index}].title`),
      url: entryUrl(entry, `entry[${index}].link`),
      publishedAt: timestamp(
        elementBody(entry, 'published', `entry[${index}].published`),
        `entry[${index}].published`,
      ),
      updatedAt: timestamp(
        elementBody(entry, 'updated', `entry[${index}].updated`),
        `entry[${index}].updated`,
      ),
    };
  });
  if (new Set(entries.map((entry) => entry.entryId)).size !== entries.length) {
    return notAdmitted('feed response contains duplicate entry IDs');
  }
  entries.sort(
    (left, right) =>
      right.publishedAt.localeCompare(left.publishedAt) ||
      left.entryId.localeCompare(right.entryId),
  );
  return {
    kind: 'search-feed',
    responseStatus: fetched.status,
    mediaType: fetched.mediaType as
      | 'application/atom+xml'
      | 'application/rss+xml'
      | 'application/xml'
      | 'text/xml',
    byteCount: fetched.byteCount,
    entries,
  };
}

export function normalizeSearchFetch(
  manifest: SourceManifest,
  fetched: RawFetch,
): ReceiptPublicFacts {
  verifyFetchBinding(manifest, fetched);
  if (
    manifest.sourceId === 'google-search-status' &&
    manifest.extractionContractId === 'search-status-events-v1'
  ) {
    return normalizeStatus(fetched);
  }
  if (
    manifest.sourceId === 'google-search-central-blog' &&
    manifest.extractionContractId === 'search-feed-items-v1'
  ) {
    return normalizeFeed(fetched);
  }
  return notAdmitted('manifest extraction contract is not admitted');
}
