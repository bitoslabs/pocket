/**
 * Transaction Modal - log / edit income & expense
 *
 * VanJS view: direction, category, unit and the fiat preview are reactive
 * states, so the old manual `renderCats()` / `refreshSeg()` DOM patching is gone.
 * The amount/note inputs stay uncontrolled and are read on save.
 *
 * @module components/tx-modal
 */

import { modal } from './modal.js';
import { t, categoryLabel } from '../core/i18n.js';
import { zapService } from '../services/zap-service.js';
import { categoryService } from '../services/category-service.js';
import { priceService } from '../services/price-service.js';
import { entryPrefs } from '../services/entry-prefs.js';
import { Icons } from '../utils/icons.js';
import { categoryMeta, fmtSats, playFX, toast } from '../utils/ui.js';
import van from '../vendor/van.js';

const { button, div, input, span } = van.tags;

const DIR_TO_TYPE = { out: 'expense', in: 'income' };
const TYPE_TO_DIR = { expense: 'out', income: 'in' };

/**
 * @param {Object} opts
 * @param {Object|null} opts.tx - transaction to edit
 * @param {'in'|'out'} opts.dir - default direction for new transaction
 * @param {Function} opts.onSaved
 */
export function openTxModal({ tx = null, dir = 'out', onSaved = null } = {}) {
  const fiatOn = priceService.showFiat && priceService.hasRate(priceService.currency);
  const currency = priceService.currency;

  const dirState = van.state(tx ? TYPE_TO_DIR[tx.type] || 'out' : dir);
  const catState = van.state(tx?.category || entryPrefs.lastCategory(dir));
  const unitState = van.state(tx || !fiatOn ? 'sats' : entryPrefs.lastUnit());
  const previewState = van.state('');

  const catsFor = (d) => categoryService.getCategories(DIR_TO_TYPE[d]);

  const amtInput = input({
    id: 'txAmt',
    type: 'number',
    min: '0',
    inputmode: 'decimal',
    placeholder: '0',
    autocomplete: 'off',
    value: tx?.amount || '',
    oninput: () => renderFiatPreview(),
  });

  const noteInput = input({
    id: 'txNote',
    class: 'note-input',
    style: 'margin-top:12px',
    placeholder: t('tx.notePlaceholder'),
    maxlength: '80',
    autocomplete: 'off',
    value: tx?.description || '',
  });

  const amountToSats = () => {
    const v = parseFloat(amtInput.value);
    if (!(v > 0)) return 0;
    return unitState.val === 'fiat' ? priceService.fiatToSats(v) : Math.round(v);
  };

  function renderFiatPreview() {
    if (!fiatOn) return;
    const v = parseFloat(amtInput.value);
    if (!(v > 0)) {
      previewState.val = '';
      return;
    }
    const sats = unitState.val === 'fiat' ? priceService.fiatToSats(v) : Math.round(v);
    const fiat = unitState.val === 'fiat' ? v : priceService.satsToFiat(v);
    previewState.val =
      sats > 0 && fiat > 0
        ? `${fmtSats(sats)} ${t('common.sats')} ~ ${priceService.formatAmount(fiat, currency)}`
        : '';
  }

  const setUnit = (next) => {
    if (!fiatOn || next === unitState.val) return;
    const v = parseFloat(amtInput.value);
    if (v > 0) {
      amtInput.value =
        next === 'fiat'
          ? priceService.satsToFiat(v).toFixed(2)
          : priceService.fiatToSats(v);
    }
    unitState.val = next;
    entryPrefs.setUnit(next);
    renderFiatPreview();
  };

  const segBtn = (d, id, icon, labelKey) =>
    button(
      {
        type: 'button',
        id,
        class: () => (dirState.val === d ? (d === 'out' ? 'on-out' : 'on-in') : ''),
        onclick: () => {
          dirState.val = d;
          catState.val = entryPrefs.lastCategory(d);
        },
      },
      span({ class: 'ic', innerHTML: Icons[icon] }),
      t(labelKey)
    );

  const unitToggle = fiatOn
    ? button(
        {
          type: 'button',
          class: 'unit-toggle',
          id: 'txUnit',
          'aria-label': t('tx.switchUnit'),
          onclick: (e) => {
            const s = e.target.closest('span[data-unit]');
            setUnit(s ? s.dataset.unit : unitState.val === 'sats' ? 'fiat' : 'sats');
          },
        },
        span(
          { 'data-unit': 'sats', class: () => (unitState.val === 'sats' ? 'on' : '') },
          t('common.sats')
        ),
        span(
          { 'data-unit': 'fiat', class: () => (unitState.val === 'fiat' ? 'on' : '') },
          currency
        )
      )
    : span(t('common.sats'));

  const currentCat = () => {
    const cats = catsFor(dirState.val);
    const sel = catState.val;
    return sel && cats.some((c) => c.id === sel) ? sel : cats[0]?.id || 'other';
  };

  const catsEl = div({ class: 'cat-chips', id: 'txCats' });
  van.derive(() => {
    const cats = catsFor(dirState.val);
    const sel = currentCat();
    catsEl.replaceChildren();
    van.add(
      catsEl,
      cats.map((c) => {
        const meta = categoryMeta(c.id);
        const on = sel === c.id;
        return button(
          {
            type: 'button',
            class: `cat-chip ${on ? 'on' : ''}`,
            style: `--cc:${meta.color}`,
            'data-cat': c.id,
            'aria-pressed': String(on),
            onclick: () => {
              catState.val = c.id;
              entryPrefs.setCategory(dirState.val, c.id);
            },
          },
          span({
            class: 'ic',
            style: `color:${meta.color}`,
            innerHTML: Icons[meta.icon] || Icons.file,
          }),
          categoryLabel(c.id, c.name || meta.label)
        );
      })
    );
  });

  const content = div(
    { class: 'tx-modal' },
    div(
      { class: 'seg', style: 'margin-top:8px' },
      segBtn('out', 'txSegOut', 'upRight', 'tx.expense'),
      segBtn('in', 'txSegIn', 'downLeft', 'tx.income')
    ),
    div({ class: 'amt-line' }, amtInput, unitToggle),
    fiatOn ? div({ class: 'fiat-preview', id: 'txFiatPreview' }, () => previewState.val) : null,
    catsEl,
    noteInput
  );

  const actions = [];
  if (tx) {
    actions.push({
      label: t('common.delete'),
      variant: 'btn-danger',
      closeOnClick: false,
      handler: async () => {
        await zapService.deleteTransaction(tx.id);
        toast(t('tx.transactionDeleted'));
        modal.close();
        onSaved?.();
      },
    });
  }
  actions.push({
    label: t('common.save'),
    variant: 'btn-primary',
    closeOnClick: false,
    handler: async () => {
      const amt = amountToSats();
      if (!amt || amt < 1) {
        toast(t('tx.enterAmount'), 'error');
        return false;
      }
      const note = noteInput.value.trim();
      const type = DIR_TO_TYPE[dirState.val];
      const cat = currentCat();

      // Snapshot the fiat value at the time of entry (when shown)
      let fiatAmount;
      if (fiatOn) {
        const v = parseFloat(amtInput.value);
        fiatAmount = unitState.val === 'fiat' && v > 0 ? v : priceService.satsToFiat(amt);
      }

      const payload = { type, category: cat, amount: amt, description: note };
      if (fiatOn && Number.isFinite(fiatAmount)) {
        payload.fiatAmount = fiatAmount;
        payload.currency = currency;
      }

      try {
        if (tx) {
          await zapService.updateTransaction(tx.id, payload);
          toast(t('tx.transactionUpdated'));
        } else {
          const created = await zapService.createManualTransaction(payload);
          if (type === 'income' || cat === 'tips' || cat === 'zaps') {
            playFX(amt, type === 'income');
          }
          toast(
            (type === 'income' ? t('tx.incomeLogged') : t('tx.expenseLogged')) +
              fmtSats(amt) +
              ' ' +
              t('common.sats'),
            'success'
          );
          modal.close();
          onSaved?.(created);
          return false;
        }
        modal.close();
        onSaved?.();
      } catch (err) {
        toast(err.message || t('tx.couldNotSave'), 'error');
      }
      return false;
    },
  });

  modal.open({
    title: tx
      ? t('tx.editTitle')
      : dirState.val === 'in'
      ? t('tx.logIncome')
      : t('tx.logExpense'),
    content,
    actions,
  });

  setTimeout(() => amtInput?.focus(), 320);
}

export default openTxModal;
