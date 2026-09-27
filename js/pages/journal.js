/**
 * Journal Page - private timeline of encrypted entries
 *
 * @module pages/journal
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { journalService } from '../services/journal-service.js';
import { storageService } from '../services/storage-service.js';
import { modal } from '../components/modal.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import {
  categoryMeta,
  dayLabel,
  escapeHtml,
  fiatLabel,
  fmtSats,
  groupByDay,
  isIncome,
  moodById,
  moneyForEntry,
  toast,
  toMs,
} from '../utils/ui.js';
import { openComposer } from '../components/journal-composer.js';
import { openTxModal } from '../components/tx-modal.js';

export class JournalPage extends Component {
  mounted() {
    this.watchStore('journal', () => this.render());
    this.watchStore('transactions', () => this.render());
    this.watchStore('ui.query', () => this.render());
    this.watchStore('isAuthenticated', () => this.render());
    this.watchStore('price', () => this.render());
  }

  template() {
    const authenticated = store.get('isAuthenticated');

    if (!authenticated) {
      return `
        <div class="view-title">Journal <span class="priv-pill">${Icons.eyeOff} private</span></div>
        <div class="empty">
          <div class="empty-ic">${Icons.lock}</div>
          <h3>Connect to unlock</h3>
          <p>Your journal is encrypted and stored on Nostr. Connect your account to read it.</p>
          <button class="btn btn-primary" data-action="connect">Connect with Nostr</button>
        </div>
      `;
    }

    const query = store.get('ui.query') || '';
    const all = (store.get('journal') || []).slice().sort(
      (a, b) => toMs(b.created_at) - toMs(a.created_at)
    );
    const entries = all.filter((e) => {
      if (!query) return true;
      const hay = `${e.title || ''} ${e.text || ''} ${(this._tagsOf(e) || []).join(' ')}`.toLowerCase();
      return hay.includes(query);
    });

    if (!entries.length) {
      return `
        <div class="view-title">Journal <span class="priv-pill">${Icons.eyeOff} private</span></div>
        <div class="empty">
          <div class="empty-ic">${Icons.book}</div>
          <h3>${query ? 'No matches' : 'Your journal starts today'}</h3>
          <p>${
            query ? 'Try different words.' : 'No one reads this but you. That is the point.'
          }</p>
          ${
            query
              ? ''
              : '<button class="btn btn-primary" data-action="new-entry">Write first entry</button>'
          }
        </div>
      `;
    }

    const transactions = store.get('transactions') || [];
    const groups = groupByDay(entries, (e) => e.created_at);

    return `
      <div class="view-title">Journal <span class="priv-pill">${Icons.eyeOff} private</span></div>
      ${groups
        .map(
          (g) =>
            `<div class="day-label">${dayLabel(g.items[0].created_at)}</div>` +
            g.items.map((e) => this._entryCard(e, transactions)).join('')
        )
        .join('')}
    `;
  }

  _tagsOf(entry) {
    if (Array.isArray(entry.tags) && entry.tags.length) return entry.tags;
    return entry.tag ? [entry.tag] : [];
  }

  _entryCard(entry, transactions) {
    const mood = moodById(entry.mood);
    const money = moneyForEntry(entry, transactions);
    const long = (entry.text || '').length > 280;
    const tags = this._tagsOf(entry);

    return `<article class="jentry rise" data-id="${entry.id}">
      <div class="jentry-top">
        ${
          mood
            ? `<span class="jmood"><span class="je">${mood.emoji}</span>${mood.label}</span>`
            : '<span class="jmood"></span>'
        }
        <span class="jtime">${new Date(toMs(entry.created_at)).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })}</span>
      </div>
      <p class="jtext">${escapeHtml(entry.text || '')}</p>
      ${long ? '<button class="more-btn" data-action="expand">Show more</button>' : ''}
      ${
        tags.length
          ? `<div class="jtags">${tags
              .map(
                (t) =>
                  `<button class="tag" data-action="jtag" data-tag="${escapeHtml(t)}">#${escapeHtml(
                    t
                  )}</button>`
              )
              .join('')}</div>`
          : ''
      }
      ${
        money.length
          ? `<div class="jmoney">${money
              .map((t) => {
                const meta = categoryMeta(t.category);
                const income = isIncome(t);
                return `<span class="mchip ${income ? 'in' : 'out'}">${Icons.bolt}${
                  income ? '+' : '−'
                }${fmtSats(t.amount)}${fiatLabel(t.amount) ? ' · ' + fiatLabel(t.amount) : ''} · ${
                  meta.label
                }</span>`;
              })
              .join('')}</div>`
          : ''
      }
      <div class="jacts">
        <button class="act" data-action="attach-money" data-id="${entry.id}">
          <span class="ic">${Icons.bolt}</span>Money
        </button>
        <button class="act danger" data-action="entry-del" data-id="${entry.id}">
          <span class="ic">${Icons.trash}</span><span class="dl">Delete</span>
        </button>
      </div>
    </article>`;
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.container.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || !this.container.contains(el)) return;
      const action = el.dataset.action;

      if (action === 'connect') {
        const { loginModal } = await import('../components/login-modal.js');
        loginModal.show();
      } else if (action === 'new-entry') {
        openComposer();
      } else if (action === 'expand') {
        const card = el.closest('.jentry');
        const open = card.classList.toggle('open');
        el.textContent = open ? 'Show less' : 'Show more';
      } else if (action === 'jtag') {
        store.set('ui.query', el.dataset.tag);
      } else if (action === 'attach-money') {
        const id = el.dataset.id;
        openTxModal({
          dir: 'out',
          onSaved: (tx) => {
            if (tx) this._linkMoney(id, tx.id);
          },
        });
      } else if (action === 'entry-del') {
        const id = el.dataset.id;
        const confirmed = await modal.confirm({
          title: 'Delete entry',
          message: 'Delete this journal entry? This cannot be undone.',
          confirmText: 'Delete',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await journalService.delete(id);
          toast('Entry deleted');
        } catch (err) {
          toast(err.message || 'Could not delete entry', 'error');
        }
      }
    });
  }

  async _linkMoney(entryId, txId) {
    const entries = store.get('journal') || [];
    const idx = entries.findIndex((e) => e.id === entryId);
    if (idx < 0) return;
    const updatedEntry = { ...entries[idx], linkedTransaction: txId };
    const updated = [...entries];
    updated[idx] = updatedEntry;
    store.set('journal', updated);
    try {
      await storageService.put('journal', updatedEntry);
    } catch (e) {
      /* ignore */
    }
    toast('Money attached to entry ⚡');
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default JournalPage;
