/**
 * Format Utilities
 * Date, number, and string formatting helpers
 * 
 * @module utils/format
 */

/**
 * Format a timestamp to readable date
 * @param {number} timestamp - Unix timestamp (seconds)
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string}
 */
export function formatDate(timestamp, options = {}) {
    const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options
    };

    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
}

/**
 * Format timestamp to time string
 * @param {number} timestamp - Unix timestamp (seconds)
 * @returns {string}
 */
export function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(date);
}

/**
 * Format timestamp to datetime string
 * @param {number} timestamp - Unix timestamp (seconds)
 * @returns {string}
 */
export function formatDateTime(timestamp) {
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    }).format(date);
}

/**
 * Format relative time (e.g., "2 hours ago")
 * @param {number} timestamp - Unix timestamp (seconds)
 * @returns {string}
 */
export function formatRelativeTime(timestamp) {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;

    return formatDate(timestamp);
}

/**
 * Format satoshi amount with suffix
 * @param {number} sats - Amount in satoshis
 * @param {boolean} [showSuffix=true] - Whether to show "sats" suffix
 * @returns {string}
 */
export function formatSats(sats, showSuffix = true) {
    const suffix = showSuffix ? ' sats' : '';

    if (sats >= 100000000) {
        return `${(sats / 100000000).toFixed(2)} BTC`;
    }
    if (sats >= 1000000) {
        return `${(sats / 1000000).toFixed(2)}M${suffix}`;
    }
    if (sats >= 1000) {
        return `${(sats / 1000).toFixed(1)}k${suffix}`;
    }
    return `${sats.toLocaleString()}${suffix}`;
}

/**
 * Format number with locale
 * @param {number} num - Number to format
 * @param {Object} options - Intl.NumberFormat options
 * @returns {string}
 */
export function formatNumber(num, options = {}) {
    return new Intl.NumberFormat('en-US', options).format(num);
}

/**
 * Format percentage
 * @param {number} value - Value (0-1)
 * @param {number} [decimals=1] - Decimal places
 * @returns {string}
 */
export function formatPercent(value, decimals = 1) {
    return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format currency
 * @param {number} amount - Amount
 * @param {string} [currency='USD'] - Currency code
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency
    }).format(amount);
}

/**
 * Format bytes to human readable size
 * @param {number} bytes - Bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Truncate string with ellipsis
 * @param {string} str - String to truncate
 * @param {number} length - Max length
 * @param {string} [suffix='...'] - Suffix to add
 * @returns {string}
 */
export function truncate(str, length, suffix = '...') {
    if (!str || str.length <= length) return str;
    return str.slice(0, length - suffix.length) + suffix;
}

/**
 * Shorten hex key/hash
 * @param {string} hex - Hex string
 * @param {number} [chars=8] - Characters to show on each side
 * @returns {string}
 */
export function shortenHex(hex, chars = 8) {
    if (!hex || hex.length <= chars * 2) return hex;
    return `${hex.slice(0, chars)}...${hex.slice(-chars)}`;
}

/**
 * Capitalize first letter
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert string to title case
 * @param {string} str
 * @returns {string}
 */
export function titleCase(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Slugify string
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Escape HTML entities
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Parse URL search params
 * @param {string} [search=window.location.search] - Search string
 * @returns {Object}
 */
export function parseQuery(search = window.location.search) {
    const params = new URLSearchParams(search);
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}

/**
 * Build URL search string from object
 * @param {Object} params
 * @returns {string}
 */
export function buildQuery(params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            searchParams.set(key, String(value));
        }
    });
    return searchParams.toString();
}

export default {
    formatDate,
    formatTime,
    formatDateTime,
    formatRelativeTime,
    formatSats,
    formatNumber,
    formatPercent,
    formatCurrency,
    formatBytes,
    truncate,
    shortenHex,
    capitalize,
    titleCase,
    slugify,
    escapeHtml,
    parseQuery,
    buildQuery
};
