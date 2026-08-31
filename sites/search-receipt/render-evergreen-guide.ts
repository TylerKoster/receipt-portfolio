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
}

interface BoundText {
  readonly sourceBindingIds: readonly string[];
}

export interface SourceBoundEvergreenGuide {
  readonly intendedAudience: string;
  readonly decision: string;
  readonly metadata: {
    readonly title: string;
    readonly description: string;
    readonly canonicalSlugProposal: string;
  };
  readonly sourceBindings: readonly SourceBinding[];
  readonly workflow: readonly (BoundText & {
    readonly step: number;
    readonly instruction: string;
  })[];
  readonly boundaries: {
    readonly currentOfficialStatus: string;
    readonly historicalControlledExamples: string;
    readonly ownSiteEvidence: string;
    readonly noCausation: string;
    readonly unknowns: readonly string[];
  };
  readonly faqs: readonly (BoundText & {
    readonly question: string;
    readonly answer: string;
  })[];
  readonly correctionAndCurrentnessPolicy: string;
}

function canonicalGuideUrl(
  site: SiteDefinition,
  guide: SourceBoundEvergreenGuide,
  publicBaseUrl: string,
): string {
  return `${normalizePublicBaseUrl(publicBaseUrl)}${site.siteId}${guide.metadata.canonicalSlugProposal}/`;
}

function sourceLink(source: SourceBinding): string {
  let safe = false;
  try {
    safe = new URL(source.endpoint).protocol === 'https:';
  } catch {
    safe = false;
  }
  const endpoint = escapeHtml(source.endpoint);
  return safe
    ? `<a href="${endpoint}">${endpoint}</a>`
    : `<span class="invalid-source">${endpoint}</span>`;
}

export function renderSearchReceiptEvergreenGuide(
  site: SiteDefinition,
  guide: SourceBoundEvergreenGuide,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const canonical = canonicalGuideUrl(site, guide, publicBaseUrl);
  const workflow = guide.workflow
    .map((step) => `<li>${escapeHtml(step.instruction)}</li>`)
    .join('');
  const sources = guide.sourceBindings
    .map(
      (source) =>
        `<li><strong>${escapeHtml(source.sourceId)}</strong> · ${sourceLink(source)} · ${escapeHtml(source.purpose)}</li>`,
    )
    .join('');
  const unknowns = guide.boundaries.unknowns
    .map((unknown) => `<li>${escapeHtml(unknown)}</li>`)
    .join('');
  const faqs = guide.faqs
    .map(
      (faq, index) =>
        `<section aria-labelledby="guide-faq-${index + 1}"><h3 id="guide-faq-${index + 1}">${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></section>`,
    )
    .join('');
  const structuredData = jsonForHtml({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: guide.metadata.title,
        description: guide.metadata.description,
        mainEntityOfPage: canonical,
        url: canonical,
      },
      {
        '@type': 'FAQPage',
        mainEntity: guide.faqs.map((faq) => ({
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
      path: `${guide.metadata.canonicalSlugProposal}/`,
      title: guide.metadata.title,
      description: guide.metadata.description,
      structuredData,
      body: `<article><p class="eyebrow">Source-bound evergreen guide</p><h2>${escapeHtml(guide.metadata.title)}</h2>
    <p><strong>For:</strong> ${escapeHtml(guide.intendedAudience)}</p>
    <p><strong>Decision:</strong> ${escapeHtml(guide.decision)}</p>
    <section aria-labelledby="guide-workflow-heading"><h2 id="guide-workflow-heading">Three evidence checks</h2><ol>${workflow}</ol></section>
    <section aria-labelledby="guide-boundaries-heading"><h2 id="guide-boundaries-heading">What each source can and cannot establish</h2><p>${escapeHtml(guide.boundaries.currentOfficialStatus)}</p><p>${escapeHtml(guide.boundaries.historicalControlledExamples)}</p><p>${escapeHtml(guide.boundaries.ownSiteEvidence)}</p><p><strong>No causation:</strong> ${escapeHtml(guide.boundaries.noCausation)}</p><h3>Unknowns</h3><ul>${unknowns}</ul></section>
    <section aria-labelledby="guide-sources-heading"><h2 id="guide-sources-heading">Admitted official sources</h2><ul>${sources}</ul></section>
    <section aria-labelledby="guide-faq-heading"><h2 id="guide-faq-heading">Frequently asked questions</h2>${faqs}</section>
    <section aria-labelledby="guide-corrections-heading"><h2 id="guide-corrections-heading">Currentness and corrections</h2><p>${escapeHtml(guide.correctionAndCurrentnessPolicy)}</p></section></article>`,
    },
    publicBaseUrl,
  );
}
