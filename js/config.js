/**
 * Application Configuration
 * Centralized configuration for the Nostr Zap Journal app
 * 
 * @module config
 */

export const config = {
    // App metadata
    app: {
        name: 'ZapJournal',
        version: '1.0.0',
        description: 'Private journal and Lightning sats tracker on Nostr'
    },

    // Nostr relay configuration
    relays: {
        default: [
            'wss://nostr-01.yakihonne.com',
            'wss://relay.damus.io',
            'wss://nos.lol',
        ],
        timeout: 5000,
        maxRetries: 3,
        retryDelay: 1000
    },

    // Nostr event kinds
    kinds: {
        METADATA: 0,
        TEXT_NOTE: 1,
        ENCRYPTED_DM: 4,
        DELETE: 5,
        ZAP_REQUEST: 9734,
        ZAP_RECEIPT: 9735
    },

    // Storage keys
    storage: {
        keys: {
            USER: 'nostr_user',
            RELAYS: 'nostr_relays',
            THEME: 'app_theme',
            TRANSACTIONS: 'zap_transactions',
            JOURNAL: 'journal_entries',
            CATEGORIES: 'categories'
        },
        dbName: 'NostrZapJournalDB',
        dbVersion: 2
    },

    // UI settings
    ui: {
        defaultTheme: 'dark',
        pageSize: 20,
        toastDuration: 3000,
        animationDuration: 300
    },

    // Feature flags
    features: {
        offlineMode: true,
        encryption: true,
        familyMode: false,
        manualTransactions: true,
        recurringTransactions: true,
        budgetManagement: true,
        customCategories: true
    },

    // Transaction settings
    transactions: {
        defaultView: 'all', // all, income, expense
        pageSize: 20,
        enableRecurring: true,
        enableCategories: true,
        enableBudgets: true
    },

    // Budget settings
    budgets: {
        defaultPeriod: 'monthly', // daily, weekly, monthly, yearly
        defaultAlertThreshold: 0.7, // 70%
        enableRollover: false,
        maxBudgets: 50
    },

    // Category settings
    categories: {
        enableCustom: true,
        maxCustomCategories: 100,
        defaultIcons: ['🍔', '🚗', '🛍️', '🎮', '📄', '🏥', '📚', '💼', '📈', '💻'],
        defaultColors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#52C41A']
    },

    // Recurring transaction settings
    recurring: {
        enableAutoGeneration: true,
        checkInterval: 3600000, // 1 hour in milliseconds
        maxOccurrences: 1000,
        lookaheadDays: 30
    }
};

// Freeze config to prevent modifications
Object.freeze(config);
Object.freeze(config.app);
Object.freeze(config.relays);
Object.freeze(config.kinds);
Object.freeze(config.storage);
Object.freeze(config.ui);
Object.freeze(config.features);

export default config;
