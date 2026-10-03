/**
 * Transaction Row - shared VanJS ledger row
 *
 * The VanJS replacement for the `txRowHtml()` string builder. Text is inserted
 * as text nodes by `van.tags`, so descriptions/labels are escaped automatically.
 *
 * @module components/tx-row
 */

import { t } from '../core/i18n.js';
import { store } from '../core/state.js';
import { priceService } from '../services/price-service.js';
import { amountOf, categoryIconHtml, categoryMeta, fmtSats, fmtTime, isIncome } from '../utils/ui.js';
import van from '../vendor/van.js';

const { b, button, div, i, span } = van.tags;

/**
 * Build a ledger row element.
 * @param {Object} tx - transaction record
 * @param {Set<string>|null} [linkedIds] - ids linked to a journal entry
 * @returns {HTMLElement}
 */
export function txRow(tx, linkedIds = null) {
  const meta = categoryMeta(tx.category);
  const income = isIncome(tx);
  const dir = income ? 'in' : 'out';
  const linked = linkedIds && linkedIds.has(tx.id);
  const fiat = priceService.showFiat ? priceService.fiatFor(tx) : '';
  const pending = (store.get('sync')?.pendingIds || []).includes(`transaction:${tx.id}`);

  return button(
    { class: 'tx', 'data-action': 'edit-tx', 'data-id': tx.id },
    span(
      { class: 'tx-ic', style: `background:${meta.color}1F` },
      span({
        class: 'ic',
        style: `color:${meta.color}`,
        innerHTML: categoryIconHtml(meta),
      })
    ),
    div(
      { class: 'tx-body' },
      pending
        ? b(tx.description || meta.label, ' ', i({ class: 'tx-pending', title: 'Waiting to sync' }))
        : b(tx.description || meta.label),
      linked
        ? span(
            `${meta.label} · ${fmtTime(tx.created_at)} · `,
            i({ class: 'tx-link' }, `✎ ${t('journal.title')}`)
          )
        : span(`${meta.label} · ${fmtTime(tx.created_at)}`)
    ),
    span(
      { class: `tx-amt ${dir}` },
      span({ class: 'tx-sats' }, `${income ? '+' : '−'}${fmtSats(amountOf(tx))}`),
      fiat ? span({ class: 'tx-fiat' }, fiat) : null
    )
  );
}

export default txRow;
