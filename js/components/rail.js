/**
 * Rail Component - right-hand insights (wide desktop only)
 *
 * @module components/rail
 */

import { Component } from '../core/component.js';
import { Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { t } from '../core/i18n.js';
import { budgetService } from '../services/budget-service.js';
import { categoryService } from '../services/category-service.js';
import { hydrateIcons } from '../utils/icons.js';
import { categoryMeta, fmtSats, toMs, txRowHtml } from '../utils/ui.js';

export class Rail extends Component {
  mounted() {
    this.watchStore('transactions', () => this.render());
    this.watchStore('price', () => this.render());

    // Budgets live outside the reactive store, so react to their events instead.
    [
      Events.BUDGETS_LOADED,
      Events.BUDGET_CREATED,
      Events.BUDGET_UPDATED,
      Events.BUDGET_DELETED,
    ].forEach((event) => this.watchEvent(event, () => this.render()));
  }

  template() {
    const groups = groupBudgetWatch(budgetService.getAllBudgetProgress());

    const recent = (store.get('transactions') || [])
      .slice()
      .sort((a, b) => toMs(b.created_at) - toMs(a.created_at))
      .slice(0, 5);

    const entries = store.get('journal') || [];
    const linkedIds = new Set(entries.map((e) => e.linkedTransaction).filter(Boolean));

    return `
      <div class="card">
        <div class="card-head"><h3>${t('rail.budgetWatch')}</h3>${
          groups.length
            ? `<button class="btn btn-ghost btn-sm" data-action="open-budgets">${t(
                'rail.manage'
              )}</button>`
            : ''
        }</div>
        ${
          groups.length
            ? groups
                .map(
                  (g) => `<div class="bud-group">
                    <div class="bud-group-head">${t('periods.' + g.period)}</div>
                    ${g.rows.map((p) => this._budgetRow(p)).join('')}
                  </div>`
                )
                .join('')
            : `<p class="muted-p">${t('rail.noBudgets')}</p><button class="btn btn-primary btn-block" data-action="open-budgets">${t(
                'rail.setBudget'
              )}</button>`
        }
      </div>
      <div class="card">
        <div class="card-head"><h3>${t('rail.recent')}</h3></div>
        ${
          recent.length
            ? recent.map((tx) => txRowHtml(tx, linkedIds)).join('')
            : `<p class="muted-p">${t('rail.noActivity')}</p>`
        }
      </div>
    `;
  }

  _budgetRow(p) {
    const { budget, percentage, status } = p;
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
        <b class="${cls}">${Math.round(percentage)}%</b></div>
      <div class="btrack"><i class="bfill" style="width:${pct}%;background:${col}"></i></div>
    </div></div>`;
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.addEventListener(this.container, 'click', async (e) => {
      const budgetBtn = e.target.closest('[data-action="open-budgets"]');
      if (budgetBtn && this.container.contains(budgetBtn)) {
        const { openBudgetsModal } = await import('./budgets-modal.js');
        openBudgetsModal();
        return;
      }

      const el = e.target.closest('[data-action="edit-tx"]');
      if (!el || !this.container.contains(el)) return;
      const tx = (store.get('transactions') || []).find((t) => t.id === el.dataset.id);
      if (!tx) return;
      const { openTxModal } = await import('./tx-modal.js');
      openTxModal({ tx });
    });
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default Rail;

const PERIOD_ORDER = ['daily', 'weekly', 'monthly', 'yearly'];
const STATUS_SEVERITY = { danger: 2, warning: 1, 'on-track': 0 };

/**
 * Choose and group the rows shown in the Budget watch card.
 *
 * Picks the most urgent rows first (status severity, then utilization), but
 * when several periods are in use caps each period so one period cannot fill
 * the card and hide the others. Result is grouped by period so percentages are
 * comparable within a group.
 *
 * @param {Array} active - budget progress objects from getAllBudgetProgress()
 * @param {number} [max] - maximum rows to show
 * @returns {Array<{period: string, rows: Array}>}
 */
export function groupBudgetWatch(active, max = 4) {
  const bySeverity = (a, b) =>
    STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status] || b.percentage - a.percentage;

  const sorted = [...active].sort(bySeverity);
  const present = PERIOD_ORDER.filter((period) =>
    sorted.some((p) => p.budget.period === period)
  );
  const perPeriodCap = present.length > 1 ? 2 : max;

  const counts = {};
  const shown = [];
  for (const p of sorted) {
    if (shown.length >= max) break;
    const period = p.budget.period;
    counts[period] = counts[period] || 0;
    if (counts[period] >= perPeriodCap) continue;
    counts[period]++;
    shown.push(p);
  }

  return present
    .map((period) => ({ period, rows: shown.filter((p) => p.budget.period === period) }))
    .filter((g) => g.rows.length);
}
