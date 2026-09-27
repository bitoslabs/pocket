/**
 * Journal Composer - new private entry (mood, tags, optional attached money)
 *
 * @module components/journal-composer
 */

import { modal } from './modal.js';
import { journalService } from '../services/journal-service.js';
import { zapService } from '../services/zap-service.js';
import { categoryService } from '../services/category-service.js';
import { authService } from '../services/auth-service.js';
import { Icons } from '../utils/icons.js';
import {
  MOODS,
  categoryMeta,
  playFX,
  toast,
} from '../utils/ui.js';

const DIR_TO_TYPE = { out: 'expense', in: 'income' };

export function openComposer({ mood = null, onSaved = null } = {}) {
  const state = {
    mood,
    tags: [],
    attach: false,
    dir: 'out',
    cat: null,
    saving: false,
  };

  const content = document.createElement('div');

  const catsFor = (d) => categoryService.getCategories(DIR_TO_TYPE[d]);

  const ensureCat = () => {
    const cats = catsFor(state.dir);
    if (!state.cat || !cats.some((c) => c.id === state.cat)) {
      state.cat = cats[0]?.id || 'other';
    }
  };

  const moodRow = () =>
    MOODS.map(
      (m) =>
        `<button type="button" class="mood-chip ${state.mood === m.id ? 'on' : ''}"
           data-mood="${m.id}">${m.emoji} ${m.label}</button>`
    ).join('');

  const tagChips = () =>
    state.tags
      .map(
        (t, i) =>
          `<span class="tchip">#${t}<button type="button" data-remove-tag="${i}" aria-label="Remove">${Icons.x}</button></span>`
      )
      .join('');

  const catChips = () => {
    ensureCat();
    return catsFor(state.dir)
      .map((c) => {
        const meta = categoryMeta(c.id);
        return `<button type="button" class="cat-chip ${state.cat === c.id ? 'on' : ''}"
          style="--cc:${meta.color}" data-attach-cat="${c.id}">
          <span class="ic" style="color:${meta.color}">${Icons[meta.icon] || Icons.file}</span>${c.name || meta.label}
        </button>`;
      })
      .join('');
  };

  content.innerHTML = `
    <textarea id="composeText" maxlength="2000"
      placeholder="How was your day? What are you grateful for?"></textarea>
    <div class="mood-row" id="moodRow">${moodRow()}</div>
    <div class="tag-edit">
      <div id="tagChips" style="display:contents">${tagChips()}</div>
      <input id="tagInput" placeholder="Add tag, press Enter" autocomplete="off" />
    </div>
    <button type="button" class="attach-toggle ${state.attach ? 'on' : ''}" id="attachToggle">
      <span class="ic">${Icons.bolt}</span>
      <span id="attachLabel">${state.attach ? 'Money attached ⚡' : 'Attach money to this entry'}</span>
    </button>
    <div class="attach-box" id="attachBox" ${state.attach ? '' : 'hidden'}>
      <div class="seg">
        <button type="button" id="segOut" class="${state.dir === 'out' ? 'on-out' : ''}">
          <span class="ic">${Icons.upRight}</span>Spent
        </button>
        <button type="button" id="segIn" class="${state.dir === 'in' ? 'on-in' : ''}">
          <span class="ic">${Icons.downLeft}</span>Received
        </button>
      </div>
      <div class="amt-line">
        <input id="composeAmt" type="number" min="1" inputmode="numeric" placeholder="Amount" autocomplete="off" />
        <span>sats</span>
      </div>
      <div class="cat-chips" id="attachCats">${catChips()}</div>
    </div>
  `;

  const textarea = content.querySelector('#composeText');
  const moodRowEl = content.querySelector('#moodRow');
  const tagChipsEl = content.querySelector('#tagChips');
  const tagInput = content.querySelector('#tagInput');
  const attachToggle = content.querySelector('#attachToggle');
  const attachBox = content.querySelector('#attachBox');
  const attachCats = content.querySelector('#attachCats');

  const refreshTags = () => {
    tagChipsEl.innerHTML = tagChips();
  };
  const refreshCats = () => {
    attachCats.innerHTML = catChips();
  };
  const refreshSeg = () => {
    content.querySelector('#segOut').className = state.dir === 'out' ? 'on-out' : '';
    content.querySelector('#segIn').className = state.dir === 'in' ? 'on-in' : '';
  };

  content.addEventListener('click', (e) => {
    const moodBtn = e.target.closest('[data-mood]');
    if (moodBtn) {
      const id = moodBtn.dataset.mood;
      state.mood = state.mood === id ? null : id;
      moodRowEl.innerHTML = moodRow();
      return;
    }
    const rm = e.target.closest('[data-remove-tag]');
    if (rm) {
      state.tags.splice(Number(rm.dataset.removeTag), 1);
      refreshTags();
      return;
    }
    if (e.target.closest('#attachToggle')) {
      state.attach = !state.attach;
      attachToggle.classList.toggle('on', state.attach);
      content.querySelector('#attachLabel').textContent = state.attach
        ? 'Money attached ⚡'
        : 'Attach money to this entry';
      attachBox.hidden = !state.attach;
      return;
    }
    if (e.target.closest('#segOut') || e.target.closest('#segIn')) {
      state.dir = e.target.closest('#segIn') ? 'in' : 'out';
      state.cat = null;
      refreshSeg();
      refreshCats();
      return;
    }
    const cat = e.target.closest('[data-attach-cat]');
    if (cat) {
      state.cat = cat.dataset.attachCat;
      refreshCats();
    }
  });

  tagInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const v = tagInput.value
      .trim()
      .toLowerCase()
      .replace(/^#/, '')
      .replace(/[^a-z0-9_-]/g, '');
    if (!v) return;
    if (state.tags.includes(v)) return toast('Tag already added', 'warning');
    if (state.tags.length >= 5) return toast('Max 5 tags', 'warning');
    state.tags.push(v);
    tagInput.value = '';
    refreshTags();
  });

  const actions = [
    {
      label: 'Save entry',
      variant: 'btn-primary',
      closeOnClick: false,
      handler: () => submit(textarea, state, modal, onSaved),
    },
  ];

  modal.open({ title: 'New entry', content, actions });
  setTimeout(() => textarea.focus(), 320);
}

