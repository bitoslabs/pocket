/**
 * Transaction Modal - log / edit income & expense
 *
 * @module components/tx-modal
 */

import { modal } from './modal.js';
import { zapService } from '../services/zap-service.js';
import { categoryService } from '../services/category-service.js';
import { priceService } from '../services/price-service.js';
import { Icons } from '../utils/icons.js';
import { categoryMeta, fmtSats, playFX, toast } from '../utils/ui.js';

const DIR_TO_TYPE = { out: 'expense', in: 'income' };
const TYPE_TO_DIR = { expense: 'out', income: 'in' };

/**
 * @param {Object} opts
 * @param {Object|null} opts.tx - transaction to edit
 * @param {'in'|'out'} opts.dir - default direction for new transaction
 * @param {Function} opts.onSaved
 */
export function openTxModal({ tx = null, dir = 'out', onSaved = null } = {}) {
  const state = {
    dir,
    cat: null,
  };

  const fiatOn = priceService.showFiat && priceService.hasRate(priceService.currency);
  const currency = priceService.currency;

  const content = document.createElement('div');
  content.className = 'tx-modal';

  const segBtnCls = (d) =>
    state.dir === d ? (d === 'out' ? 'on-out' : 'on-in') : '';

  const catsFor = (d) => {
    const type = DIR_TO_TYPE[d];
    const cats = categoryService.getCategories(type);
    if (!state.cat || !cats.some((c) => c.id === state.cat)) {
      state.cat = cats[0]?.id || 'other';
    }
    return cats;
  };

  const renderCats = () => {
    const cats = catsFor(state.dir);
    content.querySelector('#txCats').innerHTML = cats
      .map((c) => {
        const meta = categoryMeta(c.id);
        return `<button type="button" class="cat-chip ${state.cat === c.id ? 'on' : ''}"
          style="--cc:${meta.color}" data-cat="${c.id}">
          <span class="ic" style="color:${meta.color}">${Icons[meta.icon] || Icons.file}</span>${c.name || meta.label}
        </button>`;
      })
      .join('');
  };

  content.innerHTML = `
    <div class="seg" style="margin-top:8px">
      <button type="button" id="txSegOut" class="${segBtnCls('out')}">
        <span class="ic">${Icons.upRight}</span>Expense
      </button>
      <button type="button" id="txSegIn" class="${segBtnCls('in')}">
        <span class="ic">${Icons.downLeft}</span>Income
      </button>
    </div>
    <div class="amt-line">
      <input id="txAmt" type="number" min="1" inputmode="numeric" placeholder="0" autocomplete="off" />
      <span>sats</span>
    </div>
    ${
      fiatOn
        ? `<div class="amt-line fiat-line">
             <input id="txFiat" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" autocomplete="off" />
             <span>${currency}</span>
           </div>`
        : ''
    }
    <div class="cat-chips" id="txCats"></div>
    <input id="txNote" class="note-input" style="margin-top:12px"
      placeholder="Note (optional) — e.g. Ramen with the crew" maxlength="80" autocomplete="off" />
  `;

  const satsInput = content.querySelector('#txAmt');
  const fiatInput = content.querySelector('#txFiat');

  if (tx) {
    state.dir = TYPE_TO_DIR[tx.type] || 'out';
    state.cat = tx.category || null;
    satsInput.value = tx.amount || '';
    content.querySelector('#txNote').value = tx.description || '';
    if (fiatInput && tx.fiatAmount !== undefined && tx.fiatAmount !== null) {
      fiatInput.value = tx.fiatAmount;
    }
  }

  // Two-way sats ⇄ fiat binding
  if (fiatOn && fiatInput) {
    const syncFromSats = () => {
      const sats = parseFloat(satsInput.value);
      fiatInput.value = Number.isFinite(sats) && sats > 0
        ? priceService.satsToFiat(sats).toFixed(2)
        : '';
    };
    const syncFromFiat = () => {
      const f = parseFloat(fiatInput.value);
      satsInput.value = Number.isFinite(f) && f > 0 ? priceService.fiatToSats(f) : '';
    };
    satsInput.addEventListener('input', syncFromSats);
    fiatInput.addEventListener('input', syncFromFiat);
    if (tx && (tx.fiatAmount === undefined || tx.fiatAmount === null) && satsInput.value) {
      syncFromSats();
    }
  }

  const refreshSeg = () => {
    content.querySelector('#txSegOut').className = segBtnCls('out');
    content.querySelector('#txSegIn').className = segBtnCls('in');
  };

  renderCats();
  refreshSeg();

  content.addEventListener('click', (e) => {
    const seg = e.target.closest('#txSegOut, #txSegIn');
    if (seg) {
      state.dir = seg.id === 'txSegIn' ? 'in' : 'out';
      state.cat = null;
      refreshSeg();
      renderCats();
      return;
    }
    const cat = e.target.closest('.cat-chip');
    if (cat) {
      state.cat = cat.dataset.cat;
      renderCats();
    }
  });

  const actions = [];
  if (tx) {
    actions.push({
      label: 'Delete',
      variant: 'btn-danger',
      closeOnClick: false,
      handler: async () => {
        await zapService.deleteTransaction(tx.id);
        toast('Transaction deleted');
        modal.close();
        onSaved?.();
      },
    });
  }
  actions.push({
    label: 'Save',
    variant: 'btn-primary',
    closeOnClick: false,
    handler: async () => {
      const amt = parseInt(satsInput.value, 10);
      if (!amt || amt < 1) {
        toast('Enter an amount first', 'error');
        return false;
      }
      const note = content.querySelector('#txNote').value.trim();
      const type = DIR_TO_TYPE[state.dir];

      // Snapshot the fiat value at the time of entry (when shown)
      let fiatAmount;
      if (fiatOn) {
        const f = fiatInput ? parseFloat(fiatInput.value) : NaN;
        fiatAmount = Number.isFinite(f) && f > 0 ? f : priceService.satsToFiat(amt);
      }

      const payload = { type, category: state.cat, amount: amt, description: note };
      if (fiatOn && Number.isFinite(fiatAmount)) {
        payload.fiatAmount = fiatAmount;
        payload.currency = currency;
      }

      try {
        if (tx) {
          await zapService.updateTransaction(tx.id, payload);
          toast('Transaction updated');
        } else {
          const created = await zapService.createManualTransaction(payload);
          if (type === 'income' || state.cat === 'tips' || state.cat === 'zaps') {
            playFX(amt, type === 'income');
          }
          toast(
            (type === 'income' ? 'Income logged +' : 'Expense logged −') + fmtSats(amt) + ' sats',
            'success'
          );
          modal.close();
          onSaved?.(created);
          return false;
        }
        modal.close();
        onSaved?.();
      } catch (err) {
        toast(err.message || 'Could not save transaction', 'error');
      }
      return false;
    },
  });

  modal.open({
    title: tx ? 'Edit transaction' : state.dir === 'in' ? 'Log income' : 'Log expense',
    content,
    actions,
  });

  setTimeout(() => satsInput?.focus(), 320);
}

export default openTxModal;
