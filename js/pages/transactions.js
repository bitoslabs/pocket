/**
 * Money Page - monthly stats, donut breakdown, budgets, ledger
 *
 * @module pages/transactions
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { budgetService } from '../services/budget-service.js';
import { categoryService } from '../services/category-service.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import {
  categoryMeta,
  dayLabel,
  fiatLabel,
  fmtSats,
  groupByDay,
  inMonth,
  isIncome,
  monthTotals,
  spentByCat,
  toMs,
  txRowHtml,
} from '../utils/ui.js';
import { openBudgetsModal } from '../components/budgets-modal.js';
import { openTxModal } from '../components/tx-modal.js';
import { openQuickAdd } from '../components/quick-add.js';

export class MoneyPage extends Component {
  constructor(options) {
    super(options);
    const now = new Date();
    this._view = {
      y: now.getFullYear(),
      m: now.getMonth(),
      filter: 'all',
    };
  }

  mounted() {
    this.watchStore('transactions', () => this.render());
    this.watchStore('ui.query', () => this.render());
    this.watchStore('price', () => this.render());
  }

  template() {
    const { y, m, filter } = this._view;
    const all = store.get('transactions') || [];
    const query = store.get('ui.query') || '';

    const label = new Date(y, m, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    const monthTx = all.filter((t) => inMonth(t.created_at, y, m));
    const { tin, tout, net } = monthTotals(all, y, m);
    const spent = spentByCat(all, y, m);

    const catSegs = Object.entries(spent)
      .map(([cat, v]) => ({ cat, v, color: categoryMeta(cat).color }))
      .sort((a, b) => b.v - a.v);
    const totalOut = catSegs.reduce((a, s) => a + s.v, 0);
    const top = catSegs.slice(0, 5);
    const restV = catSegs.slice(5).reduce((a, s) => a + s.v, 0);

    const filtered = monthTx
      .filter((t) => {
        if (filter === 'in') return isIncome(t);
        if (filter === 'out') return !isIncome(t);
        if (filter.startsWith('cat:')) return t.category === filter.slice(4) && !isIncome(t);
        return true;
      })
      .filter((t) => {
        if (!query) return true;
        const meta = categoryMeta(t.category);
        return (
          (t.description || '').toLowerCase().includes(query) ||
          meta.label.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => toMs(b.created_at) - toMs(a.created_at));

    const chip = (id, text) =>
      `<button class="chip ${filter === id ? 'on' : ''}" data-action="mfilter" data-filter="${id}">${text}</button>`;

    const progress = budgetService
      .getAllBudgetProgress()
      .sort((a, b) => b.percentage - a.percentage);

    return `
      <div class="view-title"><span class="ic" style="color:var(--zap)">${Icons.bolt}</span>Money</div>

      <div class="month-nav">
        <button class="mnav-btn" data-action="month" data-d="-1" aria-label="Previous month">
          <span class="ic">${Icons.chevL}</span>
        </button>
        <span class="mnav-label">${label}</span>
        <button class="mnav-btn" data-action="month" data-d="1" aria-label="Next month">
          <span class="ic">${Icons.chevR}</span>
        </button>
      </div>

      <div class="stat-grid">
        <div class="stat"><b class="vin">${Icons.downLeft}${fmtSats(tin)}</b><span>in · this month</span>${
      fiatLabel(tin) ? `<em class="stat-fiat">${fiatLabel(tin)}</em>` : ''
    }</div>
        <div class="stat"><b class="vout">${Icons.upRight}${fmtSats(tout)}</b><span>out · this month</span>${
      fiatLabel(tout) ? `<em class="stat-fiat">${fiatLabel(tout)}</em>` : ''
    }</div>
        <div class="stat"><b class="vnet">${net >= 0 ? '+' : '−'}${fmtSats(
      Math.abs(net)
    )}</b><span>net · sats</span>${
      fiatLabel(net) ? `<em class="stat-fiat">${fiatLabel(net)}</em>` : ''
    }</div>
        <div class="stat"><b>${monthTx.length}</b><span>transactions</span></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Income vs spending</h3></div>
        <div class="split">
          <i class="s-in" style="width:${tin + tout ? Math.round((tin / (tin + tout)) * 100) : 50}%"></i>
          <i class="s-out" style="flex:1"></i>
        </div>
        <div class="split-legend">
          <span class="li">in <b>+${fmtSats(tin)}</b></span>
          <span class="lo">out <b>−${fmtSats(tout)}</b></span>
        </div>
      </div>

      ${
        catSegs.length
          ? `<div class="card"><div class="card-head"><h3>Where the sats went</h3></div>
              <div class="donut-wrap">
                <div class="donut">
                  ${this._donut([
                    ...top,
                    ...(restV ? [{ v: restV, color: '#3B3550' }] : []),
                  ])}
                  <div class="dc"><b>${fmtSats(totalOut)}</b><span>spent</span></div>
                </div>
                <div class="dlegend">
                  ${top
                    .map(
                      (s) =>
                        `<div class="dl-row"><span class="dl-dot" style="background:${s.color}"></span>
                          <span class="dl-name">${categoryMeta(s.cat).label}</span>
                          <b class="dl-amt">${fmtSats(s.v)}</b>
                          <span class="dl-pct">${Math.round((s.v / totalOut) * 100)}%</span></div>`
                    )
                    .join('')}
                  ${
                    restV
                      ? `<div class="dl-row"><span class="dl-dot" style="background:#3B3550"></span>
                          <span class="dl-name">Other</span><b class="dl-amt">${fmtSats(restV)}</b>
                          <span class="dl-pct">${Math.round((restV / totalOut) * 100)}%</span></div>`
                      : ''
                  }
                </div>
              </div></div>`
          : `<div class="card"><p class="muted-p">No spending this month yet — the donut is hungry 🍩</p></div>`
      }

      <div class="card">
        <div class="card-head"><h3>Budgets</h3>
          <button class="btn btn-ghost" style="padding:6px 12px;font-size:12px" data-action="budgets-open">Edit</button>
        </div>
        ${
          progress.length
            ? progress.map((p) => this._budgetRow(p)).join('')
            : '<p class="muted-p">No budgets yet. Tap Edit to set monthly limits.</p>'
        }
      </div>

      <div class="chips">
        ${chip('all', 'All')}
        ${chip('in', '↓ Income')}
        ${chip('out', '↑ Expense')}
        ${catSegs
          .slice(0, 4)
          .map((s) => chip('cat:' + s.cat, categoryMeta(s.cat).label))
          .join('')}
      </div>

      ${
        filtered.length
          ? this._groupedLedger(filtered)
          : `<div class="empty"><div class="empty-ic">${Icons.wallet}</div>
              <h3>Nothing here</h3>
              <p>${query ? 'No matching transactions.' : 'No activity this month yet.'}</p>
              <button class="btn btn-primary" data-action="log">Log something</button></div>`
      }
    `;
  }

  _budgetRow(progress) {
    const { budget, spent, percentage, status } = progress;
    const cat = categoryService.getCategory(budget.categoryId);
    const meta = categoryMeta(budget.categoryId);
    const pct = Math.min(100, Math.round(percentage));
    const col =
      status === 'danger' ? 'var(--out)' : status === 'warning' ? 'var(--zap)' : meta.color;
    const cls = status === 'danger' ? 'over' : status === 'warning' ? 'warn' : '';
    return `<div class="bud-row"><div class="bud-info">
      <div class="bud-top"><span>${cat?.name || meta.label}</span>
        <b class="${cls}">${fmtSats(spent)} / ${fmtSats(budget.amount)}</b></div>
      <div class="btrack"><i class="bfill" style="width:${spent ? pct : 0}%;background:${col}"></i></div>
    </div></div>`;
  }

  _groupedLedger(list) {
    const entries = store.get('journal') || [];
    const linkedIds = new Set(entries.map((e) => e.linkedTransaction).filter(Boolean));
    return groupByDay(list)
      .map(
        (g) =>
          `<div class="day-label">${dayLabel(g.items[0].created_at)}</div>
           <div class="card" style="padding:6px 16px">${g.items
             .map((t) => txRowHtml(t, linkedIds))
             .join('')}</div>`
      )
      .join('');
  }

  _donut(segs) {
    const size = 150;
    const stroke = 18;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const total = segs.reduce((a, s) => a + s.v, 0) || 1;
    let acc = 0;
    const circles = segs
      .map((s) => {
        const len = (s.v / total) * c;
        const draw = Math.max(len - 2.5, 0);
        const el = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none"
          stroke="${s.color}" stroke-width="${stroke}"
          stroke-dasharray="${draw} ${c - draw}" stroke-dashoffset="${-acc}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
        acc += len;
        return el;
      })
      .join('');
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="max-width:150px">${circles}</svg>`;
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.container.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || !this.container.contains(el)) return;
      const action = el.dataset.action;

      if (action === 'month') {
        const d = Number(el.dataset.d);
        let { y, m } = this._view;
        m += d;
        if (m < 0) {
          m = 11;
          y--;
        }
        if (m > 11) {
          m = 0;
          y++;
        }
        this._view = { ...this._view, y, m };
        this.render();
      } else if (action === 'mfilter') {
        this._view = { ...this._view, filter: el.dataset.filter };
        this.render();
      } else if (action === 'budgets-open') {
        openBudgetsModal({ onSaved: () => this.render() });
      } else if (action === 'log') {
        openQuickAdd();
      } else if (action === 'edit-tx') {
        const tx = (store.get('transactions') || []).find((t) => t.id === el.dataset.id);
        if (tx) openTxModal({ tx, onSaved: () => this.render() });
      }
    });
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default MoneyPage;
