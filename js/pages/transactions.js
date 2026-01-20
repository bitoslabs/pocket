/**
 * Transactions Page
 * Paginated list of all zap events
 * 
 * @module pages/transactions
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { config } from '../config.js';
import { zapService } from '../services/zap-service.js';
import { formatSats, formatDateTime, formatRelativeTime, shortenHex } from '../utils/format.js';

export class TransactionsPage extends Component {
    constructor(options) {
        super(options);
        this._state = {
            page: 1,
            filter: 'all', // all, income, expense
            search: '',
            selectedCategory: null
        };
    }

    mounted() {
        this.watchStore('transactions', () => this.render());
    }

    template() {
        const { page, filter, search } = this._state;
        const pageSize = config.ui.pageSize;

        // Get filtered transactions
        let transactions = zapService.getTransactions({
            type: filter === 'all' ? null : filter
        });

        // Apply search filter
        if (search) {
            const searchLower = search.toLowerCase();
            transactions = transactions.filter(tx =>
                tx.sender?.toLowerCase().includes(searchLower) ||
                tx.description?.toLowerCase().includes(searchLower)
            );
        }

        const total = transactions.length;
        const totalPages = Math.ceil(total / pageSize);
        const start = (page - 1) * pageSize;
        const pageTransactions = transactions.slice(start, start + pageSize);

        return `
      <div class="page-header flex justify-between items-start mb-6">
        <div>
          <h1 class="text-3xl font-bold">Transactions</h1>
          <p class="text-secondary mt-2">${total} total transactions</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar card mb-6">
        <div class="flex flex-wrap gap-4 items-center">
          <div class="filter-group flex gap-2">
            <button class="btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm filter-btn" data-filter="all">
              All
            </button>
            <button class="btn ${filter === 'income' ? 'btn-primary' : 'btn-secondary'} btn-sm filter-btn" data-filter="income">
              Income
            </button>
            <button class="btn ${filter === 'expense' ? 'btn-primary' : 'btn-secondary'} btn-sm filter-btn" data-filter="expense">
              Expenses
            </button>
          </div>
          
          <div class="search-box flex-1 min-w-64">
            <input type="text" class="search-input" placeholder="Search transactions..." value="${this.escape(search)}">
          </div>
        </div>
      </div>

      <!-- Transactions List -->
      <div class="card">
        ${pageTransactions.length > 0
                ? this._renderTransactionTable(pageTransactions)
                : this._renderEmpty()}
        
        ${totalPages > 1 ? this._renderPagination(page, totalPages, total) : ''}
      </div>
    `;
    }

    _renderTransactionTable(transactions) {
        return `
      <div class="table-container overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Amount</th>
              <th>From/To</th>
              <th class="hide-mobile">Description</th>
              <th>Date</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map(tx => this._renderTransactionRow(tx)).join('')}
          </tbody>
        </table>
      </div>
    `;
    }

    _renderTransactionRow(tx) {
        const amount = formatSats(tx.amount);
        const isIncome = tx.type === 'income';
        const date = formatRelativeTime(tx.created_at);
        const contactDisplay = shortenHex(tx.senderPubkey || '', 6) || 'Anonymous';

        return `
      <tr class="transaction-row" data-id="${tx.id}">
        <td>
          <span class="badge ${isIncome ? 'badge-success' : 'badge-error'}">
            ${isIncome ? 'IN' : 'OUT'}
          </span>
        </td>
        <td>
          <span class="font-semibold transaction-amount ${tx.type}">
            ${isIncome ? '+' : '-'}${amount}
          </span>
        </td>
        <td>
          <span class="text-sm">${this.escape(contactDisplay)}</span>
        </td>
        <td class="hide-mobile">
          <span class="text-sm text-secondary truncate" style="max-width: 200px; display: block;">
            ${this.escape(tx.description || '-')}
          </span>
        </td>
        <td>
          <span class="text-sm text-secondary">${date}</span>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm category-btn" data-id="${tx.id}">
            ${tx.category
                ? `<span class="badge badge-primary">${this.escape(tx.category)}</span>`
                : '<span class="text-tertiary">+ Add</span>'
            }
          </button>
        </td>
      </tr>
    `;
    }

    _renderPagination(currentPage, totalPages, total) {
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                pages.push(i);
            } else if (pages[pages.length - 1] !== '...') {
                pages.push('...');
            }
        }

        return `
      <div class="pagination flex items-center justify-between p-4 border-t border-color-border">
        <span class="text-sm text-secondary">
          Showing ${(currentPage - 1) * config.ui.pageSize + 1} - ${Math.min(currentPage * config.ui.pageSize, total)} of ${total}
        </span>
        <div class="pagination-controls flex gap-1">
          <button class="btn btn-ghost btn-sm page-btn" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>
            ←
          </button>
          ${pages.map(p => p === '...'
            ? '<span class="px-2 text-tertiary">...</span>'
            : `<button class="btn ${p === currentPage ? 'btn-primary' : 'btn-ghost'} btn-sm page-btn" data-page="${p}">${p}</button>`
        ).join('')}
          <button class="btn btn-ghost btn-sm page-btn" data-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>
            →
          </button>
        </div>
      </div>
    `;
    }

    _renderEmpty() {
        return `
      <div class="empty-state py-12">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <h3 class="empty-state-title">No transactions found</h3>
        <p class="empty-state-description">
          ${this._state.search || this._state.filter !== 'all'
                ? 'Try adjusting your filters or search terms.'
                : 'Connect your Nostr account to see your zap transactions.'}
        </p>
      </div>
    `;
    }

    bindEvents() {
        // Filter buttons
        this.addEventListener('.filter-btn', 'click', (e) => {
            const filter = e.target.dataset.filter;
            this.setState({ filter, page: 1 });
        });

        // Search input
        this.addEventListener('.search-input', 'input', (e) => {
            clearTimeout(this._searchTimeout);
            this._searchTimeout = setTimeout(() => {
                this.setState({ search: e.target.value, page: 1 });
            }, 300);
        });

        // Pagination
        this.addEventListener('.page-btn', 'click', (e) => {
            const page = parseInt(e.target.dataset.page, 10);
            if (page) {
                this.setState({ page });
            }
        });

        // Category button
        this.addEventListener('.category-btn', 'click', async (e) => {
            const id = e.target.closest('.category-btn').dataset.id;
            const { modal } = await import('../components/modal.js');

            // Simple category picker
            modal.open({
                title: 'Set Category',
                content: `
          <div class="form-group">
            <label>Category</label>
            <select id="category-select" class="w-full">
              <option value="">None</option>
              <option value="food">Food & Dining</option>
              <option value="entertainment">Entertainment</option>
              <option value="services">Services</option>
              <option value="tips">Tips</option>
              <option value="donations">Donations</option>
              <option value="salary">Salary/Income</option>
              <option value="other">Other</option>
            </select>
          </div>
        `,
                actions: [
                    { label: 'Cancel', variant: 'btn-secondary' },
                    {
                        label: 'Save',
                        variant: 'btn-primary',
                        handler: () => {
                            const select = document.getElementById('category-select');
                            zapService.updateCategory(id, select.value || null);
                            this.render();
                        }
                    }
                ]
            });
        });
    }
}

export default TransactionsPage;
