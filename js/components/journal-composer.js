/**
 * Journal Composer - new private entry (mood, tags, optional attached money)
 *
 * VanJS view: mood, tags, attach and direction are reactive states, so the old
 * `innerHTML` refresh helpers are gone. The textarea/amount/tag inputs stay
 * uncontrolled and are read on save.
 *
 * @module components/journal-composer
 */

import { modal } from './modal.js';
import { t } from '../core/i18n.js';
import { journalService } from '../services/journal-service.js';
import { zapService } from '../services/zap-service.js';
import { categoryService } from '../services/category-service.js';
import { authService } from '../services/auth-service.js';
import { Icons } from '../utils/icons.js';
import { MOODS, categoryMeta, moodLabel, playFX, toast } from '../utils/ui.js';
import van from '../vendor/van.js';

const { button, div, input, span, textarea } = van.tags;

const DIR_TO_TYPE = { out: 'expense', in: 'income' };

export function openComposer({ mood = null, onSaved = null } = {}) {
  const moodState = van.state(mood);
  const tagsState = van.state([]);
  const attachState = van.state(false);
  const dirState = van.state('out');
  const catState = van.state(null);

  const saving = { value: false };
  const catsFor = (d) => categoryService.getCategories(DIR_TO_TYPE[d]);

  const textareaEl = textarea({
    id: 'composeText',
    maxlength: '2000',
    placeholder: t('composer.placeholder'),
  });

  const moodRowEl = div({ class: 'mood-row', id: 'moodRow' });
  van.derive(() => {
    const sel = moodState.val;
    moodRowEl.replaceChildren();
    van.add(
      moodRowEl,
      MOODS.map((m) =>
        button(
          {
            type: 'button',
            class: `mood-chip ${sel === m.id ? 'on' : ''}`,
            'data-mood': m.id,
            onclick: () => {
              moodState.val = moodState.val === m.id ? null : m.id;
            },
          },
          `${m.emoji} ${moodLabel(m)}`
        )
      )
    );
  });

  const tagChipsEl = div({ id: 'tagChips', style: 'display:contents' });
  van.derive(() => {
    tagChipsEl.replaceChildren();
    van.add(
      tagChipsEl,
      tagsState.val.map((tag, i) =>
        span(
          { class: 'tchip' },
          `#${tag}`,
          button(
            {
              type: 'button',
              'data-remove-tag': i,
              'aria-label': t('composer.removeTag'),
              onclick: () => {
                tagsState.val = tagsState.val.filter((_, idx) => idx !== i);
              },
            },
            span({ class: 'ic', innerHTML: Icons.x })
          )
        )
      )
    );
  });

  const tagInput = input({
    id: 'tagInput',
    placeholder: t('composer.addTag'),
    autocomplete: 'off',
    onkeydown: (e) => {
      if (e.key !== 'Enter' && e.key !== ',') return;
      e.preventDefault();
      const v = e.target.value
        .trim()
        .toLowerCase()
        .replace(/^#/, '')
        .replace(/[^a-z0-9_-]/g, '');
      if (!v) return;
      if (tagsState.val.includes(v)) return toast(t('composer.tagAlready'), 'warning');
      if (tagsState.val.length >= 5) return toast(t('composer.maxTags'), 'warning');
      tagsState.val = [...tagsState.val, v];
      e.target.value = '';
    },
  });

  const attachToggle = button(
    {
      type: 'button',
      class: () => `attach-toggle ${attachState.val ? 'on' : ''}`,
      id: 'attachToggle',
      onclick: () => {
        attachState.val = !attachState.val;
      },
    },
    span({ class: 'ic', innerHTML: Icons.bolt }),
    span(
      { id: 'attachLabel' },
      () => (attachState.val ? t('composer.attachDone') : t('composer.attachPrompt'))
    )
  );

  const amtInput = input({
    id: 'composeAmt',
    type: 'number',
    min: '1',
    inputmode: 'numeric',
    placeholder: t('composer.amount'),
    autocomplete: 'off',
  });

  const segBtn = (d, id, icon, labelKey) =>
    button(
      {
        type: 'button',
        id,
        class: () => (dirState.val === d ? (d === 'out' ? 'on-out' : 'on-in') : ''),
        onclick: () => {
          dirState.val = d;
          catState.val = null;
        },
      },
      span({ class: 'ic', innerHTML: Icons[icon] }),
      t(labelKey)
    );

  const attachCats = div({ class: 'cat-chips', id: 'attachCats' });
  van.derive(() => {
    const d = dirState.val;
    const cats = catsFor(d);
    let sel = catState.val;
    if (!sel || !cats.some((c) => c.id === sel)) {
      sel = cats[0]?.id || 'other';
      catState.val = sel;
    }
    attachCats.replaceChildren();
    van.add(
      attachCats,
      cats.map((c) => {
        const meta = categoryMeta(c.id);
        return button(
          {
            type: 'button',
            class: `cat-chip ${sel === c.id ? 'on' : ''}`,
            style: `--cc:${meta.color}`,
            'data-attach-cat': c.id,
            onclick: () => {
              catState.val = c.id;
            },
          },
          span({
            class: 'ic',
            style: `color:${meta.color}`,
            innerHTML: Icons[meta.icon] || Icons.file,
          }),
          c.name || meta.label
        );
      })
    );
  });

  const attachBox = div(
    { class: 'attach-box', id: 'attachBox', hidden: () => !attachState.val },
    div({ class: 'seg' }, segBtn('out', 'segOut', 'upRight', 'composer.spent'), segBtn('in', 'segIn', 'downLeft', 'composer.received')),
    div({ class: 'amt-line' }, amtInput, span(t('common.sats'))),
    attachCats
  );

  const content = div(
    textareaEl,
    moodRowEl,
    div({ class: 'tag-edit' }, tagChipsEl, tagInput),
    attachToggle,
    attachBox
  );

  const submit = async () => {
    if (saving.value) return false;
    const text = textareaEl.value.trim();
    if (!text) {
      toast(t('composer.writeSomething'), 'error');
      return false;
    }

    // Guests can still write: entries are stored locally and encrypted/synced
    // automatically after they connect.
    const localOnly = !authService.isAuthenticated();
    const dir = dirState.val;
    const cat = catState.val;

    saving.value = true;
    try {
      let linkedTransaction = null;
      const amt = parseInt(amtInput.value, 10);

      if (attachState.val && amt > 0) {
        const tx = await zapService.createManualTransaction({
          type: DIR_TO_TYPE[dir],
          amount: amt,
          description: '',
          category: cat,
        });
        linkedTransaction = tx.id;
        if (DIR_TO_TYPE[dir] === 'income' || cat === 'tips' || cat === 'zaps') {
          playFX(amt, DIR_TO_TYPE[dir] === 'income');
        }
      }

      const firstLine = text.split('\n')[0].slice(0, 60);
      await journalService.create({
        title: firstLine || t('journal.journalEntry'),
        text,
        tag: tagsState.val[0] || 'personal',
        tags: tagsState.val,
        mood: moodState.val,
        linkedTransaction,
      });

      modal.close();
      toast(
        localOnly ? t('composer.savedLocal') : t('composer.savedPrivate'),
        localOnly ? 'info' : 'success'
      );
      onSaved?.();
    } catch (err) {
      toast(err.message || t('composer.couldNotSave'), 'error');
    } finally {
      saving.value = false;
    }
    return false;
  };

  const actions = [
    {
      label: t('composer.saveEntry'),
      variant: 'btn-primary',
      closeOnClick: false,
      handler: submit,
    },
  ];

  modal.open({ title: t('composer.title'), content, actions });
  setTimeout(() => textareaEl.focus(), 320);
}

export default openComposer;
