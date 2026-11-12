/**
 * NIP-46 remote signer service.
 *
 * A disposable client key talks NIP-44-encrypted JSON-RPC to a remote signer
 * over kind 24133 events. The user's key never reaches this app. Supports both
 * a `bunker://` token and the client-initiated `nostrconnect://` QR flow.
 *
 * @module services/nip46-service
 */

import { config } from '../config.js';
import { storageService } from './storage-service.js';

const KIND = 24133;
const CONNECT_TIMEOUT = 120000;
const QR_TIMEOUT = 180000;
const REQUEST_TIMEOUT = 30000;

const randomHex = (bytes = 16) => {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
};

const isHexPubkey = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

const normalizeRelays = (relays) => {
    const out = [];
    for (const raw of relays || []) {
        try {
            const url = new URL(String(raw));
            if (url.protocol !== 'wss:' && url.protocol !== 'ws:') continue;
            const normalized = url.toString();
            if (!out.includes(normalized)) out.push(normalized);
        } catch {
            // Ignore malformed relay entries.
        }
    }
    return out;
};

class Nip46Service {
    constructor() {
        this._pool = null;
        this._clientSecret = null;
        this._clientPubkey = null;
        this._bunker = null;
        this._userPubkey = null;
        this._sub = null;
        this._listeners = new Map();
        this._serial = 0;
        this._idPrefix = Math.random().toString(36).slice(2, 8);
    }

    isConnected() {
        return Boolean(this._userPubkey && this._bunker && this._clientSecret);
    }

    hasStoredConnection() {
        return Boolean(storageService.getLocal(config.storage.keys.NIP46));
    }

    getPublicKey() {
        return this._userPubkey;
    }

    _tools() {
        const tools = typeof window !== 'undefined' ? window.NostrTools : null;
        if (!tools?.nip44?.utils?.v2 || !tools.generatePrivateKey || !tools.finishEvent) {
            throw new Error('Crypto library is not loaded. Refresh and try again.');
        }
        return tools;
    }

    _poolInstance() {
        const tools = this._tools();
        if (!this._pool) this._pool = new tools.SimplePool();
        return this._pool;
    }

    _conversationKey(signerPubkey) {
        const tools = this._tools();
        return tools.nip44.utils.v2.getConversationKey(this._clientSecret, signerPubkey);
    }

    _encrypt(signerPubkey, plaintext) {
        const tools = this._tools();
        return tools.nip44.encrypt(this._conversationKey(signerPubkey), plaintext);
    }

    _decrypt(signerPubkey, ciphertext) {
        const tools = this._tools();
        return tools.nip44.decrypt(this._conversationKey(signerPubkey), ciphertext);
    }

    _metadata() {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        return {
            name: 'PocketZap',
            url: origin,
            image: origin ? `${origin}/assets/icons/icon-192.png` : '',
        };
    }

