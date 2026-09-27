import test from 'node:test';
import assert from 'node:assert/strict';

import { syncService } from '../js/services/sync-service.js';
import { authService } from '../js/services/auth-service.js';

// Stub NIP-04 encryption so event building can be tested without a key/browser.
authService.encrypt = async (_pubkey, plaintext) => `enc:${plaintext}`;
const decode = (event) => JSON.parse(event.content.slice('enc:'.length));

test('journal upserts are replaceable NIP-78 records', async () => {
  const entry = {
    entity: 'journal',
    entityId: 'journal_1',
    op: 'upsert',
    owner: 'abc',
    updatedAt: 1000,
    payload: { title: 'T', text: 'hello', tag: 'personal', tags: ['personal'], created_at: 100 },
  };
  const event = await syncService._buildJournalEvent(entry, 'abc');

  assert.equal(event.kind, 30078);
  assert.deepEqual(event.tags.find((t) => t[0] === 'd'), ['d', 'zapjournal:journal:journal_1']);

  const payload = decode(event);
  assert.equal(payload.entity, 'journal');
  assert.equal(payload.deleted, false);
  assert.equal(payload.data.text, 'hello');
});

test('journal deletes are replaceable tombstones (no kind 5)', async () => {
  const event = await syncService._buildJournalEvent(
    { entity: 'journal', entityId: 'journal_1', op: 'delete', owner: 'abc', updatedAt: 2 },
    'abc'
  );
  assert.equal(event.kind, 30078);
  const payload = decode(event);
  assert.equal(payload.deleted, true);
  assert.equal(payload.data, null);
});

test('finance records use a per-entity d tag', async () => {
  const event = await syncService._buildEvent(
    { entity: 'transaction', entityId: 'tx1', op: 'upsert', owner: 'abc', updatedAt: 5, payload: { amount: 1 } },
    'abc'
  );
  assert.equal(event.kind, 30078);
  assert.deepEqual(event.tags.find((t) => t[0] === 'd'), ['d', 'zapjournal:transaction:tx1']);
});
