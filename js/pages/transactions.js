/**
 * Money Page - monthly stats, donut breakdown, budgets, ledger
 *
 * VanJS view: `template()` returns DOM nodes built with `van.tags` (including
 * SVG), so text is escaped automatically and no `hydrateIcons` pass is needed.
 *
 * @module pages/transactions
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { t, locale } from '../core/i18n.js';
import { budgetService } from '../services/budget-service.js';
import { categoryService } from '../services/category-service.js';
import { Icons } from '../utils/icons.js';
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
} from '../utils/ui.js';
import { txRow } from '../components/tx-row.js';
import { openBudgetsModal } from '../components/budgets-modal.js';
import { openTxModal } from '../components/tx-modal.js';
import { openQuickAdd } from '../components/quick-add.js';
import van from '../vendor/van.js';

const { b, button, div, em, h3, i, p, span } = van.tags;
const { svg, circle } = van.tags('http://www.w3.org/2000/svg');

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
    this.watchStore('sync', () => this.render());
  }

  template() {
    const { y, m, filter } = this._view;
    const all = store.get('transactions') || [];
    const query = store.get('ui.query') || '';

    const label = new Date(y, m, 1).toLocaleDateString(locale(), {
      month: 'long',
      year: 'numeric',
    });
    const monthTx = all.filter((tx) => inMonth(tx.created_at, y, m));
    const { tin, tout, net } = monthTotals(all, y, m);
    const spent = spentByCat(all, y, m);

    const catSegs = Object.entries(spent)
      .map(([cat, v]) => ({ cat, v, color: categoryMeta(cat).color }))
      .sort((a, b2) => b2.v - a.v);
    const totalOut = catSegs.reduce((a, s) => a + s.v, 0);
    const top = catSegs.slice(0, 5);
    const restV = catSegs.slice(5).reduce((a, s) => a + s.v, 0);

    const filtered = monthTx
      .filter((tx) => {
        if (filter === 'in') return isIncome(tx);
        if (filter === 'out') return !isIncome(tx);
        if (filter.startsWith('cat:')) return tx.category === filter.slice(4) && !isIncome(tx);
        return true;
      })
      .filter((tx) => {
        if (!query) return true;
        const meta = categoryMeta(tx.category);
        return (
          (tx.description || '').toLowerCase().includes(query) ||
          meta.label.toLowerCase().includes(query)
        );
      })
      .sort((a, b2) => toMs(b2.created_at) - toMs(a.created_at));

    const progress = budgetService
      .getAllBudgetProgress()
      .sort((a, b2) => b2.percentage - a.percentage);

    const frag = document.createDocumentFragment();
    van.add(
      frag,
      div(
        { class: 'view-title' },
        span({ class: 'ic', style: 'color:var(--zap)', innerHTML: Icons.bolt }),
        t('money.title')
      ),
      this._monthNav(label),
      this._statGrid(tin, tout, net, monthTx.length),
      this._splitCard(tin, tout),
      this._donutCard(catSegs, top, restV, totalOut),
      this._budgetsCard(progress),
      this._chips(filter, catSegs),
      filtered.length ? this._groupedLedger(filtered) : this._empty(query)
    );
    return frag;
  }

  _monthNav(label) {
    return div(
      { class: 'month-nav' },
      button(
        { class: 'mnav-btn', 'data-action': 'month', 'data-d': '-1', 'aria-label': t('money.previousMonth') },
        span({ class: 'ic', innerHTML: Icons.chevL })
      ),
      span({ class: 'mnav-label' }, label),
      button(
        { class: 'mnav-btn', 'data-action': 'month', 'data-d': '1', 'aria-label': t('money.nextMonth') },
        span({ class: 'ic', innerHTML: Icons.chevR })
      )
    );
  }

  _statGrid(tin, tout, net, count) {
    const stat = (valueNode, labelText, fiat) =>
      div(
        { class: 'stat' },
        valueNode,
        span(labelText),
        fiat ? em({ class: 'stat-fiat' }, fiat) : null
      );
    return div(
      { class: 'stat-grid' },
      stat(
        b({ class: 'vin' }, span({ innerHTML: Icons.downLeft }), fmtSats(tin)),
        t('money.inThisMonth'),
        fiatLabel(tin)
      ),
      stat(
        b({ class: 'vout' }, span({ innerHTML: Icons.upRight }), fmtSats(tout)),
        t('money.outThisMonth'),
        fiatLabel(tout)
      ),
      stat(
        b({ class: 'vnet' }, `${net >= 0 ? '+' : '−'}${fmtSats(Math.abs(net))}`),
        t('money.netSats'),
        fiatLabel(net)
      ),
      stat(b(`${count}`), t('money.transactions'), null)
    );
  }

  _splitCard(tin, tout) {
    return div(
      { class: 'card' },
      div({ class: 'card-head' }, h3(t('money.incomeVsSpending'))),
      div(
        { class: 'split' },
        i({
          class: 's-in',
          style: `width:${tin + tout ? Math.round((tin / (tin + tout)) * 100) : 50}%`,
        }),
        i({ class: 's-out', style: 'flex:1' })
      ),
      div(
        { class: 'split-legend' },
        span({ class: 'li' }, `${t('money.in')} `, b(`+${fmtSats(tin)}`)),
        span({ class: 'lo' }, `${t('money.out')} `, b(`−${fmtSats(tout)}`))
      )
    );
  }

  _donutCard(catSegs, top, restV, totalOut) {
    if (!catSegs.length) {
      return div({ class: 'card' }, p({ class: 'muted-p' }, t('money.noSpending')));
    }
    const segs = [...top, ...(restV ? [{ v: restV, color: '#3B3550' }] : [])];
    return div(
      { class: 'card' },
      div({ class: 'card-head' }, h3(t('money.whereSatsWent'))),
      div(
        { class: 'donut-wrap' },
        div(
          { class: 'donut' },
          this._donut(segs),
          div({ class: 'dc' }, b(fmtSats(totalOut)), span(t('money.spent')))
        ),
        div(
          { class: 'dlegend' },
          top.map((s) =>
            div(
              { class: 'dl-row' },
              span({ class: 'dl-dot', style: `background:${s.color}` }),
              span({ class: 'dl-name' }, categoryMeta(s.cat).label),
              b({ class: 'dl-amt' }, fmtSats(s.v)),
              span({ class: 'dl-pct' }, `${Math.round((s.v / totalOut) * 100)}%`)
            )
          ),
          restV
            ? div(
                { class: 'dl-row' },
                span({ class: 'dl-dot', style: 'background:#3B3550' }),
                span({ class: 'dl-name' }, t('money.other')),
                b({ class: 'dl-amt' }, fmtSats(restV)),
                span({ class: 'dl-pct' }, `${Math.round((restV / totalOut) * 100)}%`)
              )
            : null
        )
      )
    );
  }

  _budgetsCard(progress) {
    return div(
      { class: 'card' },
      div(
        { class: 'card-head' },
        h3(t('money.budgets')),
        button(
          {
            class: 'btn btn-ghost',
            style: 'padding:6px 12px;font-size:12px',
            'data-action': 'budgets-open',
          },
          t('money.edit')
        )
      ),
      progress.length
        ? progress.map((entry) => this._budgetRow(entry))
        : p({ class: 'muted-p' }, t('money.noBudgets'))
    );
  }

  _budgetRow(progress) {
    const { budget, spent, percentage, status } = progress;
    const cat = categoryService.getCategory(budget.categoryId);
    const meta = categoryMeta(budget.categoryId);
    const pct = Math.min(100, Math.round(percentage));
    const col =
      status === 'danger' ? 'var(--out)' : status === 'warning' ? 'var(--zap)' : meta.color;
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
        div(
          { class: 'btrack' },
          i({ class: 'bfill', style: `width:${spent ? pct : 0}%;background:${col}` })
        )
      )
    );
  }

  _chips(filter, catSegs) {
    const chip = (id, text) =>
      button(
        { class: `chip ${filter === id ? 'on' : ''}`, 'data-action': 'mfilter', 'data-filter': id },
        text
      );
    return div(
      { class: 'chips' },
      chip('all', t('money.filterAll')),
      chip('in', t('money.filterIncome')),
      chip('out', t('money.filterExpense')),
      catSegs.slice(0, 4).map((s) => chip('cat:' + s.cat, categoryMeta(s.cat).label))
    );
  }

  _groupedLedger(list) {
    const entries = store.get('journal') || [];
    const linkedIds = new Set(entries.map((e) => e.linkedTransaction).filter(Boolean));
    return groupByDay(list).map((g) => [
      div({ class: 'day-label' }, dayLabel(g.items[0].created_at)),
      div(
        { class: 'card', style: 'padding:6px 16px' },
        g.items.map((tx) => txRow(tx, linkedIds))
      ),
    ]);
  }

  _empty(query) {
    return div(
      { class: 'empty' },
      div({ class: 'empty-ic', innerHTML: Icons.wallet }),
      h3(t('money.nothingHere')),
      p(query ? t('money.noMatching') : t('money.noActivity')),
      button({ class: 'btn btn-primary', 'data-action': 'log' }, t('money.logSomething'))
    );
  }

  _donut(segs) {
    const size = 150;
    const stroke = 18;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const total = segs.reduce((a, s) => a + s.v, 0) || 1;
    let acc = 0;
    const circles = segs.map((s) => {
      const len = (s.v / total) * c;
      const draw = Math.max(len - 2.5, 0);
      const el = circle({
        r,
        cx: size / 2,
        cy: size / 2,
        fill: 'none',
        stroke: s.color,
        'stroke-width': stroke,
        'stroke-dasharray': `${draw} ${c - draw}`,
        'stroke-dashoffset': -acc,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
      });
      acc += len;
      return el;
    });
    return svg(
      { viewBox: `0 0 ${size} ${size}`, width: size, height: size, style: 'max-width:150px' },
      circles
    );
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.addEventListener(this.container, 'click', (e) => {
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
        const tx = (store.get('transactions') || []).find((x) => x.id === el.dataset.id);
        if (tx) openTxModal({ tx, onSaved: () => this.render() });
      }
    });
  }
}

export default MoneyPage;