    async _parseBunkerInput(input) {
        const trimmed = String(input || '').trim();
        if (!trimmed) return null;

        if (/^bunker:\/\//i.test(trimmed)) {
            try {
                const url = new URL(trimmed);
                const pubkey = url.hostname || url.pathname.replace(/^\/+/, '');
                if (!isHexPubkey(pubkey)) return null;
                return {
                    pubkey: pubkey.toLowerCase(),
                    relays: normalizeRelays(url.searchParams.getAll('relay')),
                    secret: url.searchParams.get('secret') || null,
                };
            } catch {
                return null;
            }
        }

        const match = trimmed.match(/^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/);
        if (!match) return null;
        const [, name = '_', domain] = match;
        try {
            const response = await fetch(
                `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
                { redirect: 'error' }
            );
            if (!response.ok) return null;
            const data = await response.json();
            const pubkey = data?.names?.[name];
            if (!isHexPubkey(pubkey)) return null;
            return {
                pubkey: pubkey.toLowerCase(),
                relays: normalizeRelays(data?.nip46?.[pubkey] || []),
                secret: null,
            };
        } catch {
            return null;
        }
    }

    _subscribe(relays, filter, onEvent) {
        const sub = this._poolInstance().sub(relays, [filter], {});
        sub.on('event', (event) => {
            try {
                onEvent(event);
            } catch (error) {
                console.warn('[NIP-46] Failed to handle event:', error);
            }
        });
        return {
            close: () => {
                try {
                    sub.unsub();
                } catch {
                    // Already closed.
                }
            },
        };
    }

    _startSubscription(onAuth) {
        if (this._sub) this._sub.close();
        if (!this._bunker) return;

        this._sub = this._subscribe(
            this._bunker.relays,
            {
                kinds: [KIND],
                authors: [this._bunker.pubkey],
                '#p': [this._clientPubkey],
                limit: 0,
            },
            (event) => {
                if (event.pubkey !== this._bunker?.pubkey) return;
                let payload;
                try {
                    payload = JSON.parse(this._decrypt(event.pubkey, event.content));
                } catch {
                    return;
                }
                const { id, result, error } = payload || {};
                const listener = this._listeners.get(id);
                if (!listener) return;

                if (result === 'auth_url') {
                    const url = error || '';
                    if (listener.onAuth) {
                        listener.onAuth(url);
                        this._armTimeout(id, 5 * 60 * 1000);
                    } else {
                        this._settle(id, new Error(url || 'The signer requires approval in its own app.'));
                    }
                    return;
                }

                if (error !== undefined && error !== null) {
                    this._settle(id, new Error(String(error)));
                } else {
                    this._settle(id, null, result);
                }
            }
        );
    }

    _armTimeout(id, ms) {
        const listener = this._listeners.get(id);
        if (!listener) return;
        if (listener.timer) clearTimeout(listener.timer);
        listener.timer = setTimeout(() => {
            this._settle(id, new Error('The remote signer did not respond in time.'));
        }, ms);
    }

    _settle(id, error, result) {
        const listener = this._listeners.get(id);
        if (!listener) return;
        if (listener.timer) clearTimeout(listener.timer);
        this._listeners.delete(id);
        if (error) listener.reject(error);
        else listener.resolve(result);
    }

    _createRequestEvent(signerPubkey, payload) {
        const tools = this._tools();
        return tools.finishEvent(
            {
                kind: KIND,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['p', signerPubkey]],
                content: this._encrypt(signerPubkey, JSON.stringify(payload)),
            },
            this._clientSecret
        );
    }

    async _publish(event) {
        const relays = this._bunker?.relays || [];
        if (!relays.length) throw new Error('No relay is configured for the remote signer.');
        const results = await Promise.allSettled(this._poolInstance().publish(relays, event));
        if (!results.some((r) => r.status === 'fulfilled')) {
            const reason = results.find((r) => r.status === 'rejected')?.reason;
            throw new Error(reason?.message || 'Could not reach the remote signer relays.');
        }
    }

    _sendRequest(method, params, { timeout = REQUEST_TIMEOUT, onAuth = null } = {}) {
        if (!this._bunker || !this._clientSecret) {
            return Promise.reject(new Error('No remote signer is connected.'));
        }
        if (!this._clientPubkey) {
            try {
                this._clientPubkey = this._tools().getPublicKey(this._clientSecret);
            } catch (error) {
                return Promise.reject(error);
            }
        }
        if (!this._sub) this._startSubscription(onAuth);

        const id = `${this._idPrefix}-${++this._serial}`;
        const event = this._createRequestEvent(this._bunker.pubkey, { id, method, params });

        return new Promise((resolve, reject) => {
            this._listeners.set(id, { resolve, reject, onAuth, timer: null });
            this._armTimeout(id, timeout);
            this._publish(event).catch((error) => this._settle(id, error));
        });
    }

    _reset() {
        for (const [id, listener] of this._listeners.entries()) {
            if (listener.timer) clearTimeout(listener.timer);
            listener.reject(new Error('The remote signer connection was closed.'));
            this._listeners.delete(id);
        }
        if (this._sub) {
            this._sub.close();
            this._sub = null;
        }
        this._clientSecret = null;
        this._clientPubkey = null;
        this._bunker = null;
        this._userPubkey = null;
    }

    clearStoredConnection() {
        storageService.removeLocal(config.storage.keys.NIP46);
    }

    _storeConnection() {
        storageService.setLocal(config.storage.keys.NIP46, {
            bunker: this._bunker,
            clientSecretKey: this._clientSecret,
            clientPubkey: this._clientPubkey,
            userPubkey: this._userPubkey,
        });
    }

    async _finishConnection() {
        const pubkey = String(await this._sendRequest('get_public_key', [])).trim().toLowerCase();
        if (!isHexPubkey(pubkey)) {
            throw new Error('The remote signer returned an invalid public key.');
        }
        this._userPubkey = pubkey;
        this._storeConnection();
        return { userPubkey: pubkey };
    }

    async connectBunker(input, { onAuth, signal } = {}) {
        const bunker = await this._parseBunkerInput(input);
        if (!bunker) {
            throw new Error('Enter a valid bunker:// URL or NIP-05 address.');
        }
        if (!bunker.relays.length) {
            throw new Error('That bunker URL has no relay. Add ?relay=wss://… and try again.');
        }

        this._reset();
        const tools = this._tools();
        this._clientSecret = tools.generatePrivateKey();
        this._clientPubkey = tools.getPublicKey(this._clientSecret);
        this._bunker = bunker;
        this._startSubscription(onAuth);

        let onAbort = null;
        const aborted = new Promise((_, reject) => {
            if (!signal) return;
            onAbort = () => {
                this._reset();
                reject(new DOMException('Connection cancelled', 'AbortError'));
            };
            if (signal.aborted) onAbort();
            else signal.addEventListener('abort', onAbort, { once: true });
        });

        try {
            const result = await Promise.race([
                this._sendRequest(
                    'connect',
                    [bunker.pubkey, bunker.secret || '', '', JSON.stringify(this._metadata())],
                    { timeout: CONNECT_TIMEOUT, onAuth }
                ),
                aborted,
            ]);
            if (result !== 'ack' && (!bunker.secret || result !== bunker.secret)) {
                throw new Error('The remote signer rejected the connection.');
            }
            return await Promise.race([this._finishConnection(), aborted]);
        } catch (error) {
            this._reset();
            throw error;
        } finally {
            if (onAbort) signal?.removeEventListener('abort', onAbort);
        }
    }

    connectNostrConnect({ relays, onUri, signal, onAuth } = {}) {
        return new Promise((resolve, reject) => {
            const tools = this._tools();
            const urls = normalizeRelays(relays);
            if (!urls.length) {
                reject(new Error('No relay is available for the signer connection.'));
                return;
            }

            this._reset();
            this._clientSecret = tools.generatePrivateKey();
            this._clientPubkey = tools.getPublicKey(this._clientSecret);
            const secret = randomHex(16);

            const params = new URLSearchParams();
            for (const relay of urls) params.append('relay', relay);
            params.append('secret', secret);
            params.append('name', 'PocketZap');
            if (typeof window !== 'undefined') {
                params.append('url', window.location.origin);
                params.append('image', `${window.location.origin}/assets/icons/icon-192.png`);
            }
            params.append(
                'perms',
                'get_public_key,sign_event,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt'
            );

            const uri = `nostrconnect://${this._clientPubkey}?${params.toString()}`;
            onUri?.(uri);

            let settled = false;
            let sub = null;
            let timer = null;

            const cleanup = () => {
                if (timer) clearTimeout(timer);
                timer = null;
                if (sub) sub.close();
                sub = null;
                signal?.removeEventListener('abort', onAbort);
            };
            const fail = (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                this._reset();
                reject(error);
            };
            const onAbort = () => fail(new DOMException('Connection cancelled', 'AbortError'));

            if (signal?.aborted) {
                onAbort();
                return;
            }
            signal?.addEventListener('abort', onAbort, { once: true });

            timer = setTimeout(() => {
                fail(new Error('Timed out waiting for the signer app to scan the QR code.'));
            }, QR_TIMEOUT);

            sub = this._subscribe(
                urls,
                { kinds: [KIND], '#p': [this._clientPubkey], limit: 0 },
                (event) => {
                    if (settled) return;
                    let payload;
                    try {
                        payload = JSON.parse(this._decrypt(event.pubkey, event.content));
                    } catch {
                        return;
                    }
                    if (payload?.result !== secret) return;

                    settled = true;
                    cleanup();
                    this._bunker = {
                        pubkey: event.pubkey.toLowerCase(),
                        relays: urls,
                        secret,
                    };
                    this._startSubscription(onAuth);
                    this._finishConnection().then(
                        (connected) => resolve(connected),
                        (error) => {
                            this._reset();
                            reject(error);
                        }
                    );
                }
            );
        });
    }

