import test from 'node:test';
import assert from 'node:assert/strict';

import { outbox } from '../js/services/outbox.js';
import { storageService } from '../js/services/storage-service.js';

/** Replace the IndexedDB-backed storage with an in-memory map. */
function stubStorage() {
  const mem = new Map();
  storageService.init = async () => {};
  storageService.getAll = async (s) => mem.get(s) || [];
  storageService.put = async (s, d) => {
    const arr = mem.get(s) || [];
    const i = arr.findIndex((x) => x.id === d.id);
    if (i >= 0) arr[i] = d;
    else arr.push(d);
    mem.set(s, arr);
    return true;
  };
  storageService.delete = async (s, k) => {
    mem.set(s, (mem.get(s) || []).filter((x) => x.id !== k));
    return true;
  };
  return mem;
}

test('enqueue coalesces repeated edits to the same record', async () => {
  stubStorage();
  outbox._ready = true;

  await outbox.enqueue({
    entity: 'transaction',
    entityId: 't1',
    owner: 'guest',
    payload: { amount: 1 },
  });
  await outbox.enqueue({
    entity: 'transaction',
    entityId: 't1',
    owner: 'guest',
    payload: { amount: 2 },
  });

  const pending = await outbox.list('pending');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].payload.amount, 2);
});

test('different owners do not coalesce', async () => {
  stubStorage();
  outbox._ready = true;

  await outbox.enqueue({ entity: 'transaction', entityId: 't1', owner: 'guest', payload: {} });
  await outbox.enqueue({ entity: 'transaction', entityId: 't1', owner: 'abc', payload: {} });

  assert.equal((await outbox.list('pending')).length, 2);
});

test('a delete supersedes a pending upsert', async () => {
  stubStorage();
  outbox._ready = true;

  await outbox.enqueue({ entity: 'journal', entityId: 'j1', owner: 'abc', payload: { text: 'hi' } });
  await outbox.enqueue({ entity: 'journal', entityId: 'j1', op: 'delete', owner: 'abc' });

  const pending = await outbox.list('pending');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].op, 'delete');
});

test('pendingFor filters by owner and countPending counts', async () => {
  stubStorage();
  outbox._ready = true;

  await outbox.enqueue({ entity: 'budget', entityId: 'b1', owner: 'guest', payload: {} });
  await outbox.enqueue({ entity: 'budget', entityId: 'b2', owner: 'abc', payload: {} });

  assert.equal((await outbox.pendingFor('abc')).length, 1);
  assert.equal(await outbox.countPending(), 2);
});
