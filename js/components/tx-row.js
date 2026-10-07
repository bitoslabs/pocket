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
  fmtSats,
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
  const pending = (store.get('sync')?.pendingIds || []).includes(`transaction:${tx.id}`);
  const context = txContextLabel(tx);
  const asset = tx.assetId ? assetLabel(tx.assetId) : '';
  const title = isInvestment(tx) && asset ? `${asset} ${t('tx.investment')}` : meta.label;
  const primary = txAmountText(tx);

  // Secondary line always shows the "other" side, matching the original row:
  // fiat/sats records show their fiat equivalent, native-currency records show
  // the sats equivalent (exact from an asset quantity when available, else at
  // the current rate). Never a duplicate of the primary amount.
  let secondary = '';
  const qty = Number(tx.assetQuantity) || 0;
  const assetRec = tx.assetId ? (store.get('assets') || []).find((a) => a.id === tx.assetId) : null;

  if (tx.unit && tx.unit !== 'SATS') {
    // Prefer the snapshot taken at entry; fall back to the recorded quantity
    // or the current rate for older records without one.
    let sats = Number(tx.satsAmount) || 0;
    const isBitcoin = assetRec?.subtype === 'bitcoin' || assetRec?.symbol === 'BTC';
    if (!sats && qty > 0 && isBitcoin) {
      sats = qty * 1e8; // exact: the sats actually acquired/sold
    }
    if (!sats && tx.unit === 'BTC') {
      sats = (Number(tx.amount) || 0) * 1e8;
    }
    if (!sats) {
      sats = priceService.fiatToSats(Math.abs(Number(tx.amount) || 0), tx.unit);
    }
    if (sats > 0) {
      secondary = `${fmtSats(Math.round(sats))} ${t('common.sats')}`;
    } else if (qty > 0) {
      const symbol = assetRec?.symbol || assetRec?.name || asset || '';
      secondary = `${qty.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${symbol}`.trim();
    }
  } else if (priceService.showFiat) {
    const fiat = priceService.fiatFor(tx);
    if (fiat && fiat !== primary) secondary = fiat;
  }

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
      span({ class: 'tx-sats' }, `${SIGN[dir]}${primary}`),
      secondary ? span({ class: 'tx-fiat' }, secondary) : null
    )
  );
}

export default txRow;
