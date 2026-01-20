/**
 * Header Component
 * App header with user info and actions - iOS style
 * 
 * @module components/header
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { eventBus, Events } from '../core/event-bus.js';
import { authService } from '../services/auth-service.js';
import { storageService } from '../services/storage-service.js';
import { config } from '../config.js';
import { shortenHex } from '../utils/format.js';
import { Icons } from '../utils/icons.js';
import { loginModal } from './login-modal.js';

export class Header extends Component {
  constructor(options) {
    super(options);
  }

  mounted() {
    this.watchStore('user', () => this.render());
    this.watchStore('isAuthenticated', () => this.render());
    this.watchStore('relays.connected', () => this.render());
    this.watchStore('theme', () => this.render());
  }

  template() {
    const user = store.get('user');
    const isAuthenticated = store.get('isAuthenticated');
    const connectedRelays = store.get('relays.connected') || [];
    const currentTheme = store.get('theme') || 'dark';
    const isDark = currentTheme === 'dark';

    return `
      <div class="header-left">
        <button class="header-btn menu-toggle" aria-label="Toggle menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        
        <h1 class="header-title">
          <span class="header-logo">⚡</span>
          <span class="header-title-text">Zap Journal</span>
        </h1>
      </div>

      <div class="header-center">
        <div class="relay-indicator ${connectedRelays.length > 0 ? 'connected' : ''}">
          <span class="relay-dot"></span>
          <span class="relay-text">${connectedRelays.length} relay${connectedRelays.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div class="header-right">
        <!-- Theme Toggle - iOS style switch -->
        <button class="theme-toggle-btn" aria-label="Toggle theme" data-theme="${currentTheme}">
          <div class="theme-toggle-track">
            <span class="theme-icon sun">${Icons.Sun}</span>
            <span class="theme-icon moon">${Icons.Moon}</span>
            <div class="theme-toggle-thumb"></div>
          </div>
        </button>

        ${isAuthenticated ? this._renderUserMenu(user) : this._renderLoginButton()}
      </div>
    `;
  }

  _renderLoginButton() {
    return `
      <button class="ios-btn ios-btn-primary login-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        <span>Connect</span>
      </button>
    `;
  }

  _renderUserMenu(user) {
    const displayKey = user?.npub || shortenHex(user?.pubkey || '', 6);
    const displayKeyFormatted = displayKey.slice(0, 6) + '...' + displayKey.slice(-6);
    return `
      <div class="user-menu">
        <div class="user-avatar">
          ${(displayKey.charAt(0) || '?').toUpperCase()}
        </div>
        <span class="user-key">${this.escape(displayKeyFormatted)}</span>
        <button class="ios-btn ios-btn-secondary logout-btn">
          Logout
        </button>
      </div>
    `;
  }

  bindEvents() {
    // Menu toggle
    this.addEventListener('.menu-toggle', 'click', () => {
      const sidebar = document.querySelector('.app-sidebar');
      const overlay = document.querySelector('.sidebar-overlay');
      if (sidebar) {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('visible');
        document.body.classList.toggle('sidebar-open');
      }
    });

    // Login button -> Open Modal
    this.addEventListener('.login-btn', 'click', () => {
      loginModal.show();
    });

    // Logout button
    this.addEventListener('.logout-btn', 'click', () => {
      authService.logout();
      eventBus.emit(Events.TOAST_SHOW, {
        type: 'info',
        message: 'Logged out'
      });
    });

    // Theme toggle - FIXED
    this.addEventListener('.theme-toggle-btn', 'click', () => {
      const currentTheme = store.get('theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

      // Update store
      store.set('theme', newTheme);

      // Update DOM
      document.documentElement.setAttribute('data-theme', newTheme);

      // Save to localStorage
      storageService.setLocal(config.storage.keys.THEME, newTheme);

      // Emit event
      eventBus.emit(Events.THEME_CHANGED, { theme: newTheme });

      console.log('[Header] Theme changed to:', newTheme);
    });
  }


}


// iOS-style header styles
const headerStyles = `
  /* Header Layout */
  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-4);
    gap: var(--space-3);
  }

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .header-center {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  /* Header Button */
  .header-btn {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    background: var(--color-surface);
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
  }

  .header-btn:active {
    transform: scale(0.95);
    background: var(--color-surface-heavy);
  }

  /* Header Title */
  .header-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .header-logo {
    font-size: 1.5rem;
  }

  .header-title-text {
    display: none;
  }

  @media (min-width: 768px) {
    .header-title-text {
      display: inline;
    }
  }

  /* Relay Indicator */
  .relay-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .relay-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-error);
    transition: all var(--transition-fast);
  }

  .relay-indicator.connected .relay-dot {
    background: var(--color-success);
    box-shadow: 0 0 6px var(--color-success);
  }

  .relay-text {
    display: none;
  }

  @media (min-width: 480px) {
    .relay-text {
      display: inline;
    }
  }

  /* iOS Theme Toggle */
  .theme-toggle-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .theme-toggle-track {
    position: relative;
    width: 56px;
    height: 32px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px;
    transition: background var(--transition-fast);
  }

  [data-theme="light"] .theme-toggle-track {
    background: #e5e5e5;
  }

  .theme-icon {
    font-size: 14px;
    z-index: 1;
    transition: opacity var(--transition-fast);
  }

  .theme-icon.sun {
    opacity: 0.4;
  }

  .theme-icon.moon {
    opacity: 1;
  }

  [data-theme="light"] .theme-icon.sun {
    opacity: 1;
  }

  [data-theme="light"] .theme-icon.moon {
    opacity: 0.4;
  }

  .theme-toggle-thumb {
    position: absolute;
    left: 4px;
    width: 24px;
    height: 24px;
    background: var(--color-text-primary);
    border-radius: 50%;
    transition: transform var(--transition-bounce);
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  [data-theme="light"] .theme-toggle-thumb {
    transform: translateX(24px);
    background: #fff;
  }

  /* iOS Buttons */
  .ios-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: 36px;
    padding: 0 var(--space-4);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border-radius: var(--radius-lg);
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
  }

  .ios-btn:active {
    transform: scale(0.97);
  }

  .ios-btn-primary {
    background: var(--color-primary);
    color: #fff;
  }

  .ios-btn-primary:hover {
    background: var(--color-primary-light);
  }

  .ios-btn-secondary {
    background: var(--color-surface-light);
    color: var(--color-text-primary);
  }

  .ios-btn-secondary:hover {
    background: var(--color-surface-heavy);
  }

  /* User Menu */
  .user-menu {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: #fff;
  }

  .user-key {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: none;
  }

  @media (min-width: 640px) {
    .user-key {
      display: inline;
    }
  }

  /* Sidebar overlay for mobile */
  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    z-index: calc(var(--z-sticky) - 1);
    opacity: 0;
    visibility: hidden;
    transition: all var(--transition-normal);
  }

  .sidebar-overlay.visible {
    opacity: 1;
    visibility: visible;
  }

  /* Hide menu button on desktop */
  @media (min-width: 1024px) {
    .menu-toggle {
      display: none;
    }
  }
`;

// Inject header styles
const existingStyle = document.querySelector('#header-styles');
if (existingStyle) existingStyle.remove();

const style = document.createElement('style');
style.id = 'header-styles';
style.textContent = headerStyles;
document.head.appendChild(style);

export default Header;
