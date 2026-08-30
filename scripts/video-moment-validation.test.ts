import { describe, expect, it } from 'vitest';
import {
  validateBrowserJourneyFacts,
  validateLiveSourceFacts,
  playwrightCliInvocation,
  playwrightPageFunction,
  type BrowserJourneyFacts,
  type LiveSourceFacts,
} from './video-moment-validation.js';

const sourceUrl =
  'https://upload.wikimedia.org/wikipedia/commons/transcoded/4/47/How_can_we_keep_robots_under_control.webm/How_can_we_keep_robots_under_control.webm.240p.vp9.webm';
const timestampUrl = `${sourceUrl}#t=132`;

const liveFacts: LiveSourceFacts = {
  status: 206,
  finalUrl: sourceUrl,
  contentType: 'video/webm',
  acceptRanges: 'bytes',
  contentLength: '1',
  contentRange: 'bytes 0-0/24788866',
};

const browserFacts: BrowserJourneyFacts = {
  query: 'robots control',
  visibleResultCount: 1,
  firstMomentId: 'moment-robots-control',
  anchorHref: timestampUrl,
  activatedBy: 'normal-anchor-click',
  locationHref: timestampUrl,
  currentSrc: timestampUrl,
  currentTime: 132,
  duration: 907.299,
  seeking: false,
  readyState: 4,
  paused: true,
  error: null,
  videoWidth: 427,
  videoHeight: 240,
  mediaResponseStatus: 206,
  mediaResponseContentRange: 'bytes 3801088-24788865/24788866',
  mediaResponseAcceptRanges: 'bytes',
  mediaResponseContentType: 'video/webm',
};

describe('AI Moment Index bounded live validation', () => {
  it('launches the Windows npx JavaScript entry point without cmd shell quoting', () => {
    expect(
      playwrightCliInvocation('win32', 'C:\\Program Files\\nodejs\\node.exe'),
    ).toEqual({
      executable: 'C:\\Program Files\\nodejs\\node.exe',
      leadingArguments: [
        'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js',
      ],
    });
  });

  it('wraps browser commands in the page function required by playwright-cli', () => {
    expect(playwrightPageFunction('return page.url();')).toBe(
      'async (page) => { return page.url(); }',
    );
  });

  it('accepts only the exact one-byte Wikimedia source response', () => {
    expect(validateLiveSourceFacts(liveFacts)).toEqual({
      ok: true,
      diagnostics: [],
    });
  });

  it('rejects source response drift instead of treating reachability as rights evidence', () => {
    expect(
      validateLiveSourceFacts({
        ...liveFacts,
        contentType: 'text/html',
        contentRange: 'bytes 0-0/24788865',
      }),
    ).toEqual({
      ok: false,
      diagnostics: [
        'LIVE_SOURCE_CONTENT_RANGE_MISMATCH',
        'LIVE_SOURCE_CONTENT_TYPE_MISMATCH',
      ],
    });
  });

  it('accepts the normal-anchor Chromium journey at second 132 within tolerance', () => {
    expect(validateBrowserJourneyFacts(browserFacts, 1)).toEqual({
      ok: true,
      diagnostics: [],
    });
  });

  it('rejects programmatic or out-of-tolerance browser observations', () => {
    expect(
      validateBrowserJourneyFacts(
        {
          ...browserFacts,
          activatedBy: 'programmatic-currentTime',
          currentTime: 134,
        },
        1,
      ),
    ).toEqual({
      ok: false,
      diagnostics: [
        'BROWSER_ACTIVATION_NOT_NORMAL_ANCHOR',
        'BROWSER_TIMESTAMP_OUT_OF_TOLERANCE',
      ],
    });
  });

  it('rejects a browser destination without the expected partial media response', () => {
    expect(
      validateBrowserJourneyFacts({
        ...browserFacts,
        mediaResponseStatus: 200,
        mediaResponseContentRange: null,
      }),
    ).toEqual({
      ok: false,
      diagnostics: [
        'BROWSER_MEDIA_CONTENT_RANGE_MISMATCH',
        'BROWSER_MEDIA_RESPONSE_STATUS_MISMATCH',
      ],
    });
  });
});
