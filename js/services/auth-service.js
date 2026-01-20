/**
 * Authentication Service
 * NIP-07 browser extension authentication (Alby, nos2x, etc.)
 * 
 * @module services/auth-service
 */

import { config } from '../config.js';
import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { storageService } from './storage-service.js';

class AuthService {
    constructor() {
        this._pubkey = null;
        this._nip07Available = false;
    }

    /**
     * Initialize auth service and check for NIP-07 extension
     */
    async init() {
        // Check for NIP-07 extension availability
        this._nip07Available = await this._checkNip07();

        // Restore session from storage
        const savedUser = storageService.getLocal(config.storage.keys.USER);
        if (savedUser && savedUser.pubkey) {
            this._pubkey = savedUser.pubkey;
            store.set('user', savedUser);
            store.set('isAuthenticated', true);
            eventBus.emit(Events.AUTH_LOGIN, savedUser);
        }

        return this._nip07Available;
    }

    /**
     * Check if NIP-07 extension is available
     * @private
     */
    async _checkNip07() {
        return new Promise((resolve) => {
            // Give extension time to inject window.nostr
            const checkInterval = setInterval(() => {
                if (window.nostr) {
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    console.log('[Auth] NIP-07 extension detected');
                    resolve(true);
                }
            }, 100);

            const timeout = setTimeout(() => {
                clearInterval(checkInterval);
                console.log('[Auth] No NIP-07 extension found');
                resolve(false);
            }, 2000);
        });
    }

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!this._pubkey;
    }

    /**
     * Check if NIP-07 extension is available
     * @returns {boolean}
     */
    hasExtension() {
        return this._nip07Available;
    }

    /**
     * Get current user's public key
     * @returns {string|null}
     */
    getPublicKey() {
        return this._pubkey;
    }

    /**
     * Login with NIP-07 extension
     * @returns {Promise<Object>} User object with pubkey
     */
    async login() {
        // Double check extension availability before attempting login
        if (!window.nostr) {
            // Try one last quick check in case it loaded late
            const detected = await this._checkNip07();
            if (!detected) {
                const error = new Error('No NIP-07 extension found. Please install Alby or nos2x.');
                eventBus.emit(Events.AUTH_ERROR, { message: error.message });
                throw error;
            }
        }

        try {
            store.set('isLoading', true);

            // Detect provider for better logging
            const provider = window.alby ? 'Alby' : (window.nostr?.nip04 ? 'Generic NIP-07' : 'Unknown');
            console.log(`[Auth] Detected provider: ${provider}`);

            // NIP-07: Trigger permission prompt explicitly
            try {
                if (window.nostr.enable) {
                    console.log('[Auth] Calling window.nostr.enable()...');
                    await window.nostr.enable();
                }
            } catch (err) {
                console.error('[Auth] Enable failed:', err);
                if (err.message?.includes('rejected') || err.message?.includes('denied')) {
                    throw new Error('Connection cancelled by user');
                }
            }

            // Get public key from extension with retry logic
            let pubkey = null;
            let retries = 3;

            while (retries > 0 && !pubkey) {
                try {
                    console.log(`[Auth] Requesting public key from window.nostr (attempt ${4 - retries}/3)...`);
                    pubkey = await window.nostr.getPublicKey();
                    console.log('[Auth] window.nostr.getPublicKey() returned:', pubkey);

                    if (pubkey) break;

                    // Wait a bit before retrying if null
                    if (retries > 1) {
                        console.log('[Auth] Got null key, waiting 500ms before retry...');
                        await new Promise(r => setTimeout(r, 500));
                    }
                } catch (err) {
                    // Handle specific extension errors
                    console.error('[Auth] Extension error:', err);
                    if (err.message?.includes('rejected') || err.message?.includes('denied')) {
                        throw new Error('Login cancelled by user');
                    }
                    // Don't throw immediately on other errors, iterate retry
                }
                retries--;
            }

            if (!pubkey) {
                console.error('[Auth] Public key is null/undefined/empty after retries');
                const providerMsg = provider === 'Alby' ? 'Alby' : 'your extension';
                throw new Error(`Login failed: ${providerMsg} did not provide a public key. Please check your extension permissions.`);
            }

            if (typeof pubkey !== 'string') {
                console.error('[Auth] Unexpected public key type:', typeof pubkey);
                throw new Error('Login failed: Invalid public key format received.');
            }

            this._pubkey = pubkey;

            // Create user object
            const user = {
                pubkey,
                npub: this._pubkeyToNpub(pubkey),
                loggedInAt: Date.now(),
                method: 'nip07'
            };

            // Save to storage and state
            storageService.setLocal(config.storage.keys.USER, user);
            store.set('user', user);
            store.set('isAuthenticated', true);
            store.set('isLoading', false);

            eventBus.emit(Events.AUTH_LOGIN, user);
            console.log('[Auth] Login successful (NIP-07):', user.npub);

            return user;

        } catch (error) {
            store.set('isLoading', false);
            store.set('error', error.message);
            eventBus.emit(Events.AUTH_ERROR, { message: error.message });
            console.error('[Auth] Login error:', error);
            throw error;
        }
    }

    /**
     * Login with nsec (private key)
     * @param {string} nsec - Bech32 encoded private key
     * @returns {Promise<Object>} User object
     */
    async loginWithSecret(nsec) {
        try {
            store.set('isLoading', true);

            if (!window.NostrTools) {
                throw new Error('Crypto library not loaded. Please refresh and try again.');
            }

            // Decode nsec
            let privkey;
            try {
                if (nsec.startsWith('nsec')) {
                    const { data } = window.NostrTools.nip19.decode(nsec);
                    privkey = data;
                } else if (nsec.match(/^[0-9a-fA-F]{64}$/)) {
                    privkey = nsec; // Allow raw hex for advanced users
                } else {
                    throw new Error('Invalid key format');
                }
            } catch (err) {
                throw new Error('Invalid nsec key. Please check your input.');
            }

            // Derive public key
            const pubkey = window.NostrTools.getPublicKey(privkey);
            this._pubkey = pubkey;

            // Store private key securely (in memory mostly, but persistent for this demo app)
            // Use sessionStorage for slightly better security than localStorage if preferred, 
            // but for a persistent "app" feel we often need localStorage.
            // WARNING: Storing keys in localStorage is not recommended for high-value accounts.
            storageService.setLocal('auth_privkey', privkey);

            const user = {
                pubkey,
                npub: this._pubkeyToNpub(pubkey),
                loggedInAt: Date.now(),
                method: 'secret'
            };

            // Save public session
            storageService.setLocal(config.storage.keys.USER, user);
            store.set('user', user);
            store.set('isAuthenticated', true);
            store.set('isLoading', false);

            eventBus.emit(Events.AUTH_LOGIN, user);
            console.log('[Auth] Login successful (Secret):', user.npub);

            return user;

        } catch (error) {
            store.set('isLoading', false);
            store.set('error', error.message);
            eventBus.emit(Events.AUTH_ERROR, { message: error.message });
            throw error;
        }
    }

    /**
     * Generate a new Nostr account
     * @returns {Promise<Object>} User object with new keys
     */
    async generateNewAccount() {
        try {
            store.set('isLoading', true);

            if (!window.NostrTools) {
                throw new Error('Crypto library not loaded');
            }

            const privkey = window.NostrTools.generatePrivateKey();
            const nsec = window.NostrTools.nip19.nsecEncode(privkey);

            // Proceed with login using this new key
            const user = await this.loginWithSecret(nsec);

            // Return full details including secret for the UI to show to the user
            return {
                ...user,
                privkey,
                nsec
            };

        } catch (error) {
            store.set('isLoading', false);
            throw error;
        }
    }

    /**
     * Logout current user
     */
    logout() {
        this._pubkey = null;

        // Clear private key if it exists
        storageService.removeLocal('auth_privkey');

        storageService.removeLocal(config.storage.keys.USER);
        store.set('user', null);
        store.set('isAuthenticated', false);

        eventBus.emit(Events.AUTH_LOGOUT);
        console.log('[Auth] Logged out');
    }

    /**
     * Sign an event
     * @param {Object} event - Nostr event to sign
     * @returns {Promise<Object>} Signed event
     */
    async signEvent(event) {
        // Check for local private key first
        const localPrivKey = storageService.getLocal('auth_privkey');

        if (localPrivKey && window.NostrTools) {
            try {
                // Sign using local key
                const signedEvent = window.NostrTools.finishEvent(event, localPrivKey);
                return signedEvent;
            } catch (error) {
                console.error('[Auth] Local signing error:', error);
                throw error;
            }
        }

        // Fallback to NIP-07 extension
        if (!window.nostr) {
            throw new Error('No NIP-07 extension available and no local key found');
        }

        if (!this._pubkey) {
            throw new Error('Not authenticated');
        }

        try {
            const signedEvent = await window.nostr.signEvent(event);
            return signedEvent;
        } catch (error) {
            console.error('[Auth] Error signing event:', error);
            throw error;
        }
    }

    /**
     * Encrypt a message with NIP-04 using extension
     * @param {string} pubkey - Recipient's public key
     * @param {string} plaintext - Message to encrypt
     * @returns {Promise<string>} Encrypted message
     */
    async encrypt(pubkey, plaintext) {
        // Check for local private key first
        const localPrivKey = storageService.getLocal('auth_privkey');

        if (localPrivKey && window.NostrTools && window.NostrTools.nip04) {
            try {
                return await window.NostrTools.nip04.encrypt(localPrivKey, pubkey, plaintext);
            } catch (error) {
                console.error('[Auth] Local encryption error:', error);
                throw error;
            }
        }

        if (!window.nostr?.nip04) {
            throw new Error('NIP-04 encryption not supported by extension');
        }

        try {
            return await window.nostr.nip04.encrypt(pubkey, plaintext);
        } catch (error) {
            console.error('[Auth] Encryption error:', error);
            throw error;
        }
    }

    /**
     * Decrypt a message with NIP-04 using extension
     * @param {string} pubkey - Sender's public key
     * @param {string} ciphertext - Encrypted message
     * @returns {Promise<string>} Decrypted message
     */
    async decrypt(pubkey, ciphertext) {
        // Check for local private key first
        const localPrivKey = storageService.getLocal('auth_privkey');

        if (localPrivKey && window.NostrTools && window.NostrTools.nip04) {
            try {
                return await window.NostrTools.nip04.decrypt(localPrivKey, pubkey, ciphertext);
            } catch (error) {
                console.error('[Auth] Local decryption error:', error);
                throw error;
            }
        }

        if (!window.nostr?.nip04) {
            throw new Error('NIP-04 decryption not supported by extension');
        }

        try {
            return await window.nostr.nip04.decrypt(pubkey, ciphertext);
        } catch (error) {
            console.error('[Auth] Decryption error:', error);
            throw error;
        }
    }

    /**
     * Convert hex pubkey to npub format
     * @private
     */
    _pubkeyToNpub(pubkey) {
        if (window.NostrTools) {
            try {
                return window.NostrTools.nip19.npubEncode(pubkey);
            } catch (e) {
                console.warn('[Auth] Failed to encode npub:', e);
            }
        }
        // Fallback or placeholder
        return `npub1${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;
    }

    /**
     * Get shortened display key
     * @param {string} key - Public key
     * @returns {string} Shortened key
     */
    shortenKey(key) {
        if (!key || key.length < 16) return key;
        return `${key.slice(0, 8)}...${key.slice(-8)}`;
    }
}

// Singleton instance
export const authService = new AuthService();

export default authService;
