/**
 * Sidebar Component - ZapJournal (desktop navigation)
 *
 * @module components/sidebar
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { t } from '../core/i18n.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import { monthTotals, fmtSats } from '../utils/ui.js';
import { openQuickAdd } from './quick-add.js';

const NAV = [
  { id: 'home', labelKey: 'nav.today', icon: 'home' },
  { id: 'journal', labelKey: 'nav.journal', icon: 'book' },
  { id: 'money', labelKey: 'nav.money', icon: 'wallet' },
  { id: 'profile', labelKey: 'nav.profile', icon: 'user' },
  { id: 'about', labelKey: 'nav.about', icon: 'info' },
];

export class Sidebar extends Component {
  mounted() {
    this.watchStore('ui.currentRoute', () => this.render());
    this.watchStore('transactions', () => this.render());
  }

  template() {
    const current = store.get('ui.currentRoute') || 'home';
    const now = new Date();
    const { tin, tout } = monthTotals(
      store.get('transactions') || [],
      now.getFullYear(),
      now.getMonth()
    );

    return `
      <a class="side-brand" href="#home" aria-label="ZapJournal">
        <span class="brand-mark"><img src="assets/icons/logo-mark.svg" alt="" /></span>
        <span class="brand-name">Zap<em>Journal</em></span>
      </a>
      <nav class="side-nav">
        ${NAV.map(
          (item) => `
          <a class="side-link nav-link ${current === item.id ? 'on' : ''}"
             href="#${item.id}" data-tab="${item.id}">
            <span class="ic">${Icons[item.icon]}</span>${t(item.labelKey)}
          </a>`
        ).join('')}
      </nav>
      <button class="side-compose" data-action="open-quick">
        <span class="ic">${Icons.plus}</span>${t('nav.quickAdd')}
      </button>
      <div class="side-balance" id="sideBalance">
        <div class="sb-stat"><b class="vin">${Icons.downLeft}${fmtSats(tin)}</b><span>${t(
          'dashboard.inMonth'
        )}</span></div>
        <div class="sb-stat"><b class="vout">${Icons.upRight}${fmtSats(tout)}</b><span>${t(
          'dashboard.outMonth'
        )}</span></div>
      </div>
      <div class="side-foot">${t('nav.privateLocalFirst')}<br><b>n</b> ${t(
        'nav.quickAdd'
      )} · <b>/</b> ${t('header.search')}</div>
    `;
  }

  bindEvents() {
    this.addEventListener('[data-action="open-quick"]', 'click', () => openQuickAdd());
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default Sidebar;
