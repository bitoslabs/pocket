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

/** Browser chrome colour per theme (must match index.html's boot script). */
export const THEME_COLORS = { dark: '#0B0912', light: '#F5F3FB' };

let _theme = 'dark';
let _accent = DEFAULT_ACCENT;
let _animTimer = 0;

/** Briefly enable the global colour cross-fade (see base.css). */
function flashTransition() {
  if (
    typeof window === 'undefined' ||
    !window.matchMedia ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }
  const root = document.documentElement;
  root.classList.add('theme-anim');
  // Force a style flush so the transition is already part of the element's
  // "before-change" style. Without this, WebKit/Safari skips the transition
  // when the class and the value change land in the same frame, which made
  // plain dividers (`background: var(--border-soft)`) snap/flash while
  // elements that declare their own `transition` eased smoothly.
  void root.offsetHeight;
  clearTimeout(_animTimer);
  _animTimer = window.setTimeout(() => root.classList.remove('theme-anim'), 260);
}

/** Apply theme + accent to the document (no persistence).
 *  Only `--accent` is set inline; the derived variants (`--accent-2`,
 *  `--accent-deep`, `--accent-soft`, legacy aliases) come from CSS
 *  `color-mix()` so light/dark can tune them independently. */
export function apply(theme = _theme, accent = _accent) {
  _theme = theme === 'light' ? 'light' : 'dark';
  _accent = normalizeHex(accent);

  const root = document.documentElement;
  root.setAttribute('data-theme', _theme);
  root.style.setProperty('--accent', _accent);

  store.set('theme', _theme);
  store.set('accent', _accent);

  // Keep the browser chrome in sync
  const meta =
    document.getElementById('themeColorMeta') ||
    document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[_theme]);
}

export function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  if (next !== _theme) flashTransition();
  apply(next, _accent);
  storageService.setLocal(THEME_KEY, _theme);
}

export function setAccent(accent) {
  const next = normalizeHex(accent);
  if (next !== _accent) flashTransition();
  apply(_theme, next);
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
