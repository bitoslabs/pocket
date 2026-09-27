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
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default Header;
