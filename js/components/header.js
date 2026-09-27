/**
 * Topbar Component - ZapJournal
 * Brand, search and lock action.
 *
 * @module components/header
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import { lock } from './lock.js';

export class Header extends Component {
  mounted() {
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
  }

  _syncChip() {
    const authed = store.get('isAuthenticated');
    const sync = store.get('sync') || {};
    let label = '';
    let cls = 'ok';
    if (!authed) {
      label = 'Local only';
      cls = 'off';
    } else if (!sync.online) {
      label = sync.pending > 0 ? `Offline · ${sync.pending}` : 'Offline';
      cls = 'off';
    } else if (sync.status === 'syncing') {
      label = 'Syncing…';
      cls = 'busy';
    } else if (sync.status === 'error') {
      label = 'Sync error';
      cls = 'err';
    } else if (sync.pending > 0) {
      label = `${sync.pending} pending`;
      cls = 'pending';
    } else {
      label = 'Synced';
      cls = 'ok';
    }
    const retryable =
      authed && sync.online && (sync.status === 'error' || (sync.pending || 0) > 0);
    const title = retryable ? 'Tap to sync now' : 'Local-first sync status';
    return `<span class="sync-chip ${cls}${retryable ? ' retryable' : ''}" title="${title}">${label}</span>`;
  }

  template() {
    const appLock = store.get('appLock');
    return `
      <div class="brand">
        <span class="brand-mark ic">${Icons.bolt}</span>
        <span class="brand-name">Zap<em>Journal</em></span>
      </div>
      <div class="search-wrap" id="searchWrap">
        <span class="ic">${Icons.search}</span>
        <input id="searchInput" placeholder="Search entries, notes, categories…" autocomplete="off" />
      </div>
      <div class="top-actions">
        ${this._syncChip()}
        <button class="icon-btn search-toggle" id="searchToggle" aria-label="Search" aria-expanded="false">
          <span class="ic">${Icons.search}</span>
        </button>
        ${
          appLock
            ? `<button class="icon-btn" data-action="lock" aria-label="Lock journal">
                 <span class="ic">${Icons.lock}</span>
               </button>`
            : ''
        }
      </div>
    `;
  }

  bindEvents() {
    const searchWrap = this.$('#searchWrap');
    const searchInput = this.$('#searchInput');
    const searchToggle = this.$('#searchToggle');

    const setQuery = (value) => store.set('ui.query', value);

    this.addEventListener(searchInput, 'input', (e) => {
      setQuery(e.target.value.trim().toLowerCase());
    });

    this.addEventListener(searchToggle, 'click', () => {
      const open = !searchWrap.classList.contains('open');
      searchWrap.classList.toggle('open', open);
      searchToggle.setAttribute('aria-expanded', String(open));
      if (open) {
        setTimeout(() => searchInput.focus(), 60);
      } else {
        searchInput.value = '';
        setQuery('');
      }
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
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default Header;
