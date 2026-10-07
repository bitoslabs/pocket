/**
 * Home Page (Today) - greeting, balance, today's entry, budgets, activity
 *
 * VanJS view: `template()` returns DOM nodes built with `van.tags`, so text is
 * escaped automatically and no `hydrateIcons` pass is needed.
 *
 * @module pages/dashboard
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { t, locale } from '../core/i18n.js';
import { budgetService } from '../services/budget-service.js';
import { categoryService } from '../services/category-service.js';
import { storageService } from '../services/storage-service.js';
import { routeTo } from '../router.js';
import { Icons } from '../utils/icons.js';
import {
  MOODS,
  allTimeBalance,
  cashBalance,
  categoryMeta,
  fiatLabel,
  fmtSats,
  fmtFull,
  greeting,
  moodById,
  moodLabel,
  monthTotals,
  toBTC,
  toMs,
} from '../utils/ui.js';
import { txRow } from '../components/tx-row.js';
import { openComposer } from '../components/journal-composer.js';
import { openTxModal } from '../components/tx-modal.js';
import { balancesByCurrency } from '../utils/ledger.js';
import van from '../vendor/van.js';

const { b, button, div, h3, i, p, small, span } = van.tags;

export class HomePage extends Component {
  mounted() {
    this.watchStore('transactions', () => this.render());
    this.watchStore('journal', () => this.render());
    this.watchStore('isAuthenticated', () => this.render());
    this.watchStore('price', () => this.render());
    this.watchStore('sync', () => this.render());
    this.watchStore('accounts', () => this.render());
    this.watchStore('assets', () => this.render());
  }

  template() {
    const transactions = store.get('transactions') || [];
    const entries = store.get('journal') || [];
    const authenticated = store.get('isAuthenticated');

    const now = new Date();
    const totals = monthTotals(transactions, now.getFullYear(), now.getMonth());
    const accounts = store.get('accounts') || [];
    const balance = accounts.length ? cashBalance(transactions, accounts) : allTimeBalance(transactions);
    const primaryCurrency = accounts.length ? accounts[0].currency || 'SATS' : 'SATS';
    const otherBalances = accounts.length
      ? Object.entries(balancesByCurrency(transactions, accounts)).filter(
          ([cur, v]) => cur !== primaryCurrency && Math.abs(v) > 1e-9
        )
      : [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEntry = entries.find((e) => toMs(e.created_at) >= todayStart.getTime());

    const progress = budgetService.getAllBudgetProgress();
    const topBudgets = [...progress]
      .filter((entry) => entry.percentage > 0)
      .sort((a, b2) => b2.percentage - a.percentage)
      .slice(0, 3);

    const recent = [...transactions]
      .sort((a, b2) => toMs(b2.created_at) - toMs(a.created_at))
      .slice(0, 4);

    const linkedIds = new Set(entries.map((e) => e.linkedTransaction).filter(Boolean));

    const name = (store.get('user')?.npub || '').slice(0, 6);
    const helloName = authenticated && name ? name : t('dashboard.friend');

    const showLocalNotice =
      !authenticated && !storageService.getLocal('app_local_notice_dismissed', false);

    const dateStr = now.toLocaleDateString(locale(), {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    const frag = document.createDocumentFragment();
    van.add(
      frag,
      div({ class: 'hi' }, `${greeting()}, ${helloName} 👋`),
      div({ class: 'hi-sub' }, `${dateStr} · ${t('dashboard.privateCorner')}`),
      showLocalNotice ? this._localNotice() : null,
      authenticated ? null : this._connectCard(),
      this._balanceBlock(balance, totals, accounts, otherBalances),
      this._todayCard(todayEntry),
      topBudgets.length ? this._budgetsCard(topBudgets) : null,
      this._recentCard(recent, linkedIds)
    );
    return frag;
  }

  _localNotice() {
    return div(
      { class: 'card local-notice' },
      div(
        { class: 'card-head' },
        h3(t('dashboard.localModeTitle')),
        button(
          { class: 'btn btn-ghost btn-sm', 'data-action': 'dismiss-local' },
          t('common.dismiss')
        )
      ),
      p(
        { class: 'muted-p', style: 'text-align:left;padding:0 0 12px' },
        t('dashboard.localModeBody')
      )
    );
  }

  _connectCard() {
    return div(
      { class: 'card' },
      div({ class: 'card-head' }, h3(t('dashboard.connectTitle'))),
      p(
        { class: 'muted-p', style: 'text-align:left;padding:0 0 12px' },
        t('dashboard.connectBody')
      ),
      button(
        { class: 'btn btn-primary btn-block', 'data-action': 'connect' },
        t('dashboard.connectButton')
      )
    );
  }

  _balanceBlock(balance, totals, accounts = [], otherBalances = []) {
    const { tin, tout, invested, returned, netCashFlow } = totals;
    const unit = accounts.length ? accounts[0].currency || 'SATS' : 'SATS';
    const isSats = unit === 'SATS';
    const conv = isSats ? fiatLabel(balance) : '';
    return div(
      { class: 'balance' },
      div({ class: 'bal-label' }, t('dashboard.cashBalance')),
      div({ class: 'bal-num' }, fmtFull(balance), small(isSats ? t('common.sats') : unit)),
      otherBalances.length
        ? div(
            { class: 'bal-note' },
            `${t('dashboard.alsoHeld')} `,
            otherBalances.map(([cur, v]) => `${fmtFull(v)} ${cur}`).join(' · ')
          )
        : null,
      conv ? div({ class: 'bal-conv' }, `${fmtFull(balance)} ${t('common.sats')} ~ ${conv}`) : null,
      isSats ? div({ class: 'bal-btc' }, toBTC(balance)) : null,
      div(
        { class: 'bal-row' },
        this._balanceCell('in', 'downLeft', t('dashboard.incomeMonth'), fmtSats(tin), isSats ? fiatLabel(tin) : ''),
        this._balanceCell(null, 'upRight', t('dashboard.expensesMonth'), fmtSats(tout), isSats ? fiatLabel(tout) : '')
      ),
      div(
        { class: 'bal-row' },
        this._balanceCell(null, 'trending', t('dashboard.invested'), fmtSats(invested), ''),
        this._balanceCell(
          netCashFlow >= 0 ? 'in' : null,
          'swap',
          t('dashboard.netCashFlow'),
          `${netCashFlow >= 0 ? '+' : '−'}${fmtSats(Math.abs(netCashFlow))}`,
          ''
        ),
        returned
          ? this._balanceCell('in', 'undo', t('dashboard.returnedPrincipal'), fmtSats(returned), '')
          : null
      )
    );
  }

  _balanceCell(modifier, icon, label, value, fiat) {
    return div(
      { class: `bal-cell${modifier ? ' ' + modifier : ''}` },
      span({ class: 'ic', innerHTML: Icons[icon] }),
      div(
        {},
        div({ class: 'bc-t' }, label),
        div({ class: 'bc-v' }, value),
        fiat ? div({ class: 'bc-f' }, fiat) : null
      )
    );
  }

  _todayCard(todayEntry) {
    const children = [];
    if (todayEntry) {
      const mood = moodById(todayEntry.mood);
      children.push(
        div(
          { class: 'card-head', style: 'margin-bottom:8px' },
          h3(t('dashboard.todaysEntry')),
          span({ class: 'priv-pill' }, span({ innerHTML: Icons.eyeOff }), ` ${t('dashboard.private')}`)
        )
      );
      if (mood) {
        children.push(div({ class: 'jmood' }, span({ class: 'je' }, mood.emoji), mood.label));
      }
      children.push(
        p(
          { class: 'jtext', style: 'margin:8px 0 0' },
          `${todayEntry.text.slice(0, 180)}${todayEntry.text.length > 180 ? '…' : ''}`
        )
      );
      children.push(
        button(
          { class: 'btn btn-ghost', style: 'margin-top:12px', 'data-action': 'go-journal' },
          t('dashboard.readInJournal')
        )
      );
    } else {
      children.push(h3(t('dashboard.howWasToday')));
      children.push(p(t('dashboard.journalWaiting')));
      children.push(
        div(
          { class: 'mood-quick' },
          MOODS.map((m) =>
            button(
              { class: 'mq', 'data-action': 'new-mood', 'data-mood': m.id, title: moodLabel(m) },
              m.emoji
            )
          )
        )
      );
    }
    return div({ class: `card${todayEntry ? '' : ' prompt'}` }, children);
  }

  _budgetsCard(topBudgets) {
    return div(
      { class: 'card' },
      div(
        { class: 'card-head' },
        h3(t('dashboard.budgetsThisMonth')),
        button(
          {
            class: 'btn btn-ghost',
            style: 'padding:6px 12px;font-size:12px',
            'data-action': 'go-money',
          },
          t('dashboard.moneyLink')
        )
      ),
      topBudgets.map((progress) => this._budgetRow(progress))
    );
  }

  _recentCard(recent, linkedIds) {
    return div(
      { class: 'card' },
      div(
        { class: 'card-head' },
        h3(t('dashboard.recentActivity')),
        button(
          {
            class: 'btn btn-ghost',
            style: 'padding:6px 12px;font-size:12px',
            'data-action': 'go-money',
          },
          t('dashboard.viewAll')
        )
      ),
      recent.map((tx) => txRow(tx, linkedIds))
    );
  }

  _budgetRow(progress) {
    const { budget, spent, percentage, status } = progress;
    const cat = categoryService.getCategory(budget.categoryId);
    const meta = categoryMeta(budget.categoryId);
    const pct = Math.min(100, Math.round(percentage));
    const col =
      status === 'danger'
        ? 'var(--out)'
        : status === 'warning'
        ? 'var(--zap)'
        : meta.color;
    const cls = status === 'danger' ? 'over' : status === 'warning' ? 'warn' : '';
    return div(
      { class: 'bud-row' },
      div(
        { class: 'bud-info' },
        div(
          { class: 'bud-top' },
          span(cat?.name || meta.label),
          b({ class: cls }, `${fmtSats(spent)} / ${fmtSats(budget.amount)}`)
        ),
        div({ class: 'btrack' }, i({ class: 'bfill', style: `width:${pct}%;background:${col}` }))
      )
    );
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.addEventListener(this.container, 'click', async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || !this.container.contains(el)) return;
      const action = el.dataset.action;

      if (action === 'connect') {
        const { loginModal } = await import('../components/login-modal.js');
        loginModal.show();
      } else if (action === 'dismiss-local') {
        storageService.setLocal('app_local_notice_dismissed', true);
        this.render();
      } else if (action === 'go-money') {
        routeTo('money');
      } else if (action === 'go-journal') {
        routeTo('journal');
      } else if (action === 'new-mood') {
        openComposer({ mood: el.dataset.mood || null });
      } else if (action === 'edit-tx') {
        const tx = (store.get('transactions') || []).find((x) => x.id === el.dataset.id);
        if (tx) openTxModal({ tx });
      }
    });
  }
}

export default HomePage;
