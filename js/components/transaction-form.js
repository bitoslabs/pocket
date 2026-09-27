/**
 * Transaction Form Component
 * Comprehensive form for adding/editing manual and recurring transactions
 * 
 * @module components/transaction-form
 */

import { Component } from '../core/component.js';
import { eventBus, Events } from '../core/event-bus.js';
import { zapService } from '../services/zap-service.js';
import { categoryService } from '../services/category-service.js';
import { recurringService } from '../services/recurring-service.js';
import { formatSats, formatDateTime } from '../utils/format.js';

export class TransactionForm extends Component {
  constructor(options = {}) {
    super(options);
    this._mode = options.mode || 'create'; // create, edit
    this._transaction = options.transaction || null;
    this._defaultType = options.defaultType || 'expense';
    this._showRecurring = options.showRecurring !== false; // Default true, can be set to false
    this._onSubmit = options.onSubmit || null;
  }

  template() {
    const isEdit = this._mode === 'edit';
    const transaction = this._transaction;
    const categories = categoryService.getCategories(this._defaultType);

    return `
      <div class="transaction-form">



        <form class="form-content">
          <!-- Transaction Type -->
          <div class="form-group">
            <label class="form-label">Type</label>
            <div class="segmented-control">
              <button type="button" class="segment-btn ${this._defaultType === 'income' ? 'active' : ''}" data-type="income">
                <span class="segment-icon">💰</span>
                Income
              </button>
              <button type="button" class="segment-btn ${this._defaultType === 'expense' ? 'active' : ''}" data-type="expense">
                <span class="segment-icon">💸</span>
                Expense
              </button>
            </div>
          </div>

          <!-- Amount -->
          <div class="form-group">
            <label class="form-label">Amount (sats)</label>
            <div class="input-group">
              <input type="number"
                class="form-input"
                id="amount"
                placeholder="0"
                min="1"
                step="1"
                value="${transaction?.amount || ''}"
                required>
                <span class="input-suffix">sats</span>
            </div>
          </div>

          <!-- Description -->
          <div class="form-group">
            <label class="form-label">Description</label>
            <input type="text"
              class="form-input"
              id="description"
              placeholder="What's this for?"
              value="${transaction?.description || ''}">
          </div>

          <!-- Category -->
          <div class="form-group">
            <label class="form-label">Category</label>
            <div class="category-select">
              <select class="form-input" id="category">
                <option value="">Select category</option>
                ${categories.map(cat => `
                  <option value="${cat.id}" ${transaction?.category === cat.id ? 'selected' : ''}>
                    ${cat.icon} ${cat.name}
                  </option>
                `).join('')}
              </select>
              <button type="button" class="btn btn-ghost btn-sm add-category-btn" title="Add new category">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>

          <!-- Date -->
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="datetime-local"
              class="form-input"
              id="date"
              value="${transaction ? new Date(transaction.created_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16)}">
          </div>

          <!-- Recurring Options -->
          ${this._showRecurring ? this._renderRecurringOptions() : ''}

          <!-- Form Actions -->
          <div class="form-actions">
            <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">
              ${isEdit ? 'Update' : 'Add'} Transaction
            </button>
          </div>
        </form>
      </div >
      `;
  }

