/**
 * State Management - Reactive State Store
 * Single source of truth with subscription-based reactivity
 * 
 * @module core/state
 */

import { eventBus, Events } from './event-bus.js';

class Store {
    constructor(initialState = {}) {
        this._state = this._deepFreeze({ ...initialState });
        this._subscribers = new Map();
        this._history = [];
        this._maxHistory = 50;
    }

    /**
     * Get current state or a specific path
     * @param {string} [path] - Optional dot-notation path (e.g., 'user.profile.name')
     * @returns {*} State value
     */
    get(path = null) {
        if (!path) return this._state;
        return this._getByPath(this._state, path);
    }

    /**
     * Update state at a specific path
     * @param {string} path - Dot-notation path
     * @param {*} value - New value
     */
    set(path, value) {
        const oldState = this._state;
        const newState = this._setByPath({ ...this._state }, path, value);

        // Store history
        this._history.push({ path, oldValue: this.get(path), newValue: value, timestamp: Date.now() });
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        }

        this._state = this._deepFreeze(newState);
        this._notifySubscribers(path, value, oldState);
    }

    /**
     * Merge an object into a state path
     * @param {string} path - Dot-notation path
     * @param {Object} obj - Object to merge
     */
    merge(path, obj) {
        const current = this.get(path) || {};
        this.set(path, { ...current, ...obj });
    }

    /**
     * Subscribe to state changes at a path
     * @param {string} path - Dot-notation path to watch
     * @param {Function} callback - Called with (newValue, oldValue)
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
        if (!this._subscribers.has(path)) {
            this._subscribers.set(path, new Set());
        }
        this._subscribers.get(path).add(callback);

        // Return unsubscribe function
        return () => {
            if (this._subscribers.has(path)) {
                this._subscribers.get(path).delete(callback);
            }
        };
    }

    /**
     * Reset state to initial values
     * @param {Object} newState - New initial state
     */
    reset(newState = {}) {
        this._state = this._deepFreeze(newState);
        this._history = [];
        this._notifySubscribers('', newState, {});
    }

    /**
     * Get state change history
     * @returns {Array} History entries
     */
    getHistory() {
        return [...this._history];
    }

    // Private: Get value by dot-notation path
    _getByPath(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    // Private: Set value by dot-notation path (immutable)
    _setByPath(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();

        let current = obj;
        for (const key of keys) {
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            } else {
                current[key] = { ...current[key] };
            }
            current = current[key];
        }

        current[lastKey] = value;
        return obj;
    }

    // Private: Deep freeze object
    _deepFreeze(obj) {
        if (obj === null || typeof obj !== 'object') return obj;

        Object.getOwnPropertyNames(obj).forEach(name => {
            const prop = obj[name];
            if (typeof prop === 'object' && prop !== null) {
                this._deepFreeze(prop);
            }
        });

        return Object.freeze(obj);
    }

    // Private: Notify relevant subscribers
    _notifySubscribers(changedPath, newValue, oldState) {
        this._subscribers.forEach((callbacks, subscribedPath) => {
            // Notify if the changed path affects the subscribed path
            if (changedPath.startsWith(subscribedPath) || subscribedPath.startsWith(changedPath) || subscribedPath === '') {
                const currentValue = this.get(subscribedPath);
                const oldValue = this._getByPath(oldState, subscribedPath);

                if (currentValue !== oldValue) {
                    callbacks.forEach(callback => {
                        try {
                            callback(currentValue, oldValue);
                        } catch (error) {
                            console.error(`[Store] Subscriber error for "${subscribedPath}":`, error);
                        }
                    });
                }
            }
        });
    }
}

// Default initial state
const initialState = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    theme: 'dark',
    accent: '#8B5CF6',
    appLock: false,

    // Data
    transactions: [],
    journal: [],
    categories: [],
    accounts: [],
    assets: [],

    // UI state
    ui: {
        currentRoute: 'dashboard',
        sidebarOpen: false,
        modalOpen: false,
        modalContent: null
    },

    // Relay state
    relays: {
        connected: [],
        pending: [],
        failed: []
    }
};

// Singleton store instance
export const store = new Store(initialState);

export default store;
