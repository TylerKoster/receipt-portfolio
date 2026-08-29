import { describe, expect, it } from 'vitest';
import { EVIDENCE_SCHEMA_VERSION } from '../src/index.js';

describe('workspace contract', () => {
  it('exports the first evidence schema version', () => {
    expect(EVIDENCE_SCHEMA_VERSION).toBe('1.0.0');
  });
});
