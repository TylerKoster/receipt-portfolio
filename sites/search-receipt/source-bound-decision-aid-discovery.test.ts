import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const discoveryPath = new URL(
  './source-bound-decision-aid-discovery.json',
  import.meta.url,
);
const statusManifestPath = new URL(
  '../../manifests/search-receipt/google-search-status.json',
  import.meta.url,
);

function admittedManifests() {
  const status = JSON.parse(readFileSync(statusManifestPath, 'utf8'));

  return { [status.sourceId]: status };
}

describe('Search Receipt source-bound decision-aid discovery contract', () => {
  it('admits exactly two route-bound decision aids through the real validator', async () => {
    expect(existsSync(discoveryPath)).toBe(true);

    const { validateSourceBoundDecisionAidDiscovery } =
      await import('./source-bound-decision-aid-discovery.js');
    const discovery = JSON.parse(readFileSync(discoveryPath, 'utf8'));

    expect(
      validateSourceBoundDecisionAidDiscovery(discovery, admittedManifests()),
    ).toEqual({
      ok: true,
      diagnostics: [],
    });
    expect(discovery.decisionAids).toHaveLength(2);
    expect(discovery.decisionAids).toEqual([
      expect.objectContaining({
        id: 'guide-first',
        route: '/guides/is-google-search-down-or-my-site/',
      }),
      expect.objectContaining({
        id: 'worksheet-after-own-site-evidence',
        route: '/worksheets/compare-google-search-status-with-site-evidence',
      }),
    ]);
    expect(discovery.publication).toMatchObject({
      status: 'ROUTE_INTEGRATED_PENDING_RELEASE',
      route: '/discover/choose-google-search-guide-or-worksheet/',
    });
  });

  it('fails closed when a decision-aid route is unknown or a required boundary is removed', async () => {
    expect(existsSync(discoveryPath)).toBe(true);

    const { validateSourceBoundDecisionAidDiscovery } =
      await import('./source-bound-decision-aid-discovery.js');
    const discovery = JSON.parse(readFileSync(discoveryPath, 'utf8'));
    const unknownRoute = structuredClone(discovery);
    unknownRoute.decisionAids[0].route = '/guides/not-admitted';

    expect(
      validateSourceBoundDecisionAidDiscovery(
        unknownRoute,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining(['DECISION_AID_ROUTE_INVALID']),
    });

    const missingBoundary = structuredClone(discovery);
    missingBoundary.boundaries.noCausation = '';

    expect(
      validateSourceBoundDecisionAidDiscovery(
        missingBoundary,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining([
        'CURRENTNESS_OR_NO_CAUSATION_BOUNDARY_MISSING',
      ]),
    });
  });

  it('fails closed rather than throwing when the admitted manifest is unavailable', async () => {
    expect(existsSync(discoveryPath)).toBe(true);

    const { validateSourceBoundDecisionAidDiscovery } =
      await import('./source-bound-decision-aid-discovery.js');
    const discovery = JSON.parse(readFileSync(discoveryPath, 'utf8'));

    expect(
      validateSourceBoundDecisionAidDiscovery(discovery, {}),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining(['SOURCE_BINDINGS_INVALID']),
    });
  });

  it('rejects the superseded adapter-pending state from public admission', async () => {
    const { validateSourceBoundDecisionAidDiscovery } =
      await import('./source-bound-decision-aid-discovery.js');
    const discovery = JSON.parse(readFileSync(discoveryPath, 'utf8'));
    const pendingAdapter = structuredClone(discovery);
    pendingAdapter.publication.status =
      'CONTENT_CONTRACT_ADMITTED_PENDING_ADAPTER';
    delete pendingAdapter.publication.route;

    expect(
      validateSourceBoundDecisionAidDiscovery(
        pendingAdapter,
        admittedManifests(),
      ),
    ).toMatchObject({
      ok: false,
      diagnostics: expect.arrayContaining(['PUBLIC_ROUTE_INTEGRATION_INVALID']),
    });
  });
});
