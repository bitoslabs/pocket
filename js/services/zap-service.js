/**
 * Zap Service
 * Lightning zap receipt handling and parsing
 * 
 * @module services/zap-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { nostrService } from './nostr-service.js';
import { storageService } from './storage-service.js';

class ZapService {
    constructor() {
        this._subscriptionId = null;
    }

    /**
     * Initialize zap service and start listening
     * @param {string} pubkey - User's public key
     */
    async init(pubkey) {
        if (!pubkey) return;

        // Load cached transactions
        const cached = await storageService.getAll('transactions');
        if (cached.length > 0) {
            store.set('transactions', cached);
        }

        // Subscribe to zap receipts
        this.subscribeToZaps(pubkey);
    }

    /**
     * Subscribe to zap receipts for a pubkey
     * @param {string} pubkey - User's public key
     */
    subscribeToZaps(pubkey) {
        if (this._subscriptionId) {
            nostrService.unsubscribe(this._subscriptionId);
        }

        // Filter for zap receipts where user is recipient or sender
        const filter = {
            kinds: [config.kinds.ZAP_RECEIPT],
            '#p': [pubkey],
            limit: 500
        };

        this._subscriptionId = nostrService.subscribe(
            filter,
            (event) => this._handleZapEvent(event, pubkey),
            () => {
                console.log('[Zaps] End of stored events');
                eventBus.emit(Events.ZAPS_LOADED, { count: store.get('transactions')?.length || 0 });
            }
        );
    }

    /**
     * Unsubscribe from zap events
     */
    unsubscribe() {
        if (this._subscriptionId) {
            nostrService.unsubscribe(this._subscriptionId);
            this._subscriptionId = null;
        }
    }

    /**
     * Handle incoming zap receipt event
     * @private
     */
    async _handleZapEvent(event, userPubkey) {
        try {
            const transaction = this._parseZapEvent(event, userPubkey);
            if (!transaction) return;

            // Check for duplicates
            const existing = store.get('transactions') || [];
            if (existing.some(t => t.id === transaction.id)) return;

            // Add to state and storage
            const updated = [transaction, ...existing].sort((a, b) => b.created_at - a.created_at);
            store.set('transactions', updated);
            await storageService.put('transactions', transaction);

            eventBus.emit(Events.ZAPS_UPDATED, { transaction });

        } catch (error) {
            console.error('[Zaps] Error processing zap event:', error);
        }
    }

    /**
     * Parse zap receipt event into transaction object
     * @private
     */
    _parseZapEvent(event, userPubkey) {
        const tags = this._parseTags(event.tags);

        // Get participants
        const recipient = tags.p?.[0];
        const sender = this._extractSenderFromDescription(tags.description);

        // Get amount from bolt11 invoice
        const amount = this._extractAmountFromBolt11(tags.bolt11);
        if (!amount) return null;

        // Determine if this is income or expense for the user
        const isIncome = recipient === userPubkey;
        const type = isIncome ? 'income' : 'expense';

        return {
            id: event.id,
            type,
            amount,
            sender: sender || 'Anonymous',
            senderPubkey: sender,
            recipient,
            description: this._extractDescriptionText(tags.description),
            bolt11: tags.bolt11,
            preimage: tags.preimage,
            created_at: event.created_at,
            event_id: tags.e?.[0],
            relay: tags.relay,
            category: null, // User can categorize later
            raw: event
        };
    }

    /**
     * Parse event tags into object
     * @private
     */
    _parseTags(tags) {
        const result = {};
        for (const [key, ...values] of tags) {
            if (values.length === 1) {
                result[key] = values[0];
            } else if (values.length > 1) {
                result[key] = values;
            }
        }
        return result;
    }

    /**
     * Extract amount from bolt11 invoice
     * @private
     */
    _extractAmountFromBolt11(bolt11) {
        if (!bolt11) return null;

        try {
            // Lightning invoice amount is after 'lnbc' prefix
            const match = bolt11.toLowerCase().match(/^lnbc(\d+)([munp]?)/);
            if (!match) return null;

            const [, amount, multiplier] = match;
            let value = parseInt(amount, 10);

            // Convert to millisats based on multiplier
            switch (multiplier) {
                case 'm': value *= 100000000; break;  // milli-bitcoin
                case 'u': value *= 100000; break;     // micro-bitcoin
                case 'n': value *= 100; break;        // nano-bitcoin
                case 'p': value *= 0.1; break;        // pico-bitcoin
                default: value *= 100000000000; break; // bitcoin
            }

            // Convert millisats to sats
            return Math.floor(value / 1000);
        } catch (error) {
            console.error('[Zaps] Error parsing bolt11:', error);
            return null;
        }
    }

    /**
     * Extract sender pubkey from zap description
     * @private
     */
    _extractSenderFromDescription(description) {
        if (!description) return null;

        try {
            const zapRequest = JSON.parse(description);
            return zapRequest.pubkey;
        } catch {
            return null;
        }
    }

    /**
     * Extract description text from zap request
     * @private
     */
    _extractDescriptionText(description) {
        if (!description) return '';

        try {
            const zapRequest = JSON.parse(description);
            const contentTag = zapRequest.tags?.find(t => t[0] === 'content');
            return contentTag?.[1] || zapRequest.content || '';
        } catch {
            return '';
        }
    }

    /**
     * Get transactions with optional filtering
     * @param {Object} options - Filter options
     * @returns {Array} Filtered transactions
     */
    getTransactions({ type, category, startDate, endDate, limit } = {}) {
        let transactions = store.get('transactions') || [];

        if (type) {
            transactions = transactions.filter(t => t.type === type);
        }

        if (category) {
            transactions = transactions.filter(t => t.category === category);
        }

        if (startDate) {
            transactions = transactions.filter(t => t.created_at >= startDate);
        }

        if (endDate) {
            transactions = transactions.filter(t => t.created_at <= endDate);
        }

        if (limit) {
            transactions = transactions.slice(0, limit);
        }

        return transactions;
    }

    /**
     * Get transaction statistics
     * @returns {Object} Stats including totals and counts
     */
    getStats() {
        const transactions = store.get('transactions') || [];

        const income = transactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const expenses = transactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        return {
            totalIncome: income,
            totalExpenses: expenses,
            balance: income - expenses,
            transactionCount: transactions.length,
            incomeCount: transactions.filter(t => t.type === 'income').length,
            expenseCount: transactions.filter(t => t.type === 'expense').length
        };
    }

    /**
     * Update transaction category
     * @param {string} transactionId - Transaction ID
     * @param {string} category - New category
     */
    async updateCategory(transactionId, category) {
        const transactions = store.get('transactions') || [];
        const index = transactions.findIndex(t => t.id === transactionId);

        if (index >= 0) {
            const updated = { ...transactions[index], category };
            transactions[index] = updated;
            store.set('transactions', [...transactions]);
            await storageService.put('transactions', updated);
        }
    }

    /**
     * Format sats amount for display
     * @param {number} sats - Amount in satoshis
     * @returns {string} Formatted string
     */
    formatSats(sats) {
        if (sats >= 1000000) {
            return `${(sats / 1000000).toFixed(2)}M sats`;
        } else if (sats >= 1000) {
            return `${(sats / 1000).toFixed(1)}k sats`;
        }
        return `${sats.toLocaleString()} sats`;
    }
}

// Singleton instance
export const zapService = new ZapService();

export default zapService;
