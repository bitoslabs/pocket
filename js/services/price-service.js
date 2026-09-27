/**
 * Price Service - BTC ⇄ fiat exchange rate (multi-currency, cache-first)
 *
 * Adapted from ~/Desktop/bitdigo/platform/apps/bnos-svelte (src/lib/bitcoin/rate.svelte.ts):
 *   BTC/{cur} = BTC/USD (Coinbase, CoinGecko fallback) × USD→{cur} (open.er-api.com)
 * Both endpoints are CORS-safe. Rates are cached per currency and survive
 * offline reloads; failures keep the last good rate and back off.
 *
 * @module services/price-service
 */

import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { storageService } from './storage-service.js';

const RATE_KEY = 'app_btc_rates';
const CUR_KEY = 'app_currency';
const SHOW_KEY = 'app_show_fiat';
const SRC_KEY = 'app_rate_source';
const MANUAL_KEY = 'app_manual_rate';

const STALE_MS = 10 * 60 * 1000; // refresh a good rate after 10 min
const BACKOFF_MS = 2 * 60 * 1000; // don't retry a failed lookup for 2 min

const NATIVE = ['BTC', 'SATS'];

/** Currencies typically shown without decimal places. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'LAK', 'IDR', 'CLP', 'ISK', 'HUF']);

/** Default currency (Lao Kip). */
export const DEFAULT_CURRENCY = 'LAK';

