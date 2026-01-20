/**
 * Journal Page
 * Private encrypted journal entries
 * 
 * @module pages/journal
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { eventBus, Events } from '../core/event-bus.js';
import { journalService } from '../services/journal-service.js';
import { formatRelativeTime, formatDateTime } from '../utils/format.js';

export class JournalPage extends Component {
    constructor(options) {
        super(options);
        this._state = {
            filter: null,
            search: '',
            showForm: false
        };
    }

    mounted() {
        this.watchStore('journal', () => this.render());
        this.watchStore('isAuthenticated', () => this.render());
    }

    template() {
        const isAuthenticated = store.get('isAuthenticated');

        if (!isAuthenticated) {
            return this._renderAuthRequired();
        }

        const { filter, search, showForm } = this._state;
        const entries = journalService.getEntries({ tag: filter, search });
        const tags = journalService.getTags();

        return `
      <div class="page-header flex justify-between items-start mb-6">
        <div>
          <h1 class="text-3xl font-bold">🔒 Private Journal</h1>
          <p class="text-secondary mt-2">Encrypted notes stored on Nostr</p>
        </div>
        <button class="btn btn-primary new-entry-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Entry
        </button>
      </div>

      ${showForm ? this._renderForm() : ''}

      <!-- Filters -->
      <div class="flex gap-4 mb-6 flex-wrap">
        <div class="search-box flex-1 min-w-64">
          <input type="text" class="search-input" placeholder="Search entries..." value="${this.escape(search)}">
        </div>
        <div class="tag-filters flex gap-2 flex-wrap">
          <button class="btn ${!filter ? 'btn-primary' : 'btn-secondary'} btn-sm tag-filter-btn" data-tag="">
            All
          </button>
          ${tags.map(t => `
            <button class="btn ${filter === t.name ? 'btn-primary' : 'btn-secondary'} btn-sm tag-filter-btn" data-tag="${t.name}">
              ${this._getTagEmoji(t.name)} ${t.name} (${t.count})
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Entries Grid -->
      <div class="grid grid-auto-md gap-4">
        ${entries.length > 0
                ? entries.map(entry => this._renderEntryCard(entry)).join('')
                : this._renderEmpty()}
      </div>
    `;
    }

    _renderForm() {
        return `
      <div class="card mb-6 entry-form">
        <div class="card-header">
          <h3 class="card-title">New Journal Entry</h3>
          <button class="btn btn-ghost btn-sm close-form-btn">✕</button>
        </div>
        <div class="card-body">
          <div class="form-group">
            <label for="entry-title">Title</label>
            <input type="text" id="entry-title" placeholder="Entry title...">
          </div>
          <div class="form-group">
            <label for="entry-text">Content</label>
            <textarea id="entry-text" rows="6" placeholder="Write your private thoughts..."></textarea>
          </div>
          <div class="form-group">
            <label for="entry-tag">Category</label>
            <select id="entry-tag">
              <option value="personal">🏠 Personal</option>
              <option value="financial">💰 Financial</option>
              <option value="goals">🎯 Goals</option>
              <option value="ideas">💡 Ideas</option>
              <option value="notes">📝 Notes</option>
            </select>
          </div>
        </div>
        <div class="card-footer flex justify-end gap-3">
          <button class="btn btn-secondary cancel-btn">Cancel</button>
          <button class="btn btn-primary save-entry-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            Encrypt & Save
          </button>
        </div>
      </div>
    `;
    }

    _renderEntryCard(entry) {
        const date = formatRelativeTime(entry.created_at);
        const preview = entry.text.length > 150
            ? entry.text.slice(0, 150) + '...'
            : entry.text;

        return `
      <div class="card entry-card" data-id="${entry.id}">
        <div class="card-header">
          <div>
            <h3 class="card-title">${this.escape(entry.title)}</h3>
            <span class="badge badge-neutral mt-1">
              ${this._getTagEmoji(entry.tag)} ${entry.tag}
            </span>
          </div>
          <div class="entry-actions flex gap-1">
            <button class="btn btn-icon btn-ghost view-entry-btn" data-id="${entry.id}" title="View">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button class="btn btn-icon btn-ghost delete-entry-btn" data-id="${entry.id}" title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="card-body">
          <p class="text-secondary text-sm">${this.escape(preview)}</p>
        </div>
        <div class="card-footer">
          <span class="text-xs text-tertiary">${date}</span>
        </div>
      </div>
    `;
    }

    _renderEmpty() {
        return `
      <div class="empty-state py-12 col-span-full">
        <div class="empty-state-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        </div>
        <h3 class="empty-state-title">No journal entries</h3>
        <p class="empty-state-description">
          ${this._state.search || this._state.filter
                ? 'No entries match your search or filter.'
                : 'Start writing encrypted notes that only you can read.'}
        </p>
      </div>
    `;
    }

    _renderAuthRequired() {
        return `
      <div class="auth-required text-center py-16">
        <div class="text-6xl mb-6">🔐</div>
        <h1 class="text-3xl font-bold mb-4">Authentication Required</h1>
        <p class="text-secondary mb-8">
          Connect your Nostr account to access encrypted journal entries.
        </p>
        <a href="#dashboard" class="btn btn-primary">
          Go to Dashboard
        </a>
      </div>
    `;
    }

    _getTagEmoji(tag) {
        const emojis = {
            personal: '🏠',
            financial: '💰',
            goals: '🎯',
            ideas: '💡',
            notes: '📝'
        };
        return emojis[tag] || '📝';
    }

    bindEvents() {
        // New entry button
        this.addEventListener('.new-entry-btn', 'click', () => {
            this.setState({ showForm: true });
        });

        // Close form
        this.addEventListener('.close-form-btn', 'click', () => {
            this.setState({ showForm: false });
        });

        this.addEventListener('.cancel-btn', 'click', () => {
            this.setState({ showForm: false });
        });

        // Save entry
        this.addEventListener('.save-entry-btn', 'click', async () => {
            const title = this.$('#entry-title')?.value?.trim();
            const text = this.$('#entry-text')?.value?.trim();
            const tag = this.$('#entry-tag')?.value;

            if (!title || !text) {
                eventBus.emit(Events.TOAST_SHOW, {
                    type: 'warning',
                    message: 'Please fill in title and content'
                });
                return;
            }

            try {
                await journalService.create({ title, text, tag });
                this.setState({ showForm: false });
                eventBus.emit(Events.TOAST_SHOW, {
                    type: 'success',
                    message: 'Entry encrypted and saved!'
                });
            } catch (error) {
                eventBus.emit(Events.TOAST_SHOW, {
                    type: 'error',
                    message: error.message
                });
            }
        });

        // Search
        this.addEventListener('.search-input', 'input', (e) => {
            clearTimeout(this._searchTimeout);
            this._searchTimeout = setTimeout(() => {
                this.setState({ search: e.target.value });
            }, 300);
        });

        // Tag filter
        this.addEventListener('.tag-filter-btn', 'click', (e) => {
            const tag = e.target.dataset.tag || null;
            this.setState({ filter: tag });
        });

        // View entry
        this.addEventListener('.view-entry-btn', 'click', async (e) => {
            const id = e.target.closest('.view-entry-btn').dataset.id;
            const entry = journalService.getEntry(id);
            if (!entry) return;

            const { modal } = await import('../components/modal.js');
            modal.open({
                title: entry.title,
                content: `
          <div class="mb-4">
            <span class="badge badge-neutral">${this._getTagEmoji(entry.tag)} ${entry.tag}</span>
            <span class="text-sm text-tertiary ml-2">${formatDateTime(entry.created_at)}</span>
          </div>
          <div class="entry-content" style="white-space: pre-wrap;">
            ${this.escape(entry.text)}
          </div>
        `,
                actions: [{ label: 'Close', variant: 'btn-secondary' }]
            });
        });

        // Delete entry
        this.addEventListener('.delete-entry-btn', 'click', async (e) => {
            const id = e.target.closest('.delete-entry-btn').dataset.id;
            const { modal } = await import('../components/modal.js');

            const confirmed = await modal.confirm({
                title: 'Delete Entry',
                message: 'Are you sure you want to delete this journal entry? This action cannot be undone.',
                confirmText: 'Delete',
                danger: true
            });

            if (confirmed) {
                try {
                    await journalService.delete(id);
                    eventBus.emit(Events.TOAST_SHOW, {
                        type: 'success',
                        message: 'Entry deleted'
                    });
                } catch (error) {
                    eventBus.emit(Events.TOAST_SHOW, {
                        type: 'error',
                        message: error.message
                    });
                }
            }
        });
    }
}

export default JournalPage;
