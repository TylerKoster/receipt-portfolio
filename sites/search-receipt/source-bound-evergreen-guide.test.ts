import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateSourceBoundEvergreenGuide } from './source-bound-evergreen-guide.js';

const guidePath = new URL(
  './source-bound-evergreen-guide.json',
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

describe('Search Receipt source-bound evergreen guide', () => {
  it('binds the admitted guide contract to the coordinator route adapter', () => {
    expect(existsSync(guidePath)).toBe(true);

    const guide = JSON.parse(readFileSync(guidePath, 'utf8'));
    expect(guide).toMatchObject({
      id: 'source-bound-evergreen-guide-v1',
      publication: {
        status: 'ROUTE_INTEGRATED_PENDING_RELEASE',
        route: '/guides/is-google-search-down-or-my-site/',
        adapter: 'shared-static-guide-v1',
      },
    });
  });

  it('admits only the exact approved official source bindings and required decision boundaries', () => {
    const guide = JSON.parse(readFileSync(guidePath, 'utf8'));

    expect(
      validateSourceBoundEvergreenGuide(guide, admittedManifests()),
    ).toEqual({ ok: true, diagnostics: [] });
    expect(guide).toMatchObject({
      intendedAudience: expect.any(String),
      decision: expect.stringContaining('official Google Search Status'),
      metadata: {
        title: 'Is Google Search down, or is the problem on my site?',
        canonicalSlugProposal: '/guides/is-google-search-down-or-my-site',
      },
      workflow: expect.arrayContaining([
        expect.objectContaining({ step: 1 }),
        expect.objectContaining({ step: 2 }),
        expect.objectContaining({ step: 3 }),
      ]),
    });
    expect(guide.workflow).toHaveLength(3);
    expect(guide.factualStatements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceBindingIds: expect.arrayContaining(['google-search-status']),
        }),
        expect.objectContaining({
          sourceBindingIds: expect.arrayContaining([
            'google-search-central-blog',
          ]),
        }),
      ]),
    );
    expect(guide.boundaries).toMatchObject({
      currentOfficialStatus: expect.stringContaining(
        'does not report a current status or incident',
      ),
      historicalControlledExamples: expect.stringContaining(
        'not current incident evidence',
      ),
      noCausation: expect.stringContaining('does not explain'),
    });
    expect(guide.faqs.length).toBeGreaterThanOrEqual(2);
    expect(guide.correctionAndCurrentnessPolicy).toContain('correction');
  });

  it('fails closed when a factual statement loses its source binding or a required decision boundary is removed', () => {
    const guide = JSON.parse(readFileSync(guidePath, 'utf8'));
    const missingBinding = structuredClone(guide);
    missingBinding.factualStatements[0].sourceBindingIds = [];

    expect(
      validateSourceBoundEvergreenGuide(missingBinding, admittedManifests()),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining(['FACTUAL_STATEMENT_UNBOUND']),
    });

    const missingBoundary = structuredClone(guide);
    missingBoundary.boundaries.noCausation = '';

    expect(
      validateSourceBoundEvergreenGuide(missingBoundary, admittedManifests()),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'CURRENTNESS_OR_NO_CAUSATION_BOUNDARY_MISSING',
      ]),
    });

    const missingCurrentnessBoundary = structuredClone(guide);
    missingCurrentnessBoundary.boundaries.currentOfficialStatus = '';

    expect(
      validateSourceBoundEvergreenGuide(
        missingCurrentnessBoundary,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'CURRENTNESS_OR_NO_CAUSATION_BOUNDARY_MISSING',
      ]),
    });

    const missingSourcePurpose = structuredClone(guide);
    delete missingSourcePurpose.sourceBindings[0].purpose;

    expect(
      validateSourceBoundEvergreenGuide(
        missingSourcePurpose,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'SOURCE_BINDING_INVALID:google-search-status',
      ]),
    });

    const duplicateSourceBinding = structuredClone(guide);
    duplicateSourceBinding.sourceBindings.push(
      structuredClone(duplicateSourceBinding.sourceBindings[0]),
    );

    expect(
      validateSourceBoundEvergreenGuide(
        duplicateSourceBinding,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining(['SOURCE_BINDINGS_INCOMPLETE']),
    });
  });
});
