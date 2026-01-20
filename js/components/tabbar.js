/**
 * Tab Bar Component - iOS Style
 * Bottom navigation tab bar for mobile
 * 
 * @module components/tabbar
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { router } from '../router.js';

export class TabBar extends Component {
  constructor(options) {
    super(options);
  }

  mounted() {
    this.watchStore('ui.currentRoute', () => this.render());
  }

  template() {
    const currentRoute = store.get('ui.currentRoute') || 'dashboard';

    const tabs = [
      { id: 'dashboard', label: 'Home', icon: this._icons.home },
      { id: 'transactions', label: 'Activity', icon: this._icons.activity },
      { id: 'journal', label: 'Journal', icon: this._icons.journal },
      { id: 'settings', label: 'Settings', icon: this._icons.settings },
    ];

    return `
      <nav class="tabbar">
        ${tabs.map(tab => this._renderTab(tab, currentRoute)).join('')}
      </nav>
    `;
  }

  _renderTab(tab, currentRoute) {
    const isActive = currentRoute === tab.id || currentRoute.startsWith(tab.id + '/');

    return `
      <a href="#${tab.id}" class="tabbar-item ${isActive ? 'active' : ''}" data-tab="${tab.id}">
        <span class="tabbar-icon">${tab.icon}</span>
        <span class="tabbar-label">${tab.label}</span>
      </a>
    `;
  }

  get _icons() {
    return {
      home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>`,
      activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
      </svg>`,
      journal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
      </svg>`,
      settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>`
    };
  }

  bindEvents() {
    // Haptic-like feedback on tap
    this.addEventListener('.tabbar-item', 'click', (e) => {
      const item = e.target.closest('.tabbar-item');
      if (item) {
        item.classList.add('pressed');
        setTimeout(() => item.classList.remove('pressed'), 150);
      }
    });
  }
}

// iOS Tab Bar Styles
const tabbarStyles = `
  .tabbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: calc(49px + var(--safe-area-bottom));
    padding-bottom: var(--safe-area-bottom);
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur) var(--glass-saturate);
    -webkit-backdrop-filter: var(--glass-blur) var(--glass-saturate);
    border-top: 0.5px solid var(--color-border);
    display: flex;
    justify-content: space-around;
    align-items: flex-start;
    z-index: var(--z-sticky);
  }

  [data-theme="light"] .tabbar {
    background: rgba(255, 255, 255, 0.85);
    border-top-color: rgba(0, 0, 0, 0.1);
  }

  /* Hide on desktop */
  @media (min-width: 1024px) {
    .tabbar {
      display: none;
    }
  }

  .tabbar-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 49px;
    padding: 4px 0;
    text-decoration: none;
    color: var(--color-text-tertiary);
    transition: all var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
  }

  .tabbar-item.pressed {
    transform: scale(0.9);
  }

  .tabbar-item.active {
    color: var(--color-primary);
  }

  .tabbar-icon {
    width: 28px;
    height: 28px;
    margin-bottom: 2px;
    position: relative;
  }

  .tabbar-icon svg {
    width: 100%;
    height: 100%;
    transition: all var(--transition-fast);
  }

  .tabbar-item.active .tabbar-icon svg {
    stroke-width: 2.2;
  }

  /* Active state with background pill */
  .tabbar-item.active .tabbar-icon::before {
    content: '';
    position: absolute;
    inset: -4px -8px;
    background: var(--color-primary-alpha-20);
    border-radius: 12px;
    z-index: -1;
    animation: tabPillIn 0.2s ease-out;
  }

  @keyframes tabPillIn {
    from {
      transform: scale(0.8);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .tabbar-label {
    font-size: 10px;
    font-weight: var(--font-weight-medium);
    letter-spacing: 0.01em;
    margin-top: 2px;
  }

  .tabbar-item.active .tabbar-label {
    font-weight: var(--font-weight-semibold);
  }
`;

// Inject styles
if (!document.querySelector('#tabbar-styles')) {
  const style = document.createElement('style');
  style.id = 'tabbar-styles';
  style.textContent = tabbarStyles;
  document.head.appendChild(style);
}

export default TabBar;
