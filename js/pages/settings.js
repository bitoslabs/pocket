/**
 * Settings Page
 * App configuration and preferences
 * 
 * @module pages/settings
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { storageService } from '../services/storage-service.js';
import { nostrService } from '../services/nostr-service.js';
import { journalService } from '../services/journal-service.js';
import { Icons } from '../utils/icons.js';

export class SettingsPage extends Component {
  constructor(options) {
    super(options);
    this._state = {
      newRelay: ''
    };
  }

  mounted() {
    this.watchStore('relays', () => this.render());
    this.watchStore('theme', () => this.render());
  }

  template() {
    const theme = store.get('theme') || 'dark';
    const relays = store.get('relays') || { connected: [], pending: [], failed: [] };
    const connectedRelays = relays.connected || [];
    const savedRelays = storageService.getLocal(config.storage.keys.RELAYS) || config.relays.default;

    return `
      <div class="page-header mb-6">
        <h1 class="text-3xl font-bold">Settings</h1>
        <p class="text-secondary mt-2">Configure your preferences</p>
      </div>

      <!-- Appearance -->
      <div class="card mb-6">
        <div class="card-header">
          <h2 class="card-title">Appearance</h2>
        </div>
        <div class="card-body">
          <div class="setting-item flex justify-between items-center py-4">
            <div>
              <h3 class="font-medium">Theme</h3>
              <p class="text-sm text-secondary">Choose your preferred color scheme</p>
            </div>
            <div class="theme-toggle-group flex gap-2">
              <button class="btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'} btn-sm theme-btn" data-theme="dark">
                ${Icons.Moon} <span>Dark</span>
              </button>
              <button class="btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'} btn-sm theme-btn" data-theme="light">
                ${Icons.Sun} <span>Light</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Relays -->
      <div class="card mb-6">
        <div class="card-header">
          <h2 class="card-title">Nostr Relays</h2>
        </div>
        <div class="card-body">
          <div class="relay-list mb-4">
            ${savedRelays.map(relay => this._renderRelayItem(relay, connectedRelays)).join('')}
          </div>
          
          <div class="add-relay flex gap-2">
            <input type="text" class="relay-input flex-1" placeholder="wss://relay.example.com" value="${this.escape(this._state.newRelay)}">
            <button class="btn btn-primary add-relay-btn">Add Relay</button>
          </div>
        </div>
      </div>

      <!-- Data Management -->
      <div class="card mb-6">
        <div class="card-header">
          <h2 class="card-title">Data Management</h2>
        </div>
        <div class="card-body">
          <div class="setting-item flex justify-between items-center py-4 border-b border-color-border">
            <div>
              <h3 class="font-medium">Export Journal Backup</h3>
              <p class="text-sm text-secondary">Download an encrypted backup of your journal entries</p>
            </div>
            <button class="btn btn-secondary export-btn">Export</button>
          </div>
          
          <div class="setting-item flex justify-between items-center py-4 border-b border-color-border">
            <div>
              <h3 class="font-medium">Clear Local Cache</h3>
              <p class="text-sm text-secondary">Clear locally cached data (you won't lose data stored on relays)</p>
            </div>
            <button class="btn btn-secondary clear-cache-btn">Clear Cache</button>
          </div>
          
          <div class="setting-item flex justify-between items-center py-4">
            <div>
              <h3 class="font-medium text-error">Reset All Data</h3>
              <p class="text-sm text-secondary">Remove all local data and settings. This cannot be undone.</p>
            </div>
            <button class="btn btn-secondary reset-btn" style="border-color: var(--color-error); color: var(--color-error);">
              Reset
            </button>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">About</h2>
        </div>
        <div class="card-body">
          <div class="about-info">
            <p class="mb-2"><strong>Nostr Zap Journal</strong> v${config.app.version}</p>
            <p class="text-sm text-secondary mb-4">
              A private, encrypted journal and Lightning zap tracker built on Nostr.
            </p>
            <div class="flex gap-3">
              <a href="https://github.com" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">
                GitHub
              </a>
              <a href="https://nostr.com" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">
                Nostr
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderRelayItem(relay, connectedRelays) {
    const isConnected = connectedRelays.includes(relay);
    const isDefault = config.relays.default.includes(relay);

    return `
      <div class="relay-item flex items-center justify-between py-3 border-b border-color-border">
        <div class="flex items-center gap-3">
          <span class="status-dot ${isConnected ? 'connected' : ''}"></span>
          <span class="text-sm font-mono">${this.escape(relay)}</span>
          ${isDefault ? '<span class="badge badge-neutral">Default</span>' : ''}
        </div>
        <div class="flex gap-2">
          ${isConnected
        ? '<span class="text-xs text-success">Connected</span>'
        : `<button class="btn btn-ghost btn-sm reconnect-relay-btn" data-relay="${this.escape(relay)}">Reconnect</button>`
      }
          ${!isDefault ? `<button class="btn btn-ghost btn-sm remove-relay-btn" data-relay="${this.escape(relay)}">Remove</button>` : ''}
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Theme toggle (delegated)
    this.addEventListener('.theme-toggle-group', 'click', (e) => {
      const btn = e.target.closest('.theme-btn');
      if (btn) {
        const theme = btn.dataset.theme;
        store.set('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
        storageService.setLocal(config.storage.keys.THEME, theme);
        eventBus.emit(Events.THEME_CHANGED, { theme });
      }
    });

    // Add relay
    this.addEventListener('.add-relay-btn', 'click', () => {
      const input = this.$('.relay-input');
      const url = input.value.trim();

      if (!url.startsWith('wss://')) {
        eventBus.emit(Events.TOAST_SHOW, {
          type: 'warning',
          message: 'Relay URL must start with wss://'
        });
        return;
      }

      const savedRelays = storageService.getLocal(config.storage.keys.RELAYS) || [...config.relays.default];
      if (!savedRelays.includes(url)) {
        savedRelays.push(url);
        storageService.setLocal(config.storage.keys.RELAYS, savedRelays);
        nostrService.connect(url);
        this.setState({ newRelay: '' });
        this.render();
      }
    });

    // Reconnect relay
    this.addEventListener('.reconnect-relay-btn', 'click', (e) => {
      const relay = e.target.dataset.relay;
      nostrService.connect(relay);
      eventBus.emit(Events.TOAST_SHOW, {
        type: 'info',
        message: `Reconnecting to ${relay}...`
      });
    });

    // Remove relay
    this.addEventListener('.remove-relay-btn', 'click', (e) => {
      const relay = e.target.dataset.relay;
      const savedRelays = storageService.getLocal(config.storage.keys.RELAYS) || [];
      const filtered = savedRelays.filter(r => r !== relay);
      storageService.setLocal(config.storage.keys.RELAYS, filtered);
      nostrService.disconnect(relay);
      this.render();
    });

    // Export backup
    this.addEventListener('.export-btn', 'click', async () => {
      try {
        const backup = await journalService.exportBackup();
        const blob = new Blob([backup], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zap-journal-backup-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        eventBus.emit(Events.TOAST_SHOW, {
          type: 'success',
          message: 'Backup exported successfully'
        });
      } catch (error) {
        eventBus.emit(Events.TOAST_SHOW, {
          type: 'error',
          message: error.message
        });
      }
    });

    // Clear cache
    this.addEventListener('.clear-cache-btn', 'click', async () => {
      const { modal } = await import('../components/modal.js');
      const confirmed = await modal.confirm({
        title: 'Clear Cache',
        message: 'This will clear locally cached transactions and journal entries. Your data on relays will not be affected.',
        confirmText: 'Clear'
      });

      if (confirmed) {
        await storageService.clear('transactions');
        await storageService.clear('journal');
        store.set('transactions', []);
        store.set('journal', []);

        eventBus.emit(Events.TOAST_SHOW, {
          type: 'success',
          message: 'Cache cleared'
        });
      }
    });

    // Reset all
    this.addEventListener('.reset-btn', 'click', async () => {
      const { modal } = await import('../components/modal.js');
      const confirmed = await modal.confirm({
        title: 'Reset All Data',
        message: 'This will remove all local data including settings, cached transactions, and journal entries. This action cannot be undone.',
        confirmText: 'Reset Everything',
        danger: true
      });

      if (confirmed) {
        localStorage.clear();
        await storageService.clear('transactions');
        await storageService.clear('journal');
        await storageService.clear('events');

        window.location.reload();
      }
    });
  }
}

export default SettingsPage;
