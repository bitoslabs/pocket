/**
 * UI helpers - formatting, money math, categories, toasts, effects
 * Shared by the redesigned pages and components.
 *
 * @module utils/ui
 */

import { eventBus, Events } from '../core/event-bus.js';
import { t, locale } from '../core/i18n.js';
import { priceService } from '../services/price-service.js';

/* ==================== Time ==================== */

/** Normalize a timestamp that may be in seconds or milliseconds. */
export function toMs(ts) {
  if (!ts) return Date.now();
  return ts < 1e12 ? ts * 1000 : ts;
}

export function fmtTime(ts) {
  return new Date(toMs(ts)).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function dayLabel(ts) {
  const d = new Date(toMs(ts));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = new Date(toMs(ts));
  dd.setHours(0, 0, 0, 0);
  const diff = (today - dd) / 864e5;
  if (diff === 0) return t('time.today');
  if (diff === 1) return t('time.yesterday');
  return d.toLocaleDateString(locale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/* ==================== Money ==================== */

export function fmtSats(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace('.0', '') + 'k';
  return n.toLocaleString('en-US');
}

export const fmtFull = (n) => (Number(n) || 0).toLocaleString('en-US');

export const toBTC = (n) => '₿ ' + ((Number(n) || 0) / 1e8).toFixed(8);

export const isIncome = (tx) => tx && tx.type === 'income';

export const amountOf = (tx) => Number(tx?.amount) || 0;

export function inMonth(ts, year, month) {
  const d = new Date(toMs(ts));
  return d.getFullYear() === year && d.getMonth() === month;
}

export function monthTotals(transactions, year, month) {
  let tin = 0;
  let tout = 0;
  (transactions || []).forEach((t) => {
    if (!inMonth(t.created_at, year, month)) return;
    if (isIncome(t)) tin += amountOf(t);
    else tout += amountOf(t);
  });
  return { tin, tout, net: tin - tout };
}

export function allTimeBalance(transactions) {
  let b = 0;
  (transactions || []).forEach((t) => {
    b += isIncome(t) ? amountOf(t) : -amountOf(t);
  });
  return b;
}

export function spentByCat(transactions, year, month) {
  const out = {};
  (transactions || []).forEach((t) => {
    if (isIncome(t) || !inMonth(t.created_at, year, month)) return;
    const key = t.category || 'uncategorized';
    out[key] = (out[key] || 0) + amountOf(t);
  });
  return out;
}

/* ==================== Categories ==================== */

const CATEGORY_META = {
  food: { label: 'Food', color: '#F97316', icon: 'food' },
  transport: { label: 'Transport', color: '#38BDF8', icon: 'car' },
  shopping: { label: 'Shopping', color: '#F472B6', icon: 'shopping' },
  entertainment: { label: 'Fun', color: '#22D3EE', icon: 'smile' },
  bills: { label: 'Bills', color: '#94A3B8', icon: 'file' },
  healthcare: { label: 'Health', color: '#4ADE80', icon: 'heart' },
  education: { label: 'Learning', color: '#A78BFA', icon: 'book' },
  tips: { label: 'Zaps', color: '#FFC24B', icon: 'bolt' },
  donations: { label: 'Gifts', color: '#F472B6', icon: 'gift' },
  other: { label: 'Other', color: '#7D7396', icon: 'file' },
  salary: { label: 'Salary', color: '#4ADE80', icon: 'wallet' },
  investments: { label: 'Investments', color: '#38BDF8', icon: 'trending' },
  freelance: { label: 'Freelance', color: '#A78BFA', icon: 'briefcase' },
  // design-native ids (used if present)
  health: { label: 'Health', color: '#4ADE80', icon: 'heart' },
  learning: { label: 'Learning', color: '#A78BFA', icon: 'book' },
  zaps: { label: 'Zaps', color: '#FFC24B', icon: 'bolt' },
  gifts: { label: 'Gifts', color: '#F472B6', icon: 'gift' },
  fun: { label: 'Fun', color: '#22D3EE', icon: 'smile' },
  income: { label: 'Income', color: '#4ADE80', icon: 'wallet' },
  zapin: { label: 'Zaps received', color: '#FFC24B', icon: 'bolt' },
  refund: { label: 'Refund', color: '#38BDF8', icon: 'undo' },
  uncategorized: { label: 'Uncategorized', color: '#7D7396', icon: 'file' },
};

export function categoryMeta(id) {
  const meta = CATEGORY_META[id] || { label: id || 'Other', color: '#7D7396', icon: 'file' };
  const key = `categories.${id}`;
  const label = t(key);
  return { ...meta, label: label === key ? meta.label : label };
}

/* ==================== Moods ==================== */

export const MOODS = [
  { id: 'grateful', emoji: '😊', label: 'Grateful' },
  { id: 'peaceful', emoji: '🌿', label: 'Peaceful' },
  { id: 'inspired', emoji: '✨', label: 'Inspired' },
  { id: 'energized', emoji: '⚡', label: 'Energized' },
  { id: 'reflective', emoji: '🌙', label: 'Reflective' },
  { id: 'tired', emoji: '😴', label: 'Tired' },
];

/** Translated label for a mood id (falls back to the built-in English label). */
export function moodLabel(mood) {
  const id = typeof mood === 'string' ? mood : mood?.id;
  if (!id) return '';
  const key = `moods.${id}`;
  const label = t(key);
  if (label !== key) return label;
  return MOODS.find((m) => m.id === id)?.label || id;
}

export const moodById = (id) => {
  const m = MOODS.find((x) => x.id === id);
  return m ? { ...m, label: moodLabel(m) } : null;
};

/* ==================== Toast / FX ==================== */

export function toast(message, type = 'success') {
  eventBus.emit(Events.TOAST_SHOW, { message, type });
}

export function playFX(amount, green = false) {
  const fx = document.createElement('div');
  fx.className = 'zap-fx';
  fx.innerHTML = `<div class="zf-flash ${green ? 'green' : ''}"></div>
    <div class="zf-bolt ${green ? 'green' : ''}">${Icons.bolt}</div>
    <div class="zf-amount ${green ? 'green' : ''}">${
    green ? '+' : '−'
  }${Number(amount).toLocaleString()} ${t('common.sats')}</div>`;
  document.body.appendChild(fx);
  setTimeout(() => fx.remove(), 950);
}

export async function copyText(text, successMessage = null) {
  let done = false;
  try {
    await navigator.clipboard.writeText(text);
    done = true;
  } catch (e) {
    /* fall through */
  }
  if (!done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done = true;
    } catch (e) {
      /* ignore */
    }
  }
  const message = done ? successMessage || t('common.copied') : t('common.copyFailed');
  toast(message, done ? 'success' : 'error');
}

export function shortNpub(n = '') {
  return n.length > 16 ? n.slice(0, 8) + '…' + n.slice(-4) : n;
}

/* ==================== Rendering helpers ==================== */

export function greeting(hour = new Date().getHours()) {
  if (hour < 5) return t('dashboard.greetingStillUp');
  if (hour < 12) return t('dashboard.greetingMorning');
  if (hour < 18) return t('dashboard.greetingAfternoon');
  return t('dashboard.greetingEvening');
}

/** Fiat string for a sats amount, or '' when fiat display is off. */
export function fiatLabel(sats) {
  return priceService.showFiat ? priceService.formatFiat(sats) : '';
}

/** Group items by calendar day; returns [{ key, items }] */
export function groupByDay(items, tsFn = (t) => t.created_at) {
  const groups = [];
  items.forEach((item) => {
    const k = new Date(toMs(tsFn(item))).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.k === k) last.items.push(item);
    else groups.push({ k, items: [item] });
  });
  return groups;
}

/** Transactions linked to a journal entry (supports both link directions). */
export function moneyForEntry(entry, transactions) {
  if (!entry) return [];
  return (transactions || []).filter(
    (t) => t.entryId === entry.id || t.id === entry.linkedTransaction
  );
}
