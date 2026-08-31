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

interface BoundText {
  readonly sourceBindingIds?: readonly string[];
}

export interface SourceBoundInvestigationWorksheet {
  readonly intendedAudience: string;
  readonly decision: string;
  readonly metadata: {
    readonly title: string;
    readonly description: string;
    readonly canonicalSlugProposal: string;
  };
  readonly sourceBindings: readonly SourceBinding[];
  readonly worksheet: readonly (BoundText & {
    readonly step: number;
    readonly kind: string;
    readonly instruction: string;
  })[];
  readonly boundaries: {
    readonly currentOfficialStatus: string;
    readonly historicalControlledExamples: string;
    readonly ownSiteEvidence: string;
    readonly noCausation: string;
    readonly unknowns: readonly string[];
    readonly privacyAndMeasurement: string;
  };
  readonly faqs: readonly (BoundText & {
    readonly question: string;
    readonly answer: string;
  })[];
  readonly correctionAndCurrentnessPolicy: string;
}

function canonicalWorksheetUrl(
  site: SiteDefinition,
  worksheet: SourceBoundInvestigationWorksheet,
  publicBaseUrl: string,
): string {
  return `${normalizePublicBaseUrl(publicBaseUrl)}${site.siteId}${worksheet.metadata.canonicalSlugProposal}/`;
}

function sourceLink(source: SourceBinding): string {
  const endpoint = escapeHtml(source.endpoint);
  return `<a href="${endpoint}">${escapeHtml(source.citation)}</a>`;
}

function worksheetStep(
  step: SourceBoundInvestigationWorksheet['worksheet'][number],
): string {
  const fieldId = `worksheet-step-${step.step}`;
  const sourceTime =
    step.kind === 'official-status-at-decision-time'
      ? `<label for="${fieldId}-time">Observation time</label><input id="${fieldId}-time" type="datetime-local" data-worksheet-field required>`
      : '';
  const label =
    step.kind === 'official-status-at-decision-time'
      ? 'Record what the official source showed'
      : step.kind === 'controlled-historical-context'
        ? 'Record relevant controlled historical context'
        : step.kind === 'own-site-dated-evidence'
          ? 'Record dated evidence from your own site'
          : 'Keep the conclusion unknown';

  return `<fieldset data-worksheet-step><legend>Step ${step.step}: ${escapeHtml(label)}</legend><p>${escapeHtml(step.instruction)}</p>${sourceTime}<label for="${fieldId}">${escapeHtml(label)}</label><textarea id="${fieldId}" rows="5" data-worksheet-field required></textarea></fieldset>`;
}

export function renderSearchReceiptInvestigationWorksheet(
  site: SiteDefinition,
  worksheet: SourceBoundInvestigationWorksheet,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const canonical = canonicalWorksheetUrl(site, worksheet, publicBaseUrl);
  const sources = worksheet.sourceBindings
    .map(
      (source) =>
        `<li><strong>${escapeHtml(source.sourceId)}</strong> · ${sourceLink(source)} · ${escapeHtml(source.purpose)}</li>`,
    )
    .join('');
  const steps = worksheet.worksheet.map(worksheetStep).join('');
  const unknowns = worksheet.boundaries.unknowns
    .map((unknown) => `<li>${escapeHtml(unknown)}</li>`)
    .join('');
  const faqs = worksheet.faqs
    .map(
      (faq, index) =>
        `<section aria-labelledby="worksheet-faq-${index + 1}"><h3 id="worksheet-faq-${index + 1}">${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p></section>`,
    )
    .join('');
  const structuredData = jsonForHtml({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'HowTo',
        name: worksheet.metadata.title,
        description: worksheet.metadata.description,
        url: canonical,
        step: worksheet.worksheet.map((step) => ({
          '@type': 'HowToStep',
          position: step.step,
          name: `Evidence step ${step.step}`,
          text: step.instruction,
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: worksheet.faqs.map((faq) => ({
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
      path: `${worksheet.metadata.canonicalSlugProposal}/`,
      title: worksheet.metadata.title,
      description: worksheet.metadata.description,
      structuredData,
      scriptPath: '/investigation-worksheet.js',
      body: `<article data-investigation-worksheet><p class="eyebrow">Private in-page investigation worksheet</p><h2>${escapeHtml(worksheet.metadata.title)}</h2>
    <p><strong>For:</strong> ${escapeHtml(worksheet.intendedAudience)}</p>
    <p><strong>Use this when:</strong> A broad Google Search incident and a site-specific problem are both plausible, and you need to separate the evidence before acting.</p>
    <p><strong>Decision:</strong> ${escapeHtml(worksheet.decision)}</p>
    <h3>How to use it</h3><ol><li>Check the official status source and record exactly what it showed and when.</li><li>Record historical context and dated evidence from your own site in separate sections.</li><li>Keep the conclusion unknown unless independently reviewed evidence establishes a connection, then print or save your notes.</li></ol>
    <section class="information-panel" aria-labelledby="worksheet-boundary-heading"><h2 id="worksheet-boundary-heading">Before you enter anything</h2><p>${escapeHtml(worksheet.boundaries.privacyAndMeasurement)}</p><p><strong>No causation:</strong> ${escapeHtml(worksheet.boundaries.noCausation)}</p></section>
    <section aria-labelledby="worksheet-sources-heading"><h2 id="worksheet-sources-heading">Check these admitted official sources</h2><ul>${sources}</ul></section>
    <noscript><p class="empty-state">JavaScript is disabled. The worksheet fields remain usable, but completion counting and the clear/print buttons are unavailable. Use your browser's print command to save a copy.</p></noscript>
    <form class="worksheet-form" data-worksheet-form><p class="search-status" aria-live="polite" data-worksheet-status>Completion counting activates in this browser. Nothing is saved or sent.</p>${steps}<div class="worksheet-actions"><button type="button" data-worksheet-clear disabled>Clear worksheet</button><button type="button" data-worksheet-print disabled>Print or save as PDF</button></div></form>
    <section aria-labelledby="worksheet-limits-heading"><h2 id="worksheet-limits-heading">What the comparison cannot establish</h2><p>${escapeHtml(worksheet.boundaries.currentOfficialStatus)}</p><p>${escapeHtml(worksheet.boundaries.historicalControlledExamples)}</p><p>${escapeHtml(worksheet.boundaries.ownSiteEvidence)}</p><ul>${unknowns}</ul></section>
    <section aria-labelledby="worksheet-faq-heading"><h2 id="worksheet-faq-heading">Frequently asked questions</h2>${faqs}</section>
    <section aria-labelledby="worksheet-corrections-heading"><h2 id="worksheet-corrections-heading">Currentness and corrections</h2><p>${escapeHtml(worksheet.correctionAndCurrentnessPolicy)}</p></section></article>`,
    },
    publicBaseUrl,
  );
}
