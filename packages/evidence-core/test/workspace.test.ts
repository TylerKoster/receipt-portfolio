import { describe, expect, it } from 'vitest';
import { EVIDENCE_SCHEMA_VERSION } from '../src/index.js';

describe('workspace contract', () => {
  it('exports the strict object-bound evidence schema version', () => {
    expect(EVIDENCE_SCHEMA_VERSION).toBe('2.0.0');
  });
});
