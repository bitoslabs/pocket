/**
 * Sidebar Component - ZapJournal (desktop navigation)
 *
 * @module components/sidebar
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import { monthTotals, fmtSats } from '../utils/ui.js';
import { openQuickAdd } from './quick-add.js';

const NAV = [
  { id: 'home', label: 'Today', icon: 'home' },
  { id: 'journal', label: 'Journal', icon: 'book' },
  { id: 'money', label: 'Money', icon: 'wallet' },
  { id: 'profile', label: 'Profile', icon: 'user' },
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
      <div class="side-brand">
        <span class="brand-mark ic">${Icons.bolt}</span>
        <span class="brand-name">Zap<em>Journal</em></span>
      </div>
      <nav class="side-nav">
        ${NAV.map(
          (item) => `
          <a class="side-link nav-link ${current === item.id ? 'on' : ''}"
             href="#${item.id}" data-tab="${item.id}">
            <span class="ic">${Icons[item.icon]}</span>${item.label}
          </a>`
        ).join('')}
      </nav>
      <button class="side-compose" data-action="open-quick">
        <span class="ic">${Icons.plus}</span>Quick add
      </button>
      <div class="side-balance" id="sideBalance">
        <div class="sb-stat"><b class="vin">${Icons.downLeft}${fmtSats(tin)}</b><span>in · month</span></div>
        <div class="sb-stat"><b class="vout">${Icons.upRight}${fmtSats(tout)}</b><span>out · month</span></div>
      </div>
      <div class="side-foot">private · local-first<br><b>n</b> quick add · <b>/</b> search</div>
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
