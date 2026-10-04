/**
 * Ledger - shared transaction classifier and aggregator.
 *
 * Pure, dependency-free money rules so the same arithmetic is used by the UI,
 * budgets and sync. Amounts are positive and the direction is implied by the
 * transaction `type`, except `adjustment` which uses a `direction` field.
 *
 * Multi-currency conversion is out of scope for this release: every aggregate
 * simply sums the stored `amount` values. Legacy records without a type are
 * treated as sats income/expense records.
 *
 * Precision: `amount` and `openingBalance` are stored as JS numbers in the
 * account's own unit — whole sats for SATS, the currency's smallest display
 * unit for fiat (formatted per currency, e.g. LAK has no decimals), and the
 * asset's native unit for `assetQuantity`. Fixed-point decimals are a later
 * concern; callers must not mix units in one account.
 *
 * @module utils/ledger
 */

/** Supported transaction types for this release. */
export const TX_TYPES = ['income', 'expense', 'transfer', 'investment', 'investment_return', 'adjustment'];

/** Supported asset subtypes. */
export const ASSET_SUBTYPES = ['stock', 'bitcoin', 'crypto', 'fund', 'gold', 'business', 'property'];

/** Normalize a timestamp that may be seconds or milliseconds. */
export function toMs(ts) {
  if (!ts) return Date.now();
  return ts < 1e12 ? ts * 1000 : ts;
}

/** Numeric amount of a transaction. */
export function amountOf(tx) {
  return Number(tx?.amount) || 0;
}

/** Whether `tx` is a recognized transaction type. Legacy records may omit it. */
export function isKnownType(tx) {
  return TX_TYPES.includes(tx?.type);
}

export const isIncome = (tx) => tx?.type === 'income';
export const isExpense = (tx) => tx?.type === 'expense';
export const isTransfer = (tx) => tx?.type === 'transfer';
export const isInvestment = (tx) => tx?.type === 'investment';
export const isInvestmentReturn = (tx) => tx?.type === 'investment_return';
export const isAdjustment = (tx) => tx?.type === 'adjustment';

/** True when the record is neither income nor expense (investment/transfer/…). */
export const isNonOperating = (tx) =>
  isTransfer(tx) || isInvestment(tx) || isInvestmentReturn(tx) || isAdjustment(tx);

export function inMonth(ts, year, month) {
  const d = new Date(toMs(ts));
  return d.getFullYear() === year && d.getMonth() === month;
}

/**
 * Signed cash delta of a single transaction, independent of account.
 * Transfers net to zero across all accounts. Adjustments use `direction`.
 */
export function totalCashDelta(tx) {
  const a = amountOf(tx);
  switch (tx?.type) {
    case 'income':
      return a;
    case 'expense':
      return -a;
    case 'investment':
      return -a;
    case 'investment_return':
      return a;
    case 'adjustment':
      return String(tx.direction || 'in') === 'out' ? -a : a;
    case 'transfer':
    default:
      return 0;
  }
}

/**
 * Signed cash delta for one account. Transfers are attributed by `fromAccountId`
 * and `toAccountId`; other types only when the account is referenced.
 */
export function cashDelta(tx, accountId) {
  const a = amountOf(tx);
  if (tx?.type === 'transfer') {
    let d = 0;
    if (tx.fromAccountId === accountId) d -= a;
    if (tx.toAccountId === accountId) d += a;
    return d;
  }
  const ref = tx?.fromAccountId || tx?.toAccountId;
  if (ref && ref !== accountId) return 0;
  return totalCashDelta(tx);
}

/** Total cash across all accounts: opening balances + every cash movement. */
export function cashBalance(transactions, accounts = []) {
  let b = (accounts || []).reduce((sum, a) => sum + (Number(a.openingBalance) || 0), 0);
  for (const tx of transactions || []) b += totalCashDelta(tx);
  return b;
}

/**
 * Balance of one account. Unassigned movements (e.g. simple expenses logged
 * before accounts existed) are attributed to the primary account when
 * `attributeUnassigned` is set.
 */
