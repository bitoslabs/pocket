/**
 * HTML Utilities
 * Single source of truth for escaping values interpolated into HTML strings.
 *
 * @module utils/html
 */

/**
 * Escape a value for safe interpolation into an HTML string or attribute.
 * @param {*} value - Value to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export default { escapeHtml };
