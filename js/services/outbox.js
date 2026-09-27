/**
 * Outbox
 *
 * Durable queue of local mutations that still need to be published to Nostr.
 * Every create/update/delete on a synced entity appends an entry here first,
 * so edits made offline (or while logged out) are never lost and can be
 * replayed when a key and a relay become available.
 *
 * @module services/outbox
 */

import { eventBus, Events } from '../core/event-bus.js';
import { storageService } from './storage-service.js';

const STORE = 'outbox';

function newId() {
  return `out_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

class Outbox {
  constructor() {
    this._ready = false;
  }

  async _ensure() {
    if (this._ready) return;
    await storageService.init();
    this._ready = true;
  }

  /**
   * Queue (or coalesce) a mutation.
   * @param {Object} change
   * @param {string} change.entity - e.g. 'transaction'
   * @param {string} change.entityId
   * @param {'upsert'|'delete'} [change.op]
   * @param {string} change.owner - pubkey or 'guest'
   * @param {Object} [change.payload] - record snapshot to publish
   * @param {number} [change.updatedAt]
   */
  async enqueue({ entity, entityId, op = 'upsert', owner, payload = null, updatedAt }) {
    await this._ensure();
    const all = await storageService.getAll(STORE);

    // Coalesce: an earlier pending change for the same record is superseded.
    const stale = all.filter(
      (e) => e.entity === entity && e.entityId === entityId && e.owner === owner
    );
    for (const e of stale) {
      await storageService.delete(STORE, e.id);
    }

    const entry = {
      id: newId(),
      entity,
      entityId,
      op,
      owner,
      payload,
      updatedAt: updatedAt || Date.now(),
      state: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: Date.now(),
    };

    await storageService.put(STORE, entry);
    await this._changed();
    return entry;
  }

  async list(state = null) {
    await this._ensure();
    const all = await storageService.getAll(STORE);
    const filtered = state ? all.filter((e) => e.state === state) : all;
    return filtered.sort((a, b) => a.createdAt - b.createdAt);
  }

  async pendingFor(owner) {
    const pending = await this.list('pending');
    return pending.filter((e) => e.owner === owner);
  }

  async update(entry) {
    await this._ensure();
    await storageService.put(STORE, entry);
    await this._changed();
  }

  async remove(id) {
    await this._ensure();
    await storageService.delete(STORE, id);
    await this._changed();
  }

  async countPending() {
    return (await this.list('pending')).length;
  }

  async _changed() {
    const pending = await this.countPending();
    eventBus.emit(Events.OUTBOX_CHANGED, { pending });
  }
}

export const outbox = new Outbox();
export default outbox;
