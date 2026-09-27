import test from 'node:test';
import assert from 'node:assert/strict';

import { allTimeBalance, monthTotals, fmtSats, fmtFull } from '../js/utils/ui.js';

test('allTimeBalance is income minus expenses (can be negative)', () => {
  assert.equal(allTimeBalance([]), 0);
  assert.equal(allTimeBalance([{ type: 'expense', amount: 500 }]), -500);
  assert.equal(
    allTimeBalance([
      { type: 'income', amount: 1000 },
      { type: 'expense', amount: 500 },
    ]),
    500
  );
});

test('allTimeBalance keeps updating as entries are added', () => {
  const list = [{ type: 'income', amount: 1000 }];
  assert.equal(allTimeBalance(list), 1000);
  list.push({ type: 'expense', amount: 250 });
  assert.equal(allTimeBalance(list), 750);
});

test('monthTotals splits in/out for the given month', () => {
  const now = new Date();
  const tx = {
    type: 'expense',
    amount: 500,
    created_at: now.getTime(),
  };
  const { tin, tout, net } = monthTotals([tx], now.getFullYear(), now.getMonth());
  assert.equal(tin, 0);
  assert.equal(tout, 500);
  assert.equal(net, -500);
});

test('formatting handles zero and negative sats', () => {
  assert.equal(fmtFull(-500), '-500');
  assert.equal(fmtSats(0), '0');
});
