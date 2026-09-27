/**
 * Journal Service
 * Private encrypted journal with NIP-04 self-DMs
 * 
 * @module services/journal-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { currentOwner, filterOwned } from '../core/account.js';
import { outbox } from './outbox.js';
import { authService } from './auth-service.js';
import { nostrService } from './nostr-service.js';
import { storageService } from './storage-service.js';

class JournalService {
    constructor() {
        this._subscriptionId = null;
        this._decryptedCache = new Map();
    }

    /**
     * Initialize journal service
     * @param {string} pubkey - User's public key
     */
    async init(pubkey) {
        if (!pubkey) return;

        // Load cached entries for this account only
        const cached = filterOwned(await storageService.getAll('journal'), pubkey);
        if (cached.length > 0) {
            store.set('journal', cached);
        }

        // Subscribe to encrypted DMs to self
        this.subscribeToJournal(pubkey);
    }

    /**
     * Subscribe to journal entries (encrypted DMs to self)
     * @param {string} pubkey - User's public key
     */
    subscribeToJournal(pubkey) {
        if (this._subscriptionId) {
            nostrService.unsubscribe(this._subscriptionId);
        }

        // Filter for encrypted DMs from and to self
        const filter = {
            kinds: [config.kinds.ENCRYPTED_DM, config.kinds.DELETE],
            authors: [pubkey],
            limit: 200
        };

        this._subscriptionId = nostrService.subscribe(
            filter,
            (event) => this._handleJournalEvent(event),
            () => {
                console.log('[Journal] End of stored events');
                eventBus.emit(Events.JOURNAL_UPDATED, { count: store.get('journal')?.length || 0 });
            }
        );
    }

    /**
     * Unsubscribe from journal events
     */
    unsubscribe() {
        if (this._subscriptionId) {
            nostrService.unsubscribe(this._subscriptionId);
            this._subscriptionId = null;
        }
    }

    /**
     * Handle incoming journal event
     * @private
     */
    async _handleJournalEvent(event) {
        try {
            // Remote delete request (kind 5) referencing a journal event
            if (event.kind === config.kinds.DELETE) {
                this._handleJournalDelete(event);
                return;
            }

            // Check if this is a journal entry (has our app tag)
            const tags = this._parseTags(event.tags);
            if (!tags.app || tags.app !== 'nostr-zap-journal') return;

            const tagList = this._parseTagList(event.tags);

            // Decrypt content
            const pubkey = authService.getPublicKey();
            let content;

            if (this._decryptedCache.has(event.id)) {
                content = this._decryptedCache.get(event.id);
            } else {
                content = await authService.decrypt(pubkey, event.content);
                this._decryptedCache.set(event.id, content);
            }

            // Parse decrypted content
            let entryData;
            try {
                entryData = JSON.parse(content);
            } catch {
                entryData = { text: content };
            }

            const fields = {
                owner: pubkey,
                title: entryData.title || 'Untitled',
                text: entryData.text || '',
                tag: tagList[0] || tags.t || 'personal',
                tags: tagList.length ? tagList : (tags.t ? [tags.t] : []),
                mood: entryData.mood || null,
                linkedTransaction: tags.e,
                created_at: event.created_at,
                updated_at: entryData.updated_at || event.created_at,
                eventId: event.id,
                raw: event
            };

            // Reconcile with a local (possibly still-pending) record using the
            // `client` tag so publishing our own entry doesn't create a duplicate.
            const existing = store.get('journal') || [];
            const existingIndex = existing.findIndex(
                (e) => (tags.client && e.id === tags.client) || e.eventId === event.id || e.id === event.id
            );

            let entry;
            let updated;
            if (existingIndex >= 0) {
                entry = { ...existing[existingIndex], ...fields, id: existing[existingIndex].id };
                updated = [...existing];
                updated[existingIndex] = entry;
            } else {
                entry = { id: event.id, ...fields };
                updated = [entry, ...existing].sort((a, b) => b.created_at - a.created_at);
            }

            store.set('journal', updated);
            await storageService.put('journal', entry);

        } catch (error) {
            console.error('[Journal] Error processing entry:', error);
        }
    }

    /**
     * Apply a remote kind 5 delete to local journal entries.
     * @private
     */
    _handleJournalDelete(event) {
        const ids = (event.tags || []).filter(t => t[0] === 'e' && t[1]).map(t => t[1]);
        if (!ids.length) return;

        const entries = store.get('journal') || [];
        const removed = entries.filter(e => ids.includes(e.eventId) || ids.includes(e.id));
        if (!removed.length) return;

        store.set('journal', entries.filter(e => !ids.includes(e.eventId) && !ids.includes(e.id)));
        removed.forEach(e => storageService.delete('journal', e.id));
        eventBus.emit(Events.JOURNAL_UPDATED, { action: 'delete' });
    }

    /**
     * Create a new journal entry
     * @param {Object} data - Entry data
     * @returns {Promise<Object>} Created entry
     */
    async create({ title, text, tag = 'personal', tags = null, mood = null, linkedTransaction = null }) {
        const owner = currentOwner();
        const tagList = Array.isArray(tags) && tags.length ? tags : (tag ? [tag] : []);
        const createdAt = Math.floor(Date.now() / 1000);

        // Local-first: save immediately, publish later when a key is available.
        const entry = {
            id: `journal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            owner,
            title,
            text,
            tag: tagList[0] || tag,
            tags: tagList,
            mood,
            linkedTransaction,
            created_at: createdAt,
            updated_at: createdAt,
        };

        const entries = store.get('journal') || [];
        store.set('journal', [entry, ...entries]);
        await storageService.put('journal', entry);

        await outbox.enqueue({
            entity: 'journal',
            entityId: entry.id,
            op: 'upsert',
            owner,
            payload: {
                title,
                text,
                mood,
                tags: tagList,
                tag: entry.tag,
                linkedTransaction,
                created_at: createdAt,
            },
            updatedAt: createdAt * 1000,
        });

        eventBus.emit(Events.JOURNAL_UPDATED, { entry, action: 'create' });
        return entry;
    }

    /**
     * Get journal entries with optional filtering
     * @param {Object} options - Filter options
     * @returns {Array} Filtered entries
     */
    getEntries({ tag, search, startDate, endDate, limit } = {}) {
        let entries = store.get('journal') || [];

        if (tag) {
            entries = entries.filter(e => e.tag === tag);
        }

        if (search) {
            const searchLower = search.toLowerCase();
            entries = entries.filter(e =>
                e.title.toLowerCase().includes(searchLower) ||
                e.text.toLowerCase().includes(searchLower)
            );
        }

        if (startDate) {
            entries = entries.filter(e => e.created_at >= startDate);
        }

        if (endDate) {
            entries = entries.filter(e => e.created_at <= endDate);
        }

        if (limit) {
            entries = entries.slice(0, limit);
        }

        return entries;
    }

    /**
     * Get entry by ID
     * @param {string} id - Entry ID
     * @returns {Object|null}
     */
    getEntry(id) {
        const entries = store.get('journal') || [];
        return entries.find(e => e.id === id) || null;
    }

    /**
     * Delete a journal entry
     * @param {string} id - Entry ID
     * @returns {Promise<boolean>}
     */
    async delete(id) {
        const entry = this.getEntry(id);
        if (!entry) return false;

        const owner = entry.owner || currentOwner();

        // Remove locally first (works offline / logged out)
        const entries = store.get('journal') || [];
        store.set('journal', entries.filter(e => e.id !== id));
        await storageService.delete('journal', id);

        // Queue the kind 5 delete (needs eventId once the entry was published)
        await outbox.enqueue({
            entity: 'journal',
            entityId: id,
            op: 'delete',
            owner,
            payload: entry.eventId ? { eventId: entry.eventId } : null,
            updatedAt: Date.now(),
        });

        eventBus.emit(Events.JOURNAL_UPDATED, { id, action: 'delete' });
        return true;
    }

    /**
     * Get available tags with counts
     * @returns {Array} Tag objects with name and count
     */
    getTags() {
        const entries = store.get('journal') || [];
        const tagCounts = entries.reduce((acc, e) => {
            const list = Array.isArray(e.tags) && e.tags.length ? e.tags : (e.tag ? [e.tag] : []);
            list.forEach(t => {
                acc[t] = (acc[t] || 0) + 1;
            });
            return acc;
        }, {});

        return Object.entries(tagCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Export journal entries as encrypted backup
     * @returns {Promise<string>} Base64 encrypted backup
     */
    async exportBackup() {
        const entries = store.get('journal') || [];
        const pubkey = authService.getPublicKey();

        const backup = {
            version: 1,
            exported_at: Date.now(),
            entries: entries.map(e => ({
                id: e.id,
                title: e.title,
                text: e.text,
                tag: e.tag,
                tags: e.tags,
                mood: e.mood,
                linkedTransaction: e.linkedTransaction,
                created_at: e.created_at
            }))
        };

        const encrypted = await authService.encrypt(pubkey, JSON.stringify(backup));
        return btoa(encrypted);
    }

    /**
     * Parse event tags into object
     * @private
     */
    _parseTags(tags) {
        const result = {};
        for (const [key, value] of tags) {
            result[key] = value;
        }
        return result;
    }

    /**
     * Collect all 't' tag values as an array
     * @private
     */
    _parseTagList(tags) {
        return tags
            .filter(t => t[0] === 't' && t[1])
            .map(t => t[1]);
    }
}

// Singleton instance
export const journalService = new JournalService();

export default journalService;
