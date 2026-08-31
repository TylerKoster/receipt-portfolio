import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Step = Readonly<{ name: string; run?: string; uses?: string }>;
type Job = Readonly<{
  needs: readonly string[];
  permissions: Readonly<Record<string, string>>;
  steps: readonly Step[];
}>;
type Workflow = Readonly<{
  permissions: Readonly<Record<string, string>>;
  jobs: ReadonlyMap<string, Job>;
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

function parseWorkflow(workflow: string): Workflow {
  const jobs = new Map<
    string,
    { needs: string[]; permissions: Record<string, string>; steps: Step[] }
  >();
  const topLevelPermissions: Record<string, string> = {};
  let activeJob:
    | { needs: string[]; permissions: Record<string, string>; steps: Step[] }
    | undefined;
  let activeStep: { name: string; run?: string; uses?: string } | undefined;
  let parsingPermissions = false;
  let parsingTopLevelPermissions = false;
  let parsingJobs = false;

  const lines = workflow.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!parsingJobs) {
      if (line === 'permissions:') {
        parsingTopLevelPermissions = true;
        continue;
      }
      if (parsingTopLevelPermissions) {
        const permissionMatch = line.match(/^\s{2}([a-z-]+): (.+)$/);
        if (permissionMatch) {
          topLevelPermissions[permissionMatch[1]!] = permissionMatch[2]!;
          continue;
        }
        parsingTopLevelPermissions = false;
      }
      if (line === 'jobs:') {
        parsingJobs = true;
      }
      continue;
    }
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
  return { permissions: topLevelPermissions, jobs };
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

function hasExactRunLine(step: Step, line: string): boolean {
  return (step.run ?? '').split('\n').some((candidate) => candidate === line);
}

function requiredRunBlock(step: Step, lines: readonly string[]): void {
  expect(step.run, `unexpected ${step.name} run block`).toBe(lines.join('\n'));
}

function replaceWorkflowFragment(
  workflow: string,
  expected: string,
  replacement: string,
): string {
  const usesCrLf = workflow.includes('\r\n');
  const normalizedWorkflow = workflow.replaceAll('\r\n', '\n');
  const normalizedExpected = expected.replaceAll('\r\n', '\n');
  const normalizedReplacement = replacement.replaceAll('\r\n', '\n');
  const fragments = normalizedWorkflow.split(normalizedExpected);
  if (fragments.length !== 2) {
    throw new Error('Expected exactly one workflow fragment to mutate');
  }
  const mutated = fragments.join(normalizedReplacement);
  return usesCrLf ? mutated.replaceAll('\n', '\r\n') : mutated;
}

function orderedCommands(job: Job, commands: readonly string[]): void {
  let previous = { step: -1, line: -1 };
  for (const command of commands) {
    let current: { step: number; line: number } | undefined;
    for (const [stepIndex, step] of job.steps.entries()) {
      for (const [lineIndex, line] of (step.run ?? '').split('\n').entries()) {
        const candidate = line.trim();
        const matches = candidate === command;
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
  const parsedWorkflow = parseWorkflow(workflow);
  const jobs = parsedWorkflow.jobs;
  expect(parsedWorkflow.permissions).toEqual({ contents: 'read' });
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
    'npm run build:manifest > artifacts/build-manifest-first.txt',
  ]);
  const firstBuild = requiredStep(verify, 'Build first clean static tree');
  const secondBuild = requiredStep(verify, 'Build second clean static tree');
  const compareBuilds = requiredStep(
    verify,
    'Compare deterministic build manifests',
  );
  requiredRunBlock(firstBuild, [
    'rm -rf dist/sites',
    'npm run build',
    'mkdir -p artifacts',
    'npm run build:manifest > artifacts/build-manifest-first.txt',
  ]);
  requiredRunBlock(secondBuild, [
    'rm -rf dist/sites',
    'npm run build',
    'npm run build:manifest > artifacts/build-manifest-second.txt',
  ]);
  expect(compareBuilds.run).toBe(
    'cmp artifacts/build-manifest-first.txt artifacts/build-manifest-second.txt',
  );
  expect(verify.steps.indexOf(secondBuild)).toBeGreaterThan(
    verify.steps.indexOf(firstBuild),
  );
  expect(verify.steps.indexOf(compareBuilds)).toBeGreaterThan(
    verify.steps.indexOf(secondBuild),
  );
}

function assertDeployContract(workflow: string): void {
  const jobs = parseWorkflow(workflow).jobs;
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
    'npm run build:manifest | tee artifacts/pages-build-manifest.txt',
  ]);
  expect(
    build.steps.findIndex((step) => step.uses === 'actions/configure-pages@v5'),
  ).toBeGreaterThan(
    build.steps.findIndex((step) =>
      hasExactRunLine(
        step,
        'npm run build:manifest | tee artifacts/pages-build-manifest.txt',
      ),
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
  );
  requiredRunBlock(health, [
    'home_document="$(mktemp)"',
    'video_document="$(mktemp)"',
    'moment_document="$(mktemp)"',
    'trap \'rm -f "$home_document" "$video_document" "$moment_document"\' EXIT',
    'curl --fail --show-error --silent --location \\',
    `  '${publicRoutes[0]}' \\`,
    '  > "$home_document"',
    'curl --fail --show-error --silent --location \\',
    `  '${publicRoutes[1]}' \\`,
    '  > "$video_document"',
    'curl --fail --show-error --silent --location \\',
    `  '${publicRoutes[2]}' \\`,
    '  > "$moment_document"',
    `source_timestamp='${sourceTimestamp}'`,
    'grep --fixed-strings -- "$source_timestamp" "$video_document"',
    'grep --fixed-strings -- "$source_timestamp" "$moment_document"',
  ]);
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
        replaceWorkflowFragment(
          deployWorkflow,
          '  public-health:\n    needs: deploy',
          '  public-health:\n    needs: build',
        ),
      ),
    ).toThrow();
  });

  it('rejects a focused source-rights gate ordered before collection', () => {
    expect(() =>
      assertDeployContract(
        replaceWorkflowFragment(
          deployWorkflow,
          `      - name: Collect controlled and pinned-source evidence\n        run: ${genericCollection}\n      - name: Validate AI Moment Index controlled fixture and source rights\n        run: ${focusedSourceRightsTest}`,
          `      - name: Validate AI Moment Index controlled fixture and source rights\n        run: ${focusedSourceRightsTest}\n      - name: Collect controlled and pinned-source evidence\n        run: ${genericCollection}`,
        ),
      ),
    ).toThrow();
  });

  it('rejects a suffixed evidence verification command', () => {
    expect(() =>
      assertDeployContract(
        deployWorkflow.replace(
          'run: npm run evidence -- verify --all',
          'run: npm run evidence -- verify --all --unsafe-suffix',
        ),
      ),
    ).toThrow();
  });

  it('rejects a changed top-level verification permission', () => {
    expect(() =>
      assertVerifyContract(
        verifyWorkflow.replace('contents: read', 'contents: write'),
      ),
    ).toThrow();
  });

  it('rejects a missing top-level verification permission', () => {
    expect(() =>
      assertVerifyContract(
        replaceWorkflowFragment(
          verifyWorkflow,
          'permissions:\n  contents: read\n\njobs:',
          'jobs:',
        ),
      ),
    ).toThrow();
  });

  it('rejects a second deterministic build without a clean output reset', () => {
    expect(() =>
      assertVerifyContract(
        replaceWorkflowFragment(
          verifyWorkflow,
          '      - name: Build second clean static tree\n        shell: bash\n        run: |\n          rm -rf dist/sites\n',
          '      - name: Build second clean static tree\n        shell: bash\n        run: |\n',
        ),
      ),
    ).toThrow();
  });

  it('rejects a second deterministic build ordered before the first', () => {
    const firstStart = verifyWorkflow.indexOf(
      '      - name: Build first clean static tree',
    );
    const secondStart = verifyWorkflow.indexOf(
      '      - name: Build second clean static tree',
    );
    const compareStart = verifyWorkflow.indexOf(
      '      - name: Compare deterministic build manifests',
    );
    const reordered =
      verifyWorkflow.slice(0, firstStart) +
      verifyWorkflow.slice(secondStart, compareStart) +
      verifyWorkflow.slice(firstStart, secondStart) +
      verifyWorkflow.slice(compareStart);

    expect(() => assertVerifyContract(reordered)).toThrow();
  });

  it('rejects aliased public-health temporary documents', () => {
    expect(() =>
      assertDeployContract(
        deployWorkflow.replace(
          'moment_document="$(mktemp)"',
          'moment_document="$video_document"',
        ),
      ),
    ).toThrow();
  });

  it('rejects multiple public routes redirected to one document', () => {
    expect(() =>
      assertDeployContract(
        deployWorkflow.replace('> "$moment_document"', '> "$video_document"'),
      ),
    ).toThrow();
  });

  it('rejects a home health fetch that permits HTTP errors', () => {
    expect(() =>
      assertDeployContract(
        replaceWorkflowFragment(
          deployWorkflow,
          "curl --fail --show-error --silent --location \\\n            'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/'",
          "curl --show-error --silent --location \\\n            'https://tylerkoster.github.io/receipt-portfolio/video-moment-search/'",
        ),
      ),
    ).toThrow();
  });
});
