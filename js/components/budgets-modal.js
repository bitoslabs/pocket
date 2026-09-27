/**
 * Budgets Modal - set monthly budgets per category
 *
 * @module components/budgets-modal
 */

import { modal } from './modal.js';
import { t } from '../core/i18n.js';
import { budgetService } from '../services/budget-service.js';
import { categoryService } from '../services/category-service.js';
import { Icons } from '../utils/icons.js';
import { categoryMeta, toast } from '../utils/ui.js';

export function openBudgetsModal({ onSaved = null } = {}) {
  const cats = categoryService.getCategories('expense').filter((c) => c.id !== 'uncategorized');
  const existing = budgetService.getBudgets({ period: 'monthly' });
  const byCat = new Map(existing.map((b) => [b.categoryId, b]));

  const content = document.createElement('div');
  content.style.marginTop = '6px';
  content.innerHTML = cats
    .map((c) => {
      const meta = categoryMeta(c.id);
      const b = byCat.get(c.id);
      return `<div class="bud-edit-row">
        <span class="be-ic" style="background:${meta.color}1F">
          <span class="ic" style="color:${meta.color}">${Icons[meta.icon] || Icons.file}</span>
        </span>
        <label>${c.name || meta.label}</label>
        <input type="number" min="0" inputmode="numeric" data-cat="${c.id}"
          value="${b ? Math.round(b.amount) : 0}" />
      </div>`;
    })
    .join('');

  const actions = [
    {
      label: t('common.save'),
      variant: 'btn-primary',
      closeOnClick: false,
      handler: async () => {
        const inputs = content.querySelectorAll('input[data-cat]');
        try {
          for (const inp of inputs) {
            const catId = inp.dataset.cat;
            const amount = parseInt(inp.value, 10) || 0;
            const b = byCat.get(catId);
            if (amount > 0) {
              if (b) {
                await budgetService.updateBudget(b.id, { amount });
              } else {
                const cat = cats.find((c) => c.id === catId);
                const meta = categoryMeta(catId);
                await budgetService.createBudget({
                  name: cat?.name || meta.label,
                  categoryId: catId,
                  amount,
                  period: 'monthly',
                });
              }
            } else if (b) {
              await budgetService.deleteBudget(b.id);
            }
          }
          modal.close();
          toast(t('budgets.saved'), 'success');
          onSaved?.();
        } catch (err) {
          toast(err.message || t('budgets.couldNotSave'), 'error');
        }
        return false;
      },
    },
  ];

  modal.open({ title: t('budgets.title'), content, actions });
}

export default openBudgetsModal;
