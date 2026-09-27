/**
 * i18n - lightweight internationalisation for ZapJournal.
 *
 * Two ways to translate:
 *   1. In JS templates call `t('nav.today')` (supports `{token}` interpolation).
 *   2. In static HTML mark elements with data-i18n attributes; `applyTranslations`
 *      (run on boot and on every language change) fills them in:
 *        data-i18n="key"            -> textContent
 *        data-i18n-html="key"       -> innerHTML (allows inline markup)
 *        data-i18n-placeholder="key"-> placeholder attribute
 *        data-i18n-title="key"      -> title attribute
 *        data-i18n-aria-label="key" -> aria-label attribute
 *        data-i18n-content="key"    -> content attribute (meta tags)
 *
 * Components re-render automatically on language change because the base
 * Component subscribes to Events.LANGUAGE_CHANGED.
 *
 * @module core/i18n
 */

import { config } from '../config.js';
import { store } from './state.js';
import { eventBus, Events } from './event-bus.js';
import en from '../locales/en.js';
import th from '../locales/th.js';
import lo from '../locales/lo.js';

export const LANG_KEY = config.storage.keys.LANG; // 'app_lang'
export const DEFAULT_LANG = config.i18n.defaultLanguage || 'lo';

/** UI metadata for the language picker, in display order. */
export const LANGUAGES = [
  { code: 'lo', label: 'ລາວ', english: 'Lao' },
  { code: 'th', label: 'ไทย', english: 'Thai' },
  { code: 'en', label: 'English', english: 'English' },
];

const DICTS = { en, th, lo };
const SUPPORTED = LANGUAGES.map((l) => l.code);

const LOCALES = { lo: 'lo-LA', th: 'th-TH', en: 'en-US' };

let _lang = normalize(DEFAULT_LANG);

function normalize(code) {
  const c = String(code || '').toLowerCase().slice(0, 2);
  return SUPPORTED.includes(c) ? c : DEFAULT_LANG;
}

function lookup(dict, path) {
  return path.split('.').reduce((val, key) => {
    if (val && typeof val === 'object' && key in val) return val[key];
    return undefined;
  }, dict);
}

function interpolate(str, params) {
  if (!params) return str;
  return String(str).replace(/\{(\w+)\}/g, (m, key) =>
    params[key] === undefined || params[key] === null ? m : String(params[key])
  );
}

/**
 * Translate a dot-path key, falling back to English, then the raw key.
 * @param {string} key - e.g. 'nav.today' or 'money.pendingCount'
 * @param {Object} [params] - interpolation values for `{token}` placeholders
 * @returns {string}
 */
export function t(key, params) {
  if (!key) return '';
  let str = lookup(DICTS[_lang], key);
  if (str === undefined) str = lookup(DICTS.en, key);
  if (str === undefined) return key;
  return interpolate(str, params);
}

/** Current language code ('lo' | 'th' | 'en'). */
export function getLanguage() {
  return _lang;
}

/** BCP-47 locale for Intl / toLocaleDateString, matching the active language. */
export function locale() {
  return LOCALES[_lang] || LOCALES.en;
}

/** Translate a category id, falling back to the provided default label. */
export function categoryLabel(id, fallback = '') {
  return t(`categories.${id}`, {}) === `categories.${id}`
    ? fallback || id
    : t(`categories.${id}`);
}

/**
 * Apply all data-i18n* attributes under `root`.
 * @param {ParentNode} [root=document]
 */
export function applyTranslations(root = document) {
  if (!root || !root.querySelectorAll) return;

  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });

  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });

  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
  });

  root.querySelectorAll('[data-i18n-content]').forEach((el) => {
    el.setAttribute('content', t(el.getAttribute('data-i18n-content')));
  });
}

/**
 * Switch the active language: persists the choice, updates <html lang/data-lang>,
 * re-applies static translations and notifies listeners.
 * @param {string} code
 * @param {Object} [opts]
 * @param {boolean} [opts.persist=true]
 */
export function setLanguage(code, { persist = true } = {}) {
  const next = normalize(code);
  const changed = next !== _lang;
  _lang = next;

  const root = document.documentElement;
  root.setAttribute('lang', _lang);
  root.setAttribute('data-lang', _lang);

  if (persist) {
    try {
      localStorage.setItem(LANG_KEY, _lang);
    } catch (e) {
      /* ignore */
    }
  }

  store.set('language', _lang);

  const update = () => {
    applyTranslations(document);
    if (changed) eventBus.emit(Events.LANGUAGE_CHANGED, { lang: _lang });
  };

  // Cross-fade the UI when switching language (View Transitions where available).
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (changed && !reduceMotion && typeof document.startViewTransition === 'function') {
    document.startViewTransition(update);
  } else {
    update();
  }

  return _lang;
}

/** Detect the initial language and apply it. Call once during boot. */
export function initI18n() {
  let saved = null;
  try {
    saved = localStorage.getItem(LANG_KEY);
  } catch (e) {
    /* ignore */
  }

  let detected = saved;
  if (!detected && typeof navigator !== 'undefined' && navigator.language) {
    const nav = normalize(navigator.language);
    if (SUPPORTED.includes(nav)) detected = nav;
  }

  _lang = normalize(detected || DEFAULT_LANG);
  return setLanguage(_lang, { persist: !!saved });
}

export default { t, getLanguage, locale, setLanguage, initI18n, applyTranslations, LANGUAGES };
