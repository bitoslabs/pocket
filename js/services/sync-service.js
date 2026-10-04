/**
 * Sync Service
 *
 * Offline-first sync engine. Local mutations are queued in the outbox and
 * published as encrypted NIP-78 (kind 30078) app-data events when a key and
 * a relay are available. Remote changes are pulled and merged with
 * last-write-wins using each record's `updatedAt`.
 *
 * Works for logged-in users (full sync) and guests (local only + queue).
 * On login, guest records are "claimed" and published automatically.
 *
 * @module services/sync-service
 */

import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { GUEST, currentOwner } from '../core/account.js';
import { authService } from './auth-service.js';
import { nostrService } from './nostr-service.js';
import { storageService } from './storage-service.js';
import { outbox } from './outbox.js';
import { categoryService } from './category-service.js';
import { budgetService } from './budget-service.js';
import { recurringService } from './recurring-service.js';
import { journalService } from './journal-service.js';
import { ledgerService } from './ledger-service.js';

const APP_TAG = 'nostr-zap-journal';
const KIND_APP_DATA = 30078;

/** entity -> IndexedDB object store */
const ENTITY_STORE = {
  transaction: 'transactions',
  budget: 'budgets',
  category: 'categories',
  recurring: 'recurring',
  journal: 'journal',
  account: 'accounts',
  asset: 'assets',
};

const FLUSH_DEBOUNCE = 800;
const MAX_ATTEMPTS = 8;
const RETRY_BASE = 5000; // 5s, doubling per attempt
const RETRY_MAX = 5 * 60 * 1000;

class SyncService {
  constructor() {
    this._started = false;
    this._flushing = false;
    this._flushTimer = null;
    this._pullSubId = null;
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.status = 'idle'; // idle | syncing | error
    this.pending = 0;
    this.pendingIds = [];
    this.lastSyncedAt = 0;
    this.error = '';
  }

  async init() {
    this._publishStatus();
    this._bindEvents();
  }

  _publishStatus() {
    store.set('sync', {
      online: this.online,
      status: this.status,
      pending: this.pending,
      pendingIds: this.pendingIds,
      lastSyncedAt: this.lastSyncedAt,
      error: this.error,
    });
  }

  async _refreshPending() {
    const pending = await outbox.list('pending');
    this.pending = pending.length;
    this.pendingIds = pending.map((e) => `${e.entity}:${e.entityId}`);
    this._publishStatus();
  }

