/**
 * Router - SPA Client-Side Routing
 * Hash-based routing with middleware support
 * 
 * @module router
 */

import { eventBus, Events } from './core/event-bus.js';
import { store } from './core/state.js';

class Router {
    constructor() {
        this._routes = new Map();
        this._middlewares = [];
        this._currentRoute = null;
        this._container = null;
        this._notFound = null;
        this._currentComponent = null;
    }

    /**
     * Initialize router with container element
     * @param {HTMLElement|string} container - Main content container
     */
    init(container) {
        this._container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        // Listen for hash changes
        window.addEventListener('hashchange', () => this._handleRouteChange());

        // Handle initial route
        this._handleRouteChange();
    }

    /**
     * Register a route
     * @param {string} path - Route path (e.g., 'dashboard', 'transactions/:id')
     * @param {Object} options - Route options
     * @param {Function} options.component - Component class or factory
     * @param {string} [options.title] - Page title
     * @param {boolean} [options.auth] - Requires authentication
     */
    register(path, { component, title = '', auth = false }) {
        this._routes.set(path, { component, title, auth, path });
    }

    /**
     * Register multiple routes at once
     * @param {Object} routes - Route definitions
     */
    registerAll(routes) {
        Object.entries(routes).forEach(([path, options]) => {
            this.register(path, options);
        });
    }

    /**
     * Add middleware to run before route changes
     * @param {Function} middleware - Middleware function (to, from, next)
     */
    use(middleware) {
        this._middlewares.push(middleware);
    }

    /**
     * Set 404 not found handler
     * @param {Function} handler - Component or function to render
     */
    setNotFound(handler) {
        this._notFound = handler;
    }

    /**
     * Navigate to a route
     * @param {string} path - Route path
     * @param {Object} [params] - Route parameters
     */
    navigate(path, params = {}) {
        const queryString = Object.entries(params)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');

        const hash = queryString ? `${path}?${queryString}` : path;
        window.location.hash = hash;
    }

    /**
     * Go back in history
     */
    back() {
        window.history.back();
    }

    /**
     * Get current route info
     * @returns {Object} Current route with path and params
     */
    getCurrentRoute() {
        return this._currentRoute;
    }

    /**
     * Parse hash to get route path and params
     * @private
     */
    _parseHash() {
        const hash = window.location.hash.slice(1) || 'home';
        const [pathWithParams, queryString] = hash.split('?');

        // Parse query params
        const queryParams = {};
        if (queryString) {
            queryString.split('&').forEach(param => {
                const [key, value] = param.split('=');
                queryParams[decodeURIComponent(key)] = decodeURIComponent(value || '');
            });
        }

        // Parse path params (e.g., transactions/:id)
        const pathParts = pathWithParams.split('/');

        return {
            fullPath: pathWithParams,
            pathParts,
            queryParams
        };
    }

    /**
     * Match a route definition against current path
     * @private
     */
    _matchRoute(pathParts) {
        for (const [pattern, route] of this._routes) {
            const patternParts = pattern.split('/');

            if (patternParts.length !== pathParts.length) continue;

            const params = {};
            let match = true;

            for (let i = 0; i < patternParts.length; i++) {
                if (patternParts[i].startsWith(':')) {
                    // Dynamic segment
                    params[patternParts[i].slice(1)] = pathParts[i];
                } else if (patternParts[i] !== pathParts[i]) {
                    match = false;
                    break;
                }
            }

            if (match) {
                return { ...route, params };
            }
        }

        return null;
    }

    /**
     * Handle route changes
     * @private
     */
    async _handleRouteChange() {
        const { fullPath, pathParts, queryParams } = this._parseHash();
        const matchedRoute = this._matchRoute(pathParts);

        const to = {
            path: fullPath,
            params: matchedRoute?.params || {},
            query: queryParams,
            route: matchedRoute
        };

        const from = this._currentRoute;

        // Run middlewares
        for (const middleware of this._middlewares) {
            const result = await middleware(to, from);
            if (result === false) return; // Middleware blocked navigation
            if (typeof result === 'string') {
                // Redirect
                this.navigate(result);
                return;
            }
        }

        // Check authentication if required
        if (matchedRoute?.auth && !store.get('isAuthenticated')) {
            eventBus.emit(Events.AUTH_ERROR, { message: 'Authentication required' });
            this.navigate('login');
            return;
        }

        // Update current route
        this._currentRoute = to;
        store.set('ui.currentRoute', fullPath);

        // Update page title
        if (matchedRoute?.title) {
            document.title = `${matchedRoute.title} | ZapJournal`;
        }

        // Render route component
        if (matchedRoute) {
            this._renderRoute(matchedRoute, to);
        } else if (this._notFound) {
            this._renderNotFound(to);
        } else {
            console.error(`[Router] Route not found: ${fullPath}`);
        }

        // Emit route change event
        eventBus.emit(Events.ROUTE_CHANGED, { to, from });
    }

    /**
     * Render route component
     * @private
     */
    _renderRoute(route, context) {
        if (!this._container) {
            console.error('[Router] No container specified');
            return;
        }

        const { component } = route;

        // Unmount the previous page instance (clears its store subscriptions)
        if (this._currentComponent && typeof this._currentComponent.unmount === 'function') {
            try {
                this._currentComponent.unmount();
            } catch (e) {
                console.warn('[Router] Error unmounting previous component:', e);
            }
        }
        this._currentComponent = null;

        // Clear previous content
        this._container.innerHTML = '';

        // Instantiate and mount component
        if (typeof component === 'function') {
            // Check if it's a class (has prototype) or factory function
            if (component.prototype && component.prototype.mount) {
                const instance = new component({
                    container: this._container,
                    props: context
                });
                this._currentComponent = instance;
                instance.mount();
            } else {
                // Factory function
                component(this._container, context);
            }
        }
    }

    /**
     * Render 404 page
     * @private
     */
    _renderNotFound(context) {
        if (typeof this._notFound === 'function') {
            this._notFound(this._container, context);
        }
    }
}

// Singleton instance
export const router = new Router();

/**
 * Convenience navigation helper: routeTo('money')
 * @param {string} path
 * @param {Object} [params]
 */
export function routeTo(path, params = {}) {
    router.navigate(path, params);
}

// Helper: Create link element with routing
export function createRouterLink(path, text, className = '') {
    const link = document.createElement('a');
    link.href = `#${path}`;
    link.textContent = text;
    if (className) link.className = className;
    return link;
}

export default router;
