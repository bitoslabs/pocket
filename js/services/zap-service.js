/**
 * Zap Service
 * Lightning zap receipt handling and parsing
 * 
 * @module services/zap-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { currentOwner, filterOwned } from '../core/account.js';
import { nostrService } from './nostr-service.js';
import { storageService } from './storage-service.js';
import { outbox } from './outbox.js';
import { categoryService } from './category-service.js';
import { recurringService } from './recurring-service.js';

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

        // Load cached transactions for this account only
        const cached = filterOwned(await storageService.getAll('transactions'), pubkey);
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
            owner: userPubkey,
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
        const transactions = [...(store.get('transactions') || [])];
        const index = transactions.findIndex(t => t.id === transactionId);

        if (index >= 0) {
            const updated = { ...transactions[index], category };
            transactions[index] = updated;
            store.set('transactions', transactions);
            await storageService.put('transactions', updated);
        }
    }

    /**
     * Create a manual transaction
     * @param {Object} transactionData - Transaction data
     * @returns {Object} Created transaction
     */
    async createManualTransaction(transactionData) {
        const transaction = {
            id: this._generateTransactionId(),
            owner: transactionData.owner || currentOwner(),
            type: transactionData.type || 'expense',
            amount: parseFloat(transactionData.amount),
            description: transactionData.description?.trim() || '',
            category: transactionData.category || null,
            created_at: transactionData.date || Date.now(),
            isManual: true,
            source: transactionData.source || 'manual' // manual, recurring, etc.
        };

        // Optional fiat snapshot (currency + amount at time of entry)
        const fiatAmount = parseFloat(transactionData.fiatAmount);
        if (Number.isFinite(fiatAmount) && transactionData.currency) {
            transaction.fiatAmount = fiatAmount;
            transaction.currency = String(transactionData.currency).toUpperCase();
        }

        // Validate transaction data
        this._validateManualTransaction(transaction);

        try {
            // Get existing transactions
            const existing = store.get('transactions') || [];

            // Add to state and storage
            const updated = [transaction, ...existing].sort((a, b) => b.created_at - a.created_at);
            store.set('transactions', updated);
            await storageService.put('transactions', transaction);
            await outbox.enqueue({
                entity: 'transaction',
                entityId: transaction.id,
                op: 'upsert',
                owner: transaction.owner,
                payload: transaction,
                updatedAt: transaction.created_at || Date.now(),
            });

            // Emit event
            eventBus.emit(Events.MANUAL_TRANSACTION_CREATED, { transaction });
            eventBus.emit(Events.TRANSACTION_ADDED, { transaction });

            return transaction;
        } catch (error) {
            console.error('[Zaps] Error creating manual transaction:', error);
            throw error;
        }
    }

    /**
     * Update a transaction
     * @param {string} transactionId - Transaction ID
     * @param {Object} updates - Updates to apply
     * @returns {Object} Updated transaction
     */
    async updateTransaction(transactionId, updates) {
        const transactions = store.get('transactions') || [];
        const index = transactions.findIndex(t => t.id === transactionId);

        if (index === -1) {
            throw new Error('Transaction not found');
        }

        const transaction = { ...transactions[index], ...updates };

        // Validate updated transaction
        this._validateManualTransaction(transaction);

        try {
            // Update in state and storage
            transactions[index] = transaction;
            store.set('transactions', [...transactions]);
            await storageService.put('transactions', transaction);
            await outbox.enqueue({
                entity: 'transaction',
                entityId: transaction.id,
                op: 'upsert',
                owner: transaction.owner || currentOwner(),
                payload: transaction,
                updatedAt: Date.now(),
            });

            // Emit event
            eventBus.emit(Events.TRANSACTION_UPDATED, { transaction });

            return transaction;
        } catch (error) {
            console.error('[Zaps] Error updating transaction:', error);
            throw error;
        }
    }

    /**
     * Delete a transaction
     * @param {string} transactionId - Transaction ID
     * @returns {boolean} Success status
     */
    async deleteTransaction(transactionId) {
        const transactions = store.get('transactions') || [];
        const index = transactions.findIndex(t => t.id === transactionId);

        if (index === -1) {
            throw new Error('Transaction not found');
        }

        const transaction = transactions[index];

        try {
            // Remove from storage
            await storageService.delete('transactions', transactionId);

            // Remove from state
            transactions.splice(index, 1);
            store.set('transactions', [...transactions]);
            await outbox.enqueue({
                entity: 'transaction',
                entityId: transactionId,
                op: 'delete',
                owner: transaction.owner || currentOwner(),
                payload: null,
                updatedAt: Date.now(),
            });

            // Emit event
            eventBus.emit(Events.TRANSACTION_DELETED, { transactionId, transaction });

            return true;
        } catch (error) {
            console.error('[Zaps] Error deleting transaction:', error);
            throw error;
        }
    }

    /**
     * Get transactions by category with spending trends
     * @param {string} categoryId - Category ID
     * @param {number} days - Number of days to analyze
     * @returns {Object} Category spending data
     */
    getCategoryTrends(categoryId, days = 30) {
        const startDate = Date.now() - (days * 24 * 60 * 60 * 1000);
        const transactions = this.getTransactions({
            category: categoryId,
            startDate,
            type: 'expense'
        });

        const total = transactions.reduce((sum, t) => sum + t.amount, 0);
        const average = transactions.length > 0 ? total / transactions.length : 0;

        // Group by day
        const dailySpending = {};
        transactions.forEach(tx => {
            const day = new Date(tx.created_at).toDateString();
            dailySpending[day] = (dailySpending[day] || 0) + tx.amount;
        });

        return {
            categoryId,
            category: categoryService.getCategory(categoryId),
            total,
            average,
            transactionCount: transactions.length,
            dailyAverage: total / days,
            dailySpending,
            trend: this._calculateTrend(Object.values(dailySpending))
        };
    }

    /**
     * Get spending by category for a period
     * @param {number} days - Number of days to analyze
     * @returns {Array} Category spending breakdown
     */
    getSpendingByCategory(days = 30) {
        const startDate = Date.now() - (days * 24 * 60 * 60 * 1000);
        const transactions = this.getTransactions({
            startDate,
            type: 'expense'
        });

        const categorySpending = {};
        const categories = categoryService.getCategories('expense');

        // Initialize with all categories
        categories.forEach(cat => {
            categorySpending[cat.id] = {
                category: cat,
                amount: 0,
                count: 0,
                percentage: 0
            };
        });

        // Aggregate spending
        transactions.forEach(tx => {
            if (tx.category && categorySpending[tx.category]) {
                categorySpending[tx.category].amount += tx.amount;
                categorySpending[tx.category].count++;
            } else if (!tx.category) {
                // Handle uncategorized
                if (!categorySpending.uncategorized) {
                    categorySpending.uncategorized = {
                        category: { id: 'uncategorized', name: 'Uncategorized', icon: '📌', color: '#8C8C8C' },
                        amount: 0,
                        count: 0,
                        percentage: 0
                    };
                }
                categorySpending.uncategorized.amount += tx.amount;
                categorySpending.uncategorized.count++;
            }
        });

        // Calculate percentages
        const total = Object.values(categorySpending).reduce((sum, cat) => sum + cat.amount, 0);
        Object.values(categorySpending).forEach(cat => {
            cat.percentage = total > 0 ? (cat.amount / total) * 100 : 0;
        });

        // Sort by amount and return as array
        return Object.values(categorySpending)
            .filter(cat => cat.amount > 0)
            .sort((a, b) => b.amount - a.amount);
    }

    /**
     * Validate manual transaction data
     * @private
     */
    _validateManualTransaction(transaction) {
        if (!transaction.amount || transaction.amount <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        if (!['income', 'expense'].includes(transaction.type)) {
            throw new Error('Type must be income or expense');
        }

        if (transaction.category) {
            const category = categoryService.getCategory(transaction.category);
            if (!category) {
                throw new Error('Invalid category');
            }

            // Check if category type matches transaction type
            if (category.type !== 'both' && category.type !== transaction.type) {
                throw new Error(`Category ${category.name} cannot be used for ${transaction.type} transactions`);
            }
        }
    }

    /**
     * Calculate trend from array of values
     * @private
     */
    _calculateTrend(values) {
        if (values.length < 2) return 'stable';

        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));

        const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (change > 10) return 'increasing';
        if (change < -10) return 'decreasing';
        return 'stable';
    }

    /**
     * Generate unique ID for manual transaction
     * @private
     */
    _generateTransactionId() {
        return 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
