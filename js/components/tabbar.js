/**
 * Dock Component - PocketZap (mobile / tablet navigation)
 * Replaces the legacy tab bar. Includes the centre FAB.
 *
 * Reference VanJS component: `template()` returns DOM nodes and the active
 * route is bound through `this.storeState(...)` so no manual re-render or
 * innerHTML hydration is needed.
 *
 * @module components/tabbar
 */

import { Component } from '../core/component.js';
import { t } from '../core/i18n.js';
import { Icons } from '../utils/icons.js';
import { openQuickAdd } from './quick-add.js';
import van from '../vendor/van.js';

const { a, button, span } = van.tags;

const NAV = [
  { id: 'home', labelKey: 'nav.today', icon: 'home' },
  { id: 'journal', labelKey: 'nav.journal', icon: 'book' },
  { id: 'money', labelKey: 'nav.money', icon: 'wallet' },
  { id: 'profile', labelKey: 'nav.profile', icon: 'user' },
];

export class Dock extends Component {
  beforeMount() {
    this._route = this.storeState('ui.currentRoute');
  }

  template() {
    const navLink = (item) =>
      a(
        {
          class: () =>
            `dock-btn nav-link ${(this._route.val || 'home') === item.id ? 'on' : ''}`,
          href: `#${item.id}`,
          'data-tab': item.id,
        },
        span({ class: 'ic', innerHTML: Icons[item.icon] }),
        t(item.labelKey)
      );

    return [
      navLink(NAV[0]),
      navLink(NAV[1]),
      button(
        {
          class: 'fab',
          'data-action': 'open-quick',
          'aria-label': t('nav.quickAdd'),
          onclick: () => openQuickAdd(),
        },
        span({ class: 'ic', innerHTML: Icons.plus })
      ),
      navLink(NAV[2]),
      navLink(NAV[3]),
    ];
  }
}

export default Dock;
