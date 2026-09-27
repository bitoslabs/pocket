/**
 * Budget Service
 * Manage dynamic budget creation, tracking, and alerts
 * 
 * @module services/budget-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { storageService } from './storage-service.js';
import { zapService } from './zap-service.js';

class BudgetService {
    constructor() {
        this._budgets = [];
        this._alertThresholds = {
            warning: 0.7,  // 70% spent
            danger: 0.9    // 90% spent
        };
    }

    /**
     * Initialize budget service
     */
    async init() {
        await this._loadBudgets();
    }

    /**
     * Load budgets from storage
     * @private
     */
    async _loadBudgets() {
        try {
            const budgets = await storageService.getAll('budgets');
            this._budgets = budgets || [];
            eventBus.emit(Events.BUDGETS_LOADED, { budgets: this._budgets });
        } catch (error) {
            console.error('[BudgetService] Error loading budgets:', error);
            this._budgets = [];
        }
    }

    /**
     * Get all budgets
     * @param {Object} filters - Filter options
     * @returns {Array} Budgets array
     */
    getBudgets(filters = {}) {
        let budgets = [...this._budgets];

        if (filters.category) {
            budgets = budgets.filter(b => b.categoryId === filters.category);
        }

        if (filters.period) {
            budgets = budgets.filter(b => b.period === filters.period);
        }

        if (filters.active !== undefined) {
            const now = Date.now();
            budgets = budgets.filter(b => {
                if (filters.active) {
                    return !b.endDate || b.endDate >= now;
                } else {
                    return b.endDate && b.endDate < now;
                }
            });
        }

        return budgets;
    }

    /**
     * Get budget by ID
     * @param {string} id - Budget ID
     * @returns {Object|null} Budget object or null
     */
    getBudget(id) {
        return this._budgets.find(b => b.id === id) || null;
    }

    /**
     * Create a new budget
     * @param {Object} budgetData - Budget data
     * @returns {Object} Created budget
     */
    async createBudget(budgetData) {
        const budget = {
            id: this._generateId(),
            name: budgetData.name.trim(),
            categoryId: budgetData.categoryId,
            amount: parseFloat(budgetData.amount),
            period: budgetData.period || 'monthly', // daily, weekly, monthly, yearly
            startDate: budgetData.startDate || Date.now(),
            endDate: budgetData.endDate || null,
            alertThreshold: budgetData.alertThreshold || this._alertThresholds.warning,
            rollover: budgetData.rollover || false,
            isActive: true,
            createdAt: Date.now()
        };

        // Validate budget data
        this._validateBudget(budget);

        try {
            // Save to storage
            await storageService.put('budgets', budget);
            
            // Add to memory
            this._budgets.push(budget);
            
            // Emit event
            eventBus.emit(Events.BUDGET_CREATED, { budget });
            
            return budget;
        } catch (error) {
            console.error('[BudgetService] Error creating budget:', error);
            throw error;
        }
    }

    /**
     * Update an existing budget
     * @param {string} id - Budget ID
     * @param {Object} updates - Updates to apply
     * @returns {Object} Updated budget
     */
    async updateBudget(id, updates) {
        const index = this._budgets.findIndex(b => b.id === id);
        if (index === -1) {
            throw new Error('Budget not found');
        }

        const budget = { ...this._budgets[index], ...updates, updatedAt: Date.now() };

        // Validate updated budget
        this._validateBudget(budget);

        try {
            // Update in storage
            await storageService.put('budgets', budget);
            
            // Update in memory
            this._budgets[index] = budget;
            
            // Emit event
            eventBus.emit(Events.BUDGET_UPDATED, { budget });
            
            return budget;
        } catch (error) {
            console.error('[BudgetService] Error updating budget:', error);
            throw error;
        }
    }

    /**
     * Delete a budget
     * @param {string} id - Budget ID
     * @returns {boolean} Success status
     */
    async deleteBudget(id) {
        const index = this._budgets.findIndex(b => b.id === id);
        if (index === -1) {
            throw new Error('Budget not found');
        }

        try {
            // Remove from storage
            await storageService.delete('budgets', id);
            
            // Remove from memory
            this._budgets.splice(index, 1);
            
            // Emit event
            eventBus.emit(Events.BUDGET_DELETED, { budgetId: id });
            
            return true;
        } catch (error) {
            console.error('[BudgetService] Error deleting budget:', error);
            throw error;
        }
    }

    /**
     * Get budget progress and statistics
     * @param {string} budgetId - Budget ID
     * @returns {Object} Budget progress data
     */
    getBudgetProgress(budgetId) {
        const budget = this.getBudget(budgetId);
        if (!budget) {
            throw new Error('Budget not found');
        }

        const now = Date.now();
        const periodRange = this._getPeriodRange(budget.period, budget.startDate, budget.endDate);
        
        // Get transactions for this budget period
        const transactions = zapService.getTransactions({
            category: budget.categoryId,
            startDate: periodRange.start,
            endDate: periodRange.end
        });

        const spent = transactions
            .filter(tx => tx.type === 'expense')
            .reduce((sum, tx) => sum + tx.amount, 0);

        const remaining = budget.amount - spent;
        const percentage = Math.min((spent / budget.amount) * 100, 100);
        
        // Determine status
        let status = 'on-track';
        if (percentage >= this._alertThresholds.danger * 100) {
            status = 'danger';
        } else if (percentage >= this._alertThresholds.warning * 100) {
            status = 'warning';
        }

        // Calculate daily/weekly rate
        const daysInPeriod = Math.ceil((periodRange.end - periodRange.start) / (1000 * 60 * 60 * 24));
        const daysElapsed = Math.ceil((now - periodRange.start) / (1000 * 60 * 60 * 24));
        const projectedSpend = daysElapsed > 0 ? (spent / daysElapsed) * daysInPeriod : spent;

        return {
            budget,
            spent,
            remaining,
            percentage,
            status,
            periodRange,
            daysInPeriod,
            daysElapsed,
            projectedSpend,
            transactionCount: transactions.length,
            dailyAverage: spent / Math.max(daysElapsed, 1),
            recommendedDaily: budget.amount / daysInPeriod
        };
    }

    /**
     * Get all budget progress data
     * @returns {Array} Array of budget progress data
     */
    getAllBudgetProgress() {
        return this._budgets
            .filter(b => b.isActive && (!b.endDate || b.endDate >= Date.now()))
            .map(budget => this.getBudgetProgress(budget.id));
    }

    /**
     * Get budget alerts and warnings
     * @returns {Array} Array of budget alerts
     */
    getBudgetAlerts() {
        const progressData = this.getAllBudgetProgress();
        const alerts = [];

        progressData.forEach(progress => {
            if (progress.status === 'danger') {
                alerts.push({
                    type: 'danger',
                    budget: progress.budget,
                    message: `${progress.budget.name}: ${Math.round(progress.percentage)}% spent (${progress.remaining < 0 ? 'Over budget!' : `${Math.round(progress.remaining)} sats remaining`})`,
                    percentage: progress.percentage
                });
            } else if (progress.status === 'warning') {
                alerts.push({
                    type: 'warning',
                    budget: progress.budget,
                    message: `${progress.budget.name}: ${Math.round(progress.percentage)}% spent`,
                    percentage: progress.percentage
                });
            }
        });

        return alerts.sort((a, b) => b.percentage - a.percentage);
    }

    /**
     * Get budget statistics
     * @returns {Object} Budget statistics
     */
    getStats() {
        const activeBudgets = this._budgets.filter(b => 
            b.isActive && (!b.endDate || b.endDate >= Date.now())
        );

        const totalBudgeted = activeBudgets.reduce((sum, b) => sum + b.amount, 0);
        const progressData = activeBudgets.map(b => this.getBudgetProgress(b.id));
        const totalSpent = progressData.reduce((sum, p) => sum + p.spent, 0);
        const totalRemaining = totalBudgeted - totalSpent;

        return {
            totalBudgets: this._budgets.length,
            activeBudgets: activeBudgets.length,
            totalBudgeted,
            totalSpent,
            totalRemaining,
            averageUtilization: totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0,
            alertsCount: this.getBudgetAlerts().length
        };
    }

    /**
     * Validate budget data
     * @private
     */
    _validateBudget(budget) {
        if (!budget.name || !budget.name.trim()) {
            throw new Error('Budget name is required');
        }

        if (!budget.categoryId) {
            throw new Error('Category is required');
        }

        if (!budget.amount || budget.amount <= 0) {
            throw new Error('Budget amount must be greater than 0');
        }

        if (!['daily', 'weekly', 'monthly', 'yearly'].includes(budget.period)) {
            throw new Error('Invalid budget period');
        }

        if (budget.startDate && budget.endDate && budget.startDate >= budget.endDate) {
            throw new Error('End date must be after start date');
        }
    }

    /**
     * Get period start and end dates
     * @private
     */
    _getPeriodRange(period, startDate, endDate) {
        const now = Date.now();
        
        if (endDate) {
            return { start: startDate, end: endDate };
        }

        const start = new Date(startDate);
        const end = new Date();

        switch (period) {
            case 'daily':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
                
            case 'weekly':
                const dayOfWeek = start.getDay();
                start.setDate(start.getDate() - dayOfWeek);
                start.setHours(0, 0, 0, 0);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
                
            case 'monthly':
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setMonth(start.getMonth() + 1);
                end.setDate(0);
                end.setHours(23, 59, 59, 999);
                break;
                
            case 'yearly':
                start.setMonth(0, 1);
                start.setHours(0, 0, 0, 0);
                end.setMonth(11, 31);
                end.setHours(23, 59, 59, 999);
                break;
        }

        return {
            start: start.getTime(),
            end: end.getTime()
        };
    }

    /**
     * Generate unique ID for budget
     * @private
     */
    _generateId() {
        return 'budget_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}


// Singleton instance
export const budgetService = new BudgetService();

export default budgetService;
