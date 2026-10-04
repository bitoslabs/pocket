/**
 * Ledger Service - cash accounts and investment assets.
 *
 * Accounts (`id`, `name`, `currency`, `openingBalance`) and assets
 * (`id`, `name`, `subtype`, `symbol`) are owner-scoped local records that sync
 * through the same outbox / NIP-78 pipeline as transactions.
 *
 * @module services/ledger-service
 */

import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { currentOwner, filterOwned } from '../core/account.js';
import { storageService } from './storage-service.js';
import { outbox } from './outbox.js';
import { ASSET_SUBTYPES } from '../utils/ledger.js';

function normalizeCurrency(currency) {
  const c = String(currency || 'SATS').trim().toUpperCase();
  return c || 'SATS';
}

class LedgerService {
  constructor() {
    this._accounts = [];
    this._assets = [];
  }

  /** Load accounts and assets for the current owner into the store. */
  async init() {
    try {
      const owner = currentOwner();
      const [accounts, assets] = await Promise.all([
        storageService.getAll('accounts'),
        storageService.getAll('assets'),
      ]);
      this._accounts = filterOwned(accounts, owner);
      this._assets = filterOwned(assets, owner);
      store.set('accounts', this._accounts);
      store.set('assets', this._assets);
      eventBus.emit(Events.ACCOUNTS_LOADED, { accounts: this._accounts });
      eventBus.emit(Events.ASSETS_LOADED, { assets: this._assets });
    } catch (error) {
      console.error('[LedgerService] Error loading ledger:', error);
      this._accounts = [];
      this._assets = [];
    }
  }

  /** Publish an owner-scoped record to the outbox. */
  async _persist(entity, record) {
    await storageService.put(entity === 'account' ? 'accounts' : 'assets', record);
    await outbox.enqueue({
      entity,
      entityId: record.id,
      op: 'upsert',
      owner: record.owner || currentOwner(),
      payload: record,
      updatedAt: record.updatedAt || Date.now(),
    });
  }

  // ==================== Accounts ====================

  getAccounts() {
    return this._accounts || [];
  }

  getAccount(id) {
    return this.getAccounts().find((a) => a.id === id) || null;
  }

  /** The account that unassigned movements are attributed to. */
  primaryAccount() {
    const accounts = this.getAccounts();
    return accounts.find((a) => a.isDefault) || accounts[0] || null;
  }

  getAccountsByCurrency(currency) {
    const c = normalizeCurrency(currency);
    return this.getAccounts().filter((a) => a.currency === c);
  }

  async createAccount({ name, currency = 'SATS', openingBalance = 0 } = {}) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Account name is required');

    const opening = Number(openingBalance) || 0;
    if (!Number.isFinite(opening)) throw new Error('Opening balance must be a number');

    const now = Date.now();
    const account = {
      id: 'acc_' + now + '_' + Math.random().toString(36).slice(2, 9),
      owner: currentOwner(),
      name: trimmed,
      currency: normalizeCurrency(currency),
      openingBalance: opening,
      isDefault: this.getAccounts().length === 0,
      createdAt: now,
      updatedAt: now,
    };

    await this._persist('account', account);
    this._accounts = [...this._accounts, account];
    store.set('accounts', this._accounts);
    eventBus.emit(Events.ACCOUNT_CREATED, { account });
    return account;
  }

  async updateAccount(id, updates = {}) {
    const index = this.getAccounts().findIndex((a) => a.id === id);
    if (index === -1) throw new Error('Account not found');

    const account = {
      ...this._accounts[index],
      ...updates,
      id,
      currency: normalizeCurrency(updates.currency || this._accounts[index].currency),
      updatedAt: Date.now(),
    };

    await this._persist('account', account);
    this._accounts = this._accounts.map((a) => (a.id === id ? account : a));
    store.set('accounts', this._accounts);
    eventBus.emit(Events.ACCOUNT_UPDATED, { account });
    return account;
  }

  async deleteAccount(id) {
    const account = this.getAccount(id);
    if (!account) throw new Error('Account not found');

    await storageService.delete('accounts', id);
    this._accounts = this._accounts.filter((a) => a.id !== id);
    // Promote a replacement default if the removed account was primary.
    if (account.isDefault && this._accounts.length) {
      this._accounts = this._accounts.map((a, i) => (i === 0 ? { ...a, isDefault: true } : a));
    }
    store.set('accounts', this._accounts);
    await outbox.enqueue({
      entity: 'account',
      entityId: id,
      op: 'delete',
      owner: account.owner || currentOwner(),
      payload: null,
      updatedAt: Date.now(),
    });
    eventBus.emit(Events.ACCOUNT_DELETED, { accountId: id });
    return true;
  }

  // ==================== Assets ====================

  getAssets() {
    return this._assets || [];
  }

  getAsset(id) {
    return this.getAssets().find((a) => a.id === id) || null;
  }

  async createAsset({ name, subtype = 'crypto', symbol = '' } = {}) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Asset name is required');
    const sub = ASSET_SUBTYPES.includes(subtype) ? subtype : 'crypto';

    const now = Date.now();
    const asset = {
      id: 'ast_' + now + '_' + Math.random().toString(36).slice(2, 9),
      owner: currentOwner(),
      name: trimmed,
      subtype: sub,
      symbol: String(symbol || '').trim().toUpperCase(),
      createdAt: now,
      updatedAt: now,
    };

    await this._persist('asset', asset);
    this._assets = [...this._assets, asset];
    store.set('assets', this._assets);
    eventBus.emit(Events.ASSET_CREATED, { asset });
    return asset;
  }

  async updateAsset(id, updates = {}) {
    const index = this.getAssets().findIndex((a) => a.id === id);
    if (index === -1) throw new Error('Asset not found');

    const asset = {
      ...this._assets[index],
      ...updates,
      id,
      subtype: ASSET_SUBTYPES.includes(updates.subtype)
        ? updates.subtype
        : this._assets[index].subtype,
      updatedAt: Date.now(),
    };

    await this._persist('asset', asset);
    this._assets = this._assets.map((a) => (a.id === id ? asset : a));
    store.set('assets', this._assets);
    eventBus.emit(Events.ASSET_UPDATED, { asset });
    return asset;
  }

  async deleteAsset(id) {
    const asset = this.getAsset(id);
    if (!asset) throw new Error('Asset not found');

    await storageService.delete('assets', id);
    this._assets = this._assets.filter((a) => a.id !== id);
    store.set('assets', this._assets);
    await outbox.enqueue({
      entity: 'asset',
      entityId: id,
      op: 'delete',
      owner: asset.owner || currentOwner(),
      payload: null,
      updatedAt: Date.now(),
    });
    eventBus.emit(Events.ASSET_DELETED, { assetId: id });
    return true;
  }
}

export const ledgerService = new LedgerService();
export default ledgerService;