async function submit(textarea, state, modalMgr, onSaved) {
  if (state.saving) return false;
  const text = textarea.value.trim();
  if (!text) {
    toast('Write something first ✍️', 'error');
    return false;
  }

  if (!authService.isAuthenticated()) {
    modalMgr.close();
    const { loginModal } = await import('./login-modal.js');
    toast('Connect your Nostr account to save entries', 'warning');
    loginModal.show();
    return false;
  }

  state.saving = true;
  try {
    let linkedTransaction = null;
    const amt = parseInt(textarea.parentElement.querySelector('#composeAmt')?.value, 10);
    const attachOn = state.attach;

    if (attachOn && amt > 0) {
      const tx = await zapService.createManualTransaction({
        type: DIR_TO_TYPE[state.dir],
        amount: amt,
        description: '',
        category: state.cat,
      });
      linkedTransaction = tx.id;
      if (DIR_TO_TYPE[state.dir] === 'income' || state.cat === 'tips' || state.cat === 'zaps') {
        playFX(amt, DIR_TO_TYPE[state.dir] === 'income');
      }
    }

    const firstLine = text.split('\n')[0].slice(0, 60);
    await journalService.create({
      title: firstLine || 'Journal entry',
      text,
      tag: state.tags[0] || 'personal',
      tags: state.tags,
      mood: state.mood,
      linkedTransaction,
    });

    modalMgr.close();
    toast('Entry saved to your private journal 🔒', 'success');
    onSaved?.();
  } catch (err) {
    toast(err.message || 'Could not save entry', 'error');
  } finally {
    state.saving = false;
  }
  return false;
}

export default openComposer;
