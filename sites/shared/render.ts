import type {
  Receipt,
  ReceiptPublicFacts,
} from '../../packages/evidence-core/src/index.js';

export type SiteId = 'search-receipt' | 'workflow-test-lab' | 'skill-ledger';

export interface SiteDefinition {
  readonly siteId: SiteId;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly proposition: string;
  readonly interpretationBoundary: string;
  readonly unknowns: string;
}

export const DEFAULT_PUBLIC_BASE_URL = 'https://receipt-portfolio.example/';
// `frame-ancestors` is intentionally absent: browsers ignore it in a meta CSP.
// Framing protection requires a deployment-controlled response header.
const CONTENT_SECURITY_POLICY_PREFIX =
  "default-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; style-src 'self'";

function contentSecurityPolicy(scriptPolicy: "'none'" | "'self'"): string {
  return `${CONTENT_SECURITY_POLICY_PREFIX}; script-src ${scriptPolicy}`;
}

const CONTENT_SECURITY_POLICY = contentSecurityPolicy("'none'");

export function normalizePublicBaseUrl(value: string): string {
  if (value.includes('?') || value.includes('#')) {
    throw new Error('Public base URL must not contain a query or fragment');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Public base URL must be an absolute HTTPS URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Public base URL must use HTTPS');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('Public base URL must not contain userinfo');
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error('Public base URL must not contain a query or fragment');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.href;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function accepted(receipts: readonly Receipt[]): Receipt[] {
  return receipts
    .filter((receipt) => receipt.payload.policy.decision === 'PASS')
    .toSorted(
      (left, right) =>
        compareText(left.payload.observedAt, right.payload.observedAt) ||
        compareText(left.id, right.id),
    );
}

function publicBasePath(publicBaseUrl: string): string {
  return new URL(normalizePublicBaseUrl(publicBaseUrl)).pathname;
}

function sitePath(
  site: SiteDefinition,
  path = '/',
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const suffix = path === '/' ? '/' : path.startsWith('/') ? path : `/${path}`;
  return `${publicBasePath(publicBaseUrl)}${site.siteId}${suffix}`;
}

function canonicalUrl(
  site: SiteDefinition,
  path = '/',
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const base = normalizePublicBaseUrl(publicBaseUrl);
  const suffix = path === '/' ? '/' : path.startsWith('/') ? path : `/${path}`;
  return `${base}${site.siteId}${suffix}`;
}

function sourceLink(sourceUrl: string): string {
  try {
    if (new URL(sourceUrl).protocol === 'https:') {
      return `<a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a>`;
    }
  } catch {
    // Invalid source values remain inert text.
  }
  return `<span class="invalid-source">Invalid source URL: ${escapeHtml(sourceUrl)}</span>`;
}

function facts(factRecord: ReceiptPublicFacts): readonly [string, string][] {
  switch (factRecord.kind) {
    case 'search-status':
      return [
        ['Event ID', factRecord.eventId],
        ['Service', factRecord.service],
        ['Status', factRecord.status],
        ['Started at', factRecord.startedAt],
        ['Source summary', factRecord.summary],
      ];
    case 'workflow-experiment':
      return [
        ['Experiment ID', factRecord.experimentId],
        ['Task family', factRecord.taskFamily],
        ['Controlled fixture ID', factRecord.fixtureId],
        ['Expected fields', factRecord.expectedFields.join(', ')],
        ['Negative constraints', factRecord.negativeConstraints.join('; ')],
      ];
    case 'skill-inventory':
      return [
        ['Package ID', factRecord.packageId],
        ['Declared license', factRecord.declaredLicense],
        ['Manifest present', factRecord.manifestPresent ? 'Yes' : 'No'],
        [
          'Declared dependencies',
          factRecord.declaredDependencies.length === 0
            ? 'None declared'
            : factRecord.declaredDependencies.join(', '),
        ],
        ['Contents SHA-256', factRecord.contentsSha256],
        [
          'Static-risk flags',
          factRecord.staticRiskFlags.length === 0
            ? 'None observed in this fixture'
            : factRecord.staticRiskFlags.join(', '),
        ],
      ];
  }
}

function factMarkup(receipt: Receipt): string {
  return facts(receipt.payload.publicFacts)
    .map(
      ([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('');
}

function searchText(receipt: Receipt): string {
  return [
    receipt.payload.sourceId,
    receipt.payload.topicSlug,
    receipt.payload.provenance.publisherName,
    receipt.payload.interpretation,
    ...receipt.payload.unknowns,
    ...facts(receipt.payload.publicFacts).flat(),
  ].join(' ');
}

function exampleLabel(receipt: Receipt): string {
  return receipt.payload.provenance.evidenceClass === 'controlled-example'
    ? '<p class="example-label"><strong>Controlled fixture example</strong> · This is not live or current source evidence.</p>'
    : '<p class="live-label"><strong>Admitted live-source receipt</strong></p>';
}

function receiptCard(
  site: SiteDefinition,
  receipt: Receipt,
  publicBaseUrl: string,
  searchable = false,
): string {
  const unknowns = receipt.payload.unknowns
    .map((unknown) => `<li>${escapeHtml(unknown)}</li>`)
    .join('');
  const correction =
    receipt.payload.correction.kind === 'correction'
      ? `Correction of <a href="${escapeHtml(sitePath(site, `/receipts/${receipt.payload.correction.correctsReceiptId}/`, publicBaseUrl))}"><code>${escapeHtml(receipt.payload.correction.correctsReceiptId)}</code></a>.`
      : 'No correction relation is asserted by this receipt.';

  const searchAttributes = searchable
    ? ` data-search-record data-search-text="${escapeHtml(searchText(receipt))}" data-search-topic="${escapeHtml(receipt.payload.topicSlug)}"`
    : '';

  return `<article class="receipt-card" aria-labelledby="receipt-${escapeHtml(receipt.id)}"${searchAttributes}>
  ${exampleLabel(receipt)}
  <div class="receipt-card__heading">
    <p class="eyebrow">Accepted evidence receipt</p>
    <h3 id="receipt-${escapeHtml(receipt.id)}"><a href="${escapeHtml(sitePath(site, `/receipts/${receipt.id}/`, publicBaseUrl))}">${escapeHtml(receipt.payload.sourceId)}</a></h3>
  </div>
  <dl class="receipt-meta">
    <div><dt>Evidence source</dt><dd>${sourceLink(receipt.payload.sourceUrl)}</dd></div>
    <div><dt>Observed time</dt><dd><time datetime="${escapeHtml(receipt.payload.observedAt)}">${escapeHtml(receipt.payload.observedAt)}</time></dd></div>
    <div><dt>Policy decision</dt><dd><strong>${escapeHtml(receipt.payload.policy.decision)}</strong></dd></div>
    <div><dt>Sequence</dt><dd>${escapeHtml(String(receipt.payload.sequence))}</dd></div>
  </dl>
  <section class="receipt-section" aria-labelledby="facts-${escapeHtml(receipt.id)}">
    <h4 id="facts-${escapeHtml(receipt.id)}">Verified source facts</h4>
    <dl class="fact-list">${factMarkup(receipt)}</dl>
  </section>
  <section class="receipt-section"><h4>Bounded interpretation</h4><p>${escapeHtml(receipt.payload.interpretation)}</p></section>
  <section class="receipt-section"><h4>Unknowns and non-claims</h4><ul>${unknowns}</ul></section>
  <section class="receipt-section"><h4>Correction status</h4><p>${correction}</p></section>
  <details><summary>Integrity bindings</summary><dl class="receipt-meta">
    <div><dt>Receipt digest</dt><dd><code>${escapeHtml(receipt.id)}</code></dd></div>
    <div><dt>Manifest digest</dt><dd><code>${escapeHtml(receipt.payload.manifestSha256)}</code></dd></div>
    <div><dt>Raw object</dt><dd><code>${escapeHtml(receipt.payload.rawObjectPath)}</code></dd></div>
    <div><dt>Normalized object</dt><dd><code>${escapeHtml(receipt.payload.normalizedObjectPath)}</code></dd></div>
  </dl></details>
  <p class="card-correction"><a href="${escapeHtml(sitePath(site, '/methodology/', publicBaseUrl))}#corrections">How to report a correction</a></p>
</article>`;
}

function page(
  site: SiteDefinition,
  options: {
    readonly path: string;
    readonly title: string;
    readonly description: string;
    readonly body: string;
    readonly structuredData?: string;
    readonly scriptPath?: string;
    readonly stylePath?: string;
  },
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const structuredData =
    options.structuredData === undefined
      ? ''
      : `\n  <script type="application/ld+json">${options.structuredData}</script>`;
  const script =
    options.scriptPath === undefined
      ? ''
      : `\n  <script type="module" src="${escapeHtml(sitePath(site, options.scriptPath, publicBaseUrl))}"></script>`;
  const productStyle =
    options.stylePath === undefined
      ? ''
      : `\n  <link rel="stylesheet" href="${escapeHtml(sitePath(site, options.stylePath, publicBaseUrl))}">`;
  const policy = contentSecurityPolicy(
    options.scriptPath === undefined ? "'none'" : "'self'",
  );
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${policy}">
  <meta name="description" content="${escapeHtml(options.description)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl(site, options.path, publicBaseUrl))}">
  <link rel="icon" href="${escapeHtml(`${publicBasePath(publicBaseUrl)}favicon.ico`)}">
  <title>${escapeHtml(options.title)}</title>
  <link rel="stylesheet" href="${escapeHtml(sitePath(site, '/styles.css', publicBaseUrl))}">${productStyle}${structuredData}${script}
</head>
<body class="site-${site.siteId}">
  <a class="skip-link" href="#main-content">Skip to evidence</a>
  <header class="site-header"><div class="shell">
    <p class="portfolio-label">Evidence receipt portfolio</p>
    <h1>${escapeHtml(site.name)}</h1>
    <p class="proposition">${escapeHtml(site.proposition)}</p>
    <nav aria-label="Primary navigation">
      <a href="${escapeHtml(sitePath(site, '/', publicBaseUrl))}">Receipts</a>
      <a href="${escapeHtml(sitePath(site, '/methodology/', publicBaseUrl))}">Methodology</a>
      <a href="${escapeHtml(sitePath(site, '/sources/', publicBaseUrl))}">Sources</a>
    </nav>
  </div></header>
  <main id="main-content" class="shell">${options.body}</main>
  <footer><div class="shell">${options.scriptPath === undefined ? 'Deterministic static evidence · No accounts, analytics, external assets, or executable source content.' : 'Deterministic static evidence · First-party filtering only; no accounts, analytics, external assets, or query transmission.'}</div></footer>
</body>
</html>
`;
}

export function renderSite(
  site: SiteDefinition,
  receipts: readonly Receipt[],
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const visible = accepted(receipts);
  const assetPolicy = renderSiteAssetPolicy(site);
  const cards =
    visible.length === 0
      ? '<p class="empty-state">No accepted receipts are available in this build.</p>'
      : visible
          .map((receipt) =>
            receiptCard(
              site,
              receipt,
              publicBaseUrl,
              site.siteId === 'search-receipt',
            ),
          )
          .join('\n');
  const topics = [
    ...new Set(visible.map((receipt) => receipt.payload.topicSlug)),
  ]
    .sort(compareText)
    .map(
      (topic) =>
        `<li><a href="${escapeHtml(sitePath(site, `/topics/${topic}/`, publicBaseUrl))}">${escapeHtml(topic)}</a></li>`,
    )
    .join('');
  const topicOptions = [
    ...new Set(visible.map((receipt) => receipt.payload.topicSlug)),
  ]
    .sort(compareText)
    .map(
      (topic) =>
        `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`,
    )
    .join('');
  const searchControls =
    site.siteId === 'search-receipt'
      ? `<section class="search-panel" aria-labelledby="search-heading"><p class="eyebrow">Enterable record search</p><h2 id="search-heading">Find a source-bound record</h2><p>Filter the records already published on this page. Queries stay in this browser and are not stored or sent.</p>
    <form class="search-controls" role="search" data-search-controls><div><label for="receipt-query">Search records</label><input id="receipt-query" name="receipt-query" type="search" autocomplete="off" data-search-query></div><div><label for="receipt-topic">Filter by topic</label><select id="receipt-topic" name="receipt-topic" data-search-topic-filter><option value="">All topics</option>${topicOptions}</select></div><button type="submit">Apply filters</button></form>
    <p class="search-status" aria-live="polite" data-search-status>Showing ${visible.length} of ${visible.length} ${visible.length === 1 ? 'record' : 'records'}.</p><p class="empty-state" data-search-empty hidden>No records match this query and filter.</p><p class="empty-state" role="status" data-search-error>Interactive filtering is not active; all records remain visible.</p></section>`
      : '';
  const offer =
    site.siteId === 'search-receipt'
      ? `<section class="information-panel" aria-labelledby="offer-heading"><p class="eyebrow">Preview interest action</p><h2 id="offer-heading">Status alert and report preview</h2><p>This non-operational preview does not create an alert, send data, or start a report.</p><button type="button" data-measurement-action="alert-report-interest">I would use alerts or reports</button><p aria-live="polite" data-offer-status></p></section>`
      : '';
  return page(
    site,
    {
      path: '/',
      title: site.title,
      description: site.description,
      body: `${searchControls}<section aria-labelledby="receipts-heading"><p class="eyebrow">Source-bound records</p><h2 id="receipts-heading">Accepted receipts and examples</h2><p>Facts, interpretation, unknowns, and correction status remain visibly separate.</p><div class="receipt-list">${cards}</div></section>
    <section class="information-panel" aria-labelledby="topics-heading"><h2 id="topics-heading">Topics</h2><ul>${topics}</ul></section>${offer}`,
      scriptPath: assetPolicy.scriptPath,
      stylePath: assetPolicy.stylePath,
    },
    publicBaseUrl,
  );
}

export function renderSiteAssetPolicy(site: SiteDefinition): {
  readonly scriptPath: string | undefined;
  readonly scriptPolicy: "'none'" | "'self'";
  readonly stylePath: string | undefined;
} {
  return site.siteId === 'search-receipt'
    ? {
        scriptPath: '/search-interface.js',
        scriptPolicy: "'self'",
        stylePath: '/search-interface.css',
      }
    : { scriptPath: undefined, scriptPolicy: "'none'", stylePath: undefined };
}

export function renderMethodology(
  site: SiteDefinition,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  return page(
    site,
    {
      path: '/methodology/',
      title: `${site.name} methodology`,
      description: `Evidence admission, verification, limits, and corrections for ${site.name}.`,
      body: `<article><p class="eyebrow">Methodology</p><h2>Evidence admission and verification</h2>
    <p>Every rendered record resolves to an admitted manifest, canonical raw and normalized content-addressed objects, recomputed publication policy, and a verified source-local receipt chain.</p>
    <h2>Interpretation boundary</h2><p>${escapeHtml(site.interpretationBoundary)}</p>
    <h2>Unknowns and non-claims</h2><p>${escapeHtml(site.unknowns)}</p>
    <h2 id="corrections">Corrections</h2><p>Corrections are new immutable receipts that name the older receipt. Existing records are never silently overwritten.</p></article>`,
    },
    publicBaseUrl,
  );
}

export function renderSources(
  site: SiteDefinition,
  receipts: readonly Receipt[],
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const unique = new Map<string, Receipt>();
  for (const receipt of accepted(receipts))
    unique.set(receipt.payload.manifestSha256, receipt);
  const sources = [...unique.values()]
    .toSorted((left, right) =>
      compareText(left.payload.sourceId, right.payload.sourceId),
    )
    .map(
      (receipt) =>
        `<li><strong>${escapeHtml(receipt.payload.sourceId)}</strong> · ${sourceLink(receipt.payload.sourceUrl)} · ${escapeHtml(receipt.payload.provenance.publisherName)} · ${receipt.payload.provenance.evidenceClass === 'controlled-example' ? 'Controlled fixture example; not live/current evidence' : 'Official primary live-source manifest'}</li>`,
    )
    .join('');
  return page(
    site,
    {
      path: '/sources/',
      title: `${site.name} sources`,
      description: `Admitted evidence sources represented in this ${site.name} build.`,
      body: `<section><p class="eyebrow">Source list</p><h2>Sources represented in this build</h2><ul>${sources}</ul></section>`,
    },
    publicBaseUrl,
  );
}

function jsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function renderReceiptDetail(
  site: SiteDefinition,
  receipt: Receipt,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const url = canonicalUrl(site, `/receipts/${receipt.id}/`, publicBaseUrl);
  return page(
    site,
    {
      path: `/receipts/${receipt.id}/`,
      title: `${receipt.payload.sourceId} receipt · ${site.name}`,
      description: `Verified receipt ${receipt.id} for ${receipt.payload.sourceId}.`,
      structuredData: jsonForHtml({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: `${receipt.payload.sourceId} evidence receipt`,
        datePublished: receipt.payload.observedAt,
        mainEntityOfPage: url,
        url,
      }),
      body: `<section><h2>Receipt detail</h2>${receiptCard(site, receipt, publicBaseUrl)}</section>`,
    },
    publicBaseUrl,
  );
}

export function renderTopic(
  site: SiteDefinition,
  topicSlug: string,
  receipts: readonly Receipt[],
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const cards = accepted(receipts)
    .filter((receipt) => receipt.payload.topicSlug === topicSlug)
    .map((receipt) => receiptCard(site, receipt, publicBaseUrl))
    .join('\n');
  return page(
    site,
    {
      path: `/topics/${topicSlug}/`,
      title: `${topicSlug} receipts · ${site.name}`,
      description: `${site.name} receipts in the ${topicSlug} topic.`,
      body: `<section><p class="eyebrow">Topic</p><h2>${escapeHtml(topicSlug)}</h2><div class="receipt-list">${cards}</div></section>`,
    },
    publicBaseUrl,
  );
}

export function renderSitemap(
  site: SiteDefinition,
  receipts: readonly Receipt[],
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const visible = accepted(receipts);
  const paths = [
    '/',
    '/methodology/',
    '/sources/',
    ...visible.map((receipt) => `/receipts/${receipt.id}/`),
    ...[...new Set(visible.map((receipt) => receipt.payload.topicSlug))].map(
      (topic) => `/topics/${topic}/`,
    ),
  ].sort(compareText);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${escapeXml(canonicalUrl(site, path, publicBaseUrl))}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function renderRobots(
  site: SiteDefinition,
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  return `User-agent: *\nAllow: ${sitePath(site, '/', publicBaseUrl)}\nSitemap: ${canonicalUrl(site, '/sitemap.xml', publicBaseUrl)}\n`;
}

export function renderPortfolioHub(
  publicBaseUrl = DEFAULT_PUBLIC_BASE_URL,
): string {
  const base = normalizePublicBaseUrl(publicBaseUrl);
  const basePath = publicBasePath(base);
  const productLinks = [
    [
      'search-receipt',
      'Search Receipt',
      'Source-bound search status receipts.',
    ],
    [
      'workflow-test-lab',
      'Workflow Test Lab',
      'Fixture-checked workflow records with explicit limits.',
    ],
    [
      'skill-ledger',
      'SkillLedger',
      'Non-executing metadata receipts for skill packages.',
    ],
  ]
    .map(
      ([siteId, name, description]) =>
        `<article class="receipt-card"><h2><a href="${escapeHtml(`${basePath}${siteId}/`)}">${escapeHtml(name!)}</a></h2><p>${escapeHtml(description!)}</p></article>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">
  <meta name="description" content="Three distinct source-bound evidence receipt products.">
  <link rel="canonical" href="${escapeHtml(base)}">
  <link rel="icon" href="${escapeHtml(`${basePath}favicon.ico`)}">
  <title>Evidence receipt portfolio</title>
  <link rel="stylesheet" href="${escapeHtml(`${basePath}portfolio.css`)}">
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to products</a>
  <header class="site-header"><div class="shell">
    <p class="portfolio-label">Evidence receipt portfolio</p>
    <h1>Three bounded evidence products</h1>
    <p class="proposition">Controlled examples are not live or current source evidence. Live-source receipts remain distinct and require their own admitted source evidence.</p>
  </div></header>
  <main id="main-content" class="shell"><section class="receipt-list" aria-label="Portfolio products">${productLinks}</section></main>
  <footer><div class="shell">This portfolio hub is a deployment shell, not a fourth evidence product.</div></footer>
</body>
</html>
`;
}
