import { describe, expect, it } from 'vitest';
import { skillLedgerSite } from '../sites/skill-ledger/index.js';
import { renderMethodology } from '../sites/shared/render.js';

describe('SkillLedger site copy', () => {
  it('states that absent static signals are not evidence of package safety', () => {
    expect(renderMethodology(skillLedgerSite)).toContain(
      'The absence of a recorded static-risk flag or declared dependency is not evidence that a package is safe.',
    );
  });

  it('labels static-risk flags as limited signals instead of a security assessment', () => {
    expect(renderMethodology(skillLedgerSite)).toContain(
      'Static-risk flags are limited signals, not a security assessment.',
    );
  });
});
