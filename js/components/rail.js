/**
 * Rail Component - right-hand insights (wide desktop only)
 *
 * VanJS view: each card is rebuilt by a `van.derive` effect when its data
 * changes, so nothing re-renders the whole rail or re-hydrates icons.
 *
 * @module components/rail
 */

import { Component } from '../core/component.js';
import { Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { t } from '../core/i18n.js';
import { budgetService } from '../services/budget-service.js';
import { categoryService } from '../services/category-service.js';
import { categoryMeta, fmtSats, toMs } from '../utils/ui.js';
import { txRow } from './tx-row.js';
import van from '../vendor/van.js';

const { b, button, div, h3, i, p, span } = van.tags;

export class Rail extends Component {
  beforeMount() {
    this._transactions = this.storeState('transactions');
    this._budgets = van.state(budgetService.getAllBudgetProgress());

    // Rebuild the cards when the UI language changes too.
    this._lang = van.state(0);
    this.watchEvent(Events.LANGUAGE_CHANGED, () => {
      this._lang.val++;
    });

    // Budgets live outside the reactive store, so react to their events instead.
    [
      Events.BUDGETS_LOADED,
      Events.BUDGET_CREATED,
      Events.BUDGET_UPDATED,
      Events.BUDGET_DELETED,
    ].forEach((event) =>
      this.watchEvent(event, () => {
        this._budgets.val = budgetService.getAllBudgetProgress();
      })
    );

    this._budgetCard = div({ class: 'card' });
    this._recentCard = div({ class: 'card' });
    this._renderBudgetCard();
    this._renderRecentCard();
  }

  template() {
    return [this._budgetCard, this._recentCard];
  }

  _renderBudgetCard() {
    van.derive(() => {
      // Read deps so the effect re-runs when budgets or language change.
      const groups = groupBudgetWatch(this._budgets.val);
      this._lang.val;

      this._budgetCard.replaceChildren();
      van.add(
        this._budgetCard,
        div(
          { class: 'card-head' },
          h3(t('rail.budgetWatch')),
          groups.length
            ? button(
                {
                  class: 'btn btn-ghost btn-sm',
                  'data-action': 'open-budgets',
                  onclick: () => this._openBudgets(),
                },
                t('rail.manage')
              )
            : null
        ),
        groups.length
          ? groups.map((g) =>
              div(
                { class: 'bud-group' },
                div({ class: 'bud-group-head' }, t('periods.' + g.period)),
                ...g.rows.map((row) => this._budgetRow(row))
              )
            )
          : [
              p({ class: 'muted-p' }, t('rail.noBudgets')),
              button(
                {
                  class: 'btn btn-primary btn-block',
                  'data-action': 'open-budgets',
                  onclick: () => this._openBudgets(),
                },
                t('rail.setBudget')
              ),
            ]
      );
    });
  }

  _renderRecentCard() {
    van.derive(() => {
      const recent = [...(this._transactions.val || [])]
        .sort((a, b2) => toMs(b2.created_at) - toMs(a.created_at))
        .slice(0, 5);
      const entries = store.get('journal') || [];
      const linkedIds = new Set(entries.map((e) => e.linkedTransaction).filter(Boolean));
      this._lang.val;

      this._recentCard.replaceChildren();
      van.add(
        this._recentCard,
        div({ class: 'card-head' }, h3(t('rail.recent'))),
        recent.length
          ? recent.map((tx) => txRow(tx, linkedIds))
          : p({ class: 'muted-p' }, t('rail.noActivity'))
      );
    });
  }

  _budgetRow(progress) {
    const { budget, percentage, status } = progress;
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
          b({ class: cls }, `${Math.round(percentage)}%`)
        ),
        div({ class: 'btrack' }, i({ class: 'bfill', style: `width:${pct}%;background:${col}` }))
      )
    );
  }

  async _openBudgets() {
    const { openBudgetsModal } = await import('./budgets-modal.js');
    openBudgetsModal();
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.addEventListener(this.container, 'click', async (e) => {
      const el = e.target.closest('[data-action="edit-tx"]');
      if (!el || !this.container.contains(el)) return;
      const tx = (this._transactions.val || []).find((t) => t.id === el.dataset.id);
      if (!tx) return;
      const { openTxModal } = await import('./tx-modal.js');
      openTxModal({ tx });
    });
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
