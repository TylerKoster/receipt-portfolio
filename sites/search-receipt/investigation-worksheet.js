/* global document, window */

export function countCompletedWorksheetSteps(steps) {
  return steps.filter((step) => {
    const fields = Array.from(step.querySelectorAll('[data-worksheet-field]'));
    return (
      fields.length > 0 &&
      fields.every((field) => String(field.value ?? '').trim().length > 0)
    );
  }).length;
}

export function initializeInvestigationWorksheet(
  root = document.querySelector('[data-investigation-worksheet]'),
  printPage = () => window.print(),
) {
  if (!root || root.dataset.worksheetInitialized === 'true') return false;

  const form = root.querySelector('[data-worksheet-form]');
  const status = root.querySelector('[data-worksheet-status]');
  const clear = root.querySelector('[data-worksheet-clear]');
  const print = root.querySelector('[data-worksheet-print]');
  const steps = Array.from(root.querySelectorAll('[data-worksheet-step]'));
  if (!form || !status || !clear || !print || steps.length === 0) return false;

  const update = () => {
    status.textContent = `${countCompletedWorksheetSteps(steps)} of ${steps.length} sections completed. Nothing is saved or sent.`;
  };

  form.addEventListener('input', update);
  clear.addEventListener('click', () => {
    form.reset();
    update();
    root.querySelector('[data-worksheet-field]')?.focus();
  });
  print.addEventListener('click', printPage);
  clear.disabled = false;
  print.disabled = false;
  root.dataset.worksheetInitialized = 'true';
  update();
  return true;
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeInvestigationWorksheet();
  });
} else if (typeof document !== 'undefined') {
  initializeInvestigationWorksheet();
}
