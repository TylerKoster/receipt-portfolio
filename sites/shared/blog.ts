import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  sha256,
  type Receipt,
} from '../../packages/evidence-core/src/index.js';
import {
  DEFAULT_PUBLIC_BASE_URL,
  escapeHtml,
  jsonForHtml,
  normalizePublicBaseUrl,
  renderStaticPage,
  type SiteDefinition,
  type SiteId,
} from './render.js';

export const PRODUCT_BLOG_SITE_IDS = [
  'search-receipt',
  'skill-ledger',
  'video-moment-search',
  'workflow-test-lab',
] as const satisfies readonly SiteId[];

export interface ProductBlogSourceBinding {
  receiptId: string;
  sourceId: string;
  url: string;
  observedAt: string;
  sha256: string;
  purpose: string;
}

export interface ProductBlogEvidenceObject {
  readonly receiptId: string;
  readonly sourceId: string;
  readonly url: string;
  readonly observedAt: string;
  readonly sha256: string;
  readonly policyDecision: 'PASS' | 'REVIEW_REQUIRED' | 'REJECTED';
  readonly bytes: Uint8Array;
}

export interface ProductBlogParagraph {
  text: string;
  sourceBindingIds: string[];
}

export interface ProductBlogSection {
  heading: string;
  paragraphs: ProductBlogParagraph[];
}

export interface ProductBlogLink {
  label: string;
  href: string;
  kind: 'internal' | 'external';
}

export interface ProductBlogPost {
  id: string;
  slug: string;
  feedId: string;
  title: string;
  description: string;
  publishedAt: string;
  modifiedAt: string;
  author: { name: string; role: string };
  editorialDisclosure: string;
  sourceBindings: ProductBlogSourceBinding[];
  sections: ProductBlogSection[];
  links: ProductBlogLink[];
  boundaries: { currentness: string; noCausation: string };
}

export interface ProductBlogRegistry {
  schemaVersion: 1;
  siteId: SiteId;
  title: string;
  description: string;
  posts: ProductBlogPost[];
}

export interface BlogValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly string[];
  readonly registries: readonly ProductBlogRegistry[];
}

const linkPolicies: Readonly<
  Record<
    SiteId,
    {
      readonly internalPrefix: string;
      readonly externalHosts: readonly string[];
    }
  >
