/**
 * Sidebar Component - PocketZap (desktop navigation)
 *
 * VanJS view: nav highlight and the monthly balance are bound through
 * `storeState()`, so they update in place without re-rendering the sidebar.
 *
 * @module components/sidebar
 */

import { Component } from '../core/component.js';
import { t } from '../core/i18n.js';
import { Icons } from '../utils/icons.js';
import { fmtSats, monthTotals } from '../utils/ui.js';
import { openQuickAdd } from './quick-add.js';
import van from '../vendor/van.js';

const { a, b, br, button, div, em, img, nav, span } = van.tags;

const NAV = [
  { id: 'home', labelKey: 'nav.today', icon: 'home' },
  { id: 'journal', labelKey: 'nav.journal', icon: 'book' },
  { id: 'money', labelKey: 'nav.money', icon: 'wallet' },
  { id: 'profile', labelKey: 'nav.profile', icon: 'user' },
  { id: 'about', labelKey: 'nav.about', icon: 'info' },
];

export class Sidebar extends Component {
  beforeMount() {
    this._route = this.storeState('ui.currentRoute');
    this._transactions = this.storeState('transactions');
  }

  template() {
    const totals = () => {
      const now = new Date();
      return monthTotals(this._transactions.val || [], now.getFullYear(), now.getMonth());
    };

    const navLink = (item) =>
      a(
        {
          class: () =>
            `side-link nav-link ${(this._route.val || 'home') === item.id ? 'on' : ''}`,
          href: `#${item.id}`,
          'data-tab': item.id,
        },
        span({ class: 'ic', innerHTML: Icons[item.icon] }),
        t(item.labelKey)
      );

    return [
      a(
        { class: 'side-brand font-mono', href: '#home', 'aria-label': 'PocketZap' },
        span({ class: 'brand-mark' }, img({ src: 'assets/icons/logo-motion.svg', alt: '' })),
        span({ class: 'brand-name font-mono' }, 'Pocket', em('Zap'))
      ),
      nav({ class: 'side-nav' }, NAV.map(navLink)),
      button(
        { class: 'side-compose', 'data-action': 'open-quick', onclick: () => openQuickAdd() },
        span({ class: 'ic', innerHTML: Icons.plus }),
        t('nav.quickAdd')
      ),
      div(
        { class: 'side-balance', id: 'sideBalance' },
        div(
          { class: 'sb-stat' },
          b({ class: 'vin', innerHTML: () => `${Icons.downLeft}${fmtSats(totals().tin)}` }),
          span(t('dashboard.inMonth'))
        ),
        div(
          { class: 'sb-stat' },
          b({ class: 'vout', innerHTML: () => `${Icons.upRight}${fmtSats(totals().tout)}` }),
          span(t('dashboard.expensesMonth'))
        ),
        div(
          { class: 'sb-stat' },
          b({ class: 'vout', innerHTML: () => `${Icons.trending}${fmtSats(totals().invested)}` }),
          span(t('dashboard.invested'))
        )
      ),
      div(
        { class: 'side-foot' },
        t('nav.privateLocalFirst'),
        br(),
        b('n'),
        ` ${t('nav.quickAdd')} · `,
        b('/'),
        ` ${t('header.search')}`
      ),
    ];
  }
}

export default Sidebar;
