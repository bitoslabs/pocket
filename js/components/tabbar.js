/**
 * Dock Component - ZapJournal (mobile / tablet navigation)
 * Replaces the legacy tab bar. Includes the centre FAB.
 *
 * @module components/tabbar
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { t } from '../core/i18n.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import { openQuickAdd } from './quick-add.js';

const NAV = [
  { id: 'home', labelKey: 'nav.today', icon: 'home' },
  { id: 'journal', labelKey: 'nav.journal', icon: 'book' },
  { id: 'money', labelKey: 'nav.money', icon: 'wallet' },
  { id: 'profile', labelKey: 'nav.profile', icon: 'user' },
];

export class Dock extends Component {
  mounted() {
    this.watchStore('ui.currentRoute', () => this.render());
  }

  template() {
    const current = store.get('ui.currentRoute') || 'home';
    const btn = (item) => `
      <a class="dock-btn nav-link ${current === item.id ? 'on' : ''}"
         href="#${item.id}" data-tab="${item.id}">
        <span class="ic">${Icons[item.icon]}</span>${t(item.labelKey)}
      </a>`;

    return `
      ${btn(NAV[0])}
      ${btn(NAV[1])}
      <button class="fab" data-action="open-quick" aria-label="${t('nav.quickAdd')}">
        <span class="ic">${Icons.plus}</span>
      </button>
      ${btn(NAV[2])}
      ${btn(NAV[3])}
    `;
  }

  bindEvents() {
    this.addEventListener('[data-action="open-quick"]', 'click', () => openQuickAdd());
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default Dock;