/** Fiat currencies offered in settings. */
export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'INR', 'SGD', 'MYR',
  'THB', 'LAK', 'VND', 'PHP', 'IDR', 'AUD', 'CAD', 'BRL', 'NGN', 'ZAR',
  'RUB', 'TRY', 'AED', 'CHF', 'SEK', 'MXN',
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** BTC spot price in USD. Coinbase first, CoinGecko fallback. */
async function fetchBtcUsd() {
  try {
    const d = await fetchJson('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    const n = parseFloat(d?.data?.amount);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* try fallback */
  }
  const d = await fetchJson(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
  );
  const v = d?.bitcoin?.usd;
  if (typeof v === 'number' && v > 0) return v;
  throw new Error('No BTC/USD rate');
}

/** USD → `currency` FX rate (covers LAK, VND, etc.). */
async function fetchUsdFx(currency) {
  const cur = currency.toUpperCase();
  if (cur === 'USD') return 1;
  const d = await fetchJson('https://open.er-api.com/v6/latest/USD');
  const r = d?.rates?.[cur];
  if (typeof r === 'number' && r > 0) return r;
  throw new Error(`No USD/${cur} FX rate`);
}

/** BTC spot price in `currency` = BTC/USD × USD→{currency}. */
async function fetchBtcRate(currency) {
  const cur = currency.toUpperCase();
  const [btcUsd, fx] = await Promise.all([fetchBtcUsd(), fetchUsdFx(cur)]);
  const rate = btcUsd * fx;
  if (Number.isFinite(rate) && rate > 0) return rate;
  throw new Error(`No BTC/${currency} rate available`);
}

class PriceService {
  constructor() {
    /** Per-currency cache: { USD: { rate, ts }, THB: { rate, ts } }. */
    this.rates = {};
    this.currency = DEFAULT_CURRENCY;
    this.showFiat = false;
    this.rateSource = 'auto'; // 'auto' | 'manual'
    this.manualRate = 0;
    this.loading = false;
    this.error = '';

    this._lastErrorTs = 0;
    this._inflight = new Map();
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;
    this._initialized = true;

    const cache = storageService.getLocal(RATE_KEY, null);
    if (cache && typeof cache === 'object') this.rates = cache.rates || {};
    this.currency = storageService.getLocal(CUR_KEY, DEFAULT_CURRENCY) || DEFAULT_CURRENCY;
    this.showFiat = !!storageService.getLocal(SHOW_KEY, false);
    this.rateSource = storageService.getLocal(SRC_KEY, 'auto') || 'auto';
    this.manualRate = Number(storageService.getLocal(MANUAL_KEY, 0)) || 0;

    this._publish();
    this.ensureRate(this.currency);
  }

  _saveRates() {
    storageService.setLocal(RATE_KEY, { rates: this.rates });
  }

  _publish() {
    store.set('price', {
      currency: this.currency,
      showFiat: this.showFiat,
      rateSource: this.rateSource,
      manualRate: this.manualRate,
      rate: this.rateFor(this.currency),
      ts: this.rates[this.currency]?.ts || 0,
      ageLabel: this.ageLabel(),
      loading: this.loading,
      error: this.error,
    });
  }

  /** Effective BTC/`cur` rate (manual override is global). */
  rateFor(cur = this.currency) {
    const c = String(cur || '').toUpperCase();
    if (NATIVE.includes(c)) return 0;
    if (this.rateSource === 'manual') return this.manualRate;
    return this.rates[c]?.rate || 0;
  }

  hasRate(cur = this.currency) {
    const c = String(cur || '').toUpperCase();
    return NATIVE.includes(c) || this.rateFor(c) > 0;
  }

  ageLabel() {
    const e = this.rates[this.currency];
    if (!e?.ts) return '';
    const mins = Math.floor((Date.now() - e.ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  /** Fiat value of `sats`, or null when fiat display is off / no rate. */
  satsToFiat(sats, cur = this.currency) {
    const r = this.rateFor(cur);
    if (!(r > 0)) return null;
    return ((Number(sats) || 0) / 1e8) * r;
  }

  fiatToSats(amount, cur = this.currency) {
    const a = Number(amount) || 0;
    if (a <= 0) return 0;
    const c = String(cur || '').toUpperCase();
    if (c === 'SATS') return Math.round(a);
    if (c === 'BTC') return Math.round(a * 1e8);
    const r = this.rateFor(c);
    return r > 0 ? Math.round((a / r) * 1e8) : 0;
  }

  /** Format a sats amount as the active currency, or '' when unavailable. */
  formatFiat(sats, cur = this.currency) {
    const v = this.satsToFiat(sats, cur);
    if (v === null || !Number.isFinite(v)) return '';
    return this.formatAmount(v, cur);
  }

  /** Format a raw fiat number in `cur`. */
  formatAmount(v, cur = this.currency) {
    const code = String(cur).toUpperCase();
    const n = Number(v) || 0;
    const frac = ZERO_DECIMAL.has(code) ? 0 : n !== 0 && Math.abs(n) < 1 ? 4 : 2;
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        maximumFractionDigits: frac,
        minimumFractionDigits: Math.min(2, frac),
      }).format(n);
    } catch {
      return `${n.toFixed(frac)} ${cur}`;
    }
  }

  /** Fiat for a stored transaction/entry: uses its recorded fiat when present. */
  fiatFor(item) {
    if (!item) return '';
    if (item.fiatAmount !== undefined && item.fiatAmount !== null && item.currency) {
      return this.formatAmount(item.fiatAmount, item.currency);
    }
    return this.formatFiat(item.amount);
  }

  setCurrency(cur) {
    this.currency = String(cur || DEFAULT_CURRENCY).toUpperCase();
    storageService.setLocal(CUR_KEY, this.currency);
    this.error = '';
    this._publish();
    this.ensureRate(this.currency);
  }

  setShowFiat(v) {
    this.showFiat = !!v;
    storageService.setLocal(SHOW_KEY, this.showFiat);
    this._publish();
  }

  setRateSource(src) {
    this.rateSource = src === 'manual' ? 'manual' : 'auto';
    storageService.setLocal(SRC_KEY, this.rateSource);
    if (this.rateSource === 'auto') this.ensureRate(this.currency);
    this._publish();
  }

  setManualRate(n) {
    this.manualRate = Number(n) || 0;
    storageService.setLocal(MANUAL_KEY, this.manualRate);
    this._publish();
  }

  /** Force a fresh fetch for `cur`. Keeps the last good rate on failure. */
  async refresh(cur = this.currency) {
    const c = String(cur || '').toUpperCase();
    if (NATIVE.includes(c)) return true;
    this.loading = true;
    this.error = '';
    this._publish();
    try {
      const rate = await fetchBtcRate(c);
      this.rates = { ...this.rates, [c]: { rate, ts: Date.now() } };
      this._saveRates();
      return true;
    } catch (e) {
      this.error = e?.message || 'Failed to fetch rate';
      this._lastErrorTs = Date.now();
      return false;
    } finally {
      this.loading = false;
      this._publish();
      eventBus.emit(Events.PRICE_UPDATED, { currency: c, rate: this.rateFor(c) });
    }
  }

  /** Cache-first, per-currency single-flight, failure backoff. */
  async ensureRate(cur = this.currency) {
    const c = String(cur || '').toUpperCase();
    if (NATIVE.includes(c)) return;
    if (this.rateSource !== 'auto') return;

    const inflight = this._inflight.get(c);
    if (inflight) {
      await inflight;
      return;
    }
    const entry = this.rates[c];
    if (entry && Date.now() - entry.ts < STALE_MS) return;
    if (!entry && Date.now() - this._lastErrorTs < BACKOFF_MS) return;

    const p = this.refresh(c).finally(() => this._inflight.delete(c));
    this._inflight.set(c, p);
    await p;
  }
}

export const priceService = new PriceService();
export default priceService;
