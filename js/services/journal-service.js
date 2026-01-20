/**
 * Journal Service
 * Private encrypted journal with NIP-04 self-DMs
 * 
 * @module services/journal-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
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

        // Load cached entries
        const cached = await storageService.getAll('journal');
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
            kinds: [config.kinds.ENCRYPTED_DM],
            authors: [pubkey],
            '#p': [pubkey],
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
            // Check if this is a journal entry (has our app tag)
            const tags = this._parseTags(event.tags);
            if (!tags.app || tags.app !== 'nostr-zap-journal') return;

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

            const entry = {
                id: event.id,
                title: entryData.title || 'Untitled',
                text: entryData.text || '',
                tag: tags.t || 'personal',
                linkedTransaction: tags.e,
                created_at: event.created_at,
                updated_at: entryData.updated_at || event.created_at,
                raw: event
            };

            // Check for duplicates and update state
            const existing = store.get('journal') || [];
            const existingIndex = existing.findIndex(e => e.id === entry.id);

            let updated;
            if (existingIndex >= 0) {
                updated = [...existing];
                updated[existingIndex] = entry;
            } else {
                updated = [entry, ...existing].sort((a, b) => b.created_at - a.created_at);
            }

            store.set('journal', updated);
            await storageService.put('journal', entry);

        } catch (error) {
            console.error('[Journal] Error processing entry:', error);
        }
    }

    /**
     * Create a new journal entry
     * @param {Object} data - Entry data
     * @returns {Promise<Object>} Created entry
     */
    async create({ title, text, tag = 'personal', linkedTransaction = null }) {
        const pubkey = authService.getPublicKey();
        if (!pubkey) throw new Error('Not authenticated');

        // Create content object
        const content = JSON.stringify({
            title,
            text,
            updated_at: Math.floor(Date.now() / 1000)
        });

        // Encrypt content
        const encryptedContent = await authService.encrypt(pubkey, content);

        // Build tags
        const tags = [
            ['p', pubkey],
            ['app', 'nostr-zap-journal'],
            ['t', tag]
        ];

        if (linkedTransaction) {
            tags.push(['e', linkedTransaction]);
        }

        // Create unsigned event
        const unsignedEvent = {
            kind: config.kinds.ENCRYPTED_DM,
            pubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: encryptedContent
        };

        // Sign and publish
        const signedEvent = await authService.signEvent(unsignedEvent);
        const result = await nostrService.publish(signedEvent);

        if (result.successes.length === 0) {
            throw new Error('Failed to publish journal entry');
        }

        // Create local entry
        const entry = {
            id: signedEvent.id,
            title,
            text,
            tag,
            linkedTransaction,
            created_at: signedEvent.created_at,
            updated_at: signedEvent.created_at,
            raw: signedEvent
        };

        // Update local state
        const entries = store.get('journal') || [];
        store.set('journal', [entry, ...entries]);
        await storageService.put('journal', entry);

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
        const pubkey = authService.getPublicKey();
        if (!pubkey) throw new Error('Not authenticated');

        // Create delete event (kind 5)
        const unsignedEvent = {
            kind: config.kinds.DELETE,
            pubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['e', id]],
            content: 'Deleted by user'
        };

        const signedEvent = await authService.signEvent(unsignedEvent);
        await nostrService.publish(signedEvent);

        // Remove from local state
        const entries = store.get('journal') || [];
        store.set('journal', entries.filter(e => e.id !== id));
        await storageService.delete('journal', id);

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
            acc[e.tag] = (acc[e.tag] || 0) + 1;
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
}

// Singleton instance
export const journalService = new JournalService();

export default journalService;
