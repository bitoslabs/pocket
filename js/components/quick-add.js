/**
 * Quick Add - action sheet (journal entry / log money)
 *
 * VanJS view: rows are built with `van.tags` and use inline click handlers.
 *
 * @module components/quick-add
 */

import { modal } from './modal.js';
import { t } from '../core/i18n.js';
import { Icons } from '../utils/icons.js';
import { openComposer } from './journal-composer.js';
import { openTxModal } from './tx-modal.js';
import van from '../vendor/van.js';

const { b, button, div, span } = van.tags;

const ROWS = [
  {
    choice: 'compose',
    icon: 'edit',
    bg: 'var(--accent-soft)',
    fg: 'var(--accent-2)',
    titleKey: 'quickAdd.journalTitle',
    subKey: 'quickAdd.journalSub',
  },
  {
    choice: 'out',
    icon: 'upRight',
    bg: 'var(--out-soft)',
    fg: 'var(--out)',
    titleKey: 'quickAdd.expenseTitle',
    subKey: 'quickAdd.expenseSub',
  },
  {
    choice: 'in',
    icon: 'downLeft',
    bg: 'var(--in-soft)',
    fg: 'var(--in)',
    titleKey: 'quickAdd.incomeTitle',
    subKey: 'quickAdd.incomeSub',
  },
  {
    choice: 'invest',
    icon: 'trending',
    bg: 'var(--accent-soft)',
    fg: 'var(--accent-2)',
    titleKey: 'quickAdd.investTitle',
    subKey: 'quickAdd.investSub',
  },
  {
    choice: 'transfer',
    icon: 'swap',
    bg: 'var(--accent-soft)',
    fg: 'var(--accent-2)',
    titleKey: 'quickAdd.transferTitle',
    subKey: 'quickAdd.transferSub',
  },
];

export function openQuickAdd() {
  const choose = (choice) => {
    modal.close();
    if (choice === 'compose') openComposer();
    else openTxModal({ dir: choice });
  };

  const content = div(
    { style: 'margin-top:8px' },
    ROWS.map((row) =>
      button(
        { class: 'qa-row', 'data-choice': row.choice, onclick: () => choose(row.choice) },
        span({
          class: 'qa-ic ic',
          style: `background:${row.bg};color:${row.fg}`,
          innerHTML: Icons[row.icon],
        }),
        span(b(t(row.titleKey)), span(t(row.subKey)))
      )
    )
  );

  modal.open({ title: t('quickAdd.title'), content });
}

export default openQuickAdd;
