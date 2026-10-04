/**
 * Storage Service
 * Persistent storage with IndexedDB and LocalStorage fallback
 * 
 * @module services/storage-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';

class StorageService {
    constructor() {
        this._db = null;
        this._dbReady = false;
        this._initPromise = null;
    }

    /**
     * Initialize IndexedDB connection
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        if (this._initPromise) return this._initPromise;

        this._initPromise = new Promise((resolve) => {
            if (!window.indexedDB) {
                console.warn('[Storage] IndexedDB not supported, falling back to LocalStorage');
                this._dbReady = false;
                resolve(null);
                return;
            }

            const request = indexedDB.open(config.storage.dbName, config.storage.dbVersion);

            request.onerror = () => {
                console.error('[Storage] IndexedDB error:', request.error);
                this._dbReady = false;
                resolve(null);
            };

            request.onsuccess = () => {
                this._db = request.result;
                this._dbReady = true;
                console.log('[Storage] IndexedDB initialized');
                resolve(this._db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object stores
                if (!db.objectStoreNames.contains('transactions')) {
                    const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
                    txStore.createIndex('timestamp', 'created_at', { unique: false });
                    txStore.createIndex('category', 'category', { unique: false });
                    txStore.createIndex('owner', 'owner', { unique: false });
                }

                if (!db.objectStoreNames.contains('journal')) {
                    const journalStore = db.createObjectStore('journal', { keyPath: 'id' });
                    journalStore.createIndex('timestamp', 'created_at', { unique: false });
                    journalStore.createIndex('tag', 'tag', { unique: false });
                    journalStore.createIndex('owner', 'owner', { unique: false });
                }

                if (!db.objectStoreNames.contains('events')) {
                    const eventsStore = db.createObjectStore('events', { keyPath: 'id' });
                    eventsStore.createIndex('kind', 'kind', { unique: false });
                    eventsStore.createIndex('pubkey', 'pubkey', { unique: false });
                }

                if (!db.objectStoreNames.contains('cache')) {
                    db.createObjectStore('cache', { keyPath: 'key' });
                }

                // Create object stores for new features
                if (!db.objectStoreNames.contains('categories')) {
                    const categoriesStore = db.createObjectStore('categories', { keyPath: 'id' });
                    categoriesStore.createIndex('type', 'type', { unique: false });
                    categoriesStore.createIndex('name', 'name', { unique: false });
                }

                if (!db.objectStoreNames.contains('budgets')) {
                    const budgetsStore = db.createObjectStore('budgets', { keyPath: 'id' });
                    budgetsStore.createIndex('categoryId', 'categoryId', { unique: false });
                    budgetsStore.createIndex('period', 'period', { unique: false });
                }

                if (!db.objectStoreNames.contains('recurring')) {
                    const recurringStore = db.createObjectStore('recurring', { keyPath: 'id' });
                    recurringStore.createIndex('frequency', 'frequency', { unique: false });
                    recurringStore.createIndex('nextDue', 'nextDue', { unique: false });
                    recurringStore.createIndex('isActive', 'isActive', { unique: false });
                }

                // Cash accounts + investment assets (cost-basis ledger)
                if (!db.objectStoreNames.contains('accounts')) {
                    const accountsStore = db.createObjectStore('accounts', { keyPath: 'id' });
                    accountsStore.createIndex('owner', 'owner', { unique: false });
                    accountsStore.createIndex('currency', 'currency', { unique: false });
                }

                if (!db.objectStoreNames.contains('assets')) {
                    const assetsStore = db.createObjectStore('assets', { keyPath: 'id' });
                    assetsStore.createIndex('owner', 'owner', { unique: false });
                    assetsStore.createIndex('subtype', 'subtype', { unique: false });
                }

                // Offline-first sync: queued mutations + per-account sync metadata
                if (!db.objectStoreNames.contains('outbox')) {
                    const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
                    outboxStore.createIndex('state', 'state', { unique: false });
                    outboxStore.createIndex('entity', 'entity', { unique: false });
                    outboxStore.createIndex('entityId', 'entityId', { unique: false });
                }

                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta', { keyPath: 'key' });
                }

                // Upgrade existing stores in place (non-destructive)
                if (event.oldVersion > 0 && db.objectStoreNames.contains('transactions')) {
                    const txStore = event.target.transaction.objectStore('transactions');
                    if (!txStore.indexNames.contains('owner')) {
                        txStore.createIndex('owner', 'owner', { unique: false });
                    }
                }
                if (event.oldVersion > 0 && db.objectStoreNames.contains('journal')) {
                    const journalStore = event.target.transaction.objectStore('journal');
                    if (!journalStore.indexNames.contains('owner')) {
                        journalStore.createIndex('owner', 'owner', { unique: false });
                    }
                }
            };
        });

        return this._initPromise;
    }

    // ==================== LocalStorage Methods ====================

    /**
     * Get item from LocalStorage
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if not found
     * @returns {*} Parsed value or default
     */
    getLocal(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error(`[Storage] Error reading local "${key}":`, error);
            return defaultValue;
        }
    }

    /**
     * Set item in LocalStorage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     */
    setLocal(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error(`[Storage] Error writing local "${key}":`, error);
        }
    }

    /**
     * Remove item from LocalStorage
     * @param {string} key - Storage key
     */
    removeLocal(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`[Storage] Error removing local "${key}":`, error);
        }
    }

    // ==================== IndexedDB Methods ====================

    /**
     * Get all items from an object store
     * @param {string} storeName - Object store name
     * @returns {Promise<Array>}
     */
    async getAll(storeName) {
        if (!this._dbReady) {
            return this.getLocal(storeName, []);
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this._db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.getAll();

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => {
                    console.error(`[Storage] Error getting all from "${storeName}":`, request.error);
                    resolve([]);
                };
            } catch (error) {
                console.error(`[Storage] Transaction error for "${storeName}":`, error);
                resolve([]);
            }
        });
    }

    /**
     * Get item by key from an object store
     * @param {string} storeName - Object store name
     * @param {string} key - Item key
     * @returns {Promise<*>}
     */
    async get(storeName, key) {
        if (!this._dbReady) {
            const data = this.getLocal(storeName, []);
            return data.find(item => item.id === key) || null;
        }

        return new Promise((resolve, reject) => {
            try {
                const transaction = this._db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                const request = store.get(key);

                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => {
                    console.error(`[Storage] Error getting "${key}" from "${storeName}":`, request.error);
                    resolve(null);
                };
            } catch (error) {
                console.error(`[Storage] Transaction error:`, error);
                resolve(null);
            }
        });
    }

    /**
     * Put item into an object store
     * @param {string} storeName - Object store name
     * @param {Object} data - Data to store (must have id)
     * @returns {Promise<boolean>}
     */
    async put(storeName, data) {
        if (!this._dbReady) {
            const items = this.getLocal(storeName, []);
            const index = items.findIndex(item => item.id === data.id);
            if (index >= 0) {
                items[index] = data;
            } else {
                items.push(data);
            }
            this.setLocal(storeName, items);
            return true;
        }

        return new Promise((resolve) => {
            try {
                const transaction = this._db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.put(data);

                request.onsuccess = () => resolve(true);
                request.onerror = () => {
                    console.error(`[Storage] Error putting data in "${storeName}":`, request.error);
                    resolve(false);
                };
            } catch (error) {
                console.error(`[Storage] Transaction error:`, error);
                resolve(false);
            }
        });
    }

    /**
     * Put multiple items into an object store
     * @param {string} storeName - Object store name
     * @param {Array} items - Array of items to store
     * @returns {Promise<boolean>}
     */
    async putMany(storeName, items) {
        if (!this._dbReady) {
            const existing = this.getLocal(storeName, []);
            const merged = [...existing];

            items.forEach(item => {
                const index = merged.findIndex(e => e.id === item.id);
                if (index >= 0) {
                    merged[index] = item;
                } else {
                    merged.push(item);
                }
            });

            this.setLocal(storeName, merged);
            return true;
        }

        return new Promise((resolve) => {
            try {
                const transaction = this._db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);

                items.forEach(item => store.put(item));

                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => {
                    console.error(`[Storage] Error putting many in "${storeName}":`, transaction.error);
                    resolve(false);
                };
            } catch (error) {
                console.error(`[Storage] Transaction error:`, error);
                resolve(false);
            }
        });
    }

    /**
     * Delete item from an object store
     * @param {string} storeName - Object store name
     * @param {string} key - Item key
     * @returns {Promise<boolean>}
     */
    async delete(storeName, key) {
        if (!this._dbReady) {
            const items = this.getLocal(storeName, []);
            const filtered = items.filter(item => item.id !== key);
            this.setLocal(storeName, filtered);
            return true;
        }

        return new Promise((resolve) => {
            try {
                const transaction = this._db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.delete(key);

                request.onsuccess = () => resolve(true);
                request.onerror = () => {
                    console.error(`[Storage] Error deleting "${key}" from "${storeName}":`, request.error);
                    resolve(false);
                };
            } catch (error) {
                console.error(`[Storage] Transaction error:`, error);
                resolve(false);
            }
        });
    }

    /**
     * Clear all items from an object store
     * @param {string} storeName - Object store name
     * @returns {Promise<boolean>}
     */
    async clear(storeName) {
        if (!this._dbReady) {
            this.removeLocal(storeName);
            return true;
        }

        return new Promise((resolve) => {
            try {
                const transaction = this._db.transaction(storeName, 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();

                request.onsuccess = () => resolve(true);
                request.onerror = () => {
                    console.error(`[Storage] Error clearing "${storeName}":`, request.error);
                    resolve(false);
                };
            } catch (error) {
                console.error(`[Storage] Transaction error:`, error);
                resolve(false);
            }
        });
    }

    /**
     * Query items by index
     * @param {string} storeName - Object store name
     * @param {string} indexName - Index name
     * @param {*} value - Value to query
     * @returns {Promise<Array>}
     */
    async queryByIndex(storeName, indexName, value) {
        if (!this._dbReady) {
            const items = this.getLocal(storeName, []);
            return items.filter(item => item[indexName] === value);
        }

        return new Promise((resolve) => {
            try {
                const transaction = this._db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(value);

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => {
                    console.error(`[Storage] Error querying "${indexName}" in "${storeName}":`, request.error);
                    resolve([]);
                };
            } catch (error) {
                console.error(`[Storage] Transaction error:`, error);
                resolve([]);
            }
        });
    }
}

// Singleton instance
export const storageService = new StorageService();

export default storageService;
