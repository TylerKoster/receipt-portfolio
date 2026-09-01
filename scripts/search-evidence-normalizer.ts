import {
  canonicalJson,
  sha256,
  type RawFetch,
  type ReceiptPublicFacts,
  type SourceManifest,
} from '../packages/evidence-core/src/index.js';

type AggregateSearchFacts =
  | Extract<ReceiptPublicFacts, { readonly kind: 'search-feed' }>
  | (Extract<ReceiptPublicFacts, { readonly kind: 'search-status' }> & {
      readonly incidents: readonly { readonly incidentId: string }[];
    });

function notAdmitted(message: string): never {
  throw new Error(`SOURCE_DATA_NOT_ADMITTED: ${message}`);
}

const STRICT_UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function decodeUtf8(bytes: Uint8Array, name: string): string {
  try {
    return STRICT_UTF8_DECODER.decode(bytes);
  } catch {
    return notAdmitted(`${name} is not valid UTF-8`);
  }
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
    input = JSON.parse(decodeUtf8(fetched.bytes, 'status response'));
  } catch {
    return notAdmitted('status response is not valid JSON or UTF-8');
  }
  if (!Array.isArray(input))
    return notAdmitted('status response must be an array');

  const incidents = input.map((value, index) => {
    const incident = record(value, `incident[${index}]`);
    const end = incident.end;
    const url = httpsUrl(incident.uri, `incident[${index}].uri`);
    const parsedUrl = new URL(url);
    if (
      parsedUrl.origin !== 'https://status.search.google.com' ||
      !parsedUrl.pathname.startsWith('/incidents/')
    ) {
      return notAdmitted(`incident[${index}].uri destination is not admitted`);
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
  const numericCharacter = (digits: string, radix: number): string => {
    const codePoint = Number.parseInt(digits, radix);
    if (!validXmlCodePoint(codePoint)) {
      return notAdmitted(`${name} contains an invalid XML character reference`);
    }
    return String.fromCodePoint(codePoint);
  };
  const decoded = withoutCdata
    .replace(/&#x([a-fA-F0-9]+);/g, (_match, digits: string) =>
      numericCharacter(digits, 16),
    )
    .replace(/&#(\d+);/g, (_match, digits: string) =>
      numericCharacter(digits, 10),
    )
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
  if (
    [...decoded].some(
      (character) => !validXmlCodePoint(character.codePointAt(0)!),
    )
  ) {
    return notAdmitted(`${name} contains an invalid XML character`);
  }
  return decoded;
}

interface XmlNode {
  readonly name: string;
  readonly namespaceUri: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlNode[];
  readonly text: string[];
}

interface XmlFrame {
  readonly node: XmlNode;
  readonly namespaces: ReadonlyMap<string, string>;
}

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';
const ATOM_NAMESPACE = 'http://www.w3.org/2005/Atom';
const NC_NAME = /^[A-Za-z_][\w.-]*$/;

function qualifiedName(
  name: string,
  label: string,
): {
  readonly prefix?: string;
  readonly local: string;
} {
  const parts = name.split(':');
  if (
    parts.length > 2 ||
    parts.some((part) => !NC_NAME.test(part)) ||
    parts[0] === 'xmlns'
  ) {
    return notAdmitted(`${label} uses a malformed XML qualified name`);
  }
  return parts.length === 2
    ? { prefix: parts[0]!, local: parts[1]! }
    : { local: parts[0]! };
}

function localName(name: string): string {
  return name.split(':').at(-1) ?? '';
}

function validXmlCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

function tagEnd(xml: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote === undefined && (character === '"' || character === "'")) {
      quote = character;
    } else if (quote === character) {
      quote = undefined;
    } else if (quote === undefined && character === '>') {
      return index;
    }
  }
  return notAdmitted('feed tag is not terminated');
}

