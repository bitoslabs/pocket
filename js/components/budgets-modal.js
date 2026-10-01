/**
 * Budgets Modal - set monthly budgets per category
 *
 * VanJS view: rows are built with `van.tags`; the save handler still reads the
 * inputs by `data-cat` from the mounted content node.
 *
 * @module components/budgets-modal
 */

import { modal } from './modal.js';
import { t, categoryLabel } from '../core/i18n.js';
import { budgetService } from '../services/budget-service.js';
import { categoryService } from '../services/category-service.js';
import { Icons } from '../utils/icons.js';
import { categoryMeta, toast } from '../utils/ui.js';
import van from '../vendor/van.js';

const { div, input, label, span } = van.tags;

export function openBudgetsModal({ onSaved = null } = {}) {
  const cats = categoryService.getCategories('expense').filter((c) => c.id !== 'uncategorized');
  const existing = budgetService.getBudgets({ period: 'monthly' });
  const byCat = new Map(existing.map((b) => [b.categoryId, b]));

  const content = div(
    { style: 'margin-top:6px' },
    cats.map((c) => {
      const meta = categoryMeta(c.id);
      const b = byCat.get(c.id);
      return div(
        { class: 'bud-edit-row' },
        span(
          { class: 'be-ic', style: `background:${meta.color}1F` },
          span({
            class: 'ic',
            style: `color:${meta.color}`,
            innerHTML: Icons[meta.icon] || Icons.file,
          })
        ),
        label(categoryLabel(c.id, c.name || meta.label)),
        input({
          type: 'number',
          min: '0',
          inputmode: 'numeric',
          'data-cat': c.id,
          value: b ? Math.round(b.amount) : 0,
        })
      );
    })
  );

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
