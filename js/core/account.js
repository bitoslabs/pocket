/**
 * Account scoping helpers
 *
 * Local-first storage is partitioned by an `owner` field so the same device
 * can hold a guest workspace and one or more logged-in accounts without
 * mixing or leaking their data.
 *
 * @module core/account
 */

import { authService } from '../services/auth-service.js';

/** Owner key used for data created while not logged in. */
export const GUEST = 'guest';

/** Current owner key: the logged-in pubkey, or `guest`. */
export function currentOwner() {
  try {
    return authService.getPublicKey() || GUEST;
  } catch {
    return GUEST;
  }
}

/**
 * Whether a stored record belongs to `owner`.
 * Legacy records without an `owner` field are treated as belonging to the
 * logged-in account (never to a guest, to avoid leaking another user's data).
 */
export function ownerVisible(record, owner) {
  if (owner === GUEST) return record?.owner === GUEST;
  return !record?.owner || record.owner === owner;
}

/** Filter a list down to records visible to `owner`. */
export function filterOwned(records, owner) {
  return (records || []).filter((r) => ownerVisible(r, owner));
}
