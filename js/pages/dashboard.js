/**
 * Home Page (Today) - greeting, balance, today's entry, budgets, activity
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
import { Icons, hydrateIcons } from '../utils/icons.js';
import {
  MOODS,
  allTimeBalance,
  categoryMeta,
  escapeHtml,
  fiatLabel,
  fmtSats,
  fmtFull,
  greeting,
  moodById,
  moodLabel,
  monthTotals,
  toBTC,
  toMs,
  txRowHtml,
} from '../utils/ui.js';
import { openComposer } from '../components/journal-composer.js';
import { openTxModal } from '../components/tx-modal.js';

export class HomePage extends Component {
  mounted() {
    this.watchStore('transactions', () => this.render());
    this.watchStore('journal', () => this.render());
    this.watchStore('isAuthenticated', () => this.render());
    this.watchStore('price', () => this.render());
    this.watchStore('sync', () => this.render());
  }

  template() {
    const transactions = store.get('transactions') || [];
    const entries = store.get('journal') || [];
    const authenticated = store.get('isAuthenticated');

    const now = new Date();
    const { tin, tout } = monthTotals(transactions, now.getFullYear(), now.getMonth());
    const balance = allTimeBalance(transactions);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEntry = entries.find((e) => toMs(e.created_at) >= todayStart.getTime());

    const progress = budgetService.getAllBudgetProgress();
    const topBudgets = [...progress]
      .filter((p) => p.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3);

    const recent = [...transactions]
      .sort((a, b) => toMs(b.created_at) - toMs(a.created_at))
      .slice(0, 4);

    const linkedIds = new Set(entries.map((e) => e.linkedTransaction).filter(Boolean));

    const name = (store.get('user')?.npub || '').slice(0, 6);
    const helloName = authenticated && name ? name : t('dashboard.friend');

    const showLocalNotice =
      !authenticated && !storageService.getLocal('app_local_notice_dismissed', false);

    return `
      <div class="hi">${greeting()}, ${escapeHtml(helloName)} 👋</div>
      <div class="hi-sub">${now.toLocaleDateString(locale(), {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })} · ${t('dashboard.privateCorner')}</div>

      ${
        showLocalNotice
          ? `<div class="card local-notice">
               <div class="card-head"><h3>${t('dashboard.localModeTitle')}</h3>
                 <button class="btn btn-ghost btn-sm" data-action="dismiss-local">${t(
                   'common.dismiss'
                 )}</button>
               </div>
               <p class="muted-p" style="text-align:left;padding:0 0 12px">
                 ${t('dashboard.localModeBody')}
               </p>
             </div>`
          : ''
      }

      ${
        authenticated
          ? ''
          : `<div class="card"><div class="card-head"><h3>${t('dashboard.connectTitle')}</h3></div>
             <p class="muted-p" style="text-align:left;padding:0 0 12px">
               ${t('dashboard.connectBody')}
             </p>
             <button class="btn btn-primary btn-block" data-action="connect">${t(
               'dashboard.connectButton'
             )}</button></div>`
      }

      <div class="balance">
        <div class="bal-label">${t('dashboard.satoshiBalance')}</div>
        <div class="bal-num">${fmtFull(balance)}<small>${t('common.sats')}</small></div>
        ${
          fiatLabel(balance)
            ? `<div class="bal-conv">${fmtFull(balance)} ${t('common.sats')} ~ ${fiatLabel(
                balance
              )}</div>`
            : ''
        }
        <div class="bal-btc">${toBTC(balance)}</div>
        <div class="bal-row">
          <div class="bal-cell in">
            <span class="ic">${Icons.downLeft}</span>
            <div>
              <div class="bc-t">${t('dashboard.inMonth')}</div>
              <div class="bc-v">${fmtSats(tin)}</div>
              ${fiatLabel(tin) ? `<div class="bc-f">${fiatLabel(tin)}</div>` : ''}
            </div>
          </div>
          <div class="bal-cell">
            <span class="ic">${Icons.upRight}</span>
            <div>
              <div class="bc-t">${t('dashboard.outMonth')}</div>
              <div class="bc-v">${fmtSats(tout)}</div>
              ${fiatLabel(tout) ? `<div class="bc-f">${fiatLabel(tout)}</div>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="card ${todayEntry ? '' : 'prompt'}">
        ${
          todayEntry
            ? this._todayEntryCard(todayEntry)
            : `<h3>${t('dashboard.howWasToday')}</h3>
               <p>${t('dashboard.journalWaiting')}</p>
               <div class="mood-quick">
                 ${MOODS.map(
                   (m) =>
                     `<button class="mq" data-action="new-mood" data-mood="${m.id}" title="${moodLabel(
                       m
                     )}">${m.emoji}</button>`
                 ).join('')}
               </div>`
        }
      </div>

      ${
        topBudgets.length
          ? `<div class="card">
               <div class="card-head"><h3>${t('dashboard.budgetsThisMonth')}</h3>
                 <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" data-action="go-money">${t(
                   'dashboard.moneyLink'
                 )}</button>
               </div>
               ${topBudgets.map((b) => this._budgetRow(b)).join('')}
             </div>`
          : ''
      }

      <div class="card">
        <div class="card-head"><h3>${t('dashboard.recentActivity')}</h3>
          <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" data-action="go-money">${t(
            'dashboard.viewAll'
          )}</button>
        </div>
        ${recent.map((tx) => txRowHtml(tx, linkedIds)).join('')}
      </div>
    `;
  }

  _todayEntryCard(entry) {
    const mood = moodById(entry.mood);
    return `
      <div class="card-head" style="margin-bottom:8px">
        <h3>${t('dashboard.todaysEntry')}</h3>
        <span class="priv-pill">${Icons.eyeOff} ${t('dashboard.private')}</span>
      </div>
      ${mood ? `<div class="jmood"><span class="je">${mood.emoji}</span>${mood.label}</div>` : ''}
      <p class="jtext" style="margin:8px 0 0">${escapeHtml(
        entry.text.slice(0, 180)
      )}${entry.text.length > 180 ? '…' : ''}</p>
      <button class="btn btn-ghost" style="margin-top:12px" data-action="go-journal">${t(
        'dashboard.readInJournal'
      )}</button>
    `;
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
    return `<div class="bud-row"><div class="bud-info">
      <div class="bud-top"><span>${cat?.name || meta.label}</span>
        <b class="${cls}">${fmtSats(spent)} / ${fmtSats(budget.amount)}</b></div>
      <div class="btrack"><i class="bfill" style="width:${pct}%;background:${col}"></i></div>
    </div></div>`;
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
        const tx = (store.get('transactions') || []).find((t) => t.id === el.dataset.id);
        if (tx) openTxModal({ tx });
      }
    });
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default HomePage;
