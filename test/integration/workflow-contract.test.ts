import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Step = Readonly<{ name: string; run?: string; uses?: string }>;
type Job = Readonly<{
  needs: readonly string[];
  permissions: Readonly<Record<string, string>>;
  steps: readonly Step[];
}>;

const genericCollection = 'npm run evidence -- collect-fixtures';
const focusedSourceRightsTest =
  'npm test -- --run sites/video-moment-search/site.test.ts';
const focusedMomentBuildTest =
  'npm test -- --run test/integration/video-moment-search-build.test.ts';
const sourceTimestamp =
  'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm#t=132';
const publicRoutes = [
  'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/',
  'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/videos/robots-under-control/',
  'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/moments/moment-robots-control/',
] as const;

function parseWorkflow(workflow: string): ReadonlyMap<string, Job> {
  const jobs = new Map<
    string,
    { needs: string[]; permissions: Record<string, string>; steps: Step[] }
  >();
  let activeJob:
    | { needs: string[]; permissions: Record<string, string>; steps: Step[] }
    | undefined;
  let activeStep: { name: string; run?: string; uses?: string } | undefined;
  let parsingPermissions = false;
  let parsingJobs = false;

  const lines = workflow.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line === 'jobs:') {
      parsingJobs = true;
      continue;
    }
    if (!parsingJobs) continue;
    const jobMatch = line.match(/^\s{2}([a-z][a-z0-9-]*):$/);
    if (jobMatch) {
      activeJob = { needs: [], permissions: {}, steps: [] };
      jobs.set(jobMatch[1]!, activeJob);
      activeStep = undefined;
      parsingPermissions = false;
      continue;
    }
    if (!activeJob) continue;

    const needsMatch = line.match(/^\s{4}needs: (.+)$/);
    if (needsMatch) {
      activeJob.needs = needsMatch[1]!
        .replaceAll('[', '')
        .replaceAll(']', '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      parsingPermissions = false;
      continue;
    }
    const permissionsMatch = line.match(/^\s{4}permissions: ?(.*)$/);
    if (permissionsMatch) {
      parsingPermissions = permissionsMatch[1] !== '{}';
      continue;
    }
    if (parsingPermissions) {
      const permissionMatch = line.match(/^\s{6}([a-z-]+): (.+)$/);
      if (permissionMatch) {
        activeJob.permissions[permissionMatch[1]!] = permissionMatch[2]!;
        continue;
      }
      parsingPermissions = false;
    }

    const stepMatch = line.match(/^\s{6}- name: (.+)$/);
    if (stepMatch) {
      activeStep = { name: stepMatch[1]! };
      activeJob.steps.push(activeStep);
      continue;
    }
    if (!activeStep) continue;

    const usesMatch = line.match(/^\s{8}uses: (.+)$/);
    if (usesMatch) {
      activeStep.uses = usesMatch[1]!;
      continue;
    }
    const runMatch = line.match(/^\s{8}run: ?(.*)$/);
    if (!runMatch) continue;

    const run = runMatch[1]!;
    if (run === '|' || run === '>-') {
      const block: string[] = [];
      while (lines[index + 1]?.startsWith('          ')) {
        index += 1;
        block.push(lines[index]!.slice(10));
      }
      activeStep.run = block.join('\n');
    } else {
      activeStep.run = run;
    }
  }
  return jobs;
}

function requiredJob(jobs: ReadonlyMap<string, Job>, name: string): Job {
  const job = jobs.get(name);
  expect(job, `missing ${name} job`).toBeDefined();
  return job!;
}

function requiredStep(job: Job, name: string, run?: string): Step {
  const step = job.steps.find((candidate) => candidate.name === name);
  expect(step, `missing ${name} step`).toBeDefined();
  if (run !== undefined) expect(step!.run).toBe(run);
  return step!;
}

function orderedCommands(job: Job, commands: readonly string[]): void {
  let previous = { step: -1, line: -1 };
  for (const command of commands) {
    let current: { step: number; line: number } | undefined;
    for (const [stepIndex, step] of job.steps.entries()) {
      for (const [lineIndex, line] of (step.run ?? '').split('\n').entries()) {
        const candidate = line.trim();
        const matches =
          candidate === command || candidate.startsWith(`${command} `);
        if (
          matches &&
          (stepIndex > previous.step ||
            (stepIndex === previous.step && lineIndex > previous.line))
        ) {
          current = { step: stepIndex, line: lineIndex };
          break;
        }
      }
      if (current) break;
    }
    expect(current, `missing or unordered ${command}`).toBeDefined();
    previous = current!;
  }
}

function assertVerifyContract(workflow: string): void {
  const jobs = parseWorkflow(workflow);
  expect([...jobs.keys()]).toEqual(['verify']);
  const verify = requiredJob(jobs, 'verify');
  requiredStep(
    verify,
    'Collect controlled and pinned-source evidence',
    genericCollection,
  );
  requiredStep(
    verify,
    'Validate AI Moment Index controlled fixture and source rights',
    focusedSourceRightsTest,
  );
  requiredStep(
    verify,
    'Run AI Moment Index focused fixture and build contract',
    focusedMomentBuildTest,
  );
  orderedCommands(verify, [
    'npm ci',
    'npm run check',
    'npm test -- --run',
    'npm run test:integration',
    genericCollection,
    focusedSourceRightsTest,
    focusedMomentBuildTest,
    'npm run evidence -- verify --all',
    'npm run evidence -- test-mutation',
    'npm run build',
    'npm run build:manifest',
  ]);
  expect(requiredStep(verify, 'Build first clean static tree').run).toContain(
    'npm run build:manifest > artifacts/build-manifest-first.txt',
  );
  expect(requiredStep(verify, 'Build second clean static tree').run).toContain(
    'npm run build:manifest > artifacts/build-manifest-second.txt',
  );
  expect(
    requiredStep(verify, 'Compare deterministic build manifests').run,
  ).toBe(
    'cmp artifacts/build-manifest-first.txt artifacts/build-manifest-second.txt',
  );
}

