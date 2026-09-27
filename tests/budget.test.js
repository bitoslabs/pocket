import test from 'node:test';
import assert from 'node:assert/strict';

import { budgetService } from '../js/services/budget-service.js';
import { store } from '../js/core/state.js';
import { groupBudgetWatch } from '../js/components/rail.js';

const CATEGORY = 'cat-food';

function withBudget(budget, transactions) {
  budgetService._budgets = [budget];
  store.set('transactions', transactions);
}

function monthlyBudget(overrides = {}) {
  return {
    id: 'b1',
    name: 'Food',
    categoryId: CATEGORY,
    amount: 100,
    period: 'monthly',
    startDate: new Date(2026, 0, 1).getTime(),
    endDate: null,
    isActive: true,
    ...overrides,
  };
}

function expense(amount, when) {
  return {
    id: 't' + amount + '_' + when,
    type: 'expense',
    category: CATEGORY,
    amount,
    created_at: when,
  };
}

test('_getPeriodRange measures the current month for a recurring budget', () => {
  const now = new Date(2026, 2, 15, 12).getTime(); // 15 Mar 2026
  const startDate = new Date(2026, 1, 10).getTime(); // created 10 Feb
  const range = budgetService._getPeriodRange('monthly', startDate, null, now);
  const start = new Date(range.start);
  const end = new Date(range.end);

  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 2);
  assert.equal(start.getDate(), 1);
  assert.equal(end.getFullYear(), 2026);
  assert.equal(end.getMonth(), 2);
  assert.equal(end.getDate(), 31);
});

test('_getPeriodRange handles a December month window', () => {
  const now = new Date(2026, 11, 20).getTime();
  const range = budgetService._getPeriodRange('monthly', null, null, now);
  const start = new Date(range.start);
  const end = new Date(range.end);

  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 11);
  assert.equal(end.getFullYear(), 2026);
  assert.equal(end.getMonth(), 11);
  assert.equal(end.getDate(), 31);
});

test('_getPeriodRange snaps weekly budgets to Sunday-Saturday', () => {
  const now = new Date(2026, 2, 18, 9).getTime();
  const range = budgetService._getPeriodRange('weekly', null, null, now);

  assert.equal(new Date(range.start).getDay(), 0);
  assert.equal(new Date(range.end).getDay(), 6);
});

test('_getPeriodRange covers the whole current day', () => {
  const now = new Date(2026, 5, 4, 15, 30).getTime();
  const range = budgetService._getPeriodRange('daily', null, null, now);

  assert.equal(new Date(range.start).getHours(), 0);
  assert.equal(new Date(range.end).getHours(), 23);
  assert.equal(new Date(range.start).getDate(), new Date(range.end).getDate());
});

test('_getPeriodRange clamps the window start to the budget startDate', () => {
  const now = new Date(2026, 2, 20).getTime();
  const startDate = new Date(2026, 2, 10).getTime();
  const range = budgetService._getPeriodRange('monthly', startDate, null, now);

  assert.equal(range.start, startDate);
});

test('_getPeriodRange honors an explicit endDate', () => {
  const start = new Date(2026, 0, 1).getTime();
  const end = new Date(2026, 0, 31).getTime();
  const range = budgetService._getPeriodRange('monthly', start, end, Date.now());

  assert.deepEqual(range, { start, end });
});

test('getBudgetProgress reflects spend in the current period', () => {
  const now = Date.now();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  withBudget(monthlyBudget({ startDate: startOfMonth.getTime() }), [
    expense(85, now),
    expense(1000, startOfMonth.getTime() - 30 * 24 * 60 * 60 * 1000), // prior month
  ]);

  const progress = budgetService.getBudgetProgress('b1');
  assert.equal(progress.spent, 85);
  assert.equal(progress.percentage, 85);
  assert.equal(progress.status, 'warning');
});

test('getBudgetProgress marks danger at or above the global danger threshold', () => {
  const now = Date.now();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  withBudget(monthlyBudget({ startDate: startOfMonth.getTime() }), [expense(95, now)]);

  const progress = budgetService.getBudgetProgress('b1');
  assert.equal(progress.status, 'danger');
});

test('getBudgetProgress stays on-track below the warning threshold', () => {
  const now = Date.now();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  withBudget(monthlyBudget({ startDate: startOfMonth.getTime() }), [expense(60, now)]);

  const progress = budgetService.getBudgetProgress('b1');
  assert.equal(progress.status, 'on-track');
});

test('getBudgetProgress honors a per-budget alertThreshold', () => {
  const now = Date.now();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  withBudget(
    monthlyBudget({ startDate: startOfMonth.getTime(), alertThreshold: 0.5 }),
    [expense(60, now)]
  );

  // Global default (0.7) would leave this on-track.
  const progress = budgetService.getBudgetProgress('b1');
  assert.equal(progress.status, 'warning');
});

test('getBudgetProgress keeps the default danger gap above a custom threshold', () => {
  const now = Date.now();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  withBudget(
    monthlyBudget({ startDate: startOfMonth.getTime(), alertThreshold: 0.9 }),
    [expense(95, now)]
  );

  // warning at 90%, danger at 100% (0.9 + the 0.2 global gap, capped at 1).
  const progress = budgetService.getBudgetProgress('b1');
  assert.equal(progress.status, 'warning');
});

test('getBudgetProgress reports real (unclamped) over-budget percentage', () => {
  const now = Date.now();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  withBudget(monthlyBudget({ startDate: startOfMonth.getTime() }), [expense(150, now)]);

  const progress = budgetService.getBudgetProgress('b1');
  assert.equal(progress.percentage, 150);
  assert.equal(progress.remaining, -50);
  assert.equal(progress.status, 'danger');
});

function row(period, status, percentage) {
  return { budget: { id: period + percentage, period }, status, percentage };
}

test('groupBudgetWatch caps a single period at the row limit', () => {
  const groups = groupBudgetWatch([
    row('monthly', 'on-track', 10),
    row('monthly', 'on-track', 20),
    row('monthly', 'on-track', 30),
    row('monthly', 'on-track', 40),
    row('monthly', 'on-track', 50),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].period, 'monthly');
  assert.equal(groups[0].rows.length, 4);
});

test('groupBudgetWatch keeps a dangerous budget even when other periods exist', () => {
  const groups = groupBudgetWatch([
    row('daily', 'on-track', 10),
    row('monthly', 'danger', 95),
  ]);

  assert.deepEqual(groups.map((g) => g.period), ['daily', 'monthly']);
  assert.equal(groups.find((g) => g.period === 'monthly').rows[0].status, 'danger');
});

test('groupBudgetWatch caps each period when several periods are present', () => {
  const groups = groupBudgetWatch([
    row('daily', 'on-track', 10),
    row('daily', 'on-track', 20),
    row('daily', 'on-track', 30),
    row('monthly', 'danger', 95),
    row('monthly', 'warning', 80),
    row('monthly', 'on-track', 5),
  ]);

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  assert.equal(total, 4);
  assert.deepEqual(groups.map((g) => g.period), ['daily', 'monthly']);
  groups.forEach((g) => assert.ok(g.rows.length <= 2, `${g.period} exceeds cap`));
});

test('groupBudgetWatch orders groups by canonical period', () => {
  const groups = groupBudgetWatch([
    row('yearly', 'on-track', 10),
    row('daily', 'on-track', 10),
    row('monthly', 'on-track', 10),
    row('weekly', 'on-track', 10),
  ]);

  assert.deepEqual(groups.map((g) => g.period), [
    'daily',
    'weekly',
    'monthly',
    'yearly',
  ]);
});
