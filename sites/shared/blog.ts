import type { SiteDefinition, SiteId } from './render.js';

export const PRODUCT_BLOG_SITE_IDS = [
  'search-receipt',
  'skill-ledger',
  'video-moment-search',
  'workflow-test-lab',
] as const satisfies readonly SiteId[];

export interface ProductBlogSourceBinding {
  sourceId: string;
  url: string;
  observedAt: string;
  sha256: string;
  purpose: string;
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
  return (
    value.kind === 'internal' &&
    typeof value.href === 'string' &&
    value.href.startsWith(linkPolicies[siteId].internalPrefix) &&
    !value.href.includes('?') &&
    !value.href.includes('#') &&
    !value.href.includes('\\')
  );
}

function prohibitedClaim(texts: readonly string[]): {
  readonly currentStatus: boolean;
  readonly causation: boolean;
} {
  const text = texts.join(' ').normalize('NFKC').toLocaleLowerCase('en-US');
  return {
    currentStatus:
      /\b(?:is|are) currently (?:down|broken|experiencing an? (?:incident|outage))\b/u.test(
        text,
      ) || /\b(?:current|active) (?:incident|outage)\b/u.test(text),
    causation:
      /\b(?:caused|causes|because of|due to|is the cause|explains why)\b/u.test(
        text,
      ),
  };
}

export function validateProductBlogRegistries(
  values: readonly unknown[],
): BlogValidationResult {
  const diagnostics: string[] = [];
  const registries: ProductBlogRegistry[] = [];
  const namespaces = new Set<string>();
  const canonicals = new Set<string>();
  const feedIds = new Set<string>();

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
        nonEmpty(postValue.feedId) &&
        nonEmpty(postValue.title) &&
        nonEmpty(postValue.description);
      if (!identityValid) {
        diagnostics.push(`BLOG_POST_INVALID:${registryIndex}:${postIndex}`);
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
        sourceIds.add(source.sourceId);
      }

      const claimTexts: string[] = [];
      if (typeof postValue.title === 'string') claimTexts.push(postValue.title);
      if (typeof postValue.description === 'string') {
        claimTexts.push(postValue.description);
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
      const claims = prohibitedClaim(claimTexts);
      if (claims.currentStatus) {
        diagnostics.push(
          `BLOG_CURRENT_STATUS_CLAIM:${registryIndex}:${postIndex}`,
        );
      }
      if (claims.causation) {
        diagnostics.push(`BLOG_CAUSATION_CLAIM:${registryIndex}:${postIndex}`);
      }

      const boundaries = postValue.boundaries;
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

      const links = Array.isArray(postValue.links) ? postValue.links : [];
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
