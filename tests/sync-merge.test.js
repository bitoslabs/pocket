import test from 'node:test';
import assert from 'node:assert/strict';

import { store } from '../js/core/state.js';
import { syncService } from '../js/services/sync-service.js';
import { outbox } from '../js/services/outbox.js';
import { authService } from '../js/services/auth-service.js';
import { storageService } from '../js/services/storage-service.js';
import { categoryService } from '../js/services/category-service.js';
import { budgetService } from '../js/services/budget-service.js';
import { recurringService } from '../js/services/recurring-service.js';
import { journalService } from '../js/services/journal-service.js';

/** In-memory storage stub shared by the services under test. */
function stubStorage(initial = {}) {
  const mem = new Map(Object.entries(initial));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  storageService.init = async () => {};
  storageService.getAll = async (s) => clone(mem.get(s) || []);
  storageService.get = async (s, k) => {
    const found = (mem.get(s) || []).find((x) => x.id === k);
    return found ? clone(found) : null;
  };
  storageService.put = async (s, d) => {
    const arr = mem.get(s) || [];
    const i = arr.findIndex((x) => x.id === d.id);
    if (i >= 0) arr[i] = clone(d);
    else arr.push(clone(d));
    mem.set(s, arr);
    return true;
  };
  storageService.delete = async (s, k) => {
    mem.set(s, (mem.get(s) || []).filter((x) => x.id !== k));
    return true;
  };
  storageService.getLocal = () => 0;
  storageService.setLocal = () => {};
  return mem;
}

function stubServices() {
  const noop = async () => {};
  categoryService.init = noop;
  budgetService.init = noop;
  recurringService.init = noop;
  journalService.init = noop;
}

function recordEvent(entity, id, payload) {
  return {
    id: `evt_${id}`,
    kind: 30078,
    created_at: Math.floor((payload.updatedAt || 0) / 1000),
    tags: [['d', `zapjournal:${entity}:${id}`]],
    content: `enc:${JSON.stringify({ entity, id, ...payload })}`,
  };
}

test.beforeEach(() => {
  stubStorage();
  stubServices();
  outbox._ready = true;
  authService.decrypt = async (_pk, content) => content.replace(/^enc:/, '');
  authService.encrypt = async (_pk, text) => `enc:${text}`;
  store.set('journal', []);
  store.set('transactions', []);
});

test('merge applies a newer remote journal record', async () => {
  await storageService.put('journal', { id: 'j1', text: 'old', updatedAt: 1000 });
  await syncService._mergeEvent(
    recordEvent('journal', 'j1', { deleted: false, updatedAt: 2000, data: { title: 'T', text: 'new', created_at: 5 } }),
    'abc'
  );

  const rec = await storageService.get('journal', 'j1');
  assert.equal(rec.text, 'new');
  assert.equal(rec.updatedAt, 2000);
  assert.equal(rec.owner, 'abc');
  assert.ok((store.get('journal') || []).some((e) => e.id === 'j1'));
});

test('merge ignores an older remote record (last-write-wins)', async () => {
  await storageService.put('journal', { id: 'j2', text: 'keeper', updatedAt: 5000 });
  await syncService._mergeEvent(
    recordEvent('journal', 'j2', { deleted: false, updatedAt: 1000, data: { text: 'stale', created_at: 5 } }),
    'abc'
  );

  const rec = await storageService.get('journal', 'j2');
  assert.equal(rec.text, 'keeper');
});

test('merge applies a delete tombstone', async () => {
  await storageService.put('transactions', { id: 'tx1', amount: 10, updatedAt: 1000 });
  store.set('transactions', [{ id: 'tx1', amount: 10, updatedAt: 1000 }]);

  await syncService._mergeEvent(
    recordEvent('transaction', 'tx1', { deleted: true, updatedAt: 2000 }),
    'abc'
  );

  assert.equal(await storageService.get('transactions', 'tx1'), null);
  assert.equal((store.get('transactions') || []).length, 0);
});

test('merge ignores events without a valid d tag', async () => {
  await syncService._mergeEvent(
    { id: 'x', kind: 30078, created_at: 1, tags: [['d', 'other-app:thing']], content: 'enc:{}' },
    'abc'
  );
  assert.equal((await storageService.getAll('journal')).length, 0);
});

test('claimGuest reassigns guest records and queues them', async () => {
  stubStorage({
    transactions: [{ id: 't1', owner: 'guest', amount: 5, created_at: 1 }],
    journal: [{ id: 'j1', owner: 'guest', text: 'hi', created_at: 1 }],
    budgets: [],
    categories: [],
    recurring: [],
    outbox: [],
  });

  const claimed = await syncService.claimGuest('abc');
  assert.equal(claimed, 2);

  assert.equal((await storageService.get('transactions', 't1')).owner, 'abc');
  assert.equal((await storageService.get('journal', 'j1')).owner, 'abc');

  const pending = await outbox.list('pending');
  assert.equal(pending.length, 2);
  assert.ok(pending.every((e) => e.owner === 'abc'));
});
