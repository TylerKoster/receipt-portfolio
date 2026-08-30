import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  validateBrowserJourneyFacts,
  validatePlaywrightCliPackage,
  playwrightCliInvocation,
  playwrightPageFunction,
  VIDEO_MOMENT_QUERY,
  type BrowserJourneyFacts,
} from './video-moment-validation.js';

const BROWSER_LIVE_ENV = 'AI_MOMENT_BROWSER_LIVE_CHECK';
const SESSION = `ai-moment-index-${process.pid}`;

function projectRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const parent = dirname(moduleDirectory);
  return parent.endsWith(`${join('dist', 'runtime')}`)
    ? dirname(dirname(parent))
    : dirname(moduleDirectory);
}

function cli(cwd: string, ...args: readonly string[]): Promise<string> {
  const invocation = playwrightCliInvocation(
    process.platform,
    process.execPath,
    projectRoot(),
  );
  return new Promise((resolveOutput, reject) => {
    const child = spawn(
      invocation.executable,
      [
        ...invocation.leadingArguments,
        '--session',
        SESSION,
        ...args,
      ],
      { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolveOutput(stdout);
      else reject(new Error(`playwright-cli exit ${String(code)}: ${stderr || stdout}`));
    });
  });
}

async function verifyPinnedPlaywrightCli(): Promise<void> {
  const packageJson = JSON.parse(
    await readFile(
      resolve(
        projectRoot(),
        'node_modules',
        '@playwright',
        'cli',
        'package.json',
      ),
      'utf8',
    ),
  ) as unknown;
  const validation = validatePlaywrightCliPackage(packageJson);
  if (!validation.ok) {
    throw new Error(validation.diagnostics.join(','));
  }
}

