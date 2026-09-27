import test from 'node:test';
import assert from 'node:assert/strict';

import { GUEST, ownerVisible, filterOwned } from '../js/core/account.js';

test('guest sees only guest-owned records', () => {
  assert.equal(ownerVisible({ owner: GUEST }, GUEST), true);
  assert.equal(ownerVisible({ owner: 'abc' }, GUEST), false);
  // Legacy records without an owner must never leak to a guest
  assert.equal(ownerVisible({}, GUEST), false);
  assert.equal(ownerVisible(null, GUEST), false);
});

test('account sees its own records and legacy ones', () => {
  assert.equal(ownerVisible({ owner: 'abc' }, 'abc'), true);
  assert.equal(ownerVisible({}, 'abc'), true);
  assert.equal(ownerVisible({ owner: 'other' }, 'abc'), false);
  assert.equal(ownerVisible({ owner: GUEST }, 'abc'), false);
});

test('filterOwned partitions a mixed list', () => {
  const records = [
    { id: 1, owner: GUEST },
    { id: 2, owner: 'abc' },
    { id: 3 },
    { id: 4, owner: 'other' },
  ];
  assert.deepEqual(
    filterOwned(records, GUEST).map((r) => r.id),
    [1]
  );
  assert.deepEqual(
    filterOwned(records, 'abc').map((r) => r.id),
    [2, 3]
  );
  assert.deepEqual(filterOwned(null, 'abc'), []);
});
