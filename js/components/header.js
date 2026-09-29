/**
 * Topbar Component - ZapJournal
 * Brand, search and lock action.
 *
 * VanJS view: the search field stays uncontrolled (so typing is never
 * clobbered) while the store keeps it in sync; the sync chip, lock button and
 * responsive brand are plain reactive bindings.
 *
 * @module components/header
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { t } from '../core/i18n.js';
import { Icons } from '../utils/icons.js';
import { router } from '../router.js';
import { lock } from './lock.js';
import van from '../vendor/van.js';

const { a, button, div, em, img, input, span } = van.tags;

const SEARCH_ROUTES = new Set(['journal', 'money']);

export class Header extends Component {
  beforeMount() {
    this._searchOpen = van.state(false);
    this._query = this.storeState('ui.query');
    this._sync = this.storeState('sync');
    this._authed = this.storeState('isAuthenticated');
    this._appLock = this.storeState('appLock');

    this._mql = window.matchMedia('(min-width: 1000px)');
    this._desktop = van.state(this._mql.matches);
    this._onMql = (e) => {
      this._desktop.val = e.matches;
    };
    this._mql.addEventListener('change', this._onMql);
  }

  beforeUnmount() {
    this._mql?.removeEventListener('change', this._onMql);
  }

  mounted() {
    // Keep the uncontrolled input in sync with the store without clobbering
    // what the user is typing.
    this.watchStore('ui.query', () => this._syncSearchValue());
    this._syncSearchValue();
  }

  _syncSearchValue() {
    const el = this.$('#searchInput');
    if (!el) return;
    const query = store.get('ui.query') || '';
    if (el.value.trim().toLowerCase() !== query) el.value = query;
  }

  _chip() {
    const authed = this._authed.val;
    const sync = this._sync.val || {};
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
    return { label, cls, retryable, title };
  }

  _chipNode() {
    const d = this._chip();
    return span(
      {
        class: `sync-chip ${d.cls}${d.retryable ? ' retryable' : ''}`,
        title: d.title,
        onclick: async () => {
          const sync = store.get('sync') || {};
          if (!sync.online || (sync.status !== 'error' && !(sync.pending > 0))) return;
          const { syncService } = await import('../services/sync-service.js');
          await syncService.retryNow();
        },
      },
      d.label
    );
  }

  /** Open the search field and focus it (used by the global `/` shortcut). */
  openSearch() {
    this._setSearchOpen(true);
  }

  _setSearchOpen(open) {
    this._searchOpen.val = open;
    if (this.container) this.container.classList.toggle('search-open', open);
    if (open) {
      setTimeout(() => this.$('#searchInput')?.focus(), 60);
    } else {
      const el = this.$('#searchInput');
      if (el) el.value = '';
      store.set('ui.query', '');
    }
  }

  _onInput(e) {
    const raw = e.target.value;
    const query = raw.trim().toLowerCase();
    store.set('ui.query', query);
    if (query && !SEARCH_ROUTES.has(store.get('ui.currentRoute'))) {
      router.navigate('journal');
    }
  }

  _onKeydown(e) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (e.target.value) {
      e.target.value = '';
      store.set('ui.query', '');
    } else if (this._searchOpen.val) {
      this._setSearchOpen(false);
    }
  }

  _onClear() {
    const el = this.$('#searchInput');
    if (el) {
      el.value = '';
      el.focus();
    }
    store.set('ui.query', '');
  }

  template() {
    const frag = document.createDocumentFragment();

    const brand = () =>
      this._desktop.val
        ? ''
        : a(
            { class: 'brand', href: '#home', 'aria-label': 'ZapJournal' },
            span({ class: 'brand-mark' }, img({ src: 'assets/icons/logo-mark.svg', alt: '' })),
            span({ class: 'brand-name' }, 'Zap', em('Journal'))
          );

    const searchWrap = div(
      {
        class: () => `search-wrap ${this._searchOpen.val ? 'open' : ''}`,
        id: 'searchWrap',
        role: 'search',
      },
      span({ class: 'ic', innerHTML: Icons.search }),
      input({
        id: 'searchInput',
        type: 'search',
        placeholder: t('header.searchPlaceholder'),
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': t('header.searchAria'),
        value: this._query.val || '',
        oninput: (e) => this._onInput(e),
        onkeydown: (e) => this._onKeydown(e),
      }),
      button(
        {
          type: 'button',
          class: 'search-clear',
          id: 'searchClear',
          'aria-label': t('header.clearSearch'),
          hidden: () => !this._query.val,
          onclick: () => this._onClear(),
        },
        span({ class: 'ic', innerHTML: Icons.x })
      )
    );

    const topActions = div(
      { class: 'top-actions' },
      () => this._chipNode(),
      button(
        {
          class: 'icon-btn search-toggle',
          id: 'searchToggle',
          'aria-label': () => (this._searchOpen.val ? t('common.close') : t('header.search')),
          'aria-expanded': () => String(this._searchOpen.val),
          onclick: () => this._setSearchOpen(!this._searchOpen.val),
        },
        span({
          class: 'ic',
          innerHTML: () => (this._searchOpen.val ? Icons.x : Icons.search),
        })
      ),
      () =>
        this._appLock.val
          ? button(
              {
                class: 'icon-btn',
                'data-action': 'lock',
                'aria-label': t('header.lockJournal'),
                onclick: () => lock.show('unlock'),
              },
              span({ class: 'ic', innerHTML: Icons.lock })
            )
          : ''
    );

    van.add(frag, brand, searchWrap, topActions);
    return frag;
  }
}

export default Header;
