import test from 'node:test';
import assert from 'node:assert/strict';

import {
  accountBalance,
  assetHolding,
  assetPositions,
  availableQuantity,
  cashBalance,
  periodTotals,
  spentByCategory,
  totalCashDelta,
} from '../js/utils/ledger.js';
import { monthTotals, spentByCat } from '../js/utils/ui.js';
import { zapService } from '../js/services/zap-service.js';

const NOW = Date.now();
const when = () => NOW;

test('periodTotals separates operating, invested and returned amounts', () => {
  const tx = [
    { type: 'income', amount: 1000, created_at: when() },
    { type: 'expense', amount: 300, created_at: when() },
    { type: 'investment', amount: 500, created_at: when() },
    { type: 'investment_return', amount: 200, created_at: when() },
    { type: 'transfer', amount: 999, created_at: when() },
  ];
  const now = new Date();
  const totals = periodTotals(tx, now.getFullYear(), now.getMonth());

  assert.equal(totals.income, 1000);
  assert.equal(totals.expenses, 300);
  assert.equal(totals.invested, 500);
  assert.equal(totals.returned, 200);
  // Transfers net to zero, investments and returns are not expenses.
  assert.equal(totals.netCashFlow, 1000 - 300 - 500 + 200);
});

test('monthTotals keeps tout as operating expenses only', () => {
  const tx = [
    { type: 'expense', amount: 100, created_at: when() },
    { type: 'investment', amount: 900, created_at: when() },
    { type: 'transfer', amount: 50, created_at: when() },
  ];
  const now = new Date();
  const totals = monthTotals(tx, now.getFullYear(), now.getMonth());

  assert.equal(totals.tout, 100);
  assert.equal(totals.invested, 900);
  assert.equal(totals.net, -100);
  assert.equal(totals.netCashFlow, -1000);
});

test('spentByCategory excludes investments and transfers', () => {
  const tx = [
    { type: 'expense', amount: 100, category: 'food', created_at: when() },
    { type: 'investment', amount: 900, category: 'investments', created_at: when() },
    { type: 'transfer', amount: 50, created_at: when() },
  ];
  const now = new Date();
  const spent = spentByCategory(tx, now.getFullYear(), now.getMonth());
  assert.deepEqual(spent, { food: 100 });
  assert.deepEqual(spentByCat(tx, now.getFullYear(), now.getMonth()), { food: 100 });
});

test('legacy sats records still balance like income minus expenses', () => {
  assert.equal(totalCashDelta({ type: 'income', amount: 1000 }), 1000);
  assert.equal(totalCashDelta({ type: 'expense', amount: 400 }), -400);
  assert.equal(cashBalance([{ type: 'income', amount: 1000 }, { type: 'expense', amount: 400 }]), 600);
});

test('multi-account transfers move cash without changing the total', () => {
  const accounts = [
    { id: 'a', openingBalance: 1000 },
    { id: 'b', openingBalance: 0 },
  ];
  const tx = [{ type: 'transfer', amount: 250, fromAccountId: 'a', toAccountId: 'b' }];

  assert.equal(accountBalance(tx, accounts[0]), 750);
  assert.equal(accountBalance(tx, accounts[1]), 250);
  assert.equal(cashBalance(tx, accounts), 1000);
});

test('acceptance example: BCEL opening, expenses and a bitcoin purchase', () => {
  const bcel = { id: 'bcel', name: 'BCEL', currency: 'LAK', openingBalance: 5000000 };
  const tx = [
    { type: 'expense', amount: 2000000, created_at: when() },
    {
      type: 'investment',
      amount: 1000000,
      currency: 'LAK',
      unit: 'LAK',
      created_at: when(),
      fromAccountId: 'bcel',
      assetId: 'btc',
      assetQuantity: 0.001,
    },
  ];

  // Unassigned expenses are attributed to the primary account.
  assert.equal(accountBalance(tx, bcel, { attributeUnassigned: true }), 2000000);
  assert.equal(cashBalance(tx, [bcel]), 2000000);

  const now = new Date();
  const totals = periodTotals(tx, now.getFullYear(), now.getMonth());
  assert.equal(totals.expenses, 2000000);
  assert.equal(totals.invested, 1000000);

  const withIncome = [{ type: 'income', amount: 5000000, created_at: when() }, ...tx];
  const period = periodTotals(withIncome, now.getFullYear(), now.getMonth());
  assert.equal(period.netCashFlow, 2000000);

  const holding = assetHolding(tx, 'btc');
  assert.equal(holding.costBasis, 1000000);
  assert.equal(holding.quantity, 0.001);
});

test('return of principal reduces cost basis and quantity; a gain does not', () => {
  const tx = [
    { type: 'investment', amount: 1000, assetId: 'x', assetQuantity: 10 },
    { type: 'investment_return', amount: 400, assetId: 'x', assetQuantity: 4 },
    // Dividend recorded as income with an asset link: no holding change.
    { type: 'income', amount: 50, assetId: 'x' },
  ];
  const p = assetPositions(tx).x;
  assert.equal(p.costBasis, 600);
  assert.equal(p.quantity, 6);
  assert.equal(availableQuantity(tx, 'x'), 6);
});

test('_validateManualTransaction rejects unknown types and missing links', () => {
  assert.throws(() => zapService._validateManualTransaction({ type: 'mystery', amount: 5 }));
  assert.throws(() =>
    zapService._validateManualTransaction({
      type: 'transfer',
      amount: 5,
      fromAccountId: 'a',
      toAccountId: 'a',
    })
  );
  assert.throws(() =>
    zapService._validateManualTransaction({ type: 'investment', amount: 5, fromAccountId: 'a' })
  );
  assert.doesNotThrow(() =>
    zapService._validateManualTransaction({
      type: 'investment',
      amount: 5,
      fromAccountId: 'a',
      assetId: 'x',
    })
  );
});
