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
import {
  assetLabel,
  categoryIconHtml,
  fmtTime,
  isInvestment,
  txAmountText,
  txContextLabel,
  txDirection,
  txMeta,
} from '../utils/ui.js';
import van from '../vendor/van.js';

const { b, button, div, i, span } = van.tags;

const SIGN = { in: '+', out: '−', neutral: '' };

/**
 * Build a ledger row element.
 * @param {Object} tx - transaction record
 * @param {Set<string>|null} [linkedIds] - ids linked to a journal entry
 * @returns {HTMLElement}
 */
export function txRow(tx, linkedIds = null) {
  const meta = txMeta(tx);
  const dir = txDirection(tx);
  const linked = linkedIds && linkedIds.has(tx.id);
  const fiat = priceService.showFiat ? priceService.fiatFor(tx) : '';
  const pending = (store.get('sync')?.pendingIds || []).includes(`transaction:${tx.id}`);
  const context = txContextLabel(tx);
  const asset = tx.assetId ? assetLabel(tx.assetId) : '';
  const title = isInvestment(tx) && asset ? `${asset} ${t('tx.investment')}` : meta.label;

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
        ? b(tx.description || title, ' ', i({ class: 'tx-pending', title: 'Waiting to sync' }))
        : b(tx.description || title),
      linked
        ? span(
            `${meta.label} · ${fmtTime(tx.created_at)} · `,
            i({ class: 'tx-link' }, `✎ ${t('journal.title')}`)
          )
        : span(context ? `${context} · ${fmtTime(tx.created_at)}` : `${meta.label} · ${fmtTime(tx.created_at)}`)
    ),
    span(
      { class: `tx-amt ${dir}` },
      span({ class: 'tx-sats' }, `${SIGN[dir]}${txAmountText(tx)}`),
      fiat ? span({ class: 'tx-fiat' }, fiat) : null
    )
  );
}

export default txRow;
