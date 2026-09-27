/**
 * Journal Page - private timeline of encrypted entries
 *
 * @module pages/journal
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { t, locale } from '../core/i18n.js';
import { journalService } from '../services/journal-service.js';
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
    const banner = authenticated ? '' : this._guestBanner();

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
        <div class="view-title">${t('journal.title')} <span class="priv-pill">${Icons.eyeOff} ${
        authenticated ? t('journal.private') : t('journal.local')
      }</span></div>
        ${banner}
        <div class="empty">
          <div class="empty-ic">${Icons.book}</div>
          <h3>${query ? t('journal.noMatches') : t('journal.startsToday')}</h3>
          <p>${
            query ? t('journal.tryDifferentWords') : t('journal.noOneReads')
          }</p>
          ${
            query
              ? ''
              : `<button class="btn btn-primary" data-action="new-entry">${t(
                  'journal.writeFirst'
                )}</button>`
          }
        </div>
      `;
    }

    const transactions = store.get('transactions') || [];
    const groups = groupByDay(entries, (e) => e.created_at);

    return `
      <div class="view-title">${t('journal.title')} <span class="priv-pill">${Icons.eyeOff} ${
      authenticated ? t('journal.private') : t('journal.local')
    }</span></div>
      ${banner}
      ${groups
        .map(
          (g) =>
            `<div class="day-label">${dayLabel(g.items[0].created_at)}</div>` +
            g.items.map((e) => this._entryCard(e, transactions)).join('')
        )
        .join('')}
    `;
  }

  _guestBanner() {
    return `
      <div class="card">
        <div class="card-head"><h3>${t('journal.localModeTitle')}</h3></div>
        <p class="muted-p" style="text-align:left;padding:0 0 12px">
          ${t('journal.localModeBody')}
        </p>
        <button class="btn btn-primary btn-block" data-action="connect">${t(
          'journal.connectButton'
        )}</button>
      </div>
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
        <span class="jtime">${new Date(toMs(entry.created_at)).toLocaleTimeString(locale(), {
          hour: 'numeric',
          minute: '2-digit',
        })}</span>
      </div>
      <p class="jtext">${escapeHtml(entry.text || '')}</p>
      ${long ? `<button class="more-btn" data-action="expand">${t('common.showMore')}</button>` : ''}
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
        <button class="act" data-action="entry-edit" data-id="${entry.id}">
          <span class="ic">${Icons.edit}</span>${t('common.edit')}
        </button>
        <button class="act" data-action="attach-money" data-id="${entry.id}">
          <span class="ic">${Icons.bolt}</span>${t('money.title')}
        </button>
        <button class="act danger" data-action="entry-del" data-id="${entry.id}">
          <span class="ic">${Icons.trash}</span><span class="dl">${t('common.delete')}</span>
        </button>
      </div>
    </article>`;
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.addEventListener(this.container, 'click', async (e) => {
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
        el.textContent = open ? t('common.showLess') : t('common.showMore');
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
      } else if (action === 'entry-edit') {
        const entry = (store.get('journal') || []).find((e) => e.id === el.dataset.id);
        if (entry) this._openEditEntry(entry);
      } else if (action === 'entry-del') {
        const id = el.dataset.id;
        const confirmed = await modal.confirm({
          title: t('journal.deleteTitle'),
          message: t('journal.deleteMessage'),
          confirmText: t('common.delete'),
          danger: true,
        });
        if (!confirmed) return;
        try {
          await journalService.delete(id);
          toast(t('journal.entryDeleted'));
        } catch (err) {
          toast(err.message || t('journal.couldNotDelete'), 'error');
        }
      }
    });
  }

  _openEditEntry(entry) {
    const content = document.createElement('div');
    content.innerHTML = `
      <textarea id="editEntryText" class="note-input" rows="6"
        style="width:100%;min-height:150px;margin-top:8px"
        placeholder="${t('journal.editPlaceholder')}">${escapeHtml(entry.text || '')}</textarea>
    `;

    modal.open({
      title: t('journal.editTitle'),
      content,
      actions: [
        { label: t('common.cancel'), variant: 'btn-ghost', handler: () => {} },
        {
          label: t('common.save'),
          variant: 'btn-primary',
          closeOnClick: false,
          handler: async () => {
            const text = content.querySelector('#editEntryText').value.trim();
            if (!text) {
              toast(t('journal.writeSomething'), 'error');
              return false;
            }
            try {
              await journalService.updateEntry(entry.id, {
                text,
                title: text.split('\n')[0].slice(0, 60) || t('journal.journalEntry'),
              });
              toast(t('journal.entryUpdated'));
              modal.close();
            } catch (err) {
              toast(err.message || t('journal.couldNotUpdate'), 'error');
            }
            return false;
          },
        },
      ],
    });
  }

  async _linkMoney(entryId, txId) {
    try {
      await journalService.updateEntry(entryId, { linkedTransaction: txId });
      toast(t('journal.moneyAttached'));
    } catch (e) {
      toast(e.message || t('journal.couldNotAttach'), 'error');
    }
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default JournalPage;
