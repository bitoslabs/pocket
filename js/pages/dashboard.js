/**
 * Dashboard Page - iOS Style
 * Overview of zap income/expenses with gradient header and iOS components
 * 
 * @module pages/dashboard
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { eventBus, Events } from '../core/event-bus.js';
import { zapService } from '../services/zap-service.js';
import { formatSats, formatRelativeTime } from '../utils/format.js';

export class DashboardPage extends Component {
  constructor(options) {
    super(options);
    this.selectedTab = 'expense';
    this.selectedDate = new Date().getDate();
  }

  mounted() {
    this.watchStore('transactions', () => this.render());
    this.watchStore('isAuthenticated', () => this.render());
    this.watchStore('isLoading', () => this.render());
  }

  template() {
    const isAuthenticated = store.get('isAuthenticated');
    const isLoading = store.get('isLoading');
    const stats = zapService.getStats();
    const recentTransactions = zapService.getTransactions({ limit: 5 });

    if (isLoading) {
      return this._renderLoading();
    }

    if (!isAuthenticated) {
      return this._renderWelcome();
    }

    return `
      <!-- Gradient Hero Header -->
      <div class="hero-header">
        <div class="hero-nav">
          <button class="hero-nav-btn menu-toggle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <span class="hero-title">Budget</span>
          <button class="hero-nav-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </button>
        </div>

        <div class="hero-balance">
          <div class="hero-balance-amount">${formatSats(stats.balance)}</div>
          <div class="hero-balance-label">${new Date().toLocaleDateString('en-US', { month: 'long' })}</div>
        </div>

        ${this._renderDatePicker()}
      </div>

      <!-- Segmented Control -->
      <div class="segmented-control mb-6">
        <button class="segment-btn ${this.selectedTab === 'expense' ? 'active' : ''}" data-tab="expense">
          Expense
        </button>
        <button class="segment-btn ${this.selectedTab === 'income' ? 'active' : ''}" data-tab="income">
          Income
        </button>
      </div>

      <!-- Savings Card -->
      <div class="savings-card mb-6">
        <div class="savings-label">Monthly Savings</div>
        <div class="savings-amount">${formatSats(stats.totalIncome)}</div>
        <div class="savings-breakdown">
          <div class="savings-row">
            <span class="savings-indicator earned"></span>
            <span class="savings-row-label">Earned</span>
            <span class="savings-row-amount">${formatSats(stats.totalIncome)}</span>
          </div>
          <div class="savings-row">
            <span class="savings-indicator spent"></span>
            <span class="savings-row-label">Spent</span>
            <span class="savings-row-amount">${formatSats(stats.totalExpenses)}</span>
          </div>
        </div>
      </div>

      <!-- Top Spending Categories -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-4">Top Spending</h3>
        <div class="category-scroll">
          ${this._renderCategories()}
        </div>
      </div>

      <!-- Monthly Budget -->
      <div class="mb-6">
        <h3 class="text-lg font-semibold mb-4">Monthly Budget</h3>
        <div class="flex flex-col gap-3">
          ${this._renderBudgetCards()}
        </div>
      </div>

      <!-- Recent Transactions -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Recent Activity</h2>
          <a href="#transactions" class="btn btn-ghost btn-sm">View All</a>
        </div>
        <div class="card-body">
          ${recentTransactions.length > 0
        ? this._renderTransactionList(recentTransactions)
        : this._renderEmptyTransactions()}
        </div>
      </div>

      <!-- Floating Action Button -->
      <button class="fab" id="fab-add">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>
    `;
  }

  _renderDatePicker() {
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    let html = '<div class="hero-date-picker">';
    for (let i = 1; i <= Math.min(daysInMonth, 31); i++) {
      const isActive = i === this.selectedDate;
      html += `<span class="hero-date-item ${isActive ? 'active' : ''}" data-date="${i}">${i.toString().padStart(2, '0')}</span>`;
    }
    html += '</div>';
    return html;
  }

  _renderCategories() {
    const categories = [
      { id: 'house', name: 'House', icon: this._icons.house },
      { id: 'transport', name: 'Transport', icon: this._icons.transport },
      { id: 'office', name: 'Office', icon: this._icons.office },
      { id: 'education', name: 'Education', icon: this._icons.education },
      { id: 'medical', name: 'Medical', icon: this._icons.medical },
    ];

    return categories.map(cat => `
          <div class="category-item" data-category="${cat.id}">
            <div class="category-badge ${cat.id}">
              ${cat.icon}
            </div>
            <span class="category-item-label">${cat.name}</span>
          </div>
        `).join('');
  }

  _renderBudgetCards() {
    const budgets = [
      { name: 'Transportation', perDay: '20 sats/day', spent: 500, total: 1000, status: 'on-track' },
      { name: 'Food & Dining', perDay: '50 sats/day', spent: 1500, total: 2000, status: 'warning' },
    ];

    return budgets.map(budget => {
      const percentage = Math.min((budget.spent / budget.total) * 100, 100);
      const progressClass = percentage >= 90 ? 'danger' : percentage >= 70 ? 'warning' : 'success';

      return `
              <div class="budget-card">
                <div class="category-badge transport">
                  ${this._icons.transport}
                </div>
                <div class="budget-info">
                  <div class="budget-title">${budget.name}</div>
                  <div class="budget-subtitle">${budget.perDay}</div>
                  <div class="budget-amounts">
                    <span class="budget-spent">${formatSats(budget.spent)}</span>
                    <div class="progress-bar" style="flex: 1;">
                      <div class="progress-bar-fill ${progressClass}" style="width: ${percentage}%;"></div>
                    </div>
                    <span class="budget-total">${formatSats(budget.total)}</span>
                  </div>
                  <div class="budget-status ${budget.status}">
                    <span>●</span>
                    ${budget.status === 'on-track' ? 'Your spending is on track' : 'You are almost exceeding your budget'}
                  </div>
                </div>
              </div>
            `;
    }).join('');
  }

  get _icons() {
    return {
      house: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>`,
      transport: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="3" width="15" height="13"></rect>
              <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
              <circle cx="5.5" cy="18.5" r="2.5"></circle>
              <circle cx="18.5" cy="18.5" r="2.5"></circle>
            </svg>`,
      office: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>`,
      education: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
              <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
            </svg>`,
      medical: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
            </svg>`,
    };
  }

  _renderTransactionList(transactions) {
    return `
      <div class="transaction-list flex flex-col gap-3">
        ${transactions.map(tx => this._renderTransaction(tx)).join('')}
      </div>
    `;
  }

  _renderTransaction(tx) {
    const amount = formatSats(tx.amount);
    const time = formatRelativeTime(tx.created_at);
    const isIncome = tx.type === 'income';

    return `
      <div class="transaction-item" data-id="${tx.id}">
        <div class="category-badge ${isIncome ? 'education' : 'transport'}">
          ${isIncome
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>'
      }
        </div>
        <div class="transaction-info">
          <div class="transaction-description">
            ${isIncome ? 'Received from' : 'Sent to'} ${this.escape(tx.sender || 'Anonymous')}
          </div>
          <div class="transaction-meta">${time}</div>
        </div>
        <div class="transaction-amount ${tx.type}">
          ${isIncome ? '+' : '-'}${amount}
        </div>
      </div>
    `;
  }

  _renderEmptyTransactions() {
    return `
      <div class="empty-state py-8">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
        </div>
        <h3 class="empty-state-title">No transactions yet</h3>
        <p class="empty-state-description">
          Your zap receipts will appear here once you start receiving or sending sats.
        </p>
      </div>
    `;
  }

  _renderWelcome() {
    return `
      <!-- Gradient Hero for Welcome -->
      <div class="hero-header" style="margin-bottom: var(--space-6); padding-bottom: var(--space-8);">
        <div class="hero-balance">
          <div style="font-size: 4rem; margin-bottom: var(--space-4); filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));">⚡</div>
          <div class="hero-balance-amount" style="font-size: 2.5rem;">Zap Journal</div>
          <div class="hero-balance-label" style="opacity: 0.9;">Track your Lightning finances</div>
        </div>
      </div>

      <div class="px-4 max-w-md mx-auto" style="margin-top: -40px; position: relative; z-index: 10;">
        <div class="card" style="text-align: center; padding: var(--space-6);">
          <h2 class="text-xl font-semibold mb-2">Welcome Back</h2>
          <p class="text-secondary mb-6">
            Connect your Nostr wallet to start tracking your zaps and expenses.
          </p>
          
          <button class="btn btn-primary btn-lg btn-block connect-btn mb-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
            </svg>
            Connect with Nostr
          </button>
          
          <p class="text-tertiary text-xs">
            Requires a NIP-07 extension like Alby or nos2x
          </p>
        </div>

        <!-- simple features list -->
        <div class="mt-8 grid gap-4">
          <div class="flex items-center gap-4 p-4 bg-tertiary rounded-xl">
             <div class="w-10 h-10 rounded-full bg-primary-alpha-20 flex items-center justify-center text-primary">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
             </div>
             <div>
               <div class="font-medium">Track Expenses</div>
               <div class="text-xs text-secondary">Monitor your spending habits</div>
             </div>
          </div>
          
           <div class="flex items-center gap-4 p-4 bg-tertiary rounded-xl">
             <div class="w-10 h-10 rounded-full bg-success-alpha-20 flex items-center justify-center text-success" style="background: rgba(48, 209, 88, 0.15);">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
             </div>
             <div>
               <div class="font-medium">Zap Income</div>
               <div class="text-xs text-secondary">See your incoming zaps</div>
             </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderLoading() {
    return `
      <div class="loading-section flex items-center justify-center py-16">
        <div class="spinner spinner-lg"></div>
      </div>
    `;
  }

  bindEvents() {
    // Connect button
    this.addEventListener('.connect-btn', 'click', async () => {
      const { authService } = await import('../services/auth-service.js');
      try {
        await authService.login();
      } catch (error) {
        eventBus.emit(Events.TOAST_SHOW, {
          type: 'error',
          message: error.message
        });
      }
    });

    // Segmented control
    this.addEventListener('.segment-btn', 'click', (e) => {
      const tab = e.target.dataset.tab;
      if (tab) {
        this.selectedTab = tab;
        this.render();
      }
    });

    // Date picker
    this.addEventListener('.hero-date-item', 'click', (e) => {
      const date = parseInt(e.target.dataset.date);
      if (date) {
        this.selectedDate = date;
        this.render();
      }
    });

    // FAB
    this.addEventListener('#fab-add', 'click', () => {
      eventBus.emit(Events.TOAST_SHOW, {
        type: 'info',
        message: 'Add transaction coming soon!'
      });
    });

    // Menu toggle for mobile
    this.addEventListener('.menu-toggle', 'click', () => {
      const sidebar = document.querySelector('.app-sidebar');
      const overlay = document.querySelector('.sidebar-overlay');
      if (sidebar) {
        sidebar.classList.toggle('open');
        overlay?.classList.toggle('visible');
      }
    });
  }
}

export default DashboardPage;
