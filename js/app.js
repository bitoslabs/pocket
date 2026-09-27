/**
 * Main Application
 * Entry point and orchestration for ZapJournal
 *
 * @module app
 */

import { config } from './config.js';
import { eventBus, Events } from './core/event-bus.js';
import { store } from './core/state.js';
import { initTheme } from './core/theme.js';
import { initI18n, t } from './core/i18n.js';
import { GUEST, filterOwned } from './core/account.js';
import { router } from './router.js';

// Services
import { storageService } from './services/storage-service.js';
import { authService } from './services/auth-service.js';
import { nostrService } from './services/nostr-service.js';
import { zapService } from './services/zap-service.js';
import { journalService } from './services/journal-service.js';
import { categoryService } from './services/category-service.js';
import { budgetService } from './services/budget-service.js';
import { recurringService } from './services/recurring-service.js';
import { priceService } from './services/price-service.js';
import { syncService } from './services/sync-service.js';

// Components
import { Header } from './components/header.js';
import { Sidebar } from './components/sidebar.js';
import { Dock } from './components/tabbar.js';
import { Rail } from './components/rail.js';
import { lock } from './components/lock.js';
import { hydrateIcons } from './utils/icons.js';
import { openQuickAdd } from './components/quick-add.js';
import './components/toast.js';
import './components/modal.js';

// Pages
import { HomePage } from './pages/dashboard.js';
import { JournalPage } from './pages/journal.js';
import { MoneyPage } from './pages/transactions.js';
import { ProfilePage } from './pages/settings.js';
import { AboutPage } from './pages/about.js';

class App {
    constructor() {
        this._header = null;
        this._sidebar = null;
        this._dock = null;
        this._rail = null;
        this._initialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this._initialized) return;

        console.log(`[App] Initializing ${config.app.name} v${config.app.version}`);

        try {
            // Storage first
            await storageService.init();

            // Language (defaults to Lao) + static [data-i18n] nodes
            initI18n();

            // Restore saved theme + accent (dark/Light, colour picker)
            initTheme();

            // Load cached BTC/fiat rates (cache-first; fetch happens in background)
            await priceService.init();

            await authService.init();

            // Connect relays in the background — never block first paint on the network
            nostrService.init().catch((e) => console.warn('[App] Relay init failed:', e));

            this._setupEventListeners();
            this._mountLayout();
            this._setupRouter();
            this._setupShortcuts();

            await categoryService.init();
            await budgetService.init();
            await recurringService.init();

            if (authService.isAuthenticated()) {
                const pubkey = authService.getPublicKey();
                await zapService.init(pubkey);
                await journalService.init(pubkey);
            } else {
                // Guest mode: load only guest-owned local data so the app still
                // works offline / without login, without leaking account data.
                const [cachedTx, cachedJournal] = await Promise.all([
                    storageService.getAll('transactions'),
                    storageService.getAll('journal'),
                ]);
                const guestTx = filterOwned(cachedTx, GUEST);
                const guestJournal = filterOwned(cachedJournal, GUEST);
                if (guestTx.length > 0) store.set('transactions', guestTx);
                if (guestJournal.length > 0) store.set('journal', guestJournal);
            }

            // Offline-first sync: flush queued changes, pull remote, claim guest data on login
            await syncService.init();
            await syncService.start();

            // App lock is opt-in (default off): only gate when a PIN is set
            const appLockEnabled = lock.hasPin();
            store.set('appLock', appLockEnabled);
            if (appLockEnabled) {
                lock.show('unlock');
            }

            this._initialized = true;
            console.log('[App] Initialization complete');
        } catch (error) {
            console.error('[App] Initialization error:', error);
            eventBus.emit(Events.ERROR, { message: t('errors.initFailed') });
        }
    }

    _setupEventListeners() {
        eventBus.on(Events.AUTH_LOGIN, async (user) => {
            await zapService.init(user.pubkey);
            await journalService.init(user.pubkey);
            // Re-scope local config data (categories/budgets/recurring) to the account
            await categoryService.init();
            await budgetService.init();
            await recurringService.init();
        });

        eventBus.on(Events.AUTH_LOGOUT, async () => {
            zapService.unsubscribe();
            journalService.unsubscribe();
            store.set('transactions', []);
            store.set('journal', []);
            // Fall back to the guest workspace
            await categoryService.init();
            await budgetService.init();
            await recurringService.init();
        });

        eventBus.on(Events.ERROR, ({ message }) => {
            eventBus.emit(Events.TOAST_SHOW, { type: 'error', message });
        });
    }

    _mountLayout() {
        this._header = new Header({ container: document.querySelector('#topbar') });
        this._header.mount();

        this._sidebar = new Sidebar({ container: document.querySelector('#sidebar') });
        this._sidebar.mount();

        this._dock = new Dock({ container: document.querySelector('#dock') });
        this._dock.mount();

        this._rail = new Rail({ container: document.querySelector('#rail') });
        this._rail.mount();
    }

    _setupRouter() {
        router.registerAll({
            home: { component: HomePage, titleKey: 'nav.today' },
            journal: { component: JournalPage, titleKey: 'nav.journal' },
            money: { component: MoneyPage, titleKey: 'nav.money' },
            profile: { component: ProfilePage, titleKey: 'nav.profile' },
            about: { component: AboutPage, titleKey: 'nav.about' },
        });

        router.setNotFound(() => {
            router.navigate('home');
        });

        router.init('#app-content');
    }

    _setupShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (lock._el && !lock._el.hidden) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const el = document.activeElement;
            if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
            if (document.querySelector('.modal-overlay.open')) return;

            if (e.key === 'n' || e.key === 'N') {
                e.preventDefault();
                openQuickAdd();
            } else if (e.key === '/') {
                e.preventDefault();
                this._header?.openSearch();
            }
        });

        // Hydrate any static [data-icon] nodes (loading + lock screens)
        hydrateIcons(document);
    }
}

// Singleton instance
const app = new App();

export default app;
