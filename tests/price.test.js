import test from 'node:test';
import assert from 'node:assert/strict';

import { priceService } from '../js/services/price-service.js';

test('sats ⇄ fiat conversion (LAK example: 100 sats = 500 LAK)', () => {
  priceService.rateSource = 'auto';
  priceService.manualRate = 0;
  priceService.rates = { LAK: { rate: 5e8, ts: Date.now() } };
  priceService.currency = 'LAK';

  assert.equal(priceService.hasRate('LAK'), true);
  assert.equal(priceService.satsToFiat(100, 'LAK'), 500);
  assert.equal(priceService.fiatToSats(500, 'LAK'), 100);
});

test('native units have no fiat rate', () => {
  assert.equal(priceService.rateFor('SATS'), 0);
  assert.equal(priceService.rateFor('BTC'), 0);
  assert.equal(priceService.hasRate('SATS'), true);
});

test('zero-decimal currencies format without fractions', () => {
  const text = priceService.formatAmount(500, 'LAK');
  assert.match(text, /500/);
  assert.equal(text.includes('.'), false);
});

test('manual rate source overrides cached rates', () => {
  priceService.rateSource = 'manual';
  priceService.manualRate = 1e9;
  priceService.rates = { LAK: { rate: 5e8, ts: Date.now() } };
  assert.equal(priceService.rateFor('LAK'), 1e9);
});

test('satsToFiat returns null without a rate', () => {
  priceService.rateSource = 'auto';
  priceService.rates = {};
  assert.equal(priceService.satsToFiat(100, 'LAK'), null);
});