> = Object.freeze({
  'search-receipt': {
    internalPrefix: '/search-receipt/',
    externalHosts: ['feeds.feedburner.com', 'status.search.google.com'],
  },
  'skill-ledger': {
    internalPrefix: '/skill-ledger/',
    externalHosts: ['github.com', 'raw.githubusercontent.com'],
  },
  'video-moment-search': {
    internalPrefix: '/video-moment-search/',
    externalHosts: ['commons.wikimedia.org', 'upload.wikimedia.org'],
  },
  'workflow-test-lab': {
    internalPrefix: '/workflow-test-lab/',
    externalHosts: [],
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function slug(value: unknown): value is string {
  return nonEmpty(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function canonicalTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function allowedExternalUrl(value: unknown, siteId: SiteId): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      linkPolicies[siteId].externalHosts.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function allowedLink(value: unknown, siteId: SiteId): boolean {
  if (!isRecord(value) || !nonEmpty(value.label)) return false;
  if (value.kind === 'external') return allowedExternalUrl(value.href, siteId);
  if (value.kind !== 'internal' || typeof value.href !== 'string') return false;
  const prefix = linkPolicies[siteId].internalPrefix;
  if (
    !value.href.startsWith(prefix) ||
    !value.href.endsWith('/') ||
    value.href.includes('?') ||
    value.href.includes('#') ||
    value.href.includes('\\') ||
    value.href.includes('%')
  ) {
    return false;
  }
  const remainder = value.href.slice(prefix.length, -1);
  return (
    remainder === '' || remainder.split('/').every((segment) => slug(segment))
  );
}

function prohibitedClaim(texts: readonly string[]): {
  readonly currentStatus: boolean;
  readonly causation: boolean;
} {
  const text = texts.join(' ').normalize('NFKC').toLocaleLowerCase('en-US');
  return {
    currentStatus:
      /\b(?:is|are|remains?|appears?|looks?)\s+(?:currently\s+)?(?:down|broken|unavailable|degraded|experiencing\s+(?:an?\s+)?(?:incident|outage|degradation))(?:\s+right\s+now)?\b/u.test(
        text,
      ) ||
      /\b(?:current|active|ongoing|live)\s+(?:incident|outage|degradation)\b/u.test(
        text,
      ) ||
      /\b(?:incident|outage|degradation)\s+(?:is\s+)?(?:active|ongoing|live|happening)(?:\s+right\s+now)?\b/u.test(
        text,
      ),
    causation:
      /\b(?:caused|causes|because of|due to|is the cause|explains?|responsible for|reason for|triggered|led to|resulted in)\b/u.test(
        text,
      ),
  };
}

function normalizedIdentity(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function absoluteFeedId(value: unknown): boolean {
  if (!nonEmpty(value) || /\s/u.test(value)) return false;
  if (value.startsWith('urn:')) {
    return /^urn:[a-z0-9][a-z0-9-]{1,31}:[^\s:][^\s]*$/iu.test(value);
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && url.username === '' && url.password === ''
    );
  } catch {
    return false;
  }
}

export function validateProductBlogRegistries(
  values: readonly unknown[],
  evidenceObjects: readonly ProductBlogEvidenceObject[] = [],
): BlogValidationResult {
  const diagnostics: string[] = [];
  const registries: ProductBlogRegistry[] = [];
  const namespaces = new Set<string>();
  const canonicals = new Set<string>();
  const feedIds = new Set<string>();
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  const evidenceByReceipt = new Map(
    evidenceObjects.map((object) => [object.receiptId, object]),
  );

  values.forEach((value, registryIndex) => {
    if (!isRecord(value)) {
      diagnostics.push(`BLOG_REGISTRY_INVALID:${registryIndex}`);
      return;
    }
    const siteId = value.siteId;
    if (
      typeof siteId !== 'string' ||
      !PRODUCT_BLOG_SITE_IDS.includes(siteId as SiteId)
    ) {
      diagnostics.push(`BLOG_SITE_ID_NOT_APPROVED:${registryIndex}`);
      return;
    }
    const approvedSiteId = siteId as SiteId;
    if (namespaces.has(approvedSiteId)) {
      diagnostics.push(`BLOG_SITE_NAMESPACE_DUPLICATE:${registryIndex}`);
    }
    namespaces.add(approvedSiteId);
    if (
      value.schemaVersion !== 1 ||
      !nonEmpty(value.title) ||
      !nonEmpty(value.description) ||
      !Array.isArray(value.posts)
    ) {
      diagnostics.push(`BLOG_REGISTRY_INVALID:${registryIndex}`);
      return;
    }
    const registryClaims = prohibitedClaim([value.title, value.description]);
    if (registryClaims.currentStatus) {
      diagnostics.push(`BLOG_REGISTRY_CURRENT_STATUS_CLAIM:${registryIndex}`);
    }
    if (registryClaims.causation) {
      diagnostics.push(`BLOG_REGISTRY_CAUSATION_CLAIM:${registryIndex}`);
    }

    const postIds = new Set<string>();
    const slugs = new Set<string>();
    value.posts.forEach((postValue, postIndex) => {
      if (!isRecord(postValue)) {
        diagnostics.push(`BLOG_POST_INVALID:${registryIndex}:${postIndex}`);
        return;
      }
      const identityValid =
        slug(postValue.id) &&
        slug(postValue.slug) &&
        absoluteFeedId(postValue.feedId) &&
        nonEmpty(postValue.title) &&
        nonEmpty(postValue.description);
      if (!identityValid) {
        diagnostics.push(`BLOG_POST_INVALID:${registryIndex}:${postIndex}`);
      }
      if (!absoluteFeedId(postValue.feedId)) {
        diagnostics.push(`BLOG_FEED_ID_INVALID:${registryIndex}:${postIndex}`);
      }
      if (typeof postValue.id === 'string') {
        if (postIds.has(postValue.id)) {
          diagnostics.push(
            `BLOG_POST_ID_DUPLICATE:${registryIndex}:${postIndex}`,
          );
        }
        postIds.add(postValue.id);
      }
      if (typeof postValue.slug === 'string') {
        if (slugs.has(postValue.slug)) {
          diagnostics.push(`BLOG_SLUG_DUPLICATE:${registryIndex}:${postIndex}`);
        }
        slugs.add(postValue.slug);
        const canonical = `/${approvedSiteId}/blog/${postValue.slug}/`;
        if (canonicals.has(canonical)) {
          diagnostics.push(
            `BLOG_CANONICAL_DUPLICATE:${registryIndex}:${postIndex}`,
          );
        }
        canonicals.add(canonical);
      }
      if (typeof postValue.feedId === 'string') {
        if (feedIds.has(postValue.feedId)) {
          diagnostics.push(
            `BLOG_FEED_ID_DUPLICATE:${registryIndex}:${postIndex}`,
          );
        }
        feedIds.add(postValue.feedId);
      }
      if (typeof postValue.title === 'string') {
        const title = normalizedIdentity(postValue.title);
        if (titles.has(title)) {
          diagnostics.push(
            `BLOG_TITLE_DUPLICATE:${registryIndex}:${postIndex}`,
          );
        }
        titles.add(title);
      }
      if (typeof postValue.description === 'string') {
        const description = normalizedIdentity(postValue.description);
        if (descriptions.has(description)) {
          diagnostics.push(
            `BLOG_DESCRIPTION_DUPLICATE:${registryIndex}:${postIndex}`,
          );
        }
        descriptions.add(description);
      }

      const publishedValid = canonicalTimestamp(postValue.publishedAt);
      const modifiedValid = canonicalTimestamp(postValue.modifiedAt);
      if (!publishedValid || !modifiedValid) {
        diagnostics.push(`BLOG_DATE_INVALID:${registryIndex}:${postIndex}`);
      } else if (
        new Date(postValue.modifiedAt as string).getTime() <
        new Date(postValue.publishedAt as string).getTime()
      ) {
        diagnostics.push(
          `BLOG_DATE_ORDER_INVALID:${registryIndex}:${postIndex}`,
        );
      }

      if (
        !isRecord(postValue.author) ||
        !nonEmpty(postValue.author.name) ||
        !nonEmpty(postValue.author.role) ||
        !nonEmpty(postValue.editorialDisclosure)
      ) {
        diagnostics.push(
          `BLOG_EDITORIAL_DISCLOSURE_MISSING:${registryIndex}:${postIndex}`,
        );
      }

      const sources = Array.isArray(postValue.sourceBindings)
        ? postValue.sourceBindings
        : [];
      const sourceIds = new Set<string>();
      if (sources.length === 0) {
        diagnostics.push(
          `BLOG_SOURCE_BINDING_MISSING:${registryIndex}:${postIndex}`,
        );
      }
      for (const source of sources) {
        if (
          !isRecord(source) ||
          typeof source.receiptId !== 'string' ||
          !/^[a-f0-9]{64}$/u.test(source.receiptId) ||
          !slug(source.sourceId) ||
          sourceIds.has(source.sourceId) ||
          !allowedExternalUrl(source.url, approvedSiteId) ||
          !canonicalTimestamp(source.observedAt) ||
          typeof source.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/u.test(source.sha256) ||
          !nonEmpty(source.purpose)
        ) {
          diagnostics.push(
            `BLOG_SOURCE_BINDING_INVALID:${registryIndex}:${postIndex}`,
          );
          continue;
        }
        const evidence = evidenceByReceipt.get(source.receiptId);
        if (evidence === undefined) {
          diagnostics.push(
            `BLOG_EVIDENCE_OBJECT_MISSING:${registryIndex}:${postIndex}`,
          );
          continue;
        }
        if (evidence.policyDecision !== 'PASS') {
          diagnostics.push(
            `BLOG_EVIDENCE_OBJECT_NOT_ADMITTED:${registryIndex}:${postIndex}`,
          );
        }
        if (
          sha256(evidence.bytes) !== evidence.sha256 ||
          source.sha256 !== evidence.sha256
        ) {
          diagnostics.push(
            `BLOG_EVIDENCE_DIGEST_MISMATCH:${registryIndex}:${postIndex}`,
          );
        }
        if (
          source.sourceId !== evidence.sourceId ||
          source.url !== evidence.url ||
          source.observedAt !== evidence.observedAt
        ) {
          diagnostics.push(
            `BLOG_EVIDENCE_SOURCE_MISMATCH:${registryIndex}:${postIndex}`,
          );
        }
        sourceIds.add(source.sourceId);
      }

      const claimTexts: string[] = [];
      if (typeof postValue.title === 'string') claimTexts.push(postValue.title);
      if (typeof postValue.description === 'string') {
        claimTexts.push(postValue.description);
      }
      if (isRecord(postValue.author)) {
        if (typeof postValue.author.name === 'string') {
          claimTexts.push(postValue.author.name);
        }
        if (typeof postValue.author.role === 'string') {
          claimTexts.push(postValue.author.role);
        }
      }
      if (typeof postValue.editorialDisclosure === 'string') {
        claimTexts.push(postValue.editorialDisclosure);
      }
      for (const source of sources) {
        if (isRecord(source) && typeof source.purpose === 'string') {
          claimTexts.push(source.purpose);
        }
      }
      const renderedLinks = Array.isArray(postValue.links)
        ? postValue.links
        : [];
      if (!Array.isArray(postValue.links)) {
        diagnostics.push(`BLOG_LINKS_INVALID:${registryIndex}:${postIndex}`);
      }
      for (const link of renderedLinks) {
        if (isRecord(link) && typeof link.label === 'string') {
          claimTexts.push(link.label);
        }
      }
      const sections = Array.isArray(postValue.sections)
        ? postValue.sections
        : [];
      if (sections.length === 0) {
        diagnostics.push(`BLOG_SECTION_INVALID:${registryIndex}:${postIndex}`);
      }
      for (const section of sections) {
        if (
          !isRecord(section) ||
          !nonEmpty(section.heading) ||
          !Array.isArray(section.paragraphs) ||
          section.paragraphs.length === 0
        ) {
          diagnostics.push(
            `BLOG_SECTION_INVALID:${registryIndex}:${postIndex}`,
          );
          continue;
        }
        claimTexts.push(section.heading);
        for (const paragraph of section.paragraphs) {
          if (
            !isRecord(paragraph) ||
            !nonEmpty(paragraph.text) ||
            !Array.isArray(paragraph.sourceBindingIds) ||
            paragraph.sourceBindingIds.length === 0 ||
            paragraph.sourceBindingIds.some(
              (sourceId) =>
                typeof sourceId !== 'string' || !sourceIds.has(sourceId),
            )
          ) {
            diagnostics.push(
              `BLOG_SOURCE_REFERENCE_INVALID:${registryIndex}:${postIndex}`,
            );
            continue;
          }
          claimTexts.push(paragraph.text);
        }
      }
      const boundaries = postValue.boundaries;
      if (isRecord(boundaries)) {
        if (typeof boundaries.currentness === 'string') {
          claimTexts.push(boundaries.currentness);
        }
        if (typeof boundaries.noCausation === 'string') {
          claimTexts.push(boundaries.noCausation);
        }
      }
      const claims = prohibitedClaim(claimTexts);
      if (claims.currentStatus) {
        diagnostics.push(
          `BLOG_CURRENT_STATUS_CLAIM:${registryIndex}:${postIndex}`,
        );
      }
      if (claims.causation) {
        diagnostics.push(`BLOG_CAUSATION_CLAIM:${registryIndex}:${postIndex}`);
      }

      if (
        !isRecord(boundaries) ||
        !nonEmpty(boundaries.currentness) ||
        !boundaries.currentness.includes(
          'does not report a current status or incident',
        )
      ) {
        diagnostics.push(
          `BLOG_CURRENTNESS_BOUNDARY_MISSING:${registryIndex}:${postIndex}`,
        );
      }
      if (
        !isRecord(boundaries) ||
        !nonEmpty(boundaries.noCausation) ||
        !boundaries.noCausation.includes('does not diagnose') ||
        !boundaries.noCausation.includes('does not establish cause')
      ) {
        diagnostics.push(
          `BLOG_NO_CAUSATION_BOUNDARY_MISSING:${registryIndex}:${postIndex}`,
        );
      }

      const links = renderedLinks;
      if (links.some((link) => !allowedLink(link, approvedSiteId))) {
        diagnostics.push(
          `BLOG_LINK_NOT_ALLOWLISTED:${registryIndex}:${postIndex}`,
        );
      }
    });

    registries.push(value as unknown as ProductBlogRegistry);
  });

  const stableDiagnostics = [...new Set(diagnostics)].sort();
  return {
    ok: stableDiagnostics.length === 0,
    diagnostics: stableDiagnostics,
    registries: stableDiagnostics.length === 0 ? registries : [],
  };
}

export type ProductBlogSite = Pick<
  SiteDefinition,
  'siteId' | 'name' | 'title' | 'description'
>;

export interface ProductBlogRouteInventory {
  readonly siteId: SiteId;
  readonly sitemapPaths: readonly string[];
  readonly inventoryPaths: readonly string[];
}

function blogRootUrl(site: SiteDefinition, publicBaseUrl: string): string {
  return `${normalizePublicBaseUrl(publicBaseUrl)}${site.siteId}/blog/`;
}

function blogPostUrl(
  site: SiteDefinition,
  slug: string,
  publicBaseUrl: string,
): string {
  return `${blogRootUrl(site, publicBaseUrl)}${slug}/`;
}

function publicInternalLink(href: string, publicBaseUrl: string): string {
  const basePath = new URL(normalizePublicBaseUrl(publicBaseUrl)).pathname;
  return `${basePath === '/' ? '' : basePath.replace(/\/$/u, '')}${href}`;
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function orderedPosts(registry: ProductBlogRegistry): ProductBlogPost[] {
  return registry.posts.toSorted(
    (left, right) =>
      right.modifiedAt.localeCompare(left.modifiedAt) ||
      left.slug.localeCompare(right.slug),
  );
}

export function renderProductBlogIndex(
  site: SiteDefinition,
  registry: ProductBlogRegistry,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  if (registry.siteId !== site.siteId) {
    throw new Error(
      'Blog registry cannot render outside its product namespace',
    );
  }
  const canonical = blogRootUrl(site, publicBaseUrl);
  const posts = orderedPosts(registry)
    .map(
      (post) =>
        `<article class="receipt-card"><h3><a href="${escapeHtml(publicInternalLink(`/${site.siteId}/blog/${post.slug}/`, publicBaseUrl))}">${escapeHtml(post.title)}</a></h3><p>${escapeHtml(post.description)}</p><p>Published <time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(post.publishedAt)}</time> · Updated <time datetime="${escapeHtml(post.modifiedAt)}">${escapeHtml(post.modifiedAt)}</time></p></article>`,
    )
    .join('');
  return renderStaticPage(
    site,
    {
      path: '/blog/',
      title: registry.title,
      description: registry.description,
      structuredData: jsonForHtml({
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: registry.title,
        description: registry.description,
        url: canonical,
      }),
      body: `<section aria-labelledby="blog-index-heading"><p class="eyebrow">Evidence-bound editorial</p><h2 id="blog-index-heading">${escapeHtml(registry.title)}</h2><p>${escapeHtml(registry.description)}</p><div class="receipt-list">${posts}</div></section>`,
    },
    publicBaseUrl,
  );
}

export function renderProductBlogPost(
  site: SiteDefinition,
  post: ProductBlogPost,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const canonical = blogPostUrl(site, post.slug, publicBaseUrl);
  const sections = post.sections
    .map(
      (section, index) =>
        `<section aria-labelledby="blog-section-${index + 1}"><h2 id="blog-section-${index + 1}">${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p data-source-bindings="${escapeHtml(paragraph.sourceBindingIds.join(' '))}">${escapeHtml(paragraph.text)}</p>`).join('')}</section>`,
    )
    .join('');
  const sources = post.sourceBindings
    .map(
      (source) =>
        `<li id="source-${escapeHtml(source.sourceId)}"><a href="${escapeHtml(source.url)}">${escapeHtml(source.sourceId)}</a> · observed <time datetime="${escapeHtml(source.observedAt)}">${escapeHtml(source.observedAt)}</time> · SHA-256 ${escapeHtml(source.sha256)} · ${escapeHtml(source.purpose)}</li>`,
    )
    .join('');
  const links = post.links
    .map((link) => {
      const href =
        link.kind === 'internal'
          ? publicInternalLink(link.href, publicBaseUrl)
          : link.href;
      return `<li><a href="${escapeHtml(href)}">${escapeHtml(link.label)}</a></li>`;
    })
    .join('');
  return renderStaticPage(
    site,
    {
      path: `/blog/${post.slug}/`,
      title: post.title,
      description: post.description,
      structuredData: jsonForHtml({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.description,
        datePublished: post.publishedAt,
        dateModified: post.modifiedAt,
        author: {
          '@type': 'Person',
          name: post.author.name,
        },
        mainEntityOfPage: canonical,
        url: canonical,
      }),
      body: `<article><p class="eyebrow">Evidence-bound editorial</p><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.description)}</p><p>Published <time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(post.publishedAt)}</time> · Updated <time datetime="${escapeHtml(post.modifiedAt)}">${escapeHtml(post.modifiedAt)}</time></p><section class="information-panel" aria-labelledby="editorial-disclosure-heading"><h2 id="editorial-disclosure-heading">Author and editorial disclosure</h2><p><strong>${escapeHtml(post.author.name)}</strong> · ${escapeHtml(post.author.role)}</p><p>${escapeHtml(post.editorialDisclosure)}</p></section>${sections}<section aria-labelledby="blog-limits-heading"><h2 id="blog-limits-heading">Currentness and causation limits</h2><p>${escapeHtml(post.boundaries.currentness)}</p><p>${escapeHtml(post.boundaries.noCausation)}</p></section><section aria-labelledby="blog-sources-heading"><h2 id="blog-sources-heading">Source bindings</h2><ul>${sources}</ul></section><section aria-labelledby="blog-links-heading"><h2 id="blog-links-heading">Related links</h2><ul>${links}</ul></section></article>`,
    },
    publicBaseUrl,
  );
}

export function renderProductBlogAtom(
  site: SiteDefinition,
  registry: ProductBlogRegistry,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  if (registry.siteId !== site.siteId || registry.posts.length === 0) {
    throw new Error('Atom requires a matching nonempty product blog registry');
  }
  const root = blogRootUrl(site, publicBaseUrl);
  const posts = orderedPosts(registry);
  const updated = posts[0]!.modifiedAt;
  const entries = posts
    .map(
      (post) =>
        `<entry><id>${xml(post.feedId)}</id><title>${xml(post.title)}</title><link href="${xml(blogPostUrl(site, post.slug, publicBaseUrl))}"/><published>${xml(post.publishedAt)}</published><updated>${xml(post.modifiedAt)}</updated><author><name>${xml(post.author.name)}</name></author><summary>${xml(post.description)}</summary></entry>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><id>${xml(root)}</id><title>${xml(registry.title)}</title><link href="${xml(root)}"/><link rel="self" href="${xml(`${root}feed.xml`)}"/><updated>${xml(updated)}</updated>${entries}</feed>\n`;
}

export function productBlogRoutes(
  registries: readonly ProductBlogRegistry[],
): ProductBlogRouteInventory[] {
  return registries
    .filter((registry) => registry.posts.length > 0)
    .toSorted((left, right) => left.siteId.localeCompare(right.siteId))
    .map((registry) => ({
      siteId: registry.siteId,
      sitemapPaths: [
        '/blog/',
        ...registry.posts
          .map((post) => `/blog/${post.slug}/`)
          .toSorted((left, right) => left.localeCompare(right)),
      ],
      inventoryPaths: [
        'blog/feed.xml',
        'blog/index.html',
        ...registry.posts
          .map((post) => `blog/${post.slug}/index.html`)
          .toSorted((left, right) => left.localeCompare(right)),
      ],
    }));
}

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function sameResolvedPath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
    : resolve(left) === resolve(right);
}

async function realDirectoryState(
  path: string,
): Promise<'present' | 'missing' | 'invalid'> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isDirectory()) return 'invalid';
    return sameResolvedPath(await realpath(path), path) ? 'present' : 'invalid';
  } catch (error) {
    if (isEnoent(error)) return 'missing';
    return 'invalid';
  }
}

export async function loadProductBlogEvidenceObjects(
  receipts: readonly Receipt[],
  evidenceDirectory: string,
): Promise<ProductBlogEvidenceObject[]> {
  const root = resolve(evidenceDirectory);
  return Promise.all(
    receipts.map(async (receipt) => {
      const objectPath = resolve(root, receipt.payload.rawObjectPath);
      const objectRelative = relative(root, objectPath);
      if (
        objectRelative === '' ||
        objectRelative === '..' ||
        objectRelative.startsWith(`..${sep}`) ||
        isAbsolute(objectRelative)
      ) {
        throw new Error(
          `Blog evidence object escapes evidence root: ${receipt.id}`,
        );
      }
      const stats = await lstat(objectPath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error(`Blog evidence object is not immutable: ${receipt.id}`);
      }
      const bytes = await readFile(objectPath);
      if (sha256(bytes) !== receipt.payload.rawSha256) {
        throw new Error(`Blog evidence object digest mismatch: ${receipt.id}`);
      }
      return {
        receiptId: receipt.id,
        sourceId: receipt.payload.sourceId,
        url: receipt.payload.sourceUrl,
        observedAt: receipt.payload.observedAt,
        sha256: receipt.payload.rawSha256,
        policyDecision: receipt.payload.policy.decision,
        bytes,
      };
    }),
  );
}

export async function loadProductBlogRegistries(
  root: string,
  evidenceObjects: readonly ProductBlogEvidenceObject[] = [],
): Promise<BlogValidationResult> {
  const values: unknown[] = [];
  const expectedSiteIds: SiteId[] = [];
  const loadingDiagnostics: string[] = [];
  siteLoop: for (const siteId of PRODUCT_BLOG_SITE_IDS) {
    const productDirectory = join(root, 'sites', siteId);
    for (const ancestor of [
      resolve(root),
      join(root, 'sites'),
      productDirectory,
    ]) {
      const state = await realDirectoryState(ancestor);
      if (state === 'missing') continue siteLoop;
      if (state === 'invalid') {
        loadingDiagnostics.push(`BLOG_REGISTRY_PATH_INVALID:${siteId}`);
        continue siteLoop;
      }
    }
    const registryPath = join(productDirectory, 'blog-registry.json');
    try {
      const stats = await lstat(registryPath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        loadingDiagnostics.push(`BLOG_REGISTRY_FILE_INVALID:${siteId}`);
        continue;
      }
      const value = JSON.parse(await readFile(registryPath, 'utf8')) as unknown;
      values.push(value);
      expectedSiteIds.push(siteId);
    } catch (error) {
      if (isEnoent(error)) continue;
      loadingDiagnostics.push(`BLOG_REGISTRY_READ_FAILED:${siteId}`);
    }
  }

  const validation = validateProductBlogRegistries(values, evidenceObjects);
  const namespaceDiagnostics = values.flatMap((value, index) =>
    isRecord(value) && value.siteId === expectedSiteIds[index]
      ? []
      : [`BLOG_REGISTRY_NAMESPACE_MISMATCH:${expectedSiteIds[index]}`],
  );
  const diagnostics = [
    ...new Set([
      ...loadingDiagnostics,
      ...validation.diagnostics,
      ...namespaceDiagnostics,
    ]),
  ].sort();
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    registries: diagnostics.length === 0 ? validation.registries : [],
  };
}
