/**
 * Category Manager Component
 * Manage and display transaction categories
 * 
 * @module components/category-manager
 */

import { Component } from '../core/component.js';
import { eventBus, Events } from '../core/event-bus.js';
import { categoryService } from '../services/category-service.js';

export class CategoryManager extends Component {
    constructor(options = {}) {
        super(options);
        this._mode = options.mode || 'manage'; // manage, select
        this._type = options.type || 'both'; // income, expense, both
        this._selectedCategory = options.selectedCategory || null;
        this._onSelect = options.onSelect || null;
        this._showCreate = options.showCreate !== false;
    }

    template() {
        const categories = categoryService.getCategories(this._type);
        const stats = categoryService.getStats();

        return `
      <div class="category-manager ${this._mode}">
        ${this._mode === 'manage' ? this._renderManageHeader(stats) : ''}
        
        <div class="categories-grid">
          ${categories.map(cat => this._renderCategory(cat)).join('')}
        </div>
        
        ${this._mode === 'manage' && this._showCreate ? this._renderCreateCategory() : ''}
      </div>
    `;
    }

    _renderManageHeader(stats) {
        return `
      <div class="categories-header">
        <div class="header-info">
          <h3>Categories</h3>
          <p class="text-secondary">${stats.total} categories (${stats.custom} custom)</p>
        </div>
        <button class="btn btn-primary btn-sm add-category-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add Category
        </button>
      </div>
    `;
    }

    _renderCategory(category) {
        const isSelected = this._selectedCategory === category.id;
        const isCustom = category.isCustom;
        const transactionCount = this._getTransactionCount(category.id);

        return `
      <div class="category-card ${isSelected ? 'selected' : ''} ${isCustom ? 'custom' : 'default'}" 
           data-category-id="${category.id}">
        <div class="category-header">
          <div class="category-icon" style="background-color: ${category.color}20; color: ${category.color};">
            ${category.icon}
          </div>
          <div class="category-info">
            <div class="category-name">${category.name}</div>
            <div class="category-meta">
              <span class="category-type">${category.type}</span>
              ${transactionCount > 0 ? `<span class="category-count">${transactionCount} transactions</span>` : ''}
            </div>
          </div>
        </div>
        
        ${this._mode === 'manage' && isCustom ? this._renderCategoryActions(category) : ''}
      </div>
    `;
    }

