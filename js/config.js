/**
 * Application Configuration
 * Centralized configuration for the Nostr Zap Journal app
 * 
 * @module config
 */

export const config = {
    // App metadata
    app: {
        name: 'Nostr Zap Journal',
        version: '1.0.0',
        description: 'Track your Lightning zaps and manage private journal entries'
    },

    // Nostr relay configuration
    relays: {
        default: [
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
        dbVersion: 1
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
        familyMode: false
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
