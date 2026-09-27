/**
 * Profile Page - identity, stats, settings, data management
 *
 * @module pages/settings
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { config } from '../config.js';
import { authService } from '../services/auth-service.js';
import { journalService } from '../services/journal-service.js';
import { nostrService } from '../services/nostr-service.js';
import { storageService } from '../services/storage-service.js';
import { modal } from '../components/modal.js';
import { lock } from '../components/lock.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import {
  categoryMeta,
  copyText,
  fmtSats,
  hueOf,
  isIncome,
  shortNpub,
  toast,
  toMs,
} from '../utils/ui.js';

const NAME_KEY = 'zapjournal.name';
const BIO_KEY = 'zapjournal.bio';

export class ProfilePage extends Component {
  mounted() {
    this.watchStore('user', () => this.render());
    this.watchStore('isAuthenticated', () => this.render());
    this.watchStore('transactions', () => this.render());
    this.watchStore('journal', () => this.render());
    this.watchStore('relays', () => this.render());
    this.watchStore('appLock', () => this.render());
  }

  _profile() {
    const user = store.get('user');
    const npub = user?.npub || '';
    const name =
      storageService.getLocal(NAME_KEY) || (npub ? shortNpub(npub) : 'Anon Nostrich');
    const bio =
      storageService.getLocal(BIO_KEY) ||
      'Private journal, honest numbers. Where my days and my sats meet.';
    return { user, npub, name, bio };
  }

  template() {
    const { npub, name, bio } = this._profile();
    const authenticated = store.get('isAuthenticated');
    const entries = store.get('journal') || [];
    const txs = store.get('transactions') || [];

    const tin = txs.filter(isIncome).reduce((a, t) => a + (Number(t.amount) || 0), 0);
    const tout = txs.filter((t) => !isIncome(t)).reduce((a, t) => a + (Number(t.amount) || 0), 0);

    const spentAll = {};
    txs.filter((t) => !isIncome(t)).forEach((t) => {
      const k = t.category || 'uncategorized';
      spentAll[k] = (spentAll[k] || 0) + (Number(t.amount) || 0);
    });
    const topCat = Object.entries(spentAll).sort((a, b) => b[1] - a[1])[0];

    const h = hueOf(npub || name);
    const streak = this._streak(entries);
    const appLock = store.get('appLock');
    const relays = store.get('relays')?.connected || [];
    const savedRelays = storageService.getLocal(config.storage.keys.RELAYS) || config.relays.default;

    return `
      <div class="view-title">Profile</div>

      <div class="card" style="padding-bottom:14px">
        <div class="banner" style="background:linear-gradient(120deg,hsl(${h},60%,45%),hsl(${(h + 80) % 360},65%,35%))"></div>
        <div class="prof-row">
          <div class="avatar" style="background:linear-gradient(135deg,hsl(${h},65%,58%),hsl(${(h + 70) % 360},70%,48%))">
            ${(name[0] || '?').toUpperCase()}
          </div>
        </div>
        <h2 class="prof-name">${this.escape(name)}</h2>
        ${
          npub
            ? `<button class="npub-full" data-action="copy-npub">
                 <span class="ic">${Icons.copy}</span>${shortNpub(npub)}</button>`
            : ''
        }
        <p class="bio">${this.escape(bio)}</p>
        <div class="prof-stats">
          <div class="pstat"><b>${entries.length}</b><span>entries</span></div>
          <div class="pstat"><b class="streak">${Icons.flame}${streak}</b><span>day streak</span></div>
          <div class="pstat"><b style="color:var(--in)">${fmtSats(tin)}</b><span>all-time in</span></div>
          <div class="pstat"><b style="color:var(--out)">${fmtSats(tout)}</b><span>all-time out</span></div>
        </div>
      </div>

      ${
        topCat
          ? `<div class="card"><p class="muted-p" style="padding:0">
               Your biggest category: <b style="color:${categoryMeta(topCat[0]).color}">${
                 categoryMeta(topCat[0]).label
               }</b> · ${fmtSats(topCat[1])} sats</p></div>`
          : ''
      }

      <div class="card" style="padding:6px 16px">
        ${
          authenticated
            ? `<button class="set-row" data-action="logout"><span class="ic">${Icons.lock}</span>
                 <span><b>Disconnect Nostr</b><span>${shortNpub(npub)}</span></span></button>`
            : `<button class="set-row" data-action="connect"><span class="ic">${Icons.plug}</span>
                 <span><b>Connect Nostr</b><span>NIP-07 extension, nsec or new account</span></span></button>`
        }
        <button class="set-row" data-action="edit-profile"><span class="ic">${Icons.edit}</span>
          <span><b>Edit profile</b><span>Name &amp; bio</span></span></button>
        <button class="set-row" data-action="toggle-lock" aria-pressed="${appLock}">
          <span class="ic">${Icons.lock}</span>
          <span><b>App lock</b><span>${
            appLock ? 'PIN required to open ZapJournal' : 'Off · no PIN required'
          }</span></span>
          <span class="switch ${appLock ? 'on' : ''}" aria-hidden="true"></span>
        </button>
        ${
          appLock
            ? `<button class="set-row" data-action="change-pin"><span class="ic">${Icons.lock}</span>
                 <span><b>Change PIN</b><span>Re-lock your journal with a new code</span></span></button>`
            : ''
        }
        <button class="set-row" data-action="export"><span class="ic">${Icons.download}</span>
          <span><b>Export data</b><span>Download everything as JSON — self-custody</span></span></button>
      </div>

      <div class="card">
        <div class="card-head"><h3>Relays</h3>
          <span class="badge ${relays.length ? 'badge-success' : 'badge-neutral'}">${
            relays.length
          } connected</span>
        </div>
        ${savedRelays
          .map((r) => {
            const conn = relays.includes(r);
            const isDefault = config.relays.default.includes(r);
            return `<div class="set-row" style="cursor:default">
              <span class="status-dot ${conn ? 'connected' : ''}"></span>
              <span style="flex:1"><b class="font-mono" style="font-size:12px">${this.escape(r)}</b>
                <span>${conn ? 'Connected' : 'Offline'}${
              isDefault ? ' · default' : ''
            }</span></span>
              ${
                !isDefault
                  ? `<button class="btn btn-ghost btn-sm" data-action="remove-relay" data-relay="${this.escape(
                      r
                    )}">Remove</button>`
                  : ''
              }
            </div>`;
          })
          .join('')}
        <div class="join" style="margin-top:12px">
          <input type="text" class="input relay-input" placeholder="wss://relay.example.com" />
          <button class="btn btn-primary" data-action="add-relay" style="flex:0 0 auto">Add</button>
        </div>
      </div>

      <div class="card" style="padding:6px 16px">
        <button class="set-row danger" data-action="reset"><span class="ic">${Icons.trash}</span>
          <span><b>Reset app</b><span>Wipe all entries &amp; transactions</span></span></button>
      </div>

      <p class="muted-p" style="margin-bottom:24px">
        ZapJournal v${config.app.version} · private · local-first
      </p>
    `;
  }

  _streak(entries) {
    const days = new Set(
      entries.map((e) => {
        const d = new Date(toMs(e.created_at));
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
    );
    let s = 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (!days.has(d.getTime())) d.setDate(d.getDate() - 1);
    while (days.has(d.getTime())) {
      s++;
      d.setDate(d.getDate() - 1);
    }
    return s;
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
      } else if (action === 'logout') {
        authService.logout();
        toast('Disconnected', 'info');
      } else if (action === 'copy-npub') {
        const { npub } = this._profile();
        if (npub) copyText(npub, 'npub copied to clipboard');
      } else if (action === 'edit-profile') {
        this._openEditProfile();
      } else if (action === 'toggle-lock') {
        if (lock.isEnabled()) {
          const ok = await modal.confirm({
            title: 'Turn off app lock',
            message: 'ZapJournal will open without a PIN on this device.',
            confirmText: 'Turn off',
            danger: true,
          });
          if (!ok) return;
          lock.disable();
          toast('App lock off', 'info');
        } else {
          lock.show('setup', { cancelable: true });
        }
      } else if (action === 'change-pin') {
        lock.show('setup', { cancelable: true });
      } else if (action === 'export') {
        this._exportData();
      } else if (action === 'add-relay') {
        this._addRelay();
      } else if (action === 'remove-relay') {
        const relay = el.dataset.relay;
        const saved = storageService.getLocal(config.storage.keys.RELAYS) || [];
        storageService.setLocal(
          config.storage.keys.RELAYS,
          saved.filter((r) => r !== relay)
        );
        nostrService.disconnect(relay);
        this.render();
      } else if (action === 'reset') {
        const confirmed = await modal.confirm({
          title: 'Reset app',
          message:
            'This wipes all local entries, transactions and settings. This cannot be undone.',
          confirmText: 'Reset everything',
          danger: true,
        });
        if (!confirmed) return;
        try {
          localStorage.clear();
          await storageService.clear('transactions');
          await storageService.clear('journal');
          await storageService.clear('events');
        } catch (err) {
          /* ignore */
        }
        location.reload();
      }
    });
  }

  _openEditProfile() {
    const { name, bio } = this._profile();
    const content = document.createElement('div');
    content.innerHTML = `
      <label class="fld">Display name
        <input type="text" id="peName" maxlength="40" value="${this.escape(name)}" />
      </label>
      <label class="fld">Bio
        <textarea id="peBio" rows="3" maxlength="160">${this.escape(bio)}</textarea>
      </label>`;
    modal.open({
      title: 'Edit profile',
      content,
      actions: [
        {
          label: 'Save',
          variant: 'btn-primary',
          handler: () => {
            const n = content.querySelector('#peName').value.trim();
            const b = content.querySelector('#peBio').value.trim();
            storageService.setLocal(NAME_KEY, n || name);
            storageService.setLocal(BIO_KEY, b);
            this.render();
            toast('Profile updated ✓');
          },
        },
      ],
    });
  }

  _exportData() {
    const data = {
      app: 'ZapJournal',
      version: config.app.version,
      exported_at: new Date().toISOString(),
      transactions: store.get('transactions') || [],
      journal: (store.get('journal') || []).map((e) => ({
        id: e.id,
        title: e.title,
        text: e.text,
        tag: e.tag,
        tags: e.tags,
        mood: e.mood,
        linkedTransaction: e.linkedTransaction,
        created_at: e.created_at,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zapjournal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded — your keys, your data ⚡');
  }

  _addRelay() {
    const input = this.$('.relay-input');
    const url = (input?.value || '').trim();
    if (!url.startsWith('wss://')) {
      toast('Relay URL must start with wss://', 'warning');
      return;
    }
    const saved = storageService.getLocal(config.storage.keys.RELAYS) || [
      ...config.relays.default,
    ];
    if (!saved.includes(url)) {
      saved.push(url);
      storageService.setLocal(config.storage.keys.RELAYS, saved);
      nostrService.connect(url);
      input.value = '';
      this.render();
      toast('Relay added');
    }
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default ProfilePage;
