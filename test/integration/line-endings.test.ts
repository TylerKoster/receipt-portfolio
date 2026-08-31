import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repository line-ending policy', () => {
  it('checks text files out with the LF endings required by the aggregate formatter', () => {
    const attributes = readFileSync(
      new URL('../../.gitattributes', import.meta.url),
      'utf8',
    );

    expect(attributes.split(/\r?\n/u)).toContain('* text=auto eol=lf');
  });
});
