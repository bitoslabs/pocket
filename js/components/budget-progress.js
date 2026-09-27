/**
 * Budget Progress Component
 * Display budget progress with visual indicators and alerts
 * 
 * @module components/budget-progress
 */

import { Component } from '../core/component.js';
import { eventBus, Events } from '../core/event-bus.js';
import { budgetService } from '../services/budget-service.js';
import { categoryService } from '../services/category-service.js';
import { formatSats } from '../utils/format.js';

export class BudgetProgress extends Component {
    constructor(options = {}) {
        super(options);
        this._budgetId = options.budgetId || null;
        this._compact = options.compact || false;
        this._showDetails = options.showDetails !== false;
        this._clickable = options.clickable || false;
    }

    template() {
        if (this._budgetId) {
            const progress = budgetService.getBudgetProgress(this._budgetId);
            return this._renderSingleBudget(progress);
        } else {
            const allProgress = budgetService.getAllBudgetProgress();
            return this._renderAllBudgets(allProgress);
        }
    }

    _renderSingleBudget(progress) {
        const { budget, spent, remaining, percentage, status } = progress;
        const category = categoryService.getCategory(budget.categoryId);
        
        return `
      <div class="budget-progress ${this._compact ? 'compact' : ''} ${this._clickable ? 'clickable' : ''}" data-budget-id="${budget.id}">
        <div class="budget-header">
          <div class="budget-info">
            <div class="budget-title">
              ${category?.icon || '📌'} ${budget.name}
            </div>
            ${!this._compact ? `<div class="budget-period">${this._formatPeriod(budget.period)}</div>` : ''}
          </div>
          <div class="budget-amounts">
            <div class="budget-spent">${formatSats(spent)}</div>
            ${!this._compact ? `<div class="budget-total">/ ${formatSats(budget.amount)}</div>` : ''}
          </div>
        </div>
        
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-bar-fill ${status}" style="width: ${percentage}%;"></div>
          </div>
          <div class="progress-percentage ${status}">${Math.round(percentage)}%</div>
        </div>
        
        ${this._showDetails ? this._renderBudgetDetails(progress) : ''}
        
        ${status !== 'on-track' ? this._renderAlert(progress) : ''}
      </div>
    `;
    }

    _renderAllBudgets(progressData) {
        if (progressData.length === 0) {
            return `
        <div class="empty-budgets">
          <div class="empty-state-icon">📊</div>
          <h3>No budgets set up</h3>
          <p>Create budgets to track your spending</p>
          <button class="btn btn-primary create-budget-btn">Create Budget</button>
        </div>
      `;
        }

        return `
      <div class="budgets-list">
        ${progressData.map(progress => this._renderSingleBudget(progress)).join('')}
      </div>
      
      ${!this._compact ? `
        <div class="budgets-summary">
          <div class="summary-card">
            <h4>Budget Overview</h4>
            ${this._renderBudgetSummary(progressData)}
          </div>
        </div>
      ` : ''}
    `;
    }

    _renderBudgetDetails(progress) {
        const { budget, spent, remaining, daysElapsed, daysInPeriod, dailyAverage, recommendedDaily } = progress;
        
        return `
      <div class="budget-details">
        <div class="detail-row">
          <span>Remaining</span>
          <span class="${remaining < 0 ? 'negative' : 'positive'}">${formatSats(remaining)}</span>
        </div>
        <div class="detail-row">
          <span>Daily Average</span>
          <span>${formatSats(dailyAverage)}/day</span>
        </div>
        <div class="detail-row">
          <span>Recommended</span>
          <span>${formatSats(recommendedDaily)}/day</span>
        </div>
        <div class="detail-row">
          <span>Time Left</span>
          <span>${daysInPeriod - daysElapsed} days</span>
        </div>
      </div>
    `;
    }

    _renderAlert(progress) {
        const { percentage, remaining, budget } = progress;
        const isOverBudget = remaining < 0;
        
        return `
      <div class="budget-alert ${progress.status}">
        <div class="alert-icon">
          ${progress.status === 'danger' ? '⚠️' : '⚡'}
        </div>
        <div class="alert-message">
          ${isOverBudget 
            ? `${Math.round(percentage)}% spent - Over budget by ${formatSats(Math.abs(remaining))}!`
            : `${Math.round(percentage)}% spent - ${formatSats(remaining)} remaining`
          }
        </div>
      </div>
    `;
    }

