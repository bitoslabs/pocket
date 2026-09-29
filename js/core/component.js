/**
 * Base Component Class
 * Foundation for building UI components with lifecycle hooks
 * 
 * @module core/component
 */

import { store } from './state.js';
import { eventBus, Events } from './event-bus.js';
import { escapeHtml } from '../utils/html.js';
import van from '../vendor/van.js';

export class Component {
    /**
     * Create a new component
     * @param {Object} options - Component options
     * @param {HTMLElement|string} options.container - Container element or selector
     * @param {Object} [options.props] - Initial props
     * @param {Object} [options.state] - Initial local state
     */
    constructor({ container, props = {}, state = {} } = {}) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        this.props = props;
        this._state = state;
        this._subscriptions = [];
        this._eventListeners = [];
        this._isMounted = false;
    }

    // ==================== Lifecycle Hooks ====================

    /**
     * Called before component mounts
     * Override in subclass for initialization logic
     */
    beforeMount() { }

    /**
     * Called after component is rendered and mounted
     * Override in subclass for DOM interactions
     */
    mounted() { }

    /**
     * Called before each render
     * Override in subclass for pre-render logic
     */
    beforeRender() { }

    /**
     * Called after each render
     * Override in subclass for post-render logic
     */
    afterRender() { }

    /**
     * Called before component unmounts
     * Override in subclass for cleanup logic
     */
    beforeUnmount() { }

    /**
     * Called after component unmounts
     * Override in subclass for final cleanup
     */
    unmounted() { }

    // ==================== Core Methods ====================

    /**
     * Mount the component to the DOM
     */
    mount() {
        if (this._isMounted) return;

        // Re-render automatically whenever the UI language changes.
        this.watchEvent(Events.LANGUAGE_CHANGED, () => this.render());

        this.beforeMount();
        this.render();
        this._isMounted = true;
        this.mounted();
    }

    /**
     * Unmount the component and cleanup
     */
    unmount() {
        if (!this._isMounted) return;

        this.beforeUnmount();

        // Cleanup subscriptions
        this._subscriptions.forEach(unsubscribe => unsubscribe());
        this._subscriptions = [];

        // Cleanup event listeners
        this._eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this._eventListeners = [];

        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }

        this._isMounted = false;
        this.unmounted();
    }

    /**
     * Render the component template
     */
    render() {
        if (!this.container) {
            console.error('[Component] No container specified');
            return;
        }

        this.beforeRender();

        const output = this.template();

        // VanJS views return DOM nodes (or an array of them); string templates
        // keep the legacy innerHTML path so existing components are unaffected.
        if (output instanceof Node) {
            this.container.replaceChildren(output);
        } else if (Array.isArray(output)) {
            this.container.replaceChildren(...output);
        } else {
            this.container.innerHTML = output;
        }

        // Bind events after render
        this.bindEvents();

        this.afterRender();
    }

    /**
     * Override this method to provide component output
     * @returns {string|Node|Array<Node>} HTML string (legacy) or VanJS node(s)
     */
    template() {
        return '';
    }

    /**
     * Override this method to bind DOM events after render
     */
    bindEvents() { }

    // ==================== State Management ====================

    /**
     * Get local component state
     * @param {string} [key] - Optional state key
     * @returns {*} State value
     */
    getState(key = null) {
        if (key === null) return this._state;
        return this._state[key];
    }

    /**
     * Set local component state and trigger re-render
     * @param {Object} newState - Partial state to merge
     * @param {boolean} [shouldRender=true] - Whether to re-render
     */
    setState(newState, shouldRender = true) {
        this._state = { ...this._state, ...newState };
        if (shouldRender && this._isMounted) {
            this.render();
        }
    }

    // ==================== Subscription Helpers ====================

    /**
     * Subscribe to global store changes
     * @param {string} path - Store path to watch
     * @param {Function} callback - Handler function
     */
    watchStore(path, callback) {
        const unsubscribe = store.subscribe(path, callback.bind(this));
        this._subscriptions.push(unsubscribe);
    }

    /**
     * Subscribe to event bus events
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    watchEvent(event, callback) {
        const unsubscribe = eventBus.on(event, callback.bind(this));
        this._subscriptions.push(unsubscribe);
    }

    /**
     * Mirror a global store path as a VanJS state, kept in sync with the store
     * and unsubscribed automatically on unmount. The VanJS counterpart of
     * watchStore(): views read `state.val` instead of forcing a full re-render.
     * @param {string} path - Store path to mirror (e.g. 'ui.currentRoute')
     * @returns {Object} VanJS state whose `.val` tracks the store
     */
    storeState(path) {
        const state = van.state(store.get(path));
        const unsubscribe = store.subscribe(path, (value) => {
            if (value !== state.val) state.val = value;
        });
        this._subscriptions.push(unsubscribe);
        return state;
    }

    // ==================== DOM Helpers ====================

    /**
     * Query element within component container
     * @param {string} selector - CSS selector
     * @returns {HTMLElement|null}
     */
    $(selector) {
        return this.container?.querySelector(selector);
    }

    /**
     * Query all elements within component container
     * @param {string} selector - CSS selector
     * @returns {NodeList}
     */
    $$(selector) {
        return this.container?.querySelectorAll(selector) || [];
    }

    /**
     * Add event listener with automatic cleanup
     * @param {HTMLElement|string} element - Element or selector
     * @param {string} event - Event type
     * @param {Function} handler - Event handler
     * @param {Object} [options] - Event listener options
     */
    addEventListener(element, event, handler, options = {}) {
        const el = typeof element === 'string' ? this.$(element) : element;
        if (!el) return;

        const boundHandler = handler.bind(this);
        el.addEventListener(event, boundHandler, options);

        this._eventListeners.push({
            element: el,
            event,
            handler: boundHandler
        });
    }

    /**
     * Emit custom event from component
     * @param {string} eventName - Custom event name
     * @param {*} detail - Event detail data
     */
    emit(eventName, detail = null) {
        const event = new CustomEvent(eventName, {
            bubbles: true,
            detail
        });
        this.container?.dispatchEvent(event);
    }

    // ==================== Utility Methods ====================

    /**
     * Safe HTML escaping
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escape(str) {
        return escapeHtml(str);
    }

    /**
     * Format class names conditionally
     * @param {Object} classes - Object with className: boolean pairs
     * @returns {string} Space-separated class names
     */
    classNames(classes) {
        return Object.entries(classes)
            .filter(([, condition]) => condition)
            .map(([className]) => className)
            .join(' ');
    }
}

export default Component;