  _bindEvents() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._setOnline(true));
      window.addEventListener('offline', () => this._setOnline(false));
    }

    eventBus.on(Events.CONNECTION_CHANGED, ({ online } = {}) => {
      this.online = !!online;
      this._publishStatus();
      if (this.online && authService.isAuthenticated()) {
        this._scheduleFlush();
        this.pull();
      }
    });

    eventBus.on(Events.OUTBOX_CHANGED, async () => {
      await this._refreshPending();
      if (authService.isAuthenticated()) this._scheduleFlush();
    });

    eventBus.on(Events.AUTH_LOGIN, async (user) => {
      await this.claimGuest(user.pubkey);
      await this.flush();
      this.pull();
    });

    eventBus.on(Events.AUTH_LOGOUT, () => {
      this.status = 'idle';
      this.error = '';
      this._publishStatus();
    });
  }

  /** Mark sync as ready and do a first pass for a logged-in session. */
  async start() {
    if (this._started) return;
    this._started = true;
    await this._refreshPending();
    if (authService.isAuthenticated()) {
      await this.flush();
      this.pull();
    }
  }

  _setOnline(online) {
    this.online = !!online;
    this._publishStatus();
    if (this.online && authService.isAuthenticated()) {
      this._scheduleFlush();
      this.pull();
    }
  }

  _scheduleFlush() {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this.flush(), FLUSH_DEBOUNCE);
  }

  /** Publish all pending outbox entries for the current account. */
  async flush() {
    if (this._flushing) return;
    const owner = currentOwner();
    if (owner === GUEST || !authService.isAuthenticated()) return;

    const now = Date.now();
    const entries = (await outbox.pendingFor(owner)).filter(
      (e) => !e.nextAttemptAt || e.nextAttemptAt <= now
    );
    if (entries.length === 0) {
      await this._refreshPending();
      return;
    }

    this._flushing = true;
    this.status = 'syncing';
    this.error = '';
    this._publishStatus();
    eventBus.emit(Events.SYNC_STARTED, { pending: entries.length });

    try {
      let published = 0;
      for (const entry of entries) {
        const ok = await this._publishEntry(entry, owner);
        if (ok) published++;
      }
      this.lastSyncedAt = Date.now();
      this.status = 'idle';
      await this._refreshPending();
      eventBus.emit(Events.SYNC_DONE, { published, pending: this.pending });
    } catch (e) {
      this.status = 'error';
      this.error = e?.message || 'Sync failed';
      this._publishStatus();
      eventBus.emit(Events.SYNC_ERROR, { message: this.error });
    } finally {
      this._flushing = false;
    }
  }

  async _publishEntry(entry, owner) {
    try {
      const event = await this._buildEvent(entry, owner);
      const signed = await authService.signEvent(event);
      const result = await nostrService.publish(signed);
      if (result.successes.length > 0) {
        entry.state = 'done';
        entry.lastError = null;
        entry.eventId = signed.id;
        await outbox.update(entry);
        if (entry.op !== 'delete') {
          await this._stampEventId(entry.entity, entry.entityId, signed.id);
        }
        return true;
      }
      throw new Error(result.failures[0]?.reason || 'No relay accepted the event');
    } catch (e) {
      entry.attempts = (entry.attempts || 0) + 1;
      entry.lastError = e?.message || 'publish failed';
      entry.state = entry.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      entry.nextAttemptAt = Date.now() + Math.min(RETRY_MAX, RETRY_BASE * 2 ** Math.max(0, entry.attempts - 1));
      await outbox.update(entry);
      this.error = entry.lastError;
      return false;
    }
  }

  async _buildEvent(entry, owner) {
    if (entry.entity === 'journal') return this._buildJournalEvent(entry, owner);

    const d = `zapjournal:${entry.entity}:${entry.entityId}`;
    const payload = {
      v: 1,
      entity: entry.entity,
      id: entry.entityId,
      deleted: entry.op === 'delete',
      updatedAt: entry.updatedAt,
      data: entry.op === 'delete' ? null : entry.payload,
    };
    const content = await authService.encrypt(owner, JSON.stringify(payload));
    return {
      kind: KIND_APP_DATA,
      pubkey: owner,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', d],
        ['app', APP_TAG],
      ],
      content,
    };
  }

  /**
   * Journal now syncs as encrypted NIP-78 app-data (kind 30078), the same
   * replaceable record model as finance data, so edits are idempotent upserts.
   */
  async _buildJournalEvent(entry, owner) {
    const d = `zapjournal:journal:${entry.entityId}`;
    const data = entry.payload || {};
    const tagList = Array.isArray(data.tags) ? data.tags : data.tag ? [data.tag] : [];

    const payload = {
      v: 1,
      entity: 'journal',
      id: entry.entityId,
      deleted: entry.op === 'delete',
      updatedAt: entry.updatedAt,
      data:
        entry.op === 'delete'
          ? null
          : {
              title: data.title,
              text: data.text,
              mood: data.mood || null,
              tag: tagList[0] || data.tag || 'personal',
              tags: tagList,
              linkedTransaction: data.linkedTransaction || null,
              created_at: data.created_at,
            },
    };
    const content = await authService.encrypt(owner, JSON.stringify(payload));
    return {
      kind: KIND_APP_DATA,
      pubkey: owner,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', d],
        ['app', APP_TAG],
      ],
      content,
    };
  }

  /** Record the published event id on the local record (any entity). */
  async _stampEventId(entity, id, eventId) {
    const storeName = ENTITY_STORE[entity];
    if (!storeName) return;
    const record = await storageService.get(storeName, id);
    if (!record || record.eventId === eventId) return;
    await storageService.put(storeName, { ...record, eventId });

    // Reflect in memory where the UI reads live state
    if (entity === 'transaction') {
      const txs = store.get('transactions') || [];
      const i = txs.findIndex((t) => t.id === id);
      if (i >= 0) {
        const next = [...txs];
        next[i] = { ...next[i], eventId };
        store.set('transactions', next);
      }
    } else if (entity === 'journal') {
      const entries = store.get('journal') || [];
      const i = entries.findIndex((e) => e.id === id);
      if (i >= 0) {
        const next = [...entries];
        next[i] = { ...next[i], eventId };
        store.set('journal', next);
      }
    }
  }

  /** Pull remote app-data events and merge them (last-write-wins). */
  pull() {
    const owner = currentOwner();
    if (owner === GUEST || !authService.isAuthenticated()) return;
    if (this._pullSubId) nostrService.unsubscribe(this._pullSubId);

    const since = Number(storageService.getLocal(`sync_cursor_${owner}`, 0)) || 0;

    this._pullSubId = nostrService.subscribe(
      {
        kinds: [KIND_APP_DATA],
        authors: [owner],
        since: since || undefined,
        limit: 500,
      },
      (event) => this._mergeEvent(event, owner),
      () => {
        storageService.setLocal(`sync_cursor_${owner}`, Math.floor(Date.now() / 1000));
        this._refreshServices(owner);
      }
    );
  }

  async _mergeEvent(event, owner) {
    try {
      const dTag = (event.tags || []).find((t) => t[0] === 'd')?.[1] || '';
      const match = dTag.match(/^zapjournal:([a-z]+):(.+)$/);
      if (!match) return;

      const [, entity, entityId] = match;
      const storeName = ENTITY_STORE[entity];
      if (!storeName) return;

      const plaintext = await authService.decrypt(owner, event.content);
      const payload = JSON.parse(plaintext);
      const updatedAt = Number(payload?.updatedAt) || event.created_at * 1000;

      const existing = await storageService.get(storeName, entityId);
      if (existing && (existing.updatedAt || 0) >= updatedAt) return;

      if (payload.deleted) {
        await storageService.delete(storeName, entityId);
        this._removeFromState(entity, entityId);
      } else {
        const record = {
          ...(payload.data || {}),
          id: entityId,
          owner,
          updatedAt,
          eventId: event.id,
        };
        await storageService.put(storeName, record);
        this._upsertState(entity, record);
      }
    } catch (e) {
      console.warn('[Sync] Could not merge remote event:', e?.message || e);
    }
  }

  _upsertState(entity, record) {
    if (entity === 'transaction') {
      const txs = [...(store.get('transactions') || [])];
      const i = txs.findIndex((t) => t.id === record.id);
      if (i >= 0) txs[i] = record;
      else txs.unshift(record);
      txs.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      store.set('transactions', txs);
      return;
    }
    if (entity === 'journal') {
      const entries = [...(store.get('journal') || [])];
      const i = entries.findIndex((e) => e.id === record.id);
      if (i >= 0) entries[i] = record;
      else entries.unshift(record);
      entries.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      store.set('journal', entries);
    }
    if (entity === 'account' || entity === 'asset') {
      const key = entity === 'account' ? 'accounts' : 'assets';
      const list = [...(store.get(key) || [])];
      const i = list.findIndex((x) => x.id === record.id);
      if (i >= 0) list[i] = record;
      else list.push(record);
      store.set(key, list);
    }
  }

  _removeFromState(entity, id) {
    if (entity === 'transaction') {
      store.set('transactions', (store.get('transactions') || []).filter((t) => t.id !== id));
    } else if (entity === 'journal') {
      store.set('journal', (store.get('journal') || []).filter((e) => e.id !== id));
    } else if (entity === 'account' || entity === 'asset') {
      const key = entity === 'account' ? 'accounts' : 'assets';
      store.set(key, (store.get(key) || []).filter((x) => x.id !== id));
    }
  }

  async _refreshServices(owner) {
    await categoryService.init();
    await budgetService.init();
    await recurringService.init();
    await ledgerService.init();
    if (owner && authService.isAuthenticated()) {
      await journalService.init(owner);
    }
  }

  /**
   * Reassign guest-owned records to the logged-in account and queue them for
   * publishing. Returns the number of claimed records.
   */
  async claimGuest(pubkey) {
    if (!pubkey) return 0;
    let claimed = 0;

    for (const [entity, storeName] of Object.entries(ENTITY_STORE)) {
      const all = await storageService.getAll(storeName);
      const guestRecords = all.filter((r) => r.owner === GUEST);
      for (const record of guestRecords) {
        const updated = { ...record, owner: pubkey, updatedAt: Date.now() };
        await storageService.put(storeName, updated);
        await outbox.enqueue({
          entity,
          entityId: updated.id,
          op: 'upsert',
          owner: pubkey,
          payload: updated,
          updatedAt: updated.updatedAt,
        });
        claimed++;
      }
    }

    if (claimed > 0) {
      await this._refreshServices(pubkey);
      await this._refreshPending();
    }
    return claimed;
  }

  /** Retry now: clear backoff on pending entries and revive failed ones. */
  async retryNow() {
    const owner = currentOwner();
    if (owner === GUEST || !authService.isAuthenticated()) return;
    const pending = await outbox.pendingFor(owner);
    for (const entry of pending) {
      if (entry.nextAttemptAt) {
        entry.nextAttemptAt = 0;
        await outbox.update(entry);
      }
    }
    await this.retryFailed();
    await this.flush();
  }

  /** Retry entries that exhausted their attempts. */
  async retryFailed() {
    const failed = await outbox.list('failed');
    for (const entry of failed) {
      entry.state = 'pending';
      entry.attempts = 0;
      entry.nextAttemptAt = 0;
      await outbox.update(entry);
    }
    await this.flush();
  }

  stop() {
    if (this._pullSubId) {
      nostrService.unsubscribe(this._pullSubId);
      this._pullSubId = null;
    }
  }
}

export const syncService = new SyncService();
export default syncService;