function parseAttributes(value: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const pattern = /\s*([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
  let offset = 0;
  while (offset < value.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(value);
    if (match === null) return notAdmitted('feed tag attributes are malformed');
    const name = match[1];
    const rawValue = match[2] ?? match[3];
    if (
      name === undefined ||
      rawValue === undefined ||
      result[name] !== undefined
    ) {
      return notAdmitted('feed tag attributes are duplicated or malformed');
    }
    if (rawValue.includes('<')) {
      return notAdmitted('feed attribute contains forbidden XML syntax');
    }
    result[name] = decodeXml(rawValue, `attribute ${name}`);
    offset = pattern.lastIndex;
  }
  return result;
}

function parseXml(xml: string): XmlNode {
  if (
    [...xml].some((character) => !validXmlCodePoint(character.codePointAt(0)!))
  ) {
    return notAdmitted('feed contains an invalid XML character');
  }
  const roots: XmlNode[] = [];
  const stack: XmlFrame[] = [];
  let offset = 0;
  const appendText = (value: string, decode = true) => {
    if (decode && value.includes(']]>')) {
      return notAdmitted('feed text contains a forbidden CDATA terminator');
    }
    if (stack.length === 0) {
      if (value.trim().length > 0)
        return notAdmitted('feed has text outside its root');
      return;
    }
    stack
      .at(-1)
      ?.node.text.push(decode ? decodeXml(value, 'feed text') : value);
  };

  while (offset < xml.length) {
    if (xml.startsWith('<?', offset)) {
      const end = xml.indexOf('?>', offset + 2);
      if (end < 0)
        return notAdmitted('feed processing instruction is malformed');
      const instruction = xml.slice(offset, end + 2);
      const declaration = instruction.match(
        /^<\?xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"([A-Za-z][A-Za-z0-9._-]*)"|'([A-Za-z][A-Za-z0-9._-]*)'))?(?:\s+standalone=(?:"(?:yes|no)"|'(?:yes|no)'))?\s*\?>$/,
      );
      const declaredEncoding = declaration?.[1] ?? declaration?.[2];
      if (
        offset !== 0 ||
        declaration === null ||
        (declaredEncoding !== undefined && !/^utf-?8$/i.test(declaredEncoding))
      ) {
        return notAdmitted(
          'feed XML declaration is malformed, misplaced, or not UTF-8',
        );
      }
      offset = end + 2;
      continue;
    }
    if (xml.startsWith('<!--', offset)) {
      const end = xml.indexOf('-->', offset + 4);
      if (end < 0) return notAdmitted('feed comment is malformed');
      const comment = xml.slice(offset + 4, end);
      if (comment.includes('--') || comment.endsWith('-')) {
        return notAdmitted('feed comment uses forbidden XML syntax');
      }
      offset = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', offset)) {
      const end = xml.indexOf(']]>', offset + 9);
      if (end < 0) return notAdmitted('feed CDATA is malformed');
      if (stack.length === 0)
        return notAdmitted('feed CDATA is outside its root');
      appendText(xml.slice(offset + 9, end), false);
      offset = end + 3;
      continue;
    }
    if (xml.startsWith('<!', offset)) {
      return notAdmitted('feed declarations are not admitted');
    }
    if (xml[offset] !== '<') {
      const end = xml.indexOf('<', offset);
      const next = end < 0 ? xml.length : end;
      appendText(xml.slice(offset, next));
      offset = next;
      continue;
    }

    const end = tagEnd(xml, offset + 1);
    const tag = xml.slice(offset + 1, end).trim();
    if (tag.startsWith('/')) {
      const closingName = tag.slice(1).trim();
      if (!/^[A-Za-z_:][\w:.-]*$/.test(closingName)) {
        return notAdmitted('feed closing tag is malformed');
      }
      qualifiedName(closingName, 'feed closing tag');
      const open = stack.pop();
      if (open === undefined || open.node.name !== closingName) {
        return notAdmitted('feed tags are not properly nested');
      }
    } else {
      const selfClosing = tag.endsWith('/');
      const content = selfClosing ? tag.slice(0, -1).trimEnd() : tag;
      const match = content.match(/^([A-Za-z_:][\w:.-]*)([\s\S]*)$/);
      if (match?.[1] === undefined || match[2] === undefined) {
        return notAdmitted('feed opening tag is malformed');
      }
      const parsedAttributes = parseAttributes(match[2]);
      const parent = stack.at(-1);
      const namespaces = new Map(
        parent?.namespaces ?? [['xml', XML_NAMESPACE]],
      );
      for (const [name, namespace] of Object.entries(parsedAttributes)) {
        if (name === 'xmlns') {
          if (namespace === XML_NAMESPACE || namespace === XMLNS_NAMESPACE) {
            return notAdmitted('feed default namespace uses a reserved URI');
          }
          namespaces.set('', namespace);
          continue;
        }
        if (!name.startsWith('xmlns:')) continue;
        const prefix = name.slice(6);
        if (
          !NC_NAME.test(prefix) ||
          (/^xml/i.test(prefix) && prefix !== 'xml') ||
          prefix === 'xmlns' ||
          namespace.length === 0 ||
          namespace === XMLNS_NAMESPACE ||
          (prefix === 'xml') !== (namespace === XML_NAMESPACE)
        ) {
          return notAdmitted('feed namespace declaration is malformed');
        }
        namespaces.set(prefix, namespace);
      }
      const elementPrefix = qualifiedName(match[1], 'feed element').prefix;
      if (elementPrefix !== undefined && !namespaces.has(elementPrefix)) {
        return notAdmitted('feed element uses an unbound namespace prefix');
      }
      for (const name of Object.keys(parsedAttributes)) {
        if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
        const attributePrefix = qualifiedName(name, 'feed attribute').prefix;
        if (attributePrefix !== undefined && !namespaces.has(attributePrefix)) {
          return notAdmitted('feed attribute uses an unbound namespace prefix');
        }
      }
      const expandedAttributes = new Set<string>();
      for (const name of Object.keys(parsedAttributes)) {
        if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
        const parsedName = qualifiedName(name, 'feed attribute');
        const namespace =
          parsedName.prefix === undefined
            ? ''
            : namespaces.get(parsedName.prefix)!;
        const expanded = `${namespace}\u0000${parsedName.local}`;
        if (expandedAttributes.has(expanded)) {
          return notAdmitted('feed attributes have a duplicate expanded name');
        }
        expandedAttributes.add(expanded);
      }
      const elementNamespace =
        elementPrefix === undefined
          ? (namespaces.get('') ?? '')
          : namespaces.get(elementPrefix)!;
      const node: XmlNode = {
        name: match[1],
        namespaceUri: elementNamespace,
        attributes: parsedAttributes,
        children: [],
        text: [],
      };
      if (parent === undefined) roots.push(node);
      else parent.node.children.push(node);
      if (!selfClosing) stack.push({ node, namespaces });
    }
    offset = end + 1;
  }
  if (
    stack.length > 0 ||
    roots.length !== 1 ||
    localName(roots[0]!.name) !== 'feed' ||
    roots[0]!.namespaceUri !== ATOM_NAMESPACE
  ) {
    return notAdmitted('feed response is not one well-formed Atom document');
  }
  return roots[0]!;
}