export function accountBalance(transactions, account, { attributeUnassigned = false } = {}) {
  if (!account) return 0;
  let b = Number(account.openingBalance) || 0;
  for (const tx of transactions || []) {
    const assigned = tx.fromAccountId || tx.toAccountId || tx.accountId;
    if (assigned) {
      b += cashDelta(tx, account.id);
    } else if (attributeUnassigned) {
      b += totalCashDelta(tx);
    }
  }
  return b;
}

/**
 * Period totals by category. Transfers are excluded; investments and returns
 * are reported separately from operating income/expense.
 */
export function periodTotals(transactions, year, month) {
  let income = 0;
  let expenses = 0;
  let invested = 0;
  let returned = 0;
  let adjustments = 0;

  for (const tx of transactions || []) {
    if (!inMonth(tx.created_at, year, month)) continue;
    const a = amountOf(tx);
    switch (tx.type) {
      case 'income':
        income += a;
        break;
      case 'expense':
        expenses += a;
        break;
      case 'investment':
        invested += a;
        break;
      case 'investment_return':
        returned += a;
        break;
      case 'adjustment':
        adjustments += totalCashDelta(tx);
        break;
      default:
        break;
    }
  }

  const netCashFlow = income - expenses - invested + returned + adjustments;
  return { income, expenses, invested, returned, adjustments, netCashFlow };
}

/** Spending per category for a period. Only `expense` counts. */
export function spentByCategory(transactions, year, month) {
  const out = {};
  for (const tx of transactions || []) {
    if (!isExpense(tx) || !inMonth(tx.created_at, year, month)) continue;
    const key = tx.category || 'uncategorized';
    out[key] = (out[key] || 0) + amountOf(tx);
  }
  return out;
}

/**
 * Net asset positions derived from investment purchases and returns of
 * principal. `costBasis` is the cash spent minus the principal returned.
 * Investment income (dividends) is `income` with an `assetId` and does not
 * change the holding.
 *
 * @returns {Object<string, {assetId, quantity, costBasis, invested, returned, investedCost, returnedCost}>}
 */
export function assetPositions(transactions) {
  const out = {};
  const ensure = (id) => {
    if (!out[id]) {
      out[id] = {
        assetId: id,
        quantity: 0,
        costBasis: 0,
        invested: 0,
        returned: 0,
        investedCost: 0,
        returnedCost: 0,
      };
    }
    return out[id];
  };

  for (const tx of transactions || []) {
    if (!tx?.assetId) continue;
    if (isInvestment(tx)) {
      const p = ensure(tx.assetId);
      const a = amountOf(tx);
      const q = Number(tx.assetQuantity) || 0;
      p.quantity += q;
      p.costBasis += a;
      p.invested += q;
      p.investedCost += a;
    } else if (isInvestmentReturn(tx)) {
      const p = ensure(tx.assetId);
      const a = amountOf(tx);
      const q = Number(tx.assetQuantity) || 0;
      p.quantity -= q;
      p.costBasis -= a;
      p.returned += q;
      p.returnedCost += a;
    }
  }
  return out;
}

/** Net holding for one asset, or a zeroed record when unknown. */
export function assetHolding(transactions, assetId) {
  const p = assetPositions(transactions)[assetId];
  return (
    p || {
      assetId,
      quantity: 0,
      costBasis: 0,
      invested: 0,
      returned: 0,
      investedCost: 0,
      returnedCost: 0,
    }
  );
}

/** Quantity of `assetId` currently held (for over-return validation). */
export function availableQuantity(transactions, assetId) {
  return assetHolding(transactions, assetId).quantity;
}

export default {
  TX_TYPES,
  ASSET_SUBTYPES,
  toMs,
  amountOf,
  isKnownType,
  isIncome,
  isExpense,
  isTransfer,
  isInvestment,
  isInvestmentReturn,
  isAdjustment,
  isNonOperating,
  inMonth,
  totalCashDelta,
  cashDelta,
  cashBalance,
  accountBalance,
  periodTotals,
  spentByCategory,
  assetPositions,
  assetHolding,
  availableQuantity,
};
