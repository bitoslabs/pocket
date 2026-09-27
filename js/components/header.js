/**
 * Topbar Component - ZapJournal
 * Brand, search and lock action.
 *
 * @module components/header
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { t } from '../core/i18n.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import { escapeHtml } from '../utils/ui.js';
import { router } from '../router.js';
import { lock } from './lock.js';

const SEARCH_ROUTES = new Set(['journal', 'money']);

export class Header extends Component {
  mounted() {
    this._searchOpen = false;
    this.watchStore('appLock', () => this.render());
    this.watchStore('sync', () => {
      const chip = this._syncChip();
      if (chip !== this._lastSyncChip) {
        this._lastSyncChip = chip;
        this.render();
      }
    });
    this.watchStore('isAuthenticated', () => {
      this._lastSyncChip = null;
      this.render();
    });
    this.watchStore('ui.query', () => this._syncSearchValue());
  }

  _syncChip() {
    const authed = store.get('isAuthenticated');
    const sync = store.get('sync') || {};
    let label = '';
    let cls = 'ok';
    if (!authed) {
      label = t('header.localOnly');
      cls = 'off';
    } else if (!sync.online) {
      label = sync.pending > 0 ? t('header.offlineCount', { n: sync.pending }) : t('header.offline');
      cls = 'off';
    } else if (sync.status === 'syncing') {
      label = t('header.syncing');
      cls = 'busy';
    } else if (sync.status === 'error') {
      label = t('header.syncError');
      cls = 'err';
    } else if (sync.pending > 0) {
      label = t('header.pending', { n: sync.pending });
      cls = 'pending';
    } else {
      label = t('header.synced');
      cls = 'ok';
    }
    const retryable =
      authed && sync.online && (sync.status === 'error' || (sync.pending || 0) > 0);
    const title = retryable ? t('header.tapToSync') : t('header.syncStatus');
    return `<span class="sync-chip ${cls}${retryable ? ' retryable' : ''}" title="${title}">${label}</span>`;
  }

  template() {
    const appLock = store.get('appLock');
    const query = store.get('ui.query') || '';
    return `
      <a class="brand" href="#home" aria-label="ZapJournal">
        <span class="brand-mark"><img src="assets/icons/logo-mark.svg" alt="" /></span>
        <span class="brand-name">Zap<em>Journal</em></span>
      </a>
      <div class="search-wrap ${this._searchOpen ? 'open' : ''}" id="searchWrap" role="search">
        <span class="ic">${Icons.search}</span>
        <input id="searchInput" type="search" placeholder="${t('header.searchPlaceholder')}"
               autocomplete="off" spellcheck="false" aria-label="${t('header.searchAria')}"
               value="${escapeHtml(query)}" />
        <button type="button" class="search-clear" id="searchClear" aria-label="${t(
          'header.clearSearch'
        )}" ${query ? '' : 'hidden'}>
          <span class="ic">${Icons.x}</span>
        </button>
      </div>
      <div class="top-actions">
        ${this._syncChip()}
        <button class="icon-btn search-toggle" id="searchToggle" aria-label="${t(
          'header.search'
        )}" aria-expanded="${this._searchOpen ? 'true' : 'false'}">
          <span class="ic">${Icons.search}</span>
        </button>
        ${
          appLock
            ? `<button class="icon-btn" data-action="lock" aria-label="${t('header.lockJournal')}">
                 <span class="ic">${Icons.lock}</span>
               </button>`
            : ''
        }
      </div>
    `;
  }

  _syncSearchValue() {
    const input = this.$('#searchInput');
    if (!input) return;
    const query = store.get('ui.query') || '';
    if (input.value.trim().toLowerCase() !== query) input.value = query;
    this._toggleClear(!!query);
  }

  _toggleClear(show) {
    const clear = this.$('#searchClear');
    if (clear) clear.hidden = !show;
  }

  /** Open the search field and focus it (used by the global `/` shortcut). */
  openSearch() {
    this._setSearchOpen(true);
  }

  _setSearchOpen(open) {
    this._searchOpen = open;
    const wrap = this.$('#searchWrap');
    const input = this.$('#searchInput');
    const toggle = this.$('#searchToggle');
    if (wrap) wrap.classList.toggle('open', open);
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      setTimeout(() => input && input.focus(), 60);
    } else if (input) {
      input.value = '';
      store.set('ui.query', '');
      this._toggleClear(false);
    }
  }

  bindEvents() {
    const searchInput = this.$('#searchInput');
    const searchToggle = this.$('#searchToggle');
    const searchClear = this.$('#searchClear');

    const setQuery = (value) => store.set('ui.query', value);

    this.addEventListener(searchInput, 'input', (e) => {
      const raw = e.target.value;
      const query = raw.trim().toLowerCase();
      setQuery(query);
      this._toggleClear(!!raw);
      if (query && !SEARCH_ROUTES.has(store.get('ui.currentRoute'))) {
        router.navigate('journal');
      }
    });

    this.addEventListener(searchInput, 'keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (searchInput.value) {
        searchInput.value = '';
        setQuery('');
        this._toggleClear(false);
      } else if (this._searchOpen) {
        this._setSearchOpen(false);
      }
    });

    this.addEventListener(searchClear, 'click', () => {
      searchInput.value = '';
      setQuery('');
      this._toggleClear(false);
      searchInput.focus();
    });

    this.addEventListener(searchToggle, 'click', () => {
      this._setSearchOpen(!this._searchOpen);
    });

    this.addEventListener(this.$('[data-action="lock"]'), 'click', () => {
      lock.show('unlock');
    });

    this.addEventListener(this.$('.sync-chip'), 'click', async () => {
      const sync = store.get('sync') || {};
      if (!sync.online || (sync.status !== 'error' && !(sync.pending > 0))) return;
      const { syncService } = await import('../services/sync-service.js');
      await syncService.retryNow();
    });

    this._toggleClear(!!(store.get('ui.query') || ''));
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default Header;
