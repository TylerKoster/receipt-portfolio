import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worksheetPath = new URL(
  './source-bound-investigation-worksheet.json',
  import.meta.url,
);
const statusManifestPath = new URL(
  '../../manifests/search-receipt/google-search-status.json',
  import.meta.url,
);
const searchCentralManifestPath = new URL(
  '../../manifests/search-receipt/google-search-central-blog.json',
  import.meta.url,
);

function admittedManifests() {
  const status = JSON.parse(readFileSync(statusManifestPath, 'utf8'));
  const searchCentral = JSON.parse(
    readFileSync(searchCentralManifestPath, 'utf8'),
  );

  return {
    [status.sourceId]: status,
    [searchCentral.sourceId]: searchCentral,
  };
}

describe('Search Receipt source-bound investigation worksheet', () => {
  it('admits a narrowly scoped worksheet through the real validator', async () => {
    expect(existsSync(worksheetPath)).toBe(true);

    const validatorPath = './source-bound-investigation-worksheet.js';
    const { validateSourceBoundInvestigationWorksheet } = await import(
      validatorPath
    );
    const worksheet = JSON.parse(readFileSync(worksheetPath, 'utf8'));

    expect(
      validateSourceBoundInvestigationWorksheet(worksheet, admittedManifests()),
    ).toEqual({ ok: true, diagnostics: [] });
    expect(worksheet).toMatchObject({
      id: 'source-bound-investigation-worksheet-v1',
      intendedAudience: expect.any(String),
      decision: expect.stringContaining('official Google Search Status'),
      metadata: {
        title: 'How do I compare Google Search status with my site evidence?',
        canonicalSlugProposal:
          '/worksheets/compare-google-search-status-with-site-evidence',
      },
      publication: {
        status: 'ROUTE_INTEGRATED_PENDING_RELEASE',
        adapter: 'coordinator-owned shared static route adapter',
      },
    });
    expect(worksheet.worksheet).toHaveLength(4);
    expect(worksheet.faqs.length).toBeGreaterThanOrEqual(2);
  });

  it('fails closed when a factual statement is unbound or a decision boundary is removed', async () => {
    expect(existsSync(worksheetPath)).toBe(true);

    const validatorPath = './source-bound-investigation-worksheet.js';
    const { validateSourceBoundInvestigationWorksheet } = await import(
      validatorPath
    );
    const worksheet = JSON.parse(readFileSync(worksheetPath, 'utf8'));
    const missingBinding = structuredClone(worksheet);
    missingBinding.factualStatements[0].sourceBindingIds = [];

    expect(
      validateSourceBoundInvestigationWorksheet(
        missingBinding,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining(['FACTUAL_STATEMENT_UNBOUND']),
    });

    const missingBoundary = structuredClone(worksheet);
    missingBoundary.boundaries.noCausation = '';

    expect(
      validateSourceBoundInvestigationWorksheet(
        missingBoundary,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'CURRENTNESS_OR_NO_CAUSATION_BOUNDARY_MISSING',
      ]),
    });

    const missingCurrentnessBoundary = structuredClone(worksheet);
    missingCurrentnessBoundary.boundaries.currentOfficialStatus = '';

    expect(
      validateSourceBoundInvestigationWorksheet(
        missingCurrentnessBoundary,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'CURRENTNESS_OR_NO_CAUSATION_BOUNDARY_MISSING',
      ]),
    });

    const changedRoute = structuredClone(worksheet);
    changedRoute.metadata.canonicalSlugProposal = '/worksheets/other-route';

    expect(
      validateSourceBoundInvestigationWorksheet(
        changedRoute,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining(['CANONICAL_SLUG_INVALID']),
    });
  });
});
