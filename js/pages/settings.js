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
import { CURRENCIES, priceService } from '../services/price-service.js';
import { modal } from '../components/modal.js';
import { lock } from '../components/lock.js';
import {
  ACCENT_PRESETS,
  getAccent,
  getTheme,
  setAccent,
  setTheme,
} from '../core/theme.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import {
  categoryMeta,
  copyText,
  fmtSats,
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
    this.watchStore('price', () => this.render());
    this.watchStore('sync', () => this.render());
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

    const appLock = store.get('appLock');
    const sync = store.get('sync') || {};
    const themeMode = getTheme();
    const accent = getAccent();
    const streak = this._streak(entries);
    const relays = store.get('relays')?.connected || [];
    const price = store.get('price') || {
      currency: 'LAK',
      showFiat: false,
      rateSource: 'auto',
      rate: 0,
      ageLabel: '',
      loading: false,
      error: '',
    };
    const savedRelays = storageService.getLocal(config.storage.keys.RELAYS) || config.relays.default;

    return `
      <div class="view-title">Profile</div>

      <div class="card" style="padding-bottom:14px">
        <div class="banner"></div>
        <div class="prof-row">
          <div class="avatar" style="background:linear-gradient(135deg,var(--accent),var(--accent-deep))">
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

      <div class="card">
        <div class="card-head"><h3>Appearance</h3></div>
        <div class="seg" style="margin-bottom:14px">
          <button type="button" data-action="set-theme" data-theme="dark"
            class="${themeMode === 'dark' ? 'on' : ''}">
            <span class="ic">${Icons.Moon}</span>Dark
          </button>
          <button type="button" data-action="set-theme" data-theme="light"
            class="${themeMode === 'light' ? 'on' : ''}">
            <span class="ic">${Icons.Sun}</span>Light
          </button>
        </div>
        <div class="bud-top" style="margin-bottom:6px">
          <span>Accent color</span>
          <b style="color:${accent}">${accent}</b>
        </div>
        <div class="swatches">
          ${ACCENT_PRESETS.map(
            (a) =>
              `<button type="button" class="swatch ${accent === a.hex ? 'on' : ''}"
                 style="background:${a.hex}" data-action="set-accent" data-accent="${a.hex}"
                 title="${a.name}" aria-label="${a.name}"></button>`
          ).join('')}
        </div>
        <div class="color-field">
          <input type="color" id="accentPicker" value="${accent.toLowerCase()}" aria-label="Custom accent color" />
          <code>Custom</code>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Money &amp; rate</h3>
          <span class="badge ${price.error ? 'badge-error' : 'badge-neutral'}">${
            price.loading
              ? 'updating…'
              : price.rateSource === 'manual'
              ? 'manual'
              : price.ageLabel || 'auto'
          }</span>
        </div>

        <label class="fld" style="margin-bottom:12px">Currency
          <select id="currencySelect" class="input">
            ${CURRENCIES.map(
              (c) => `<option value="${c}" ${c === price.currency ? 'selected' : ''}>${c}</option>`
            ).join('')}
          </select>
        </label>

        <button class="set-row" data-action="toggle-fiat" aria-pressed="${price.showFiat}">
          <span class="ic">${Icons.wallet}</span>
          <span><b>Show fiat values</b><span>${
            price.showFiat ? `Comparing sats to ${price.currency}` : 'Sats only'
          }</span></span>
          <span class="switch ${price.showFiat ? 'on' : ''}"></span>
        </button>

        <div class="bud-top" style="margin:12px 0 6px"><span>Rate source</span></div>
        <div class="seg">
          <button type="button" data-action="rate-source" data-src="auto"
            class="${price.rateSource === 'auto' ? 'on' : ''}">
            <span class="ic">${Icons.spark}</span>Auto
          </button>
          <button type="button" data-action="rate-source" data-src="manual"
            class="${price.rateSource === 'manual' ? 'on' : ''}">
            <span class="ic">${Icons.edit}</span>Manual
          </button>
        </div>

        ${
          price.rateSource === 'manual'
            ? `<label class="fld" style="margin-top:12px">Manual rate — 1 BTC in ${price.currency}
                 <input id="manualRate" type="number" inputmode="decimal"
                   value="${price.manualRate || ''}" placeholder="0" />
               </label>`
            : ''
        }

        <div class="set-row" style="cursor:default">
          <span class="ic">${Icons.trending}</span>
          <span style="flex:1;min-width:0"><b>1 BTC = ${
            price.rate ? priceService.formatAmount(price.rate, price.currency) : '—'
          }</b>
            <span>${
              price.error
                ? price.error
                : price.loading
                ? 'updating…'
                : price.ageLabel
                ? 'updated ' + price.ageLabel
                : 'not fetched yet'
            }</span></span>
          <button class="btn btn-ghost btn-sm" data-action="refresh-rate">Refresh</button>
        </div>
      </div>

      ${
        (() => {
          const pending = sync.pending || 0;
          let label = 'All synced';
          let badge = 'badge-neutral';
          let sub = relays.length
            ? `${relays.length} relay${relays.length === 1 ? '' : 's'} connected`
            : 'No relays connected';
          if (!authenticated) {
            label = 'Local only';
            badge = 'badge-neutral';
            sub = 'Log in to back up and sync to Nostr';
          } else if (!sync.online) {
            label = 'Offline';
            badge = 'badge-error';
            sub = pending > 0 ? `${pending} change${pending === 1 ? '' : 's'} waiting` : 'Changes sync when back online';
          } else if (sync.status === 'syncing') {
            label = 'Syncing…';
            badge = 'badge-neutral';
          } else if (sync.status === 'error') {
            label = 'Sync error';
            badge = 'badge-error';
            sub = sync.error || 'Tap Sync now to retry';
          } else if (pending > 0) {
            label = `${pending} pending`;
            badge = 'badge-neutral';
            sub = 'Waiting to publish';
          } else if (sync.lastSyncedAt) {
            sub = `Last synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}`;
          }
          return `<div class="card">
            <div class="card-head"><h3>Sync</h3><span class="badge ${badge}">${label}</span></div>
            <div class="set-row" style="cursor:default">
              <span class="ic">${Icons.bolt}</span>
              <span style="flex:1;min-width:0"><b>${label}</b><span>${sub}</span></span>
              ${
                authenticated
                  ? `<button class="btn btn-ghost btn-sm" data-action="retry-sync" ${
                      sync.online ? '' : 'disabled'
                    }>Sync now</button>`
                  : ''
              }
            </div>
          </div>`;
        })()
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
        <a class="set-row" href="#about"><span class="ic">${Icons.info}</span>
          <span><b>About ZapJournal</b><span>Contributors, source &amp; donate</span></span>
          <span class="ic" style="margin-left:auto">${Icons.chevR}</span></a>
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
      } else if (action === 'set-theme') {
        setTheme(el.dataset.theme);
        this.render();
      } else if (action === 'set-accent') {
        setAccent(el.dataset.accent);
        this.render();
      } else if (action === 'toggle-fiat') {
        priceService.setShowFiat(!priceService.showFiat);
      } else if (action === 'rate-source') {
        priceService.setRateSource(el.dataset.src);
      } else if (action === 'refresh-rate') {
        priceService.refresh();
      } else if (action === 'retry-sync') {
        const { syncService } = await import('../services/sync-service.js');
        toast('Syncing…', 'info');
        await syncService.retryNow();
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

    // Live accent preview from the native colour picker (no full re-render)
    this.container.addEventListener('input', (e) => {
      if (!e.target || e.target.id !== 'accentPicker') return;
      setAccent(e.target.value);
      const accent = getAccent();
      const label = this.container.querySelector('.bud-top b');
      if (label) {
        label.textContent = accent;
        label.style.color = accent;
      }
      this.container
        .querySelectorAll('.swatch')
        .forEach((s) => s.classList.toggle('on', s.dataset.accent === accent));
    });

    // Currency + manual rate (commit on change)
    this.container.addEventListener('change', (e) => {
      if (e.target.id === 'currencySelect') {
        priceService.setCurrency(e.target.value);
      } else if (e.target.id === 'manualRate') {
        priceService.setManualRate(e.target.value);
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
