/**
 * Sidebar Component - iOS Style
 * Navigation sidebar with menu items
 * 
 * @module components/sidebar
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { eventBus, Events } from '../core/event-bus.js';

export class Sidebar extends Component {
  constructor(options) {
    super(options);
  }

  mounted() {
    this.watchStore('ui.currentRoute', () => this.render());
    this.watchStore('isAuthenticated', () => this.render());

    // Handle overlay click to close sidebar
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => this._closeSidebar());
    }
  }

  template() {
    const currentRoute = store.get('ui.currentRoute') || 'dashboard';
    const isAuthenticated = store.get('isAuthenticated');

    const menuItems = [
      { id: 'dashboard', label: 'Dashboard', icon: '📊', color: '#007AFF' },
      { id: 'transactions', label: 'Transactions', icon: '💸', color: '#34C759' },
      { id: 'journal', label: 'Journal', icon: '📓', color: '#FF9500', auth: true },
      { id: 'categories', label: 'Categories', icon: '📁', color: '#AF52DE' },
      { id: 'reports', label: 'Reports', icon: '📈', color: '#FF2D55' },
    ];

    const bottomItems = [
      { id: 'settings', label: 'Settings', icon: '⚙️', color: '#8E8E93' }
    ];

    const filteredItems = menuItems.filter(item => !item.auth || isAuthenticated);

    return `
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <span class="sidebar-logo-icon">⚡</span>
          <div class="sidebar-logo-text">
            <span class="sidebar-logo-title">Zap Journal</span>
            <span class="sidebar-logo-subtitle">Nostr Money Tracker</span>
          </div>
        </div>
      </div>

      <nav class="sidebar-nav">
        <div class="nav-section">
          ${filteredItems.map(item => this._renderNavItem(item, currentRoute)).join('')}
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="nav-section">
          ${bottomItems.map(item => this._renderNavItem(item, currentRoute)).join('')}
        </div>
        <div class="sidebar-version">v1.0.0</div>
      </div>
    `;
  }

  _renderNavItem(item, currentRoute) {
    const isActive = currentRoute === item.id || currentRoute.startsWith(item.id + '/');

    return `
      <a href="#${item.id}" 
         class="nav-item ${isActive ? 'active' : ''}"
         data-route="${item.id}">
        <span class="nav-icon" style="background: ${item.color}20; color: ${item.color}">
          ${item.icon}
        </span>
        <span class="nav-label">${item.label}</span>
        ${isActive ? '<span class="nav-indicator"></span>' : ''}
      </a>
    `;
  }

  _closeSidebar() {
    const sidebar = document.querySelector('.app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
    document.body.classList.remove('sidebar-open');
  }

  bindEvents() {
    // Handle nav clicks - close sidebar on mobile
    this.addEventListener('.nav-item', 'click', () => {
      if (window.innerWidth < 1024) {
        this._closeSidebar();
      }
    });
  }
}

// iOS-style sidebar styles
const sidebarStyles = `
  .sidebar-header {
    padding: var(--space-5);
    padding-top: calc(var(--space-5) + var(--safe-area-top));
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-logo {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .sidebar-logo-icon {
    font-size: 2rem;
  }

  .sidebar-logo-text {
    display: flex;
    flex-direction: column;
  }

  .sidebar-logo-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .sidebar-logo-subtitle {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .sidebar-nav {
    flex: 1;
    padding: var(--space-3) 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .nav-section {
    padding: 0 var(--space-3);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-1);
    border-radius: var(--radius-xl);
    color: var(--color-text-primary);
    text-decoration: none;
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-base);
    transition: all var(--transition-fast);
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }

  .nav-item:active {
    transform: scale(0.98);
    background: var(--color-surface);
  }

  .nav-item.active {
    background: var(--color-primary-alpha-10);
  }

  .nav-icon {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    flex-shrink: 0;
  }

  .nav-label {
    flex: 1;
  }

  .nav-indicator {
    width: 6px;
    height: 6px;
    background: var(--color-primary);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sidebar-footer {
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-3);
  }

  .sidebar-version {
    text-align: center;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    padding: var(--space-4);
    padding-bottom: calc(var(--space-4) + var(--safe-area-bottom));
  }
`;

// Inject sidebar styles
const existingStyle = document.querySelector('#sidebar-styles');
if (existingStyle) existingStyle.remove();

const style = document.createElement('style');
style.id = 'sidebar-styles';
style.textContent = sidebarStyles;
document.head.appendChild(style);

export default Sidebar;