    _renderBudgetSummary(progressData) {
        const totalBudgeted = progressData.reduce((sum, p) => sum + p.budget.amount, 0);
        const totalSpent = progressData.reduce((sum, p) => sum + p.spent, 0);
        const totalRemaining = totalBudgeted - totalSpent;
        const alerts = budgetService.getBudgetAlerts();
        
        return `
      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-label">Total Budgeted</div>
          <div class="summary-value">${formatSats(totalBudgeted)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Total Spent</div>
          <div class="summary-value">${formatSats(totalSpent)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Remaining</div>
          <div class="summary-value ${totalRemaining < 0 ? 'negative' : 'positive'}">${formatSats(totalRemaining)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Alerts</div>
          <div class="summary-value ${alerts.length > 0 ? 'warning' : ''}">${alerts.length}</div>
        </div>
      </div>
    `;
    }

    _formatPeriod(period) {
        const periodMap = {
            daily: 'Daily',
            weekly: 'Weekly',
            monthly: 'Monthly',
            yearly: 'Yearly'
        };
        return periodMap[period] || period;
    }

    bindEvents() {
        // Budget click handler
        if (this._clickable) {
            this.addEventListener('.budget-progress.clickable', 'click', (e) => {
                const budgetId = e.currentTarget.dataset.budgetId;
                if (budgetId) {
                    this._onBudgetClick(budgetId);
                }
            });
        }

        // Create budget button
        this.addEventListener('.create-budget-btn', 'click', () => {
            this._showCreateBudgetModal();
        });
    }

    _onBudgetClick(budgetId) {
        eventBus.emit(Events.BUDGET_CLICKED, { budgetId });
    }

    async _showCreateBudgetModal() {
        const { modal } = await import('./modal.js');
        const categories = categoryService.getCategories('expense');

        modal.open({
            title: 'Create Budget',
            content: `
        <form class="budget-form">
          <div class="form-group">
            <label class="form-label">Budget Name</label>
            <input type="text" class="form-input" id="budget-name" placeholder="e.g., Monthly Food Budget" required>
          </div>
          
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-input" id="budget-category" required>
              <option value="">Select category</option>
              ${categories.map(cat => `
                <option value="${cat.id}">${cat.icon} ${cat.name}</option>
              `).join('')}
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">Budget Amount (sats)</label>
            <div class="input-group">
              <input type="number" class="form-input" id="budget-amount" min="1" step="1" required>
              <span class="input-suffix">sats</span>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Period</label>
            <select class="form-input" id="budget-period">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly" selected>Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          
          <div class="form-group">
            <label class="form-label">Start Date</label>
            <input type="date" class="form-input" id="budget-start-date">
          </div>
          
          <div class="form-group">
            <label class="form-label">End Date (optional)</label>
            <input type="date" class="form-input" id="budget-end-date">
          </div>
          
          <div class="form-group">
            <label class="form-label">Alert Threshold</label>
            <select class="form-input" id="budget-threshold">
              <option value="0.5">50%</option>
              <option value="0.7" selected>70%</option>
              <option value="0.8">80%</option>
              <option value="0.9">90%</option>
            </select>
          </div>
          
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="budget-rollover">
              <span class="checkbox-text">Rollover unused amount</span>
            </label>
          </div>
        </form>
      `,
            actions: [
                { label: 'Cancel', variant: 'btn-secondary' },
                {
                    label: 'Create Budget',
                    variant: 'btn-primary',
                    handler: async () => {
                        try {
                            const budgetData = {
                                name: document.getElementById('budget-name').value,
                                categoryId: document.getElementById('budget-category').value,
                                amount: parseFloat(document.getElementById('budget-amount').value),
                                period: document.getElementById('budget-period').value,
                                startDate: document.getElementById('budget-start-date').value ? 
                                    new Date(document.getElementById('budget-start-date').value).getTime() : Date.now(),
                                endDate: document.getElementById('budget-end-date').value ? 
                                    new Date(document.getElementById('budget-end-date').value).getTime() : null,
                                alertThreshold: parseFloat(document.getElementById('budget-threshold').value),
                                rollover: document.getElementById('budget-rollover').checked
                            };

                            await budgetService.createBudget(budgetData);
                            
                            eventBus.emit(Events.TOAST_SHOW, {
                                type: 'success',
                                message: 'Budget created successfully'
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

        // Set default start date to today
        setTimeout(() => {
            const startDateInput = document.getElementById('budget-start-date');
            if (startDateInput && !startDateInput.value) {
                startDateInput.value = new Date().toISOString().split('T')[0];
            }
        }, 100);
    }

    setBudgetId(budgetId) {
        this._budgetId = budgetId;
        this.render();
    }

    setCompact(compact) {
        this._compact = compact;
        this.render();
    }
}


export default BudgetProgress;