function markedJson(output: string, marker: string): Record<string, unknown> {
  const start = output.indexOf(marker);
  if (start < 0) throw new Error(`Missing browser evidence marker ${marker}`);
  const remainder = output.slice(start + marker.length);
  const end = remainder.indexOf('\n');
  const candidate = (end < 0 ? remainder : remainder.slice(0, end))
    .replace(/^['"`]|['"`]$/gu, '')
    .replace(/\\"/gu, '"');
  return JSON.parse(candidate) as Record<string, unknown>;
}

async function localServer(): Promise<{ server: Server; url: string }> {
  const routeRoot = resolve(projectRoot(), 'dist', 'sites', 'video-moment-search');
  const assets = new Map<string, readonly [string, string]>([
    ['/video-moment-search/', ['index.html', 'text/html; charset=utf-8']],
    [
      '/video-moment-search/search-index.json',
      ['search-index.json', 'application/json; charset=utf-8'],
    ],
    [
      '/video-moment-search/search-client.js',
      ['search-client.js', 'text/javascript; charset=utf-8'],
    ],
    ['/video-moment-search/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ]);
  const server = createServer(async (request, response) => {
    try {
      const asset = assets.get(request.url ?? '');
      if (request.method !== 'GET' || asset === undefined) {
        response.writeHead(404).end();
        return;
      }
      const path = resolve(routeRoot, asset[0]);
      if (dirname(path) !== routeRoot) throw new Error('Invalid asset path');
      response.writeHead(200, {
        'Content-Type': asset[1],
        'Cache-Control': 'no-store',
      });
      response.end(await readFile(path));
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message : 'error');
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('Local browser server did not bind a TCP port');
  return {
    server,
    url: `http://127.0.0.1:${address.port}/video-moment-search/`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

export async function checkVideoMomentBrowserJourney(): Promise<BrowserJourneyFacts> {
  if (process.env[BROWSER_LIVE_ENV] !== '1') {
    throw new Error(
      `${BROWSER_LIVE_ENV}=1 is required; this check opens the selected public media in Chromium`,
    );
  }
  await verifyPinnedPlaywrightCli();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'ai-moment-browser-'));
  const canonicalTemporary = await realpath(temporaryDirectory);
  if (dirname(canonicalTemporary) !== resolve(tmpdir())) {
    throw new Error('Unexpected browser temporary directory');
  }
  const { server, url } = await localServer();
  try {
    await cli(temporaryDirectory, 'open', url);
    await cli(temporaryDirectory, 'snapshot');
    const searchOutput = await cli(
      temporaryDirectory,
      'run-code',
      playwrightPageFunction(`const input = page.getByLabel('What explanation do you remember?'); await input.fill('${VIDEO_MOMENT_QUERY}'); await input.press('Enter'); const cards = page.locator('[data-client-results] article'); await cards.first().waitFor({ state: 'visible' }); const first = cards.first(); const anchor = first.getByRole('link'); return 'AI_MOMENT_SEARCH:' + JSON.stringify({ query: await input.inputValue(), visibleResultCount: await cards.count(), firstMomentId: await first.getAttribute('data-moment-id'), anchorHref: await anchor.getAttribute('href') });`),
    );
    const searchFacts = markedJson(searchOutput, 'AI_MOMENT_SEARCH:');
    const mediaOutput = await cli(
      temporaryDirectory,
      'run-code',
      playwrightPageFunction(`const anchor = page.locator('[data-client-results] article').first().getByRole('link'); const destination = await anchor.getAttribute('href'); if (!destination) throw new Error('missing destination'); const mediaResponses = []; page.on('response', (response) => { if (response.url().split('#', 1)[0] !== destination.split('#', 1)[0]) return; const headers = response.headers(); mediaResponses.push({ mediaResponseStatus: response.status(), mediaResponseContentRange: headers['content-range'] || null, mediaResponseAcceptRanges: headers['accept-ranges'] || null, mediaResponseContentType: headers['content-type'] || null }); }); await anchor.click(); const video = page.locator('video'); await video.waitFor({ state: 'attached', timeout: 60000 }); await video.evaluate((element) => element.pause()); await page.waitForFunction(() => { const element = document.querySelector('video'); return element && element.readyState >= 1; }, null, { timeout: 60000 }); await page.waitForFunction(() => { const element = document.querySelector('video'); return element && !element.seeking && element.readyState >= 2 && Math.abs(element.currentTime - 132) <= 2; }, null, { timeout: 15000 }).catch(() => undefined); await page.waitForTimeout(250); const partial = mediaResponses.findLast((response) => response.mediaResponseStatus === 206 && response.mediaResponseContentRange !== null) || mediaResponses.at(-1) || { mediaResponseStatus: 0, mediaResponseContentRange: null, mediaResponseAcceptRanges: null, mediaResponseContentType: null }; return 'AI_MOMENT_MEDIA:' + JSON.stringify({ ...(await video.evaluate((element) => ({ locationHref: location.href, currentSrc: element.currentSrc, currentTime: element.currentTime, duration: element.duration, seeking: element.seeking, readyState: element.readyState, paused: element.paused, error: element.error === null ? null : element.error.message, videoWidth: element.videoWidth, videoHeight: element.videoHeight }))), ...partial });`),
    );
    const mediaFacts = markedJson(mediaOutput, 'AI_MOMENT_MEDIA:');
    const facts = {
      ...searchFacts,
      ...mediaFacts,
      activatedBy: 'normal-anchor-click',
    } as unknown as BrowserJourneyFacts;
    const toleranceSeconds = 2;
    const validation = validateBrowserJourneyFacts(facts, toleranceSeconds);
    console.log(
      JSON.stringify({
        classification: 'OPT_IN_LIVE_CHROMIUM_BUILT_PAGE_JOURNEY',
        facts,
        method: {
          formActivation: 'Enter key',
          mediaActivation: 'normal Playwright locator click on ordinary anchor',
          programmaticCurrentTimeAssignment: false,
          savedMedia: false,
          savedCaptionsOrTranscript: false,
          savedScreenshotOrFrame: false,
          toleranceSeconds,
        },
        validation,
      }),
    );
    if (!validation.ok) throw new Error(validation.diagnostics.join(','));
    return facts;
  } finally {
    await cli(temporaryDirectory, 'close').catch(() => undefined);
    await closeServer(server);
    await rm(canonicalTemporary, { force: true, recursive: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkVideoMomentBrowserJourney().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
