import {
  DEFAULT_PUBLIC_BASE_URL,
  escapeHtml,
  jsonForHtml,
  normalizePublicBaseUrl,
  renderStaticPage,
  type SiteDefinition,
} from '../shared/render.js';

interface SourceBinding {
  readonly sourceId: string;
  readonly endpoint: string;
  readonly purpose: string;
  readonly citation: string;
}

interface RouteBinding {
  readonly id: string;
  readonly route: string;
  readonly purpose: string;
}

export interface SourceBoundDecisionAidDiscovery {
  readonly intendedAudience: string;
  readonly decision: string;
  readonly metadata: {
    readonly title: string;
    readonly description: string;
    readonly canonicalSlugProposal: string;
  };
  readonly sourceBindings: readonly SourceBinding[];
  readonly routeBindings: readonly RouteBinding[];
  readonly decisionAids: readonly {
    readonly id: string;
    readonly route: string;
    readonly choiceCriteria: string;
    readonly result: string;
  }[];
  readonly boundaries: {
    readonly currentOfficialStatus: string;
    readonly noCausation: string;
    readonly unknowns: readonly string[];
    readonly privacyAndMeasurement: string;
  };
  readonly faqs: readonly {
    readonly question: string;
    readonly answer: string;
    readonly routeBindingIds: readonly string[];
  }[];
  readonly correctionAndCurrentnessPolicy: string;
  readonly publication: {
    readonly status: string;
    readonly adapter: string;
    readonly coordinatorDependency: string;
    readonly route?: string;
  };
}

function canonicalDiscoveryUrl(
  site: SiteDefinition,
  discovery: SourceBoundDecisionAidDiscovery,
  publicBaseUrl: string,
): string {
  return `${normalizePublicBaseUrl(publicBaseUrl)}${site.siteId}${discovery.metadata.canonicalSlugProposal}/`;
}

function publicSiteRoute(
  site: SiteDefinition,
  route: string,
  publicBaseUrl: string,
): string {
  const basePath = new URL(normalizePublicBaseUrl(publicBaseUrl)).pathname;
  const canonicalRoute = route.endsWith('/') ? route : `${route}/`;
  return `${basePath}${site.siteId}${canonicalRoute}`;
}

function aidLabel(id: string): {
  readonly heading: string;
  readonly action: string;
} {
  return id === 'guide-first'
    ? { heading: 'Start with the guide', action: 'Open the guide' }
    : { heading: 'Use the worksheet', action: 'Open the worksheet' };
}

export function renderSearchReceiptDecisionAidDiscovery(
  site: SiteDefinition,
  discovery: SourceBoundDecisionAidDiscovery,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  if (
    discovery.publication.status !== 'ROUTE_INTEGRATED_PENDING_RELEASE' ||
    discovery.publication.adapter !==
      'coordinator-owned shared static route adapter' ||
    discovery.publication.route !==
      '/discover/choose-google-search-guide-or-worksheet/'
  ) {
    throw new Error('Decision aid requires an admitted integrated route');
  }
  const canonical = canonicalDiscoveryUrl(site, discovery, publicBaseUrl);
  const decisions = discovery.decisionAids
    .map((aid) => {
      const label = aidLabel(aid.id);
      return `<article class="receipt-card" data-decision-aid-route><h3>${escapeHtml(label.heading)}</h3><p>${escapeHtml(aid.choiceCriteria)}</p><p><strong>Result:</strong> ${escapeHtml(aid.result)}</p><p><a class="primary-action" href="${escapeHtml(publicSiteRoute(site, aid.route, publicBaseUrl))}">${escapeHtml(label.action)}</a></p></article>`;
    })
    .join('');
  const sources = discovery.sourceBindings
    .map(
      (source) =>
        `<li><strong>${escapeHtml(source.citation)}</strong> · ${escapeHtml(source.purpose)} · <span>${escapeHtml(source.endpoint)}</span></li>`,
    )
    .join('');
  const unknowns = discovery.boundaries.unknowns
    .map((unknown) => `<li>${escapeHtml(unknown)}</li>`)
    .join('');
  const faqs = discovery.faqs
    .map(
      (faq, index) =>
        `<section aria-labelledby="decision-faq-${index + 1}"><h3 id="decision-faq-${index + 1}">${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></section>`,
    )
    .join('');
  const structuredData = jsonForHtml({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: discovery.metadata.title,
        description: discovery.metadata.description,
        mainEntityOfPage: canonical,
        url: canonical,
      },
      {
        '@type': 'FAQPage',
        mainEntity: discovery.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
    ],
  });

  return renderStaticPage(
    site,
    {
      path: `${discovery.metadata.canonicalSlugProposal}/`,
      title: discovery.metadata.title,
      description: discovery.metadata.description,
      structuredData,
      body: `<article><p class="eyebrow">Source-bound decision aid</p><h2>${escapeHtml(discovery.metadata.title)}</h2>
    <p><strong>For:</strong> ${escapeHtml(discovery.intendedAudience)}</p>
    <p><strong>Decision:</strong> ${escapeHtml(discovery.decision)}</p>
    <section aria-labelledby="decision-heading"><h2 id="decision-heading">Choose your next step</h2><div class="receipt-list">${decisions}</div></section>
    <section aria-labelledby="decision-boundaries-heading"><h2 id="decision-boundaries-heading">Limits and unknowns</h2><p>${escapeHtml(discovery.boundaries.currentOfficialStatus)}</p><p>${escapeHtml(discovery.boundaries.noCausation)}</p><p>${escapeHtml(discovery.boundaries.privacyAndMeasurement)}</p><ul>${unknowns}</ul></section>
    <section aria-labelledby="decision-sources-heading"><h2 id="decision-sources-heading">Source binding</h2><ul>${sources}</ul></section>
    <section aria-labelledby="decision-faq-heading"><h2 id="decision-faq-heading">Frequently asked questions</h2>${faqs}</section>
    <section aria-labelledby="decision-corrections-heading"><h2 id="decision-corrections-heading">Currentness and corrections</h2><p>${escapeHtml(discovery.correctionAndCurrentnessPolicy)}</p></section></article>`,
    },
    publicBaseUrl,
  );
}
