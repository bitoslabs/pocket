/**
 * Profile Service
 * Resolves kind 0 metadata (name, nip05, lud16/lud06) for a Nostr identity.
 * Used by the About page to look up the donate Lightning address from an npub.
 *
 * @module services/profile-service
 */

import { config } from '../config.js';
import { nostrService } from './nostr-service.js';

const HEX_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Convert an npub (or raw hex pubkey) to a 32-byte hex pubkey.
 * @param {string} key - npub1… or 64-char hex
 * @returns {string|null}
 */
export function npubToHex(key) {
  const value = String(key || '').trim();
  if (!value) return null;
  if (HEX_RE.test(value)) return value.toLowerCase();
  try {
    const nip19 = window.NostrTools?.nip19;
    if (!nip19) return null;
    const { type, data } = nip19.decode(value);
    return type === 'npub' && typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Shorten an npub for display.
 * @param {string} npub
 * @returns {string}
 */
export function shortNpub(npub = '') {
  return npub.length > 16 ? npub.slice(0, 10) + '…' + npub.slice(-4) : npub;
}

/**
 * Fetch the kind 0 metadata event for a pubkey.
 *
 * Resolves with the parsed content object, or `null` when no metadata is
 * found before the timeout (or no relay answers).
 *
 * @param {string} key - npub or hex pubkey
 * @param {Object} [options]
 * @param {number} [options.timeout=6000] - Max time to wait, in ms
 * @returns {Promise<Object|null>}
 */
export function fetchProfile(key, { timeout = 6000 } = {}) {
  const author = npubToHex(key);
  if (!author) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let subId = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (subId) nostrService.unsubscribe(subId);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeout);

    subId = nostrService.subscribe(
      { kinds: [config.kinds.METADATA], authors: [author], limit: 1 },
      (event) => {
        if (settled) return;
        try {
          finish(JSON.parse(event.content || '{}'));
        } catch {
          finish(null);
        }
      }
    );
  });
}

/**
 * Extract the best available Lightning address from a profile.
 * Prefers lud16 (user@domain), falls back to lud06 (lnurl1…).
 * @param {Object|null} profile
 * @returns {string}
 */
export function lightningAddressOf(profile) {
  const lud16 = String(profile?.lud16 || '').trim();
  if (lud16.includes('@')) return lud16;
  const lud06 = String(profile?.lud06 || '').trim();
  if (lud06) return lud06;
  return '';
}

/**
 * Build a wallet-openable URI for a Lightning address.
 * @param {string} address - lud16 or lud06 string
 * @returns {string}
 */
export function lightningUri(address) {
  const value = String(address || '').trim();
  return value ? `lightning:${value}` : '';
}

export default { npubToHex, fetchProfile, lightningAddressOf, lightningUri, shortNpub };
