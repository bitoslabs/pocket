/**
 * Category Service
 * Manage transaction categories with custom icons and colors
 * 
 * @module services/category-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { currentOwner, filterOwned } from '../core/account.js';
import { outbox } from './outbox.js';
import { storageService } from './storage-service.js';

class CategoryService {
    constructor() {
        this._defaultCategories = [
            { id: 'food', name: 'Food & Dining', icon: '🍔', color: '#FF6B6B', type: 'expense' },
            { id: 'transport', name: 'Transportation', icon: '🚗', color: '#4ECDC4', type: 'expense' },
            { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#45B7D1', type: 'expense' },
            { id: 'entertainment', name: 'Entertainment', icon: '🎮', color: '#96CEB4', type: 'expense' },
            { id: 'bills', name: 'Bills & Utilities', icon: '📄', color: '#FFEAA7', type: 'expense' },
            { id: 'healthcare', name: 'Healthcare', icon: '🏥', color: '#DDA0DD', type: 'expense' },
            { id: 'education', name: 'Education', icon: '📚', color: '#98D8C8', type: 'expense' },
            { id: 'salary', name: 'Salary', icon: '💼', color: '#52C41A', type: 'income' },
            { id: 'investments', name: 'Investments', icon: '📈', color: '#1890FF', type: 'income' },
            { id: 'freelance', name: 'Freelance', icon: '💻', color: '#722ED1', type: 'income' },
            { id: 'tips', name: 'Tips', icon: '💰', color: '#FA8C16', type: 'income' },
            { id: 'donations', name: 'Donations', icon: '❤️', color: '#F5222D', type: 'expense' },
            { id: 'other', name: 'Other', icon: '📌', color: '#8C8C8C', type: 'both' }
        ];
    }

    /**
     * Initialize category service
     */
    async init() {
        await this._loadCategories();
    }

    /**
     * Load categories from storage
     * @private
     */
    async _loadCategories() {
        try {
            const customCategories = filterOwned(
                await storageService.getAll('categories'),
                currentOwner()
            );
            this._categories = [...this._defaultCategories, ...customCategories];
            eventBus.emit(Events.CATEGORIES_LOADED, { categories: this._categories });
        } catch (error) {
            console.error('[CategoryService] Error loading categories:', error);
            this._categories = [...this._defaultCategories];
        }
    }

    /**
     * Get all categories
     * @param {string} type - Filter by type: 'income', 'expense', 'both', or null for all
     * @returns {Array} Categories array
     */
    getCategories(type = null) {
        if (!type) return this._categories || [];
        
        return (this._categories || []).filter(cat => 
            cat.type === type || cat.type === 'both'
        );
    }

    /**
     * Get category by ID
     * @param {string} id - Category ID
     * @returns {Object|null} Category object or null
     */
    getCategory(id) {
        return this._categories?.find(cat => cat.id === id) || null;
    }

    /**
     * Create a new custom category
     * @param {Object} categoryData - Category data
     * @returns {Object} Created category
     */
    async createCategory(categoryData) {
        const category = {
            id: this._generateId(),
            owner: currentOwner(),
            name: categoryData.name.trim(),
            icon: categoryData.icon || '📌',
            color: categoryData.color || '#8C8C8C',
            type: categoryData.type || 'expense',
            isCustom: true,
            createdAt: Date.now()
        };

        // Validate category data
        if (!category.name) {
            throw new Error('Category name is required');
        }

        // Check for duplicates
        if (this._categories.some(cat => cat.name.toLowerCase() === category.name.toLowerCase())) {
            throw new Error('Category with this name already exists');
        }

        try {
            // Save to storage
            await storageService.put('categories', category);
            
            // Add to memory
            this._categories.push(category);

            await outbox.enqueue({
                entity: 'category',
                entityId: category.id,
                op: 'upsert',
                owner: category.owner,
                payload: category,
                updatedAt: category.updatedAt || Date.now(),
            });

            // Emit event
            eventBus.emit(Events.CATEGORY_CREATED, { category });
            
            return category;
        } catch (error) {
            console.error('[CategoryService] Error creating category:', error);
            throw error;
        }
    }

    /**
     * Update an existing category
     * @param {string} id - Category ID
     * @param {Object} updates - Updates to apply
     * @returns {Object} Updated category
     */
    async updateCategory(id, updates) {
        const index = this._categories.findIndex(cat => cat.id === id);
        if (index === -1) {
            throw new Error('Category not found');
        }

        const category = this._categories[index];
        
        // Don't allow updating default categories
        if (!category.isCustom) {
            throw new Error('Cannot update default categories');
        }

        // Apply updates
        const updatedCategory = {
            ...category,
            ...updates,
            updatedAt: Date.now()
        };

        // Validate updates
        if (updatedCategory.name && !updatedCategory.name.trim()) {
            throw new Error('Category name cannot be empty');
        }

        // Check for name duplicates (excluding current category)
        if (updates.name && this._categories.some(cat => 
            cat.id !== id && cat.name.toLowerCase() === updates.name.toLowerCase()
        )) {
            throw new Error('Category with this name already exists');
        }

        try {
            // Update in storage
            await storageService.put('categories', updatedCategory);
            
            // Update in memory
            this._categories[index] = updatedCategory;

            await outbox.enqueue({
                entity: 'category',
                entityId: updatedCategory.id,
                op: 'upsert',
                owner: updatedCategory.owner || currentOwner(),
                payload: updatedCategory,
                updatedAt: updatedCategory.updatedAt || Date.now(),
            });

            // Emit event
            eventBus.emit(Events.CATEGORY_UPDATED, { category: updatedCategory });
            
            return updatedCategory;
        } catch (error) {
            console.error('[CategoryService] Error updating category:', error);
            throw error;
        }
    }

    /**
     * Delete a custom category
     * @param {string} id - Category ID
     * @returns {boolean} Success status
     */
    async deleteCategory(id) {
        const category = this.getCategory(id);
        if (!category) {
            throw new Error('Category not found');
        }

        // Don't allow deleting default categories
        if (!category.isCustom) {
            throw new Error('Cannot delete default categories');
        }

        try {
            // Remove from storage
            await storageService.delete('categories', id);
            
            // Remove from memory
            this._categories = this._categories.filter(cat => cat.id !== id);

            await outbox.enqueue({
                entity: 'category',
                entityId: id,
                op: 'delete',
                owner: category.owner || currentOwner(),
                payload: null,
                updatedAt: Date.now(),
            });

            // Emit event
            eventBus.emit(Events.CATEGORY_DELETED, { categoryId: id });
            
            return true;
        } catch (error) {
            console.error('[CategoryService] Error deleting category:', error);
            throw error;
        }
    }

    /**
     * Get category statistics
     * @returns {Object} Category stats
     */
    getStats() {
        const stats = {
            total: this._categories.length,
            custom: this._categories.filter(cat => cat.isCustom).length,
            default: this._categories.filter(cat => !cat.isCustom).length,
            byType: {
                income: this._categories.filter(cat => cat.type === 'income').length,
                expense: this._categories.filter(cat => cat.type === 'expense').length,
                both: this._categories.filter(cat => cat.type === 'both').length
            }
        };

        return stats;
    }

    /**
     * Generate unique ID for category
     * @private
     */
    _generateId() {
        return 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get popular categories based on usage
     * @param {Array} transactions - Transaction array
     * @param {number} limit - Number of categories to return
     * @returns {Array} Popular categories
     */
    getPopularCategories(transactions = [], limit = 5) {
        const categoryCounts = {};
        
        // Count transactions per category
        transactions.forEach(tx => {
            if (tx.category) {
                categoryCounts[tx.category] = (categoryCounts[tx.category] || 0) + 1;
            }
        });

        // Sort by count and get category objects
        const popular = Object.entries(categoryCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, limit)
            .map(([categoryId]) => this.getCategory(categoryId))
            .filter(Boolean);

        return popular;
    }
}


// Singleton instance
export const categoryService = new CategoryService();

export default categoryService;
