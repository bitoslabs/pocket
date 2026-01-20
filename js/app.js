/**
 * Main Application
 * Entry point and orchestration for Nostr Zap Journal
 * 
 * @module app
 */

import { config } from './config.js';
import { eventBus, Events } from './core/event-bus.js';
import { store } from './core/state.js';
import { router } from './router.js';

// Services
import { storageService } from './services/storage-service.js';
import { authService } from './services/auth-service.js';
import { nostrService } from './services/nostr-service.js';
import { zapService } from './services/zap-service.js';
import { journalService } from './services/journal-service.js';

// Components
import { Header } from './components/header.js';
import { Sidebar } from './components/sidebar.js';
import { TabBar } from './components/tabbar.js';
import './components/toast.js';
import './components/modal.js';

// Pages
import { DashboardPage } from './pages/dashboard.js';
import { TransactionsPage } from './pages/transactions.js';
import { JournalPage } from './pages/journal.js';
import { SettingsPage } from './pages/settings.js';

class App {
    constructor() {
        this._header = null;
        this._sidebar = null;
        this._tabbar = null;
        this._initialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this._initialized) return;

        console.log(`[App] Initializing ${config.app.name} v${config.app.version}`);

        try {
            // Initialize storage first
            await storageService.init();

            // Load saved theme
            const savedTheme = storageService.getLocal(config.storage.keys.THEME) || config.ui.defaultTheme;
            store.set('theme', savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);

            // Initialize authentication
            await authService.init();

            // Initialize Nostr connections
            await nostrService.init();

            // Setup event listeners
            this._setupEventListeners();

            // Mount layout components
            this._mountLayout();

            // Setup router
            this._setupRouter();

            // If authenticated, initialize data services
            if (authService.isAuthenticated()) {
                const pubkey = authService.getPublicKey();
                await zapService.init(pubkey);
                await journalService.init(pubkey);
            }

            this._initialized = true;
            console.log('[App] Initialization complete');

        } catch (error) {
            console.error('[App] Initialization error:', error);
            eventBus.emit(Events.ERROR, { message: 'Failed to initialize application' });
        }
    }

    /**
     * Setup global event listeners
     * @private
     */
    _setupEventListeners() {
        // Handle login
        eventBus.on(Events.AUTH_LOGIN, async (user) => {
            console.log('[App] User logged in:', user.npub);
            await zapService.init(user.pubkey);
            await journalService.init(user.pubkey);
        });

        // Handle logout
        eventBus.on(Events.AUTH_LOGOUT, () => {
            console.log('[App] User logged out');
            zapService.unsubscribe();
            journalService.unsubscribe();
            store.set('transactions', []);
            store.set('journal', []);
        });

        // Handle errors
        eventBus.on(Events.ERROR, ({ message }) => {
            eventBus.emit(Events.TOAST_SHOW, {
                type: 'error',
                message
            });
        });
    }

    /**
     * Mount layout components (header, sidebar, tabbar)
     * @private
     */
    _mountLayout() {
        // Mount header
        this._header = new Header({
            container: document.querySelector('.app-header')
        });
        this._header.mount();

        // Mount sidebar (desktop)
        this._sidebar = new Sidebar({
            container: document.querySelector('.app-sidebar')
        });
        this._sidebar.mount();

        // Mount tab bar (mobile)
        this._tabbar = new TabBar({
            container: document.querySelector('.app-tabbar')
        });
        this._tabbar.mount();
    }

    /**
     * Setup router with pages
     * @private
     */
    _setupRouter() {
        // Register routes
        router.registerAll({
            'dashboard': {
                component: DashboardPage,
                title: 'Dashboard'
            },
            'transactions': {
                component: TransactionsPage,
                title: 'Transactions'
            },
            'journal': {
                component: JournalPage,
                title: 'Journal',
                auth: true
            },
            'categories': {
                component: CategoriesPage,
                title: 'Categories'
            },
            'reports': {
                component: ReportsPage,
                title: 'Reports'
            },
            'settings': {
                component: SettingsPage,
                title: 'Settings'
            }
        });

        // Set 404 handler
        router.setNotFound((container) => {
            container.innerHTML = `
        <div class="not-found text-center py-16">
          <div class="text-6xl mb-6">🔍</div>
          <h1 class="text-3xl font-bold mb-4">Page Not Found</h1>
          <p class="text-secondary mb-8">The page you're looking for doesn't exist.</p>
          <a href="#dashboard" class="btn btn-primary">Go to Dashboard</a>
        </div>
      `;
        });

        // Initialize router
        router.init('.app-content');
    }
}

// Simple placeholder pages for categories and reports
class CategoriesPage {
    constructor({ container }) {
        this.container = container;
    }

    mount() {
        this.container.innerHTML = `
      <div class="page-header mb-6">
        <h1 class="text-3xl font-bold">Categories</h1>
        <p class="text-secondary mt-2">Organize your transactions</p>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="categories-grid grid grid-cols-2 gap-4">
            ${this._renderCategories()}
          </div>
        </div>
      </div>
    `;
    }

    _renderCategories() {
        const categories = [
            { name: 'Food & Dining', icon: '🍔', color: '#f97316' },
            { name: 'Entertainment', icon: '🎮', color: '#8b5cf6' },
            { name: 'Services', icon: '🛠️', color: '#3b82f6' },
            { name: 'Tips', icon: '💡', color: '#22c55e' },
            { name: 'Donations', icon: '❤️', color: '#ef4444' },
            { name: 'Salary/Income', icon: '💰', color: '#f7931a' },
            { name: 'Shopping', icon: '🛍️', color: '#ec4899' },
            { name: 'Other', icon: '📦', color: '#737373' }
        ];

        return categories.map(cat => `
      <div class="category-card card p-4" style="border-left: 3px solid ${cat.color}">
        <div class="flex items-center gap-3">
          <span class="text-2xl">${cat.icon}</span>
          <span class="font-medium">${cat.name}</span>
        </div>
      </div>
    `).join('');
    }
}

class ReportsPage {
    constructor({ container }) {
        this.container = container;
    }

    mount() {
        this.container.innerHTML = `
      <div class="page-header mb-6">
        <h1 class="text-3xl font-bold">Reports</h1>
        <p class="text-secondary mt-2">Financial summaries and insights</p>
      </div>
      <div class="grid grid-auto-md gap-4">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Monthly Summary</h3>
          </div>
          <div class="card-body">
            <p class="text-secondary">Coming soon...</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Category Breakdown</h3>
          </div>
          <div class="card-body">
            <p class="text-secondary">Coming soon...</p>
          </div>
        </div>
      </div>
    `;
    }
}

// Initialize app when DOM is ready
const app = new App();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

export default app;
