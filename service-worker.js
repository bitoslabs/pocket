/**
 * Service Worker
 * Offline support and caching for PWA
 */

// The deployment script replaces this token with a hash of the published files.
const CACHE_NAME = 'zap-journal-__DEPLOY_HASH__';
const RELEASE_ID = '__DEPLOY_HASH__';
const STATIC_ASSETS = [
    './',
    'index.html',
    'manifest.json',
    'assets/icons/logo.svg',
    'assets/icons/logo-icon.svg',
    'assets/icons/logo-motion.svg',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'css/variables.css',
    'css/base.css',
    'css/layout.css',
    'css/components.css',
    'js/app.js',
    'js/config.js',
    'js/vendor/van.js',
    'js/router.js',
    'js/core/event-bus.js',
    'js/core/state.js',
    'js/core/component.js',
    'js/core/theme.js',
    'js/core/account.js',
    'js/core/i18n.js',
    'js/locales/en.js',
    'js/locales/th.js',
    'js/locales/lo.js',
    'js/services/storage-service.js',
    'js/services/auth-service.js',
    'js/services/nostr-service.js',
    'js/services/profile-service.js',
    'js/services/zap-service.js',
    'js/services/journal-service.js',
    'js/services/category-service.js',
    'js/services/budget-service.js',
    'js/services/recurring-service.js',
    'js/services/price-service.js',
    'js/services/outbox.js',
    'js/services/sync-service.js',
    'js/utils/icons.js',
    'js/utils/ui.js',
    'js/components/toast.js',
    'js/components/modal.js',
    'js/components/tx-row.js',
    'js/components/header.js',
    'js/components/sidebar.js',
    'js/components/tabbar.js',
    'js/components/rail.js',
    'js/components/lock.js',
    'js/components/quick-add.js',
    'js/components/tx-modal.js',
    'js/components/journal-composer.js',
    'js/components/budgets-modal.js',
    'js/components/login-modal.js',
    'js/pages/dashboard.js',
    'js/pages/transactions.js',
    'js/pages/journal.js',
    'js/pages/settings.js',
    'js/pages/about.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                // Request a release-specific URL from the CDN, then cache its
                // response under the normal URL used by the app. This prevents
                // an edge cache from supplying an older file after a deploy.
                return Promise.all(STATIC_ASSETS.map(async (asset) => {
                    const request = new Request(asset);
                    const url = new URL(asset, self.location.href);
                    url.searchParams.set('release', RELEASE_ID);
                    const response = await fetch(url, { cache: 'reload' });
                    if (!response.ok) throw new Error(`Could not precache ${asset}: ${response.status}`);
                    await cache.put(request, response);
                }));
            })
            .then(() => {
                console.log('[SW] Install complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Install failed:', error);
                throw error;
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('zap-journal-') && name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete');
                return self.clients.claim();
            })
    );
});

// Fetch event - check the network for pages, cache app assets for offline use.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip WebSocket requests (Nostr relay connections)
    if (url.protocol === 'wss:' || url.protocol === 'ws:') {
        return;
    }

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip external requests (except fonts)
    if (url.origin !== location.origin && !url.hostname.includes('fonts.')) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .catch(async () => (await caches.match('index.html')) || Response.error())
        );
        return;
    }

    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version
                    return cachedResponse;
                }

                // Fetch from network
                return fetch(request)
                    .then((networkResponse) => {
                        // Don't cache if not successful
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        // Clone and cache the response
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(request, responseToCache);
                            });

                        return networkResponse;
                    })
                    .catch(() => {
                        // Offline fallback for navigation requests
                        if (request.mode === 'navigate') {
                            return caches.match('index.html');
                        }
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
