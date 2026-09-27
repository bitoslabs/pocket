/**
 * Quick Add - action sheet (journal entry / log money)
 *
 * @module components/quick-add
 */

import { modal } from './modal.js';
import { Icons } from '../utils/icons.js';
import { openComposer } from './journal-composer.js';
import { openTxModal } from './tx-modal.js';

export function openQuickAdd() {
  const content = document.createElement('div');
  content.style.marginTop = '8px';
  content.innerHTML = `
    <button class="qa-row" data-choice="compose">
      <span class="qa-ic ic" style="background:var(--accent-soft);color:var(--accent-2)">${Icons.edit}</span>
      <span><b>Journal entry</b><span>How was today? Private, just for you</span></span>
    </button>
    <button class="qa-row" data-choice="out">
      <span class="qa-ic ic" style="background:var(--out-soft);color:var(--out)">${Icons.upRight}</span>
      <span><b>Log expense</b><span>Money out — food, zaps, bills…</span></span>
    </button>
    <button class="qa-row" data-choice="in">
      <span class="qa-ic ic" style="background:var(--in-soft);color:var(--in)">${Icons.downLeft}</span>
      <span><b>Log income</b><span>Money in — salary, zaps received…</span></span>
    </button>
  `;

  content.addEventListener('click', (e) => {
    const row = e.target.closest('[data-choice]');
    if (!row) return;
    const choice = row.dataset.choice;
    modal.close();
    if (choice === 'compose') openComposer();
    else openTxModal({ dir: choice });
  });

  modal.open({ title: 'Quick add', content });
}

export default openQuickAdd;
