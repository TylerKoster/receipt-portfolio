import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const verifyWorkflow = readFileSync(
  new URL('../../.github/workflows/verify.yml', import.meta.url),
  'utf8',
);
const deployWorkflow = readFileSync(
  new URL('../../.github/workflows/deploy-pages.yml', import.meta.url),
  'utf8',
);

const focusedMomentBuildTest =
  'npm test -- --run test/integration/video-moment-search-build.test.ts';
const sourceTimestamp =
  'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132';
const publicRoutes = [
  'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/',
  'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/videos/robots-under-control/',
  'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/moments/moment-robots-control/',
] as const;

function indexAfter(workflow: string, later: string, earlier: string): void {
  expect(workflow.indexOf(later), later).toBeGreaterThan(
    workflow.indexOf(earlier),
  );
}

describe('AI Moment Index release workflow contract', () => {
  it('collects its controlled fixture, runs the focused contract, and verifies the deployed timestamp routes', () => {
    expect(verifyWorkflow).toContain('AI Moment Index');
    expect(verifyWorkflow).toContain('npm run evidence -- collect-fixtures');
    expect(verifyWorkflow).toContain(focusedMomentBuildTest);
    indexAfter(
      verifyWorkflow,
      focusedMomentBuildTest,
      'npm run evidence -- collect-fixtures',
    );

    expect(deployWorkflow).toContain('AI Moment Index');
    expect(deployWorkflow).toContain(focusedMomentBuildTest);
    indexAfter(
      deployWorkflow,
      focusedMomentBuildTest,
      'npm run evidence -- collect-fixtures',
    );
    indexAfter(
      deployWorkflow,
      'actions/upload-pages-artifact@v4',
      focusedMomentBuildTest,
    );
    expect(deployWorkflow).toMatch(/public-health:\r?\n\s+needs: deploy\r?\n/);

    for (const route of publicRoutes) {
      expect(deployWorkflow).toContain(route);
    }
    const publicHealth = deployWorkflow.slice(
      deployWorkflow.indexOf('  public-health:'),
    );
    expect(publicHealth).toContain(sourceTimestamp);
    expect(
      publicHealth.match(/grep --fixed-strings -- "\$source_timestamp"/g),
    ).toHaveLength(2);
    expect(publicHealth).toContain('"$video_document"');
    expect(publicHealth).toContain('"$moment_document"');
  });
});
