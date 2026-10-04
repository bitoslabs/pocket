/**
 * Transaction Modal - log / edit income, expense, investment, return, transfer
 *
 * VanJS view: the active mode, category, unit and the fiat preview are reactive
 * states. Account and asset selectors read the ledger service and can create a
 * missing account/asset inline (without a nested modal). The amount/note inputs
 * stay uncontrolled and are read on save.
 *
 * @module components/tx-modal
 */

import { modal } from './modal.js';
import { t, categoryLabel } from '../core/i18n.js';
import { zapService } from '../services/zap-service.js';
import { categoryService } from '../services/category-service.js';
import { ledgerService } from '../services/ledger-service.js';
import { priceService } from '../services/price-service.js';
import { entryPrefs } from '../services/entry-prefs.js';
import { Icons } from '../utils/icons.js';
import { ASSET_SUBTYPES } from '../utils/ledger.js';
import {
  categoryIconHtml,
  categoryMeta,
  fmtSats,
  playFX,
  toast,
} from '../utils/ui.js';
import van from '../vendor/van.js';

const { button, div, input, label, option, select, span } = van.tags;

const MODE_TO_TYPE = {
  out: 'expense',
  in: 'income',
  invest: 'investment',
  return: 'investment_return',
  transfer: 'transfer',
};
const TYPE_TO_MODE = {
  expense: 'out',
  income: 'in',
  investment: 'invest',
  investment_return: 'return',
  transfer: 'transfer',
  adjustment: 'out',
};

const isOperating = (mode) => mode === 'out' || mode === 'in';
const assetModes = (mode) => mode === 'invest' || mode === 'return';

/**
 * @param {Object} opts
 * @param {Object|null} opts.tx - transaction to edit
 * @param {'in'|'out'} opts.dir - default direction for new transaction
 * @param {Function} opts.onSaved
 */