    restoreFromStorage() {
        const connection = storageService.getLocal(config.storage.keys.NIP46);
        if (!connection?.bunker?.pubkey || !connection.clientSecretKey || !connection.userPubkey) {
            return null;
        }
        const relays = normalizeRelays(connection.bunker.relays);
        if (!relays.length || !isHexPubkey(connection.userPubkey)) return null;

        let tools = null;
        try {
            tools = this._tools();
        } catch {
            // The crypto bundle may not be available on a cold offline start.
            // Keep the saved identity so local data still opens; signing will
            // require a reload once the bundle is available again.
        }

        this._reset();
        this._clientSecret = connection.clientSecretKey;
        this._bunker = {
            pubkey: connection.bunker.pubkey.toLowerCase(),
            relays,
            secret: connection.bunker.secret || null,
        };
        this._userPubkey = connection.userPubkey.toLowerCase();

        try {
            this._clientPubkey =
                connection.clientPubkey ||
                (tools ? tools.getPublicKey(this._clientSecret) : null);
        } catch {
            this._clientPubkey = null;
        }

        if (tools && this._clientPubkey) {
            this._startSubscription();
        }
        return { userPubkey: this._userPubkey };
    }

    async signEvent(event) {
        const result = await this._sendRequest('sign_event', [JSON.stringify(event)]);
        let signed;
        try {
            signed = JSON.parse(result);
        } catch {
            throw new Error('The remote signer returned an invalid event.');
        }
        const tools = this._tools();
        if (typeof tools.verifyEvent === 'function' && !tools.verifyEvent(signed)) {
            throw new Error('The remote signer returned an event with an invalid signature.');
        }
        return signed;
    }

    nip04Encrypt(pubkey, plaintext) {
        return this._sendRequest('nip04_encrypt', [pubkey, plaintext]);
    }

    nip04Decrypt(pubkey, ciphertext) {
        return this._sendRequest('nip04_decrypt', [pubkey, ciphertext]);
    }

    nip44Encrypt(pubkey, plaintext) {
        return this._sendRequest('nip44_encrypt', [pubkey, plaintext]);
    }

    nip44Decrypt(pubkey, ciphertext) {
        return this._sendRequest('nip44_decrypt', [pubkey, ciphertext]);
    }

    async disconnect({ logout = false } = {}) {
        this.clearStoredConnection();
        if (logout && this.isConnected()) {
            try {
                await this._sendRequest('logout', [], { timeout: 5000 });
            } catch {
                // Best effort; the local session is already gone.
            }
        }
        this._reset();
    }
}

export const nip46Service = new Nip46Service();

export default nip46Service;
