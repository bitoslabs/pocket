/**
 * Event Bus - Pub/Sub Event System
 * Enables decoupled communication between modules
 * 
 * @module core/event-bus
 */

class EventBus {
    constructor() {
        this._events = new Map();
        this._onceEvents = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        if (!this._events.has(event)) {
            this._events.set(event, new Set());
        }
        this._events.get(event).add(handler);

        // Return unsubscribe function
        return () => this.off(event, handler);
    }

    /**
     * Subscribe to an event, triggered only once
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     */
    once(event, handler) {
        if (!this._onceEvents.has(event)) {
            this._onceEvents.set(event, new Set());
        }
        this._onceEvents.get(event).add(handler);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     */
    off(event, handler) {
        if (this._events.has(event)) {
            this._events.get(event).delete(handler);
        }
        if (this._onceEvents.has(event)) {
            this._onceEvents.get(event).delete(handler);
        }
    }

    /**
     * Emit an event with optional data
     * @param {string} event - Event name
     * @param {*} data - Event data payload
     */
    emit(event, data = null) {
        // Regular subscribers
        if (this._events.has(event)) {
            this._events.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[EventBus] Error in handler for "${event}":`, error);
                }
            });
        }

        // Once subscribers
        if (this._onceEvents.has(event)) {
            this._onceEvents.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[EventBus] Error in once handler for "${event}":`, error);
                }
            });
            this._onceEvents.delete(event);
        }
    }

    /**
     * Remove all event listeners
     */
    clear() {
        this._events.clear();
        this._onceEvents.clear();
    }

    /**
     * Get subscriber count for an event
     * @param {string} event - Event name
     * @returns {number} Number of subscribers
     */
    listenerCount(event) {
        const regular = this._events.has(event) ? this._events.get(event).size : 0;
        const once = this._onceEvents.has(event) ? this._onceEvents.get(event).size : 0;
        return regular + once;
    }
}

// Singleton instance
export const eventBus = new EventBus();

// Event constants
export const Events = {
    // Auth events
    AUTH_LOGIN: 'auth:login',
    AUTH_LOGOUT: 'auth:logout',
    AUTH_ERROR: 'auth:error',

    // Relay events
    RELAY_CONNECTED: 'relay:connected',
    RELAY_DISCONNECTED: 'relay:disconnected',
    RELAY_ERROR: 'relay:error',

    // Data events
    ZAPS_LOADED: 'zaps:loaded',
    ZAPS_UPDATED: 'zaps:updated',
    JOURNAL_UPDATED: 'journal:updated',
    CATEGORIES_UPDATED: 'categories:updated',

    // UI events
    TOAST_SHOW: 'toast:show',
    MODAL_OPEN: 'modal:open',
    MODAL_CLOSE: 'modal:close',
    THEME_CHANGED: 'theme:changed',
    ROUTE_CHANGED: 'route:changed',

    // Error events
    ERROR: 'error',
    NETWORK_ERROR: 'network:error'
};

Object.freeze(Events);

export default eventBus;
