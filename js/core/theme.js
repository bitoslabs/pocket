/**
 * Theme - dark/light mode + accent color
 *
 * Persists to localStorage and drives CSS custom properties on <html>.
 * Accent is derived (light/deep/soft variants) so any colour works.
 *
 * @module core/theme
 */

import { config } from '../config.js';
import { store } from './state.js';
import { storageService } from '../services/storage-service.js';

const THEME_KEY = config.storage.keys.THEME; // 'app_theme'
const ACCENT_KEY = 'app_accent';

export const DEFAULT_ACCENT = '#8B5CF6';

export const ACCENT_PRESETS = [
  { name: 'Violet', hex: '#8B5CF6' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Cyan', hex: '#22D3EE' },
  { name: 'Emerald', hex: '#22C55E' },
  { name: 'Amber', hex: '#F59E0B' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Pink', hex: '#EC4899' },
];

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

export function normalizeHex(hex) {
  if (!hex) return DEFAULT_ACCENT;
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return DEFAULT_ACCENT;
  return '#' + h.toUpperCase();
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = ({ r, g, b }) =>
  '#' +
  [r, g, b]
    .map((v) => clamp(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const mix = (hex, target, amount) => {
  const { r, g, b } = hexToRgb(hex);
  return toHex({
    r: r + (target - r) * amount,
    g: g + (target - g) * amount,
    b: b + (target - b) * amount,
  });
};

export const lighten = (hex, amount = 0.18) => mix(hex, 255, amount);
export const darken = (hex, amount = 0.28) => mix(hex, 0, amount);

let _theme = 'dark';
let _accent = DEFAULT_ACCENT;

/** Apply theme + accent to the document (no persistence). */
export function apply(theme = _theme, accent = _accent) {
  _theme = theme === 'light' ? 'light' : 'dark';
  _accent = normalizeHex(accent);

  const root = document.documentElement;
  root.setAttribute('data-theme', _theme);

  const { r, g, b } = hexToRgb(_accent);
  const soft = `rgba(${r}, ${g}, ${b}, 0.14)`;
  const deep = darken(_accent, 0.3);
  const light = lighten(_accent, 0.18);

  root.style.setProperty('--accent', _accent);
  root.style.setProperty('--accent-2', light);
  root.style.setProperty('--accent-deep', deep);
  root.style.setProperty('--accent-soft', soft);

  // Legacy aliases used by older components
  root.style.setProperty('--color-primary', _accent);
  root.style.setProperty('--color-primary-light', light);
  root.style.setProperty('--color-primary-dark', deep);
  root.style.setProperty('--color-primary-alpha-10', `rgba(${r}, ${g}, ${b}, 0.1)`);
  root.style.setProperty('--color-primary-alpha-20', `rgba(${r}, ${g}, ${b}, 0.2)`);
  root.style.setProperty('--color-primary-alpha-50', `rgba(${r}, ${g}, ${b}, 0.5)`);
  root.style.setProperty('--color-tint', _accent);

  store.set('theme', _theme);
  store.set('accent', _accent);

  // Keep the browser chrome in sync
  const meta = document.getElementById('themeColorMeta') || document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', _theme === 'light' ? '#F5F3FB' : '#0B0912');
}

export function setTheme(theme) {
  apply(theme, _accent);
  storageService.setLocal(THEME_KEY, _theme);
}

export function setAccent(accent) {
  apply(_theme, accent);
  storageService.setLocal(ACCENT_KEY, _accent);
}

export function getTheme() {
  return _theme;
}

export function getAccent() {
  return _accent;
}

/** Load persisted preferences and apply. Call once at boot. */
export function initTheme() {
  const theme = storageService.getLocal(THEME_KEY) || config.ui.defaultTheme || 'dark';
  const accent = storageService.getLocal(ACCENT_KEY) || DEFAULT_ACCENT;
  apply(theme, accent);
}
