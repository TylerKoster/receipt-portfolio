import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  countCompletedWorksheetSteps,
  initializeInvestigationWorksheet,
} from './investigation-worksheet.js';

class FakeControl {
  value = '';
  textContent = '';
  focused = false;
  disabled = true;
  private listeners = new Map<string, () => void>();

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }

  dispatch(type: string) {
    this.listeners.get(type)?.();
  }

  focus() {
    this.focused = true;
  }
}

function step(...fields: FakeControl[]) {
  return {
    querySelectorAll: (selector: string) =>
      selector === '[data-worksheet-field]' ? fields : [],
  };
}

describe('Search Receipt investigation worksheet client', () => {
  it('counts only complete local worksheet sections', () => {
    const first = new FakeControl();
    const second = new FakeControl();
    const third = new FakeControl();
    first.value = '2026-08-31T03:00';
    second.value = 'Official source observation';

    expect(
      countCompletedWorksheetSteps([step(first, second), step(third)]),
    ).toBe(1);
    third.value = 'Own-site evidence';
    expect(
      countCompletedWorksheetSteps([step(first, second), step(third)]),
    ).toBe(2);
  });

  it('updates progress, clears local input, and delegates printing without storage or network', () => {
    const first = new FakeControl();
    const second = new FakeControl();
    const status = new FakeControl();
    const clear = new FakeControl();
    const print = new FakeControl();
    const form = new FakeControl() as FakeControl & { reset: () => void };
    form.reset = () => {
      first.value = '';
      second.value = '';
    };
    const steps = [step(first), step(second)];
    const root = {
      dataset: {} as Record<string, string>,
      querySelector: (selector: string) =>
        ({
          '[data-worksheet-form]': form,
          '[data-worksheet-status]': status,
          '[data-worksheet-clear]': clear,
          '[data-worksheet-print]': print,
          '[data-worksheet-field]': first,
        })[selector] ?? null,
      querySelectorAll: (selector: string) =>
        selector === '[data-worksheet-step]' ? steps : [],
    };
    const printPage = vi.fn();

    expect(initializeInvestigationWorksheet(root as never, printPage)).toBe(
      true,
    );
    expect(status.textContent).toBe(
      '0 of 2 sections completed. Nothing is saved or sent.',
    );
    expect(clear.disabled).toBe(false);
    expect(print.disabled).toBe(false);
    first.value = 'Official observation';
    form.dispatch('input');
    expect(status.textContent).toBe(
      '1 of 2 sections completed. Nothing is saved or sent.',
    );
    clear.dispatch('click');
    expect(status.textContent).toBe(
      '0 of 2 sections completed. Nothing is saved or sent.',
    );
    expect(first.focused).toBe(true);
    print.dispatch('click');
    expect(printPage).toHaveBeenCalledOnce();

    const source = readFileSync(
      new URL('./investigation-worksheet.js', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie)\b/u,
    );
  });
});