  _renderRecurringOptions() {
    return `
      <div class="form-divider">
        <span>Recurring Transaction</span>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="is-recurring">
          <span class="checkbox-text">Make this a recurring transaction</span>
        </label>
      </div>

      <div class="recurring-options" id="recurring-options" style="display: none;">
        <div class="form-group">
          <label class="form-label">Frequency</label>
          <select class="form-input" id="frequency">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly" selected>Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Every</label>
          <div class="input-group">
            <input type="number" class="form-input" id="interval" min="1" value="1">
            <span class="input-suffix" id="interval-label">month(s)</span>
          </div>
        </div>

        <div class="form-group" id="day-of-week-group" style="display: none;">
          <label class="form-label">Day of Week</label>
          <select class="form-input" id="day-of-week">
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
            <option value="6">Saturday</option>
          </select>
        </div>

        <div class="form-group" id="day-of-month-group">
          <label class="form-label">Day of Month</label>
          <input type="number" class="form-input" id="day-of-month" min="1" max="31" value="1">
        </div>

        <div class="form-group">
          <label class="form-label">End Date (optional)</label>
          <input type="date" class="form-input" id="end-date">
        </div>

        <div class="form-group">
          <label class="form-label">Number of Occurrences (optional)</label>
          <input type="number" class="form-input" id="count" min="1" placeholder="Leave blank for infinite">
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Type toggle
    // Type toggle
    this.addEventListener('.segmented-control', 'click', (e) => {
      const button = e.target.closest('.segment-btn');
      if (!button) return;

      const type = button.dataset.type;
      console.log('Type clicked:', type, 'Current:', this._defaultType);

      if (type && type !== this._defaultType) {
        this._defaultType = type;

        // Update active states
        const buttons = this.container.querySelectorAll('.segment-btn');
        buttons.forEach(btn => {
          btn.classList.remove('active');
          if (btn.dataset.type === type) {
            btn.classList.add('active');
          }
        });

        // Update categories dropdown
        const categorySelect = this.container.querySelector('#category');
        if (categorySelect) {
          const categories = categoryService.getCategories(type);
          const currentValue = categorySelect.value;

          // Update options
          categorySelect.innerHTML = '<option value="">Select category</option>' +
            categories.map(cat => `
              <option value="${cat.id}" ${currentValue === cat.id ? 'selected' : ''}>
                ${cat.icon} ${cat.name}
              </option>
            `).join('');
        }
      }
    });

    // Form submission
    this.addEventListener('.form-content', 'submit', async (e) => {
      e.preventDefault();
      await this._handleSubmit();
    });

    // Cancel button
    this.addEventListener('.cancel-btn', 'click', () => {
      this._handleCancel();
    });



    // Add category button
    this.addEventListener('.add-category-btn', 'click', () => {
      this._showAddCategoryModal();
    });

    // Recurring options
    if (this._showRecurring) {
      this.addEventListener('#is-recurring', 'change', (e) => {
        const options = document.getElementById('recurring-options');
        options.style.display = e.target.checked ? 'block' : 'none';
      });

      this.addEventListener('#frequency', 'change', (e) => {
        this._updateFrequencyOptions(e.target.value);
      });
    }
  }

  async _handleSubmit() {
    try {
      console.log('Form submission started, current type:', this._defaultType);
      const formData = this._getFormData();
      console.log('Form data:', formData);

      if (this._mode === 'edit') {
        await zapService.updateTransaction(this._transaction.id, formData);
        eventBus.emit(Events.TOAST_SHOW, {
          type: 'success',
          message: 'Transaction updated successfully'
        });
      } else {
        if (formData.isRecurring) {
          console.log('Creating recurring transaction');
          await recurringService.createRecurringTransaction(formData);
          eventBus.emit(Events.TOAST_SHOW, {
            type: 'success',
            message: 'Recurring transaction created'
          });
        } else {
          console.log('Creating manual transaction');
          await zapService.createManualTransaction(formData);
          eventBus.emit(Events.TOAST_SHOW, {
            type: 'success',
            message: 'Transaction added successfully'
          });
        }
      }

      if (this._onSubmit) {
        console.log('Calling onSubmit callback');
        this._onSubmit(formData);
      }

      this._handleClose();

    } catch (error) {
      console.error('Form submission error:', error);
      eventBus.emit(Events.TOAST_SHOW, {
        type: 'error',
        message: error.message
      });
    }
  }

  _getFormData() {
    // Get form values with validation
    const amount = document.getElementById('amount').value;
    const description = document.getElementById('description').value;
    const category = document.getElementById('category').value;
    const dateValue = document.getElementById('date').value;

    console.log('Form field values:', {
      amount,
      description,
      category,
      dateValue,
      type: this._defaultType
    });

    // Validate required fields
    if (!amount || parseFloat(amount) <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (!description || description.trim() === '') {
      throw new Error('Description is required');
    }

    if (!dateValue) {
      throw new Error('Date is required');
    }

    const data = {
      type: this._defaultType,
      amount: parseFloat(amount),
      description: description.trim(),
      category: category || null,
      date: new Date(dateValue).getTime()
    };

    // Add recurring data if enabled
    if (this._showRecurring && document.getElementById('is-recurring').checked) {
      data.isRecurring = true;
      data.name = data.description; // Recurring service requires name
      data.frequency = document.getElementById('frequency').value;
      data.interval = parseInt(document.getElementById('interval').value) || 1;
      data.startDate = data.date;

      if (document.getElementById('end-date').value) {
        data.endDate = new Date(document.getElementById('end-date').value).getTime();
      }

      if (document.getElementById('count').value) {
        data.count = parseInt(document.getElementById('count').value);
      }

      // Frequency-specific options
      if (data.frequency === 'weekly') {
        data.dayOfWeek = parseInt(document.getElementById('day-of-week').value);
      } else if (data.frequency === 'monthly') {
        data.dayOfMonth = parseInt(document.getElementById('day-of-month').value) || 1;
      }
    }

    return data;
  }

  _handleCancel() {
    this._handleClose();
  }

  _handleClose() {
    if (this._onClose) {
      this._onClose();
    }
  }

  _updateFrequencyOptions(frequency) {
    const dayOfWeekGroup = document.getElementById('day-of-week-group');
    const dayOfMonthGroup = document.getElementById('day-of-month-group');
    const intervalLabel = document.getElementById('interval-label');

    // Hide all specific options first
    dayOfWeekGroup.style.display = 'none';
    dayOfMonthGroup.style.display = 'none';

    // Show relevant options
    switch (frequency) {
      case 'daily':
        intervalLabel.textContent = 'day(s)';
        break;
      case 'weekly':
        intervalLabel.textContent = 'week(s)';
        dayOfWeekGroup.style.display = 'block';
        break;
      case 'monthly':
        intervalLabel.textContent = 'month(s)';
        dayOfMonthGroup.style.display = 'block';
        break;
      case 'yearly':
        intervalLabel.textContent = 'year(s)';
        break;
    }
  }

  async _showAddCategoryModal() {
    const { modal } = await import('./modal.js');

    modal.open({
      title: 'Add New Category',
      content: `
      < form class="category-form" >
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
            <input type="text" class="form-input" id="category-icon" placeholder="📌" maxlength="2">
          </div>
          
          <div class="form-group">
            <label class="form-label">Color</label>
            <input type="color" class="form-input" id="category-color" value="#8C8C8C">
          </div>
        </form >
      `,
      actions: [
        { label: 'Cancel', variant: 'btn-secondary' },
        {
          label: 'Add Category',
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

              // Refresh the category dropdown
              this.render();

              eventBus.emit(Events.TOAST_SHOW, {
                type: 'success',
                message: 'Category added successfully'
              });
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

  set onClose(callback) {
    this._onClose = callback;
  }

  set onSubmit(callback) {
    this._onSubmit = callback;
  }
}

export default TransactionForm;