    _renderCategoryActions(category) {
        return `
      <div class="category-actions">
        <button class="btn btn-ghost btn-sm edit-category-btn" data-category-id="${category.id}" title="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="btn btn-ghost btn-sm delete-category-btn" data-category-id="${category.id}" title="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
    }

    _renderCreateCategory() {
        return `
      <div class="category-card create-category">
        <button class="create-category-btn">
          <div class="create-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </div>
          <div class="create-text">Create New Category</div>
        </button>
      </div>
    `;
    }

    _getTransactionCount(categoryId) {
        // This would need access to transactions - for now return 0
        // In a real implementation, you'd get this from zapService
        return 0;
    }

    bindEvents() {
        // Category selection
        if (this._mode === 'select') {
            this.addEventListener('.category-card', 'click', (e) => {
                const card = e.currentTarget;
                const categoryId = card.dataset.categoryId;
                if (categoryId) {
                    this._onCategorySelect(categoryId);
                }
            });
        }

        // Add category buttons
        this.addEventListener('.add-category-btn, .create-category-btn', 'click', () => {
            this._showCreateCategoryModal();
        });

        // Edit category
        this.addEventListener('.edit-category-btn', 'click', (e) => {
            e.stopPropagation();
            const categoryId = e.target.closest('.edit-category-btn').dataset.categoryId;
            this._showEditCategoryModal(categoryId);
        });

        // Delete category
        this.addEventListener('.delete-category-btn', 'click', (e) => {
            e.stopPropagation();
            const categoryId = e.target.closest('.delete-category-btn').dataset.categoryId;
            this._confirmDeleteCategory(categoryId);
        });
    }

    _onCategorySelect(categoryId) {
        this._selectedCategory = categoryId;
        
        // Update UI
        document.querySelectorAll('.category-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.categoryId === categoryId);
        });

        if (this._onSelect) {
            this._onSelect(categoryId);
        }

        eventBus.emit(Events.CATEGORY_SELECTED, { categoryId });
    }

    async _showCreateCategoryModal() {
        const { modal } = await import('./modal.js');

        modal.open({
            title: 'Create Category',
            content: `
        <form class="category-form">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="category-name" placeholder="Category name" required>
          </div>
          
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-input" id="category-type">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="both">Both</option>
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">Icon</label>
            <div class="icon-selector">
              <input type="text" class="form-input" id="category-icon" placeholder="📌" maxlength="2" maxlength="2">
              <div class="icon-suggestions">
                ${this._getIconSuggestions().map(icon => `
                  <button type="button" class="icon-suggestion" data-icon="${icon}">${icon}</button>
                `).join('')}
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Color</label>
            <div class="color-picker">
              <input type="color" class="form-input" id="category-color" value="#8C8C8C">
              <div class="color-presets">
                ${this._getColorPresets().map(color => `
                  <button type="button" class="color-preset" data-color="${color}" style="background-color: ${color};"></button>
                `).join('')}
              </div>
            </div>
          </div>
        </form>
      `,
            actions: [
                { label: 'Cancel', variant: 'btn-secondary' },
                {
                    label: 'Create Category',
                    variant: 'btn-primary',
                    handler: async () => {
                        try {
                            const categoryData = {
                                name: document.getElementById('category-name').value,
                                type: document.getElementById('category-type').value,
                                icon: document.getElementById('category-icon').value || '📌',
                                color: document.getElementById('category-color').value
                            };

                            await categoryService.createCategory(categoryData);
                            
                            eventBus.emit(Events.TOAST_SHOW, {
                                type: 'success',
                                message: 'Category created successfully'
                            });
                            
                            this.render();
                        } catch (error) {
                            eventBus.emit(Events.TOAST_SHOW, {
                                type: 'error',
                                message: error.message
                            });
                        }
                    }
                }
            ]
        });

        // Bind icon suggestions
        setTimeout(() => {
            this._bindIconSuggestions();
            this._bindColorPresets();
        }, 100);
    }

    async _showEditCategoryModal(categoryId) {
        const category = categoryService.getCategory(categoryId);
        if (!category) return;

        const { modal } = await import('./modal.js');

        modal.open({
            title: 'Edit Category',
            content: `
        <form class="category-form">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" id="category-name" value="${category.name}" required>
          </div>
          
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-input" id="category-type">
              <option value="expense" ${category.type === 'expense' ? 'selected' : ''}>Expense</option>
              <option value="income" ${category.type === 'income' ? 'selected' : ''}>Income</option>
              <option value="both" ${category.type === 'both' ? 'selected' : ''}>Both</option>
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">Icon</label>
            <div class="icon-selector">
              <input type="text" class="form-input" id="category-icon" value="${category.icon}" maxlength="2">
              <div class="icon-suggestions">
                ${this._getIconSuggestions().map(icon => `
                  <button type="button" class="icon-suggestion" data-icon="${icon}">${icon}</button>
                `).join('')}
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Color</label>
            <div class="color-picker">
              <input type="color" class="form-input" id="category-color" value="${category.color}">
              <div class="color-presets">
                ${this._getColorPresets().map(color => `
                  <button type="button" class="color-preset" data-color="${color}" style="background-color: ${color};"></button>
                `).join('')}
              </div>
            </div>
          </div>
        </form>
      `,
            actions: [
                { label: 'Cancel', variant: 'btn-secondary' },
                {
                    label: 'Update Category',
                    variant: 'btn-primary',
                    handler: async () => {
                        try {
                            const updates = {
                                name: document.getElementById('category-name').value,
                                type: document.getElementById('category-type').value,
                                icon: document.getElementById('category-icon').value,
                                color: document.getElementById('category-color').value
                            };

                            await categoryService.updateCategory(categoryId, updates);
                            
                            eventBus.emit(Events.TOAST_SHOW, {
                                type: 'success',
                                message: 'Category updated successfully'
                            });
                            
                            this.render();
                        } catch (error) {
                            eventBus.emit(Events.TOAST_SHOW, {
                                type: 'error',
                                message: error.message
                            });
                        }
                    }
                }
            ]
        });

        // Bind icon suggestions
        setTimeout(() => {
            this._bindIconSuggestions();
            this._bindColorPresets();
        }, 100);
    }

    async _confirmDeleteCategory(categoryId) {
        const category = categoryService.getCategory(categoryId);
        if (!category) return;

        const { modal } = await import('./modal.js');

        modal.open({
            title: 'Delete Category',
            content: `
        <div class="delete-confirmation">
          <div class="warning-icon">⚠️</div>
          <h3>Delete "${category.name}"?</h3>
          <p>This action cannot be undone. Any transactions using this category will become uncategorized.</p>
        </div>
      `,
            actions: [
                { label: 'Cancel', variant: 'btn-secondary' },
                {
                    label: 'Delete',
                    variant: 'btn-error',
                    handler: async () => {
                        try {
                            await categoryService.deleteCategory(categoryId);
                            
                            eventBus.emit(Events.TOAST_SHOW, {
                                type: 'success',
                                message: 'Category deleted successfully'
                            });
                            
                            this.render();
                        } catch (error) {
                            eventBus.emit(Events.TOAST_SHOW, {
                                type: 'error',
                                message: error.message
                            });
                        }
                    }
                }
            ]
        });
    }

    _bindIconSuggestions() {
        document.querySelectorAll('.icon-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                const icon = btn.dataset.icon;
                const input = document.getElementById('category-icon');
                if (input) {
                    input.value = icon;
                }
            });
        });
    }

    _bindColorPresets() {
        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                const input = document.getElementById('category-color');
                if (input) {
                    input.value = color;
                }
            });
        });
    }

    _getIconSuggestions() {
        return ['🍔', '🚗', '🛍️', '🎮', '📄', '🏥', '📚', '💼', '📈', '💻', '💰', '❤️', '🏠', '✈️', '☕', '🎬', '🎵', '⚽', '🏃', '💊'];
    }

    _getColorPresets() {
        return ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#52C41A', '#1890FF', '#722ED1', '#FA8C16', '#F5222D', '#8C8C8C'];
    }

    setType(type) {
        this._type = type;
        this.render();
    }

    setMode(mode) {
        this._mode = mode;
        this.render();
    }

    setSelectedCategory(categoryId) {
        this._selectedCategory = categoryId;
        this.render();
    }

    setOnSelect(callback) {
        this._onSelect = callback;
    }
}


export default CategoryManager;
