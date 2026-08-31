import {
  DEFAULT_PUBLIC_BASE_URL,
  escapeHtml,
  jsonForHtml,
  normalizePublicBaseUrl,
  renderStaticPage,
  type SiteDefinition,
} from '../shared/render.js';

export interface SourceBoundInvestigationHandoff {
  readonly intendedAudience: string;
  readonly decision: string;
  readonly metadata: {
    readonly title: string;
    readonly description: string;
    readonly canonicalSlugProposal: string;
  };
  readonly sourceBindings: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
    readonly purpose: string;
    readonly citation: string;
  }[];
  readonly checklist: readonly {
    readonly step: number;
    readonly kind: string;
    readonly instruction: string;
    readonly sourceBindingIds?: readonly string[];
  }[];
  readonly boundaries: {
    readonly currentOfficialStatus: string;
    readonly historicalControlledExamples: string;
    readonly ownSiteEvidence: string;
    readonly noCausation: string;
    readonly unknowns: readonly string[];
    readonly privacyAndMeasurement: string;
  };
  readonly faqs: readonly {
    readonly question: string;
    readonly answer: string;
    readonly sourceBindingIds: readonly string[];
  }[];
  readonly correctionAndCurrentnessPolicy: string;
  readonly publication: {
    readonly status: string;
    readonly adapter: string;
    readonly coordinatorDependency: string;
  };
}

const canonicalHandoffSlug =
  '/checklists/record-before-escalating-google-search-change';

function canonicalHandoffUrl(
  site: SiteDefinition,
  publicBaseUrl: string,
): string {
  return `${normalizePublicBaseUrl(publicBaseUrl)}${site.siteId}${canonicalHandoffSlug}/`;
}

export function renderSearchReceiptInvestigationHandoff(
  site: SiteDefinition,
  handoff: SourceBoundInvestigationHandoff,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  if (
    handoff.metadata.canonicalSlugProposal !== canonicalHandoffSlug ||
    handoff.publication.status !==
      'CONTENT_CONTRACT_ADMITTED_PENDING_ADAPTER' ||
    handoff.publication.adapter !==
      'coordinator-owned shared static route adapter'
  ) {
    throw new Error(
      'Investigation handoff requires the exact adapter-pending contract',
    );
  }

  const canonical = canonicalHandoffUrl(site, publicBaseUrl);
  const checklist = handoff.checklist
    .map(
      (item) =>
        `<li class="receipt-card"><h3>Step ${item.step}</h3><p>${escapeHtml(item.instruction)}</p></li>`,
    )
    .join('');
  const sources = handoff.sourceBindings
    .map(
      (source) =>
        `<li><a href="${escapeHtml(source.endpoint)}">${escapeHtml(source.citation)}</a> · ${escapeHtml(source.purpose)}</li>`,
    )
    .join('');
  const unknowns = handoff.boundaries.unknowns
    .map((unknown) => `<li>${escapeHtml(unknown)}</li>`)
    .join('');
  const faqs = handoff.faqs
    .map(
      (faq, index) =>
        `<section aria-labelledby="handoff-faq-${index + 1}"><h3 id="handoff-faq-${index + 1}">${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></section>`,
    )
    .join('');
  const structuredData = jsonForHtml({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'HowTo',
        name: handoff.metadata.title,
        description: handoff.metadata.description,
        url: canonical,
        step: handoff.checklist.map((item) => ({
          '@type': 'HowToStep',
          position: item.step,
          text: item.instruction,
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: handoff.faqs.map((faq) => ({
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
      path: `${canonicalHandoffSlug}/`,
      title: handoff.metadata.title,
      description: handoff.metadata.description,
      structuredData,
      body: `<article><p class="eyebrow">Source-bound manual checklist</p><h2>${escapeHtml(handoff.metadata.title)}</h2>
    <p><strong>For:</strong> ${escapeHtml(handoff.intendedAudience)}</p>
    <p><strong>Decision:</strong> ${escapeHtml(handoff.decision)}</p>
    <section aria-labelledby="handoff-steps-heading"><h2 id="handoff-steps-heading">Four things to record before escalation</h2><ol class="receipt-list" data-investigation-handoff>${checklist}</ol></section>
    <section aria-labelledby="handoff-sources-heading"><h2 id="handoff-sources-heading">Check the admitted sources directly</h2><ul>${sources}</ul></section>
    <section aria-labelledby="handoff-limits-heading"><h2 id="handoff-limits-heading">Limits and unknowns</h2><p>${escapeHtml(handoff.boundaries.currentOfficialStatus)}</p><p>${escapeHtml(handoff.boundaries.historicalControlledExamples)}</p><p>${escapeHtml(handoff.boundaries.ownSiteEvidence)}</p><p>${escapeHtml(handoff.boundaries.noCausation)}</p><p>${escapeHtml(handoff.boundaries.privacyAndMeasurement)}</p><ul>${unknowns}</ul></section>
    <section aria-labelledby="handoff-faq-heading"><h2 id="handoff-faq-heading">Frequently asked questions</h2>${faqs}</section>
    <section aria-labelledby="handoff-corrections-heading"><h2 id="handoff-corrections-heading">Currentness and corrections</h2><p>${escapeHtml(handoff.correctionAndCurrentnessPolicy)}</p></section></article>`,
    },
    publicBaseUrl,
  );
}