function assertDeployContract(workflow: string): void {
  const jobs = parseWorkflow(workflow);
  expect([...jobs.keys()]).toEqual(['build', 'deploy', 'public-health']);
  const build = requiredJob(jobs, 'build');
  const deploy = requiredJob(jobs, 'deploy');
  const publicHealth = requiredJob(jobs, 'public-health');

  expect(build.needs).toEqual([]);
  expect(build.permissions).toEqual({ contents: 'read' });
  expect(deploy.needs).toEqual(['build']);
  expect(deploy.permissions).toEqual({
    contents: 'read',
    pages: 'write',
    'id-token': 'write',
  });
  expect(publicHealth.needs).toEqual(['deploy']);
  expect(publicHealth.permissions).toEqual({});

  requiredStep(
    build,
    'Collect controlled and pinned-source evidence',
    genericCollection,
  );
  requiredStep(
    build,
    'Validate AI Moment Index controlled fixture and source rights',
    focusedSourceRightsTest,
  );
  requiredStep(
    build,
    'Run AI Moment Index focused fixture and build contract',
    focusedMomentBuildTest,
  );
  orderedCommands(build, [
    'npm ci',
    'npm run check',
    'npm test -- --run',
    genericCollection,
    focusedSourceRightsTest,
    focusedMomentBuildTest,
    'npm run evidence -- verify --all',
    'npm run evidence -- test-mutation',
    'npm run build',
    'npm run build:manifest',
  ]);
  expect(
    build.steps.findIndex((step) => step.uses === 'actions/configure-pages@v5'),
  ).toBeGreaterThan(
    build.steps.findIndex((step) =>
      step.run?.includes('npm run build:manifest'),
    ),
  );
  expect(
    build.steps.findIndex(
      (step) => step.uses === 'actions/upload-pages-artifact@v4',
    ),
  ).toBeGreaterThan(
    build.steps.findIndex((step) => step.uses === 'actions/configure-pages@v5'),
  );
  expect(requiredStep(build, 'Configure GitHub Pages').uses).toBe(
    'actions/configure-pages@v5',
  );
  expect(requiredStep(build, 'Upload static Pages artifact').uses).toBe(
    'actions/upload-pages-artifact@v4',
  );
  expect(requiredStep(deploy, 'Deploy GitHub Pages artifact').uses).toBe(
    'actions/deploy-pages@v4',
  );

  const health = requiredStep(
    publicHealth,
    'Verify AI Moment Index public routes and timestamp documents',
  ).run!;
  for (const route of publicRoutes) expect(health).toContain(route);
  expect(health).toContain(`source_timestamp='${sourceTimestamp}'`);
  expect(health).toContain(
    'grep --fixed-strings -- "$source_timestamp" "$video_document"',
  );
  expect(health).toContain(
    'grep --fixed-strings -- "$source_timestamp" "$moment_document"',
  );
}

const verifyWorkflow = readFileSync(
  new URL('../../.github/workflows/verify.yml', import.meta.url),
  'utf8',
);
const deployWorkflow = readFileSync(
  new URL('../../.github/workflows/deploy-pages.yml', import.meta.url),
  'utf8',
);

describe('AI Moment Index release workflow contract', () => {
  it('binds the fourth-site fixture, source-rights, focused-build, and release gates', () => {
    assertVerifyContract(verifyWorkflow);
    assertDeployContract(deployWorkflow);
  });

  it('rejects a deploy build without the distinct generic collection step', () => {
    expect(() =>
      assertDeployContract(
        deployWorkflow.replace(
          '      - name: Collect controlled and pinned-source evidence',
          '      - name: Missing collection gate',
        ),
      ),
    ).toThrow();
  });

  it('rejects timestamp checks that target the same public document', () => {
    expect(() =>
      assertDeployContract(
        deployWorkflow.replace(
          'grep --fixed-strings -- "$source_timestamp" "$moment_document"',
          'grep --fixed-strings -- "$source_timestamp" "$video_document"',
        ),
      ),
    ).toThrow();
  });

  it('rejects a public-health job that does not depend on deployment', () => {
    expect(() =>
      assertDeployContract(
        deployWorkflow.replace(
          '  public-health:\n    needs: deploy',
          '  public-health:\n    needs: build',
        ),
      ),
    ).toThrow();
  });

  it('rejects a focused source-rights gate ordered before collection', () => {
    expect(() =>
      assertDeployContract(
        deployWorkflow.replace(
          `      - name: Collect controlled and pinned-source evidence\n        run: ${genericCollection}\n      - name: Validate AI Moment Index controlled fixture and source rights\n        run: ${focusedSourceRightsTest}`,
          `      - name: Validate AI Moment Index controlled fixture and source rights\n        run: ${focusedSourceRightsTest}\n      - name: Collect controlled and pinned-source evidence\n        run: ${genericCollection}`,
        ),
      ),
    ).toThrow();
  });
});
