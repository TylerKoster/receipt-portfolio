import type { Receipt } from '../../packages/evidence-core/src/index.js';

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

const CONTENT_SECURITY_POLICY =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; style-src 'self'; script-src 'none'\">";

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function sourceLink(sourceUrl: string): string {
  try {
    if (new URL(sourceUrl).protocol === 'https:') {
      return `<a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a>`;
    }
  } catch {
    // The inert fallback below is the only rendering path for invalid URLs.
  }

  return `<span class="invalid-source">Invalid source URL: ${escapeHtml(sourceUrl)}</span>`;
}

function renderReceipt(receipt: Receipt): string {
  const payload = receipt.payload;
  const reasonCodes = payload.policy.reasonCodes
    .map((reasonCode) => `<li><code>${escapeHtml(reasonCode)}</code></li>`)
    .join('');
  const predecessor =
    payload.predecessorReceiptId === undefined
      ? 'No predecessor recorded for this receipt.'
      : `<code>${escapeHtml(payload.predecessorReceiptId)}</code>`;

  return `<article class="receipt-card" aria-labelledby="receipt-${escapeHtml(receipt.id)}">
  <div class="receipt-card__heading">
    <p class="eyebrow">Accepted evidence receipt</p>
    <h3 id="receipt-${escapeHtml(receipt.id)}">${escapeHtml(payload.sourceId)}</h3>
  </div>
  <dl class="receipt-meta">
    <div><dt>Evidence source</dt><dd>${sourceLink(payload.sourceUrl)}</dd></div>
    <div><dt>Observed time</dt><dd><time datetime="${escapeHtml(payload.observedAt)}">${escapeHtml(payload.observedAt)}</time></dd></div>
    <div><dt>Policy decision</dt><dd><strong>${escapeHtml(payload.policy.decision)}</strong></dd></div>
    <div><dt>Evidence class</dt><dd><ul class="reason-codes">${reasonCodes}</ul></dd></div>
    <div><dt>Source manifest hash</dt><dd><code>${escapeHtml(payload.manifestSha256)}</code></dd></div>
    <div><dt>Raw content hash</dt><dd><code>${escapeHtml(payload.rawSha256)}</code></dd></div>
    <div><dt>Normalized content hash</dt><dd><code>${escapeHtml(payload.normalizedSha256)}</code></dd></div>
  </dl>
  <section class="receipt-section" aria-labelledby="facts-${escapeHtml(receipt.id)}">
    <h4 id="facts-${escapeHtml(receipt.id)}">Verified facts</h4>
    <ul>
      <li>Receipt digest: <code>${escapeHtml(receipt.id)}</code></li>
      <li>Source identifier: <code>${escapeHtml(payload.sourceId)}</code></li>
      <li>Predecessor: ${predecessor}</li>
    </ul>
  </section>
  <p class="card-correction"><a href="#corrections">How to report a correction for this receipt</a></p>
</article>`;
}

export function renderSite(
  site: SiteDefinition,
  receipts: readonly Receipt[],
): string {
  const acceptedReceipts = receipts
    .filter((receipt) => receipt.payload.policy.decision === 'PASS')
    .toSorted(
      (left, right) =>
        compareText(left.payload.observedAt, right.payload.observedAt) ||
        compareText(left.id, right.id),
    );
  const receiptMarkup =
    acceptedReceipts.length === 0
      ? '<p class="empty-state">No accepted receipts are available in this build.</p>'
      : acceptedReceipts.map(renderReceipt).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${CONTENT_SECURITY_POLICY}
  <meta name="description" content="${escapeHtml(site.description)}">
  <title>${escapeHtml(site.title)}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body class="site-${escapeHtml(site.siteId)}">
  <a class="skip-link" href="#main-content">Skip to evidence</a>
  <header class="site-header">
    <div class="shell">
      <p class="portfolio-label">Evidence receipt portfolio</p>
      <h1>${escapeHtml(site.name)}</h1>
      <p class="proposition">${escapeHtml(site.proposition)}</p>
      <nav aria-label="Page sections">
        <a href="#receipts">Receipts</a>
        <a href="#methodology">Methodology</a>
        <a href="#limits">Limits</a>
        <a href="#corrections">Corrections</a>
      </nav>
    </div>
  </header>
  <main id="main-content" class="shell">
    <section id="receipts" aria-labelledby="receipts-heading">
      <div class="section-heading">
        <p class="eyebrow">Source-bound records</p>
        <h2 id="receipts-heading">Accepted receipts</h2>
        <p>Each card exposes the stored source reference, observation time, integrity hashes, and policy result.</p>
      </div>
      <div class="receipt-list">${receiptMarkup}</div>
    </section>
    <section id="methodology" class="information-panel" aria-labelledby="methodology-heading">
      <p class="eyebrow">Methodology</p>
      <h2 id="methodology-heading">What reaches this page</h2>
      <p>Only canonical receipt files that pass digest verification and carry a <code>PASS</code> policy decision are rendered. Held and rejected records remain outside the public page.</p>
      <p>Integrity verification checks the stored receipt against its digest. Source coverage and downstream outcomes may remain unknown.</p>
    </section>
    <section id="limits" class="boundary-grid" aria-label="Interpretation and limits">
      <div>
        <p class="eyebrow">Interpretation boundary</p>
        <h2>How to read this evidence</h2>
        <p>${escapeHtml(site.interpretationBoundary)}</p>
      </div>
      <div>
        <p class="eyebrow">Unknowns and non-claims</p>
        <h2>What this page does not establish</h2>
        <p>${escapeHtml(site.unknowns)}</p>
      </div>
    </section>
    <section id="corrections" class="information-panel" aria-labelledby="corrections-heading">
      <p class="eyebrow">Correction path</p>
      <h2 id="corrections-heading">Preserve the receipt trail</h2>
      <ol>
        <li>Compare the displayed field with the linked evidence source.</li>
        <li>Record the receipt digest and the field in question.</li>
        <li>Add a new linked correction receipt; do not silently replace the original record.</li>
      </ol>
    </section>
  </main>
  <footer><div class="shell">Local fixture build · No accounts, analytics, or third-party scripts.</div></footer>
</body>
</html>
`;
}