function child(node: XmlNode, name: string, label: string): XmlNode {
  const matches = node.children.filter(
    (value) =>
      localName(value.name) === name &&
      value.namespaceUri === node.namespaceUri,
  );
  if (matches.length !== 1)
    return notAdmitted(`${label} must occur exactly once`);
  return matches[0]!;
}

function nodeText(node: XmlNode): string {
  return [...node.text, ...node.children.map(nodeText)].join(' ');
}

function childText(node: XmlNode, name: string, label: string): string {
  return requiredString(nodeText(child(node, name, label)), label, true);
}

function entryUrl(entry: XmlNode, name: string): string {
  const links = entry.children.filter(
    (node) =>
      localName(node.name) === 'link' &&
      node.namespaceUri === entry.namespaceUri,
  );
  const selected =
    links.find(
      (link) => (link.attributes.rel ?? 'alternate') === 'alternate',
    ) ?? links[0];
  const href = selected?.attributes.href;
  if (href === undefined) return notAdmitted(`${name} is missing`);
  const url = httpsUrl(href, name);
  const parsed = new URL(url);
  if (
    parsed.hostname !== 'developers.google.com' ||
    parsed.port !== '' ||
    !parsed.pathname.startsWith('/search/blog/')
  ) {
    return notAdmitted(`${name} destination is not admitted`);
  }
  return url;
}

function normalizeFeed(fetched: RawFetch): ReceiptPublicFacts {
  const xml = decodeUtf8(fetched.bytes, 'feed response');
  const feed = parseXml(xml);
  const entries = feed.children
    .filter(
      (node) =>
        localName(node.name) === 'entry' &&
        node.namespaceUri === feed.namespaceUri,
    )
    .map((entry, index) => {
      return {
        entryId: childText(entry, 'id', `entry[${index}].id`),
        title: childText(entry, 'title', `entry[${index}].title`),
        url: entryUrl(entry, `entry[${index}].link`),
        publishedAt: timestamp(
          childText(entry, 'published', `entry[${index}].published`),
          `entry[${index}].published`,
        ),
        updatedAt: timestamp(
          childText(entry, 'updated', `entry[${index}].updated`),
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

function keyedChangeRatio<T>(
  previous: readonly T[],
  current: readonly T[],
  key: (value: T) => string,
): number {
  const previousById = new Map(previous.map((value) => [key(value), value]));
  const currentById = new Map(current.map((value) => [key(value), value]));
  const ids = new Set([...previousById.keys(), ...currentById.keys()]);
  if (ids.size === 0) return 0;
  const changed = [...ids].filter(
    (id) =>
      canonicalJson(previousById.get(id) ?? null) !==
      canonicalJson(currentById.get(id) ?? null),
  ).length;
  return changed / ids.size;
}

export function searchFactsDiffRatio(
  previous: ReceiptPublicFacts | undefined,
  current: AggregateSearchFacts,
): number {
  if (previous === undefined) return 0;
  if (current.kind === 'search-feed') {
    return previous.kind === 'search-feed'
      ? keyedChangeRatio(
          previous.entries,
          current.entries,
          (entry) => entry.entryId,
        )
      : 1;
  }
  if (previous.kind !== 'search-status' || !('incidents' in previous)) {
    return 1;
  }
  return keyedChangeRatio(
    previous.incidents,
    current.incidents,
    (incident) => incident.incidentId,
  );
}
