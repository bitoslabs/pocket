/**
 * Rail Component - right-hand insights (wide desktop only)
 *
 * @module components/rail
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { budgetService } from '../services/budget-service.js';
import { categoryService } from '../services/category-service.js';
import { hydrateIcons } from '../utils/icons.js';
import { categoryMeta, fmtSats, toMs, txRowHtml } from '../utils/ui.js';

export class Rail extends Component {
  mounted() {
    this.watchStore('transactions', () => this.render());
    this.watchStore('price', () => this.render());
  }

  template() {
    const progress = [...budgetService.getAllBudgetProgress()]
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 4);

    const recent = (store.get('transactions') || [])
      .slice()
      .sort((a, b) => toMs(b.created_at) - toMs(a.created_at))
      .slice(0, 5);

    const entries = store.get('journal') || [];
    const linkedIds = new Set(entries.map((e) => e.linkedTransaction).filter(Boolean));

    return `
      <div class="card">
        <div class="card-head"><h3>Budget watch</h3></div>
        ${
          progress.length
            ? progress
                .map((p) => {
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
                  const cls =
                    status === 'danger' ? 'over' : status === 'warning' ? 'warn' : '';
                  return `<div class="bud-row"><div class="bud-info">
                    <div class="bud-top"><span>${cat?.name || meta.label}</span>
                      <b class="${cls}">${pct}%</b></div>
                    <div class="btrack"><i class="bfill" style="width:${pct}%;background:${col}"></i></div>
                  </div></div>`;
                })
                .join('')
            : '<p class="muted-p">No budgets yet.</p>'
        }
      </div>
      <div class="card">
        <div class="card-head"><h3>Recent</h3></div>
        ${
          recent.length
            ? recent.map((t) => txRowHtml(t, linkedIds)).join('')
            : '<p class="muted-p">No activity yet.</p>'
        }
      </div>
    `;
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.container.addEventListener('click', async (e) => {
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