export function openTxModal({ tx = null, dir = 'out', onSaved = null } = {}) {
  const fiatOn = priceService.showFiat && priceService.hasRate(priceService.currency);
  const fallbackCurrency = priceService.currency;

  const modeState = van.state(tx ? TYPE_TO_MODE[tx.type] || 'out' : dir);
  const catState = van.state(tx?.category || entryPrefs.lastCategory(dir));
  const unitState = van.state(tx || !fiatOn ? 'sats' : entryPrefs.lastUnit());
  const previewState = van.state('');
  const accountsState = van.state(ledgerService.getAccounts());
  const assetsState = van.state(ledgerService.getAssets());

  const primary = ledgerService.primaryAccount();
  const fromState = van.state(tx?.fromAccountId || primary?.id || '');
  const toState = van.state(tx?.toAccountId || primary?.id || '');
  const assetState = van.state(tx?.assetId || assetsState.val[0]?.id || '');

  const accountById = (id) => accountsState.val.find((a) => a.id === id) || null;
  const activeAccount = () => {
    const mode = modeState.val;
    if (mode === 'return') return accountById(toState.val);
    return accountById(fromState.val);
  };
  /** Native unit of the amount for the active mode (null = legacy sats). */
  const activeUnit = () => {
    const mode = modeState.val;
    if (isOperating(mode)) {
      // Never rewrite a historical record's unit: edits keep their own unit.
      if (tx) return tx.unit && tx.unit !== 'SATS' ? tx.unit : null;
      // New operating entries follow the primary account's currency.
      const account = accountById(fromState.val);
      return account && account.currency !== 'SATS' ? account.currency : null;
    }
    const account = activeAccount();
    return account ? account.currency : null;
  };

  const catsFor = (mode) => categoryService.getCategories(MODE_TO_TYPE[mode] === 'income' ? 'income' : 'expense');

  const amtInput = input({
    id: 'txAmt',
    type: 'number',
    min: '0',
    inputmode: 'decimal',
    placeholder: '0',
    autocomplete: 'off',
    value: tx?.amount || '',
    oninput: () => renderPreview(),
  });

  const qtyInput = input({
    id: 'txQty',
    type: 'number',
    min: '0',
    inputmode: 'decimal',
    placeholder: '0',
    autocomplete: 'off',
    style: 'margin-top:8px',
    value: tx?.assetQuantity || '',
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

  const rawAmount = () => parseFloat(amtInput.value) || 0;

  const amountToValue = () => {
    const v = rawAmount();
    if (!(v > 0)) return 0;
    const unit = activeUnit();
    if (unit) return v;
    return unitState.val === 'fiat' ? priceService.fiatToSats(v) : Math.round(v);
  };

  function renderPreview() {
    const unit = activeUnit();
    if (unit) {
      const v = rawAmount();
      previewState.val = v > 0 ? `${t('tx.amountIn', { currency: unit })} ${v.toLocaleString()}` : '';
      return;
    }
    if (!fiatOn) return;
    const v = rawAmount();
    if (!(v > 0)) {
      previewState.val = '';
      return;
    }
    const sats = unitState.val === 'fiat' ? priceService.fiatToSats(v) : Math.round(v);
    const fiat = unitState.val === 'fiat' ? v : priceService.satsToFiat(v);
    previewState.val =
      sats > 0 && fiat > 0
        ? `${fmtSats(sats)} ${t('common.sats')} ~ ${priceService.formatAmount(fiat, fallbackCurrency)}`
        : '';
  }

  const setUnit = (next) => {
    if (!fiatOn || next === unitState.val) return;
    const v = rawAmount();
    if (v > 0) {
      amtInput.value =
        next === 'fiat' ? priceService.satsToFiat(v).toFixed(2) : priceService.fiatToSats(v);
    }
    unitState.val = next;
    entryPrefs.setUnit(next);
    renderPreview();
  };

  const segBtn = (mode, id, icon, labelKey) =>
    button(
      {
        type: 'button',
        id,
        class: () =>
          modeState.val === mode
            ? mode === 'in' || mode === 'return'
              ? 'on-in'
              : 'on-out'
            : '',
        onclick: () => {
          modeState.val = mode;
          if (isOperating(mode)) catState.val = entryPrefs.lastCategory(mode);
          renderPreview();
        },
      },
      span({ class: 'ic', innerHTML: Icons[icon] }),
      t(labelKey)
    );

  const currentCat = () => {
    const cats = catsFor(modeState.val);
    const sel = catState.val;
    return sel && cats.some((c) => c.id === sel) ? sel : cats[0]?.id || 'other';
  };

  // ---- Account / asset selectors -------------------------------------------

  const fillSelect = (el, list, selectedId, labelFn) => {
    el.replaceChildren(...list.map((item) => option({ value: item.id }, labelFn(item))));
    const id = list.some((i) => i.id === selectedId) ? selectedId : list[0]?.id || '';
    el.value = id;
    return id;
  };

  const fromSelect = select({
    class: 'input',
    onchange: () => { fromState.val = fromSelect.value; renderPreview(); },
  });
  const toSelect = select({
    class: 'input',
    onchange: () => { toState.val = toSelect.value; renderPreview(); },
  });
  const assetSelect = select({
    class: 'input',
    onchange: () => { assetState.val = assetSelect.value; },
  });

  van.derive(() => {
    const accounts = accountsState.val;
    const from = fillSelect(fromSelect, accounts, fromState.val, (a) => `${a.name} (${a.currency})`);
    const to = fillSelect(toSelect, accounts, toState.val, (a) => `${a.name} (${a.currency})`);
    if (from !== fromState.val) fromState.val = from;
    if (to !== toState.val) toState.val = to;

    const assets = assetsState.val;
    const asset = fillSelect(assetSelect, assets, assetState.val, (a) => a.name);
    if (asset !== assetState.val) assetState.val = asset;
  });

  // Inline create rows (fresh nodes per render) keep everything in one modal.
  const accountCreateRow = () => {
    const nameEl = input({ type: 'text', class: 'input', placeholder: t('tx.accountName') });
    const currencyEl = input({
      type: 'text',
      class: 'input',
      placeholder: 'SATS / LAK',
      value: fallbackCurrency,
    });
    const openingEl = input({
      type: 'number',
      class: 'input',
      inputmode: 'decimal',
      min: '0',
      placeholder: t('tx.openingBalance'),
    });
    const add = async () => {
      try {
        const account = await ledgerService.createAccount({
          name: nameEl.value,
          currency: currencyEl.value || fallbackCurrency,
          openingBalance: parseFloat(openingEl.value) || 0,
        });
        accountsState.val = ledgerService.getAccounts();
        if (!fromState.val) fromState.val = account.id;
        if (!toState.val) toState.val = account.id;
        renderPreview();
      } catch (e) {
        toast(e.message || t('tx.couldNotSave'), 'error');
      }
    };
    return div(
      { class: 'mini-create' },
      div({ class: 'mini-create-row' }, nameEl, currencyEl, openingEl),
      button({ type: 'button', class: 'btn btn-ghost btn-sm', onclick: add }, t('tx.addAccount'))
    );
  };

  const assetCreateRow = () => {
    const nameEl = input({ type: 'text', class: 'input', placeholder: t('tx.assetName') });
    const subtypeEl = select(
      { class: 'input' },
      ASSET_SUBTYPES.map((s) => option({ value: s }, t('assetSubtype.' + s)))
    );
    const add = async () => {
      try {
        const asset = await ledgerService.createAsset({
          name: nameEl.value,
          subtype: subtypeEl.value,
        });
        assetsState.val = ledgerService.getAssets();
        assetState.val = asset.id;
      } catch (e) {
        toast(e.message || t('tx.couldNotSave'), 'error');
      }
    };
    return div(
      { class: 'mini-create' },
      div({ class: 'mini-create-row' }, nameEl, subtypeEl),
      button({ type: 'button', class: 'btn btn-ghost btn-sm', onclick: add }, t('tx.addAsset'))
    );
  };

  const accountFields = (which) => [
    label(
      { class: 'fld' },
      which === 'to' ? t('tx.toAccount') : t('tx.fromAccount'),
      which === 'to' ? toSelect : fromSelect
    ),
    accountsState.val.length
      ? null
      : div({ class: 'hint', style: 'max-width:none' }, t('tx.noAccounts')),
    accountCreateRow(),
  ];

  const assetFields = () => [
    label({ class: 'fld' }, t('tx.asset'), assetSelect),
    assetsState.val.length ? null : div({ class: 'hint', style: 'max-width:none' }, t('tx.noAssets')),
    assetCreateRow(),
    label({ class: 'fld' }, t('tx.quantityOptional'), qtyInput),
  ];

  const contextEl = div({ class: 'tx-context' });
  van.derive(() => {
    const mode = modeState.val;
    contextEl.replaceChildren();
    if (isOperating(mode)) {
      const cats = catsFor(mode);
      const sel = currentCat();
      van.add(
        contextEl,
        div(
          { class: 'cat-chips', id: 'txCats' },
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
                  entryPrefs.setCategory(mode, c.id);
                },
              },
              span({ class: 'ic', style: `color:${meta.color}`, innerHTML: categoryIconHtml(meta) }),
              categoryLabel(c.id, c.name || meta.label)
            );
          })
        )
      );
    } else if (mode === 'invest') {
      van.add(contextEl, ...assetFields().filter(Boolean), ...accountFields('from').filter(Boolean));
    } else if (mode === 'return') {
      van.add(contextEl, ...assetFields().filter(Boolean), ...accountFields('to').filter(Boolean));
    } else if (mode === 'transfer') {
      van.add(contextEl, ...accountFields('from').filter(Boolean), ...accountFields('to').filter(Boolean));
    }
  });

  // ---- Unit toggle ----------------------------------------------------------

  const unitEl = span();
  van.derive(() => {
    const unit = activeUnit();
    unitEl.replaceChildren();
    if (unit) {
      unitEl.appendChild(span({ class: 'unit-native' }, unit));
      return;
    }
    if (!fiatOn) {
      unitEl.appendChild(span(t('common.sats')));
      return;
    }
    unitEl.appendChild(
      button(
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
          fallbackCurrency
        )
      )
    );
  });

  const content = div(
    { class: 'tx-modal' },
    div(
      { class: 'seg seg-wrap', style: 'margin-top:8px' },
      segBtn('out', 'txSegOut', 'upRight', 'tx.expense'),
      segBtn('in', 'txSegIn', 'downLeft', 'tx.income'),
      segBtn('invest', 'txSegInvest', 'trending', 'tx.invest'),
      segBtn('return', 'txSegReturn', 'undo', 'tx.returnPrincipal'),
      segBtn('transfer', 'txSegTransfer', 'swap', 'tx.transfer')
    ),
    contextEl,
    div({ class: 'amt-line' }, amtInput, unitEl),
    div({ class: 'fiat-preview', id: 'txFiatPreview' }, () => previewState.val),
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
      const mode = modeState.val;
      const type = MODE_TO_TYPE[mode];
      const value = amountToValue();
      if (!value || value < 0) {
        toast(t('tx.enterAmount'), 'error');
        return false;
      }

      const note = noteInput.value.trim();
      const unit = activeUnit();
      const payload = { type, amount: value, description: note };
      if (unit) payload.unit = unit;

      if (isOperating(mode)) {
        payload.category = currentCat();
      } else if (mode === 'invest') {
        payload.category = 'investments';
        payload.fromAccountId = fromState.val;
        payload.assetId = assetState.val;
      } else if (mode === 'return') {
        payload.toAccountId = toState.val;
        payload.assetId = assetState.val;
      } else if (mode === 'transfer') {
        payload.fromAccountId = fromState.val;
        payload.toAccountId = toState.val;
      }

      if (assetModes(mode)) {
        const qty = parseFloat(qtyInput.value);
        if (Number.isFinite(qty) && qty > 0) payload.assetQuantity = qty;
      }

      // Snapshot the fiat value at entry for legacy sats records only.
      if (isOperating(mode) && !unit && fiatOn) {
        const v = rawAmount();
        const fiatAmount = unitState.val === 'fiat' && v > 0 ? v : priceService.satsToFiat(value);
        if (Number.isFinite(fiatAmount)) {
          payload.fiatAmount = fiatAmount;
          payload.currency = fallbackCurrency;
        }
      }

      try {
        if (tx) {
          await zapService.updateTransaction(tx.id, payload);
          toast(t('tx.transactionUpdated'));
        } else {
          const created = await zapService.createManualTransaction(payload);
          if (mode === 'in' || payload.category === 'tips' || payload.category === 'zaps') {
            playFX(value, mode === 'in');
          }
          toast(t('tx.saved'), 'success');
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
    title: tx ? t('tx.editTitle') : t('tx.logTitle'),
    content,
    actions,
  });

  renderPreview();
  setTimeout(() => amtInput?.focus(), 320);
}

export default openTxModal;
