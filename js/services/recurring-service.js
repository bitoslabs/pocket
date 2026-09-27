/**
 * Recurring Transaction Service
 * Manage recurring transactions and automatic generation
 * 
 * @module services/recurring-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { currentOwner, filterOwned } from '../core/account.js';
import { storageService } from './storage-service.js';
import { outbox } from './outbox.js';
import { zapService } from './zap-service.js';

class RecurringService {
    constructor() {
        this._recurringTransactions = [];
        this._generatedTransactions = new Map(); // Track generated transactions to avoid duplicates
        this._checkInterval = null;
    }

    /**
     * Initialize recurring service
     */
    async init() {
        await this._loadRecurringTransactions();
        await this._generatePendingTransactions();
        this._startPeriodicCheck();
    }

    /**
     * Load recurring transactions from storage
     * @private
     */
    async _loadRecurringTransactions() {
        try {
            const recurring = await storageService.getAll('recurring');
            this._recurringTransactions = filterOwned(recurring, currentOwner());
            eventBus.emit(Events.RECURRING_LOADED, { recurring: this._recurringTransactions });
        } catch (error) {
            console.error('[RecurringService] Error loading recurring transactions:', error);
            this._recurringTransactions = [];
        }
    }

    /**
     * Get all recurring transactions
     * @param {Object} filters - Filter options
     * @returns {Array} Recurring transactions array
     */
    getRecurringTransactions(filters = {}) {
        let recurring = [...this._recurringTransactions];

        if (filters.category) {
            recurring = recurring.filter(r => r.categoryId === filters.category);
        }

        if (filters.type) {
            recurring = recurring.filter(r => r.type === filters.type);
        }

        if (filters.active !== undefined) {
            recurring = recurring.filter(r => r.isActive === filters.active);
        }

        return recurring;
    }

    /**
     * Get recurring transaction by ID
     * @param {string} id - Recurring transaction ID
     * @returns {Object|null} Recurring transaction or null
     */
    getRecurringTransaction(id) {
        return this._recurringTransactions.find(r => r.id === id) || null;
    }

    /**
     * Create a new recurring transaction
     * @param {Object} recurringData - Recurring transaction data
     * @returns {Object} Created recurring transaction
     */
    async createRecurringTransaction(recurringData) {
        const recurring = {
            id: this._generateId(),
            owner: currentOwner(),
            name: recurringData.name.trim(),
            description: recurringData.description || '',
            amount: parseFloat(recurringData.amount),
            type: recurringData.type || 'expense', // income or expense
            categoryId: recurringData.categoryId,
            frequency: recurringData.frequency, // daily, weekly, monthly, yearly
            interval: parseInt(recurringData.interval) || 1, // Every N periods
            startDate: recurringData.startDate || Date.now(),
            endDate: recurringData.endDate || null,
            count: recurringData.count || null, // Number of occurrences (null for infinite)
            dayOfWeek: recurringData.dayOfWeek || null, // For weekly
            dayOfMonth: recurringData.dayOfMonth || null, // For monthly
            monthOfYear: recurringData.monthOfYear || null, // For yearly
            isActive: true,
            lastGenerated: null,
            nextDue: this._calculateNextDue(recurringData),
            generatedCount: 0,
            createdAt: Date.now()
        };

        // Validate recurring transaction data
        this._validateRecurringTransaction(recurring);

        try {
            // Save to storage
            await storageService.put('recurring', recurring);
            
            // Add to memory
            this._recurringTransactions.push(recurring);

            await outbox.enqueue({
                entity: 'recurring',
                entityId: recurring.id,
                op: 'upsert',
                owner: recurring.owner || currentOwner(),
                payload: recurring,
                updatedAt: recurring.updatedAt || Date.now(),
            });

            // Generate first transaction if due
            await this._generateTransactionIfDue(recurring);
            
            // Emit event
            eventBus.emit(Events.RECURRING_CREATED, { recurring });
            
            return recurring;
        } catch (error) {
            console.error('[RecurringService] Error creating recurring transaction:', error);
            throw error;
        }
    }

    /**
     * Update an existing recurring transaction
     * @param {string} id - Recurring transaction ID
     * @param {Object} updates - Updates to apply
     * @returns {Object} Updated recurring transaction
     */
    async updateRecurringTransaction(id, updates) {
        const index = this._recurringTransactions.findIndex(r => r.id === id);
        if (index === -1) {
            throw new Error('Recurring transaction not found');
        }

        const recurring = { 
            ...this._recurringTransactions[index], 
            ...updates, 
            updatedAt: Date.now() 
        };

        // Recalculate next due date if relevant fields changed
        if (updates.frequency || updates.interval || updates.startDate || updates.dayOfWeek || updates.dayOfMonth) {
            recurring.nextDue = this._calculateNextDue(recurring);
        }

        // Validate updated recurring transaction
        this._validateRecurringTransaction(recurring);

        try {
            // Update in storage
            await storageService.put('recurring', recurring);
            
            // Update in memory
            this._recurringTransactions[index] = recurring;

            await outbox.enqueue({
                entity: 'recurring',
                entityId: recurring.id,
                op: 'upsert',
                owner: recurring.owner || currentOwner(),
                payload: recurring,
                updatedAt: recurring.updatedAt || Date.now(),
            });

            // Emit event
            eventBus.emit(Events.RECURRING_UPDATED, { recurring });
            
            return recurring;
        } catch (error) {
            console.error('[RecurringService] Error updating recurring transaction:', error);
            throw error;
        }
    }

    /**
     * Delete a recurring transaction
     * @param {string} id - Recurring transaction ID
     * @returns {boolean} Success status
     */
    async deleteRecurringTransaction(id) {
        const index = this._recurringTransactions.findIndex(r => r.id === id);
        if (index === -1) {
            throw new Error('Recurring transaction not found');
        }

        const removed = this._recurringTransactions[index];

        try {
            // Remove from storage
            await storageService.delete('recurring', id);
            
            // Remove from memory
            this._recurringTransactions.splice(index, 1);

            await outbox.enqueue({
                entity: 'recurring',
                entityId: id,
                op: 'delete',
                owner: removed.owner || currentOwner(),
                payload: null,
                updatedAt: Date.now(),
            });
            
            // Emit event
            eventBus.emit(Events.RECURRING_DELETED, { recurringId: id });
            
            return true;
        } catch (error) {
            console.error('[RecurringService] Error deleting recurring transaction:', error);
            throw error;
        }
    }

    /**
     * Generate pending transactions for all active recurring transactions
     * @private
     */
    async _generatePendingTransactions() {
        const now = Date.now();
        const activeRecurring = this._recurringTransactions.filter(r => 
            r.isActive && 
            r.nextDue <= now &&
            (!r.endDate || r.nextDue <= r.endDate) &&
            (!r.count || r.generatedCount < r.count)
        );

        for (const recurring of activeRecurring) {
            await this._generateTransactionIfDue(recurring);
        }
    }

    /**
     * Generate transaction if recurring transaction is due
     * @private
     */
    async _generateTransactionIfDue(recurring) {
        const now = Date.now();
        
        while (recurring.isActive && 
               recurring.nextDue <= now &&
               (!recurring.endDate || recurring.nextDue <= recurring.endDate) &&
               (!recurring.count || recurring.generatedCount < recurring.count)) {
            
            // Generate unique ID for this occurrence
            const occurrenceId = `${recurring.id}_${recurring.nextDue}`;
            
            // Check if already generated
            if (this._generatedTransactions.has(occurrenceId)) {
                break;
            }

            try {
                // Create transaction
                const transaction = {
                    id: this._generateTransactionId(),
                    owner: recurring.owner || currentOwner(),
                    type: recurring.type,
                    amount: recurring.amount,
                    description: recurring.name,
                    category: recurring.categoryId,
                    created_at: recurring.nextDue,
                    isRecurring: true,
                    recurringId: recurring.id,
                    recurringName: recurring.name
                };

                // Save transaction through zap service (extend to support manual transactions)
                await storageService.put('transactions', transaction);
                await outbox.enqueue({
                    entity: 'transaction',
                    entityId: transaction.id,
                    op: 'upsert',
                    owner: transaction.owner,
                    payload: transaction,
                    updatedAt: transaction.created_at || Date.now(),
                });

                // Add to generated transactions tracker
                this._generatedTransactions.set(occurrenceId, true);
                
                // Update recurring transaction
                recurring.lastGenerated = recurring.nextDue;
                recurring.generatedCount++;
                recurring.nextDue = this._calculateNextDue(recurring, recurring.nextDue);
                
                // Update in storage and memory
                await storageService.put('recurring', recurring);
                const index = this._recurringTransactions.findIndex(r => r.id === recurring.id);
                if (index >= 0) {
                    this._recurringTransactions[index] = recurring;
                }
                
                // Emit events
                eventBus.emit(Events.RECURRING_TRANSACTION_GENERATED, { recurring, transaction });
                eventBus.emit(Events.TRANSACTION_ADDED, { transaction });
                
            } catch (error) {
                console.error('[RecurringService] Error generating transaction:', error);
                break;
            }
        }
    }

    /**
     * Calculate next due date for recurring transaction
     * @private
     */
    _calculateNextDue(recurring, fromDate = null) {
        const date = new Date(fromDate || recurring.startDate);
        
        switch (recurring.frequency) {
            case 'daily':
                date.setDate(date.getDate() + recurring.interval);
                break;
                
            case 'weekly':
                if (recurring.dayOfWeek !== null) {
                    // Set to specific day of week
                    date.setDate(date.getDate() + ((recurring.dayOfWeek - date.getDay() + 7) % 7));
                }
                date.setDate(date.getDate() + (7 * recurring.interval));
                break;
                
            case 'monthly':
                if (recurring.dayOfMonth !== null) {
                    date.setDate(recurring.dayOfMonth);
                }
                date.setMonth(date.getMonth() + recurring.interval);
                break;
                
            case 'yearly':
                if (recurring.monthOfYear !== null) {
                    date.setMonth(recurring.monthOfYear);
                }
                if (recurring.dayOfMonth !== null) {
                    date.setDate(recurring.dayOfMonth);
                }
                date.setFullYear(date.getFullYear() + recurring.interval);
                break;
        }
        
        return date.getTime();
    }

    /**
     * Start periodic check for due transactions
     * @private
     */
    _startPeriodicCheck() {
        // Check every hour
        this._checkInterval = setInterval(() => {
            this._generatePendingTransactions();
        }, 60 * 60 * 1000);
    }

    /**
     * Stop periodic check
     */
    stopPeriodicCheck() {
        if (this._checkInterval) {
            clearInterval(this._checkInterval);
            this._checkInterval = null;
        }
    }

    /**
     * Get upcoming transactions
     * @param {number} days - Number of days ahead to look
     * @returns {Array} Upcoming transactions
     */
    getUpcomingTransactions(days = 30) {
        const now = Date.now();
        const future = now + (days * 24 * 60 * 60 * 1000);
        
        return this._recurringTransactions
            .filter(r => 
                r.isActive &&
                r.nextDue >= now &&
                r.nextDue <= future &&
                (!r.endDate || r.nextDue <= r.endDate) &&
                (!r.count || r.generatedCount < r.count)
            )
            .map(r => ({
                ...r,
                nextDueDate: new Date(r.nextDue),
                daysUntil: Math.ceil((r.nextDue - now) / (24 * 60 * 60 * 1000))
            }))
            .sort((a, b) => a.nextDue - b.nextDue);
    }

    /**
     * Get recurring transaction statistics
     * @returns {Object} Statistics
     */
    getStats() {
        const active = this._recurringTransactions.filter(r => r.isActive);
        const upcoming = this.getUpcomingTransactions(30);
        
        return {
            total: this._recurringTransactions.length,
            active: active.length,
            inactive: this._recurringTransactions.length - active.length,
            upcoming30Days: upcoming.length,
            totalGenerated: this._recurringTransactions.reduce((sum, r) => sum + r.generatedCount, 0),
            monthlyTotal: active
                .filter(r => r.frequency === 'monthly')
                .reduce((sum, r) => sum + r.amount, 0),
            yearlyTotal: active
                .filter(r => r.frequency === 'yearly')
                .reduce((sum, r) => sum + r.amount, 0)
        };
    }

    /**
     * Validate recurring transaction data
     * @private
     */
    _validateRecurringTransaction(recurring) {
        if (!recurring.name || !recurring.name.trim()) {
            throw new Error('Recurring transaction name is required');
        }

        if (!recurring.amount || recurring.amount <= 0) {
            throw new Error('Amount must be greater than 0');
        }

        if (!['income', 'expense'].includes(recurring.type)) {
            throw new Error('Type must be income or expense');
        }

        if (!['daily', 'weekly', 'monthly', 'yearly'].includes(recurring.frequency)) {
            throw new Error('Invalid frequency');
        }

        if (recurring.interval && recurring.interval < 1) {
            throw new Error('Interval must be at least 1');
        }

        if (recurring.startDate && recurring.endDate && recurring.startDate >= recurring.endDate) {
            throw new Error('End date must be after start date');
        }
    }

    /**
     * Generate unique ID for recurring transaction
     * @private
     */
    _generateId() {
        return 'recurring_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generate unique ID for transaction
     * @private
     */
    _generateTransactionId() {
        return 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}


// Singleton instance
export const recurringService = new RecurringService();

export default recurringService;
