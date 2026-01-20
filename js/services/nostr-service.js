/**
 * Nostr Service
 * WebSocket relay connections and event management
 * 
 * @module services/nostr-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { storageService } from './storage-service.js';

class NostrService {
    constructor() {
        this._connections = new Map(); // relay url -> websocket
        this._subscriptions = new Map(); // subscription id -> handlers
        this._messageQueue = new Map(); // relay url -> pending messages
        this._reconnectAttempts = new Map();
    }

    /**
     * Initialize and connect to default relays
     */
    async init() {
        const savedRelays = storageService.getLocal(config.storage.keys.RELAYS);
        const relays = savedRelays || config.relays.default;

        await Promise.allSettled(relays.map(url => this.connect(url)));

        return this.getConnectedRelays();
    }

    /**
     * Connect to a relay
     * @param {string} url - Relay WebSocket URL
     * @returns {Promise<WebSocket>}
     */
    connect(url) {
        return new Promise((resolve, reject) => {
            if (this._connections.has(url)) {
                const existing = this._connections.get(url);
                if (existing.readyState === WebSocket.OPEN) {
                    resolve(existing);
                    return;
                }
            }

            store.merge('relays', { pending: [...(store.get('relays.pending') || []), url] });
            console.log(`[Nostr] Connecting to ${url}...`);

            try {
                const ws = new WebSocket(url);
                this._messageQueue.set(url, []);

                ws.onopen = () => {
                    console.log(`[Nostr] Connected to ${url}`);
                    this._connections.set(url, ws);
                    this._reconnectAttempts.set(url, 0);

                    // Update store
                    const pending = (store.get('relays.pending') || []).filter(r => r !== url);
                    const connected = [...new Set([...(store.get('relays.connected') || []), url])];
                    store.merge('relays', { pending, connected });

                    // Flush queued messages
                    const queue = this._messageQueue.get(url) || [];
                    queue.forEach(msg => ws.send(msg));
                    this._messageQueue.set(url, []);

                    eventBus.emit(Events.RELAY_CONNECTED, { url });
                    resolve(ws);
                };

                ws.onmessage = (event) => {
                    this._handleMessage(url, event.data);
                };

                ws.onerror = (error) => {
                    console.error(`[Nostr] Error on ${url}:`, error);
                    eventBus.emit(Events.RELAY_ERROR, { url, error });
                };

                ws.onclose = () => {
                    console.log(`[Nostr] Disconnected from ${url}`);
                    this._connections.delete(url);

                    // Update store
                    const connected = (store.get('relays.connected') || []).filter(r => r !== url);
                    store.merge('relays', { connected });

                    eventBus.emit(Events.RELAY_DISCONNECTED, { url });

                    // Attempt reconnection
                    this._scheduleReconnect(url);
                };

                // Timeout
                setTimeout(() => {
                    if (ws.readyState !== WebSocket.OPEN) {
                        ws.close();
                        reject(new Error(`Connection timeout: ${url}`));
                    }
                }, config.relays.timeout);

            } catch (error) {
                console.error(`[Nostr] Failed to connect to ${url}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Disconnect from a relay
     * @param {string} url - Relay URL
     */
    disconnect(url) {
        const ws = this._connections.get(url);
        if (ws) {
            ws.close();
            this._connections.delete(url);
        }
    }

    /**
     * Get list of connected relay URLs
     * @returns {string[]}
     */
    getConnectedRelays() {
        return Array.from(this._connections.keys()).filter(url => {
            const ws = this._connections.get(url);
            return ws && ws.readyState === WebSocket.OPEN;
        });
    }

    /**
     * Subscribe to events
     * @param {Object} filter - Nostr filter object
     * @param {Function} onEvent - Callback for each event
     * @param {Function} [onEose] - Callback when end of stored events
     * @returns {string} Subscription ID
     */
    subscribe(filter, onEvent, onEose = null) {
        const subId = this._generateSubId();

        this._subscriptions.set(subId, {
            filter,
            onEvent,
            onEose,
            events: new Set()
        });

        const message = JSON.stringify(['REQ', subId, filter]);
        this._broadcast(message);

        console.log(`[Nostr] Subscribed: ${subId}`, filter);
        return subId;
    }

    /**
     * Unsubscribe from events
     * @param {string} subId - Subscription ID
     */
    unsubscribe(subId) {
        if (this._subscriptions.has(subId)) {
            const message = JSON.stringify(['CLOSE', subId]);
            this._broadcast(message);
            this._subscriptions.delete(subId);
            console.log(`[Nostr] Unsubscribed: ${subId}`);
        }
    }

    /**
     * Publish an event to all connected relays
     * @param {Object} event - Signed Nostr event
     * @returns {Promise<Object>} Result with successes and failures
     */
    async publish(event) {
        const message = JSON.stringify(['EVENT', event]);
        const results = { successes: [], failures: [] };

        for (const [url, ws] of this._connections.entries()) {
            try {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(message);
                    results.successes.push(url);
                } else {
                    results.failures.push({ url, reason: 'Not connected' });
                }
            } catch (error) {
                results.failures.push({ url, reason: error.message });
            }
        }

        console.log(`[Nostr] Published event ${event.id?.slice(0, 8)}:`, results);
        return results;
    }

    /**
     * Handle incoming WebSocket message
     * @private
     */
    _handleMessage(url, data) {
        try {
            const message = JSON.parse(data);
            const [type, ...rest] = message;

            switch (type) {
                case 'EVENT': {
                    const [subId, event] = rest;
                    const sub = this._subscriptions.get(subId);
                    if (sub && !sub.events.has(event.id)) {
                        sub.events.add(event.id);
                        sub.onEvent(event, url);
                    }
                    break;
                }

                case 'EOSE': {
                    const [subId] = rest;
                    const sub = this._subscriptions.get(subId);
                    if (sub?.onEose) {
                        sub.onEose(subId, url);
                    }
                    break;
                }

                case 'OK': {
                    const [eventId, success, message] = rest;
                    console.log(`[Nostr] Event ${eventId.slice(0, 8)} ${success ? 'accepted' : 'rejected'}: ${message}`);
                    break;
                }

                case 'NOTICE': {
                    console.log(`[Nostr] Notice from ${url}:`, rest[0]);
                    break;
                }

                default:
                    console.log(`[Nostr] Unknown message type: ${type}`);
            }
        } catch (error) {
            console.error(`[Nostr] Error parsing message from ${url}:`, error);
        }
    }

    /**
     * Broadcast message to all connected relays
     * @private
     */
    _broadcast(message) {
        for (const [url, ws] of this._connections.entries()) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            } else {
                // Queue message for when connection opens
                const queue = this._messageQueue.get(url) || [];
                queue.push(message);
                this._messageQueue.set(url, queue);
            }
        }
    }

    /**
     * Schedule relay reconnection with exponential backoff
     * @private
     */
    _scheduleReconnect(url) {
        const attempts = (this._reconnectAttempts.get(url) || 0) + 1;

        if (attempts > config.relays.maxRetries) {
            console.log(`[Nostr] Max reconnect attempts reached for ${url}`);
            const failed = [...new Set([...(store.get('relays.failed') || []), url])];
            store.merge('relays', { failed });
            return;
        }

        this._reconnectAttempts.set(url, attempts);
        const delay = config.relays.retryDelay * Math.pow(2, attempts - 1);

        console.log(`[Nostr] Reconnecting to ${url} in ${delay}ms (attempt ${attempts})`);

        setTimeout(() => {
            this.connect(url).catch(() => {
                // Error handled in connect
            });
        }, delay);
    }

    /**
     * Generate unique subscription ID
     * @private
     */
    _generateSubId() {
        return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
}

// Singleton instance
export const nostrService = new NostrService();

export default nostrService;
