import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateLiveSourceFacts,
  VIDEO_MOMENT_SOURCE_URL,
  type LiveSourceFacts,
} from './video-moment-validation.js';

const LIVE_SOURCE_ENV = 'AI_MOMENT_SOURCE_LIVE_CHECK';

function projectRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const parent = dirname(moduleDirectory);
  return parent.endsWith(`${join('dist', 'runtime')}`)
    ? dirname(dirname(parent))
    : dirname(moduleDirectory);
}

async function evidenceSourceUrl(): Promise<string> {
  const evidence = JSON.parse(
    await readFile(
      resolve(
        projectRoot(),
        'fixtures',
        'video-moment-search',
        'video-source-evidence-manifest-v3.json',
      ),
      'utf8',
    ),
  ) as { records?: readonly { delivery?: { url?: unknown } }[] };
  const sourceUrl = evidence.records?.[0]?.delivery?.url;
  if (sourceUrl !== VIDEO_MOMENT_SOURCE_URL) {
    throw new Error('LIVE_SOURCE_EVIDENCE_URL_MISMATCH');
  }
  return sourceUrl;
}

export async function checkVideoMomentLiveSource(
  fetchImplementation: typeof fetch = fetch,
): Promise<LiveSourceFacts> {
  if (process.env[LIVE_SOURCE_ENV] !== '1') {
    throw new Error(
      `${LIVE_SOURCE_ENV}=1 is required; this check makes one opt-in public read-only request`,
    );
  }
  const sourceUrl = await evidenceSourceUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetchImplementation(sourceUrl, {
      method: 'GET',
      headers: {
        'Accept-Encoding': 'identity',
        Range: 'bytes=0-0',
      },
      redirect: 'error',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  await response.body?.cancel();
  const facts: LiveSourceFacts = {
    status: response.status,
    finalUrl: response.url,
    contentType: response.headers.get('content-type'),
    acceptRanges: response.headers.get('accept-ranges'),
    contentLength: response.headers.get('content-length'),
    contentRange: response.headers.get('content-range'),
  };
  const validation = validateLiveSourceFacts(facts);
  console.log(
    JSON.stringify({
      classification: 'OPT_IN_LIVE_READ_ONLY_REACHABILITY',
      request: {
        method: 'GET',
        range: 'bytes=0-0',
        redirects: 'error',
        responseBodyRead: false,
        responseBodySaved: false,
      },
      facts,
      validation,
    }),
  );
  if (!validation.ok) {
    throw new Error(validation.diagnostics.join(','));
  }
  return facts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkVideoMomentLiveSource().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
