/**
 * Profile Page - identity, stats, settings, data management
 *
 * @module pages/settings
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { config } from '../config.js';
import { t, getLanguage, setLanguage, LANGUAGES } from '../core/i18n.js';
import { authService } from '../services/auth-service.js';
import { journalService } from '../services/journal-service.js';
import { nostrService } from '../services/nostr-service.js';
import { storageService } from '../services/storage-service.js';
import { fetchProfile } from '../services/profile-service.js';
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
const PICTURE_KEY = 'zapjournal.picture';
const NIP05_KEY = 'zapjournal.nip05';
const LUD16_KEY = 'zapjournal.lud16';

/** Return a short display form for a Lightning address. */
function shortLn(address = '') {
  return address.length > 26 ? address.slice(0, 14) + '…' + address.slice(-8) : address;
}

export class ProfilePage extends Component {
  mounted() {
    this.watchStore('user', () => {
      this.render();
      this._loadProfile();
    });
    this.watchStore('isAuthenticated', () => this.render());
    this.watchStore('transactions', () => this.render());
    this.watchStore('journal', () => this.render());
    this.watchStore('relays', () => this.render());
    this.watchStore('appLock', () => this.render());
    this.watchStore('price', () => this.render());
    this.watchStore('sync', () => this.render());
    this.watchStore('profileMeta', () => this.render());
    this._loadProfile();
  }

  _profile() {
    const user = store.get('user');
    const npub = user?.npub || '';
    const remote = store.get('profileMeta') || {};
    const name =
      storageService.getLocal(NAME_KEY) ||
      remote.display_name ||
      remote.name ||
      (npub ? shortNpub(npub) : t('profile.anon'));
    const bio = storageService.getLocal(BIO_KEY) || remote.about || t('profile.defaultBio');
    const picture = storageService.getLocal(PICTURE_KEY) || remote.picture || '';
    const nip05 = storageService.getLocal(NIP05_KEY) || remote.nip05 || '';
    const lud16 =
      storageService.getLocal(LUD16_KEY) || remote.lud16 || remote.lud06 || '';
    return { user, npub, name, bio, picture, nip05, lud16 };
  }

  /**
   * Fetch the signed-in user's kind 0 metadata from relays once per identity.
   * Non-blocking: the local profile renders first, remote fields fill in after.
   */
  async _loadProfile() {
    const { npub } = this._profile();
    if (!npub || npub === this._loadedNpub) return;
    this._loadedNpub = npub;
    try {
      const meta = await fetchProfile(npub, { timeout: 6000 });
      if (meta && typeof meta === 'object') store.set('profileMeta', meta);
    } catch (err) {
      console.warn('[Profile] Failed to load metadata:', err);
    }
  }

  template() {
    const { npub, name, bio, picture, nip05, lud16 } = this._profile();
    const authenticated = store.get('isAuthenticated');
    const hasLocalKey = !!storageService.getLocal('auth_privkey');
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
      <div class="view-title">${t('profile.title')}</div>

      <div class="card" style="padding-bottom:14px">
        <div class="banner"></div>
        <div class="prof-row">
          <div class="avatar" style="background:linear-gradient(135deg,var(--accent),var(--accent-deep))">
            <span class="avatar-initial">${(name[0] || '?').toUpperCase()}</span>
            ${picture ? `<img src="${this.escape(picture)}" alt="" referrerpolicy="no-referrer" />` : ''}
          </div>
          <button type="button" class="prof-edit" data-action="edit-profile"
            title="${t('profile.editProfile')}" aria-label="${t('profile.editProfile')}">
            <span class="ic">${Icons.edit}</span>${t('profile.editProfile')}
          </button>
        </div>
        <h2 class="prof-name">${this.escape(name)}</h2>
        ${
          npub
            ? `<button class="npub-full" data-action="copy-npub">
                 <span class="ic">${Icons.copy}</span>${shortNpub(npub)}</button>`
            : ''
        }
        ${
          nip05 || lud16
            ? `<div class="prof-meta">
                 ${
                   nip05
                     ? `<span class="prof-chip nip05">${Icons.check}${this.escape(nip05)}</span>`
                     : ''
                 }
                 ${
                   lud16
                     ? `<button type="button" class="prof-chip" data-action="copy-lud16"
                          title="${t('profile.lightningAddress')}">${Icons.zap}${this.escape(
                          shortLn(lud16)
                        )}</button>`
                     : ''
                 }
               </div>`
            : ''
        }
        <p class="bio">${this.escape(bio)}</p>
        <div class="prof-stats">
          <div class="pstat"><b>${entries.length}</b><span>${t('profile.entries')}</span></div>
          <div class="pstat"><b class="streak">${Icons.flame}${streak}</b><span>${t(
            'profile.dayStreak'
          )}</span></div>
          <div class="pstat"><b style="color:var(--in)">${fmtSats(tin)}</b><span>${t(
            'profile.allTimeIn'
          )}</span></div>
          <div class="pstat"><b style="color:var(--out)">${fmtSats(tout)}</b><span>${t(
            'profile.allTimeOut'
          )}</span></div>
        </div>
      </div>

      ${
        topCat
          ? `<div class="card"><p class="muted-p" style="padding:0">
               ${t('profile.biggestCategory')} <b style="color:${
                 categoryMeta(topCat[0]).color
               }">${categoryMeta(topCat[0]).label}</b> · ${fmtSats(topCat[1])} ${t(
                 'common.sats'
               )}</p></div>`
          : ''
      }

      <div class="card">
        <div class="card-head"><h3>${t('profile.appearance')}</h3></div>
        <div class="seg" style="margin-bottom:14px">
          <button type="button" data-action="set-theme" data-theme="dark"
            class="${themeMode === 'dark' ? 'on' : ''}">
            <span class="ic">${Icons.Moon}</span>${t('profile.dark')}
          </button>
          <button type="button" data-action="set-theme" data-theme="light"
            class="${themeMode === 'light' ? 'on' : ''}">
            <span class="ic">${Icons.Sun}</span>${t('profile.light')}
          </button>
        </div>
        <div class="bud-top" style="margin-bottom:6px">
          <span>${t('profile.accentColor')}</span>
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
          <input type="color" id="accentPicker" value="${accent.toLowerCase()}" aria-label="${t(
            'profile.customAccent'
          )}" />
          <code>${t('profile.custom')}</code>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>${t('profile.language')}</h3></div>
        <p class="muted-p" style="text-align:left;padding:0 0 10px">${t(
          'profile.languageSub'
        )}</p>
        <div class="seg seg-3">
          ${LANGUAGES.map(
            (l) =>
              `<button type="button" data-action="set-language" data-lang="${l.code}"
                 aria-pressed="${getLanguage() === l.code}"
                 class="${getLanguage() === l.code ? 'on' : ''}">${l.label}</button>`
          ).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>${t('profile.moneyRate')}</h3>
          <span class="badge ${price.error ? 'badge-error' : 'badge-neutral'}">${
            price.loading
              ? t('profile.updating')
              : price.rateSource === 'manual'
              ? t('profile.manual')
              : price.ageLabel || t('profile.auto')
          }</span>
        </div>

        <label class="fld" style="margin-bottom:12px">${t('profile.currency')}
          <select id="currencySelect" class="input">
            ${CURRENCIES.map(
              (c) => `<option value="${c}" ${c === price.currency ? 'selected' : ''}>${c}</option>`
            ).join('')}
          </select>
        </label>

        <button class="set-row" data-action="toggle-fiat" aria-pressed="${price.showFiat}">
          <span class="ic">${Icons.wallet}</span>
          <span><b>${t('profile.showFiat')}</b><span>${
            price.showFiat
              ? t('profile.comparingSats', { currency: price.currency })
              : t('profile.satsOnly')
          }</span></span>
          <span class="switch ${price.showFiat ? 'on' : ''}"></span>
        </button>

        <div class="bud-top" style="margin:12px 0 6px"><span>${t(
          'profile.rateSource'
        )}</span></div>
        <div class="seg">
          <button type="button" data-action="rate-source" data-src="auto"
            class="${price.rateSource === 'auto' ? 'on' : ''}">
            <span class="ic">${Icons.spark}</span>${t('profile.auto')}
          </button>
          <button type="button" data-action="rate-source" data-src="manual"
            class="${price.rateSource === 'manual' ? 'on' : ''}">
            <span class="ic">${Icons.edit}</span>${t('profile.manual')}
          </button>
        </div>

        ${
          price.rateSource === 'manual'
            ? `<label class="fld" style="margin-top:12px">${t('profile.manualRate', {
                currency: price.currency,
              })}
                 <input id="manualRate" type="number" inputmode="decimal"
                   value="${price.manualRate || ''}" placeholder="0" />
               </label>`
            : ''
        }

        <div class="set-row" style="cursor:default">
          <span class="ic">${Icons.trending}</span>
          <span style="flex:1;min-width:0"><b>${t('profile.btcEquals')} ${
            price.rate ? priceService.formatAmount(price.rate, price.currency) : '—'
          }</b>
            <span>${
              price.error
                ? price.error
                : price.loading
                ? t('profile.updating')
                : price.ageLabel
                ? t('profile.updated', { age: price.ageLabel })
                : t('profile.notFetched')
            }</span></span>
          <button class="btn btn-ghost btn-sm" data-action="refresh-rate">${t(
            'common.refresh'
          )}</button>
        </div>
      </div>

      ${
        (() => {
          const pending = sync.pending || 0;
          let label = t('profile.allSynced');
          let badge = 'badge-neutral';
          let sub = relays.length
            ? t(relays.length === 1 ? 'profile.relayCount' : 'profile.relayCountPlural', {
                n: relays.length,
              })
            : t('profile.noRelays');
          if (!authenticated) {
            label = t('profile.localOnly');
            badge = 'badge-neutral';
            sub = t('profile.logInToBackup');
          } else if (!sync.online) {
            label = t('profile.offline');
            badge = 'badge-error';
            sub =
              pending > 0
                ? t('profile.changesWaiting', { n: pending })
                : t('profile.changesSyncOnline');
          } else if (sync.status === 'syncing') {
            label = t('profile.syncing');
            badge = 'badge-neutral';
          } else if (sync.status === 'error') {
            label = t('profile.syncError');
            badge = 'badge-error';
            sub = sync.error || t('profile.tapSyncRetry');
          } else if (pending > 0) {
            label = t('profile.pendingCount', { n: pending });
            badge = 'badge-neutral';
            sub = t('profile.waitingToPublish');
          } else if (sync.lastSyncedAt) {
            sub = t('profile.lastSynced', {
              time: new Date(sync.lastSyncedAt).toLocaleTimeString(),
            });
          }
          return `<div class="card">
            <div class="card-head"><h3>${t('profile.sync')}</h3><span class="badge ${badge}">${label}</span></div>
            <div class="set-row" style="cursor:default">
              <span class="ic">${Icons.bolt}</span>
              <span style="flex:1;min-width:0"><b>${label}</b><span>${sub}</span></span>
              ${
                authenticated
                  ? `<button class="btn btn-ghost btn-sm" data-action="retry-sync" ${
                      sync.online ? '' : 'disabled'
                    }>${t('profile.syncNow')}</button>`
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
                 <span><b>${t('profile.disconnect')}</b><span>${shortNpub(npub)}</span></span></button>`
            : `<button class="set-row" data-action="connect"><span class="ic">${Icons.plug}</span>
                 <span><b>${t('profile.connect')}</b><span>${t(
                   'profile.connectSub'
                 )}</span></span></button>`
        }
        <button class="set-row" data-action="edit-profile"><span class="ic">${Icons.edit}</span>
          <span><b>${t('profile.editProfile')}</b><span>${t('profile.nameBio')}</span></span></button>
        <button class="set-row" data-action="toggle-lock" aria-pressed="${appLock}">
          <span class="ic">${Icons.lock}</span>
          <span><b>${t('profile.appLock')}</b><span>${
            appLock ? t('profile.pinRequired') : t('profile.offNoPin')
          }</span></span>
          <span class="switch ${appLock ? 'on' : ''}" aria-hidden="true"></span>
        </button>
        ${
          appLock
            ? `<button class="set-row" data-action="change-pin"><span class="ic">${Icons.lock}</span>
                 <span><b>${t('profile.changePin')}</b><span>${t(
                   'profile.reLock'
                 )}</span></span></button>`
            : ''
        }
        <button class="set-row" data-action="export"><span class="ic">${Icons.download}</span>
          <span><b>${t('profile.export')}</b><span>${t(
            'profile.exportSub'
          )}</span></span></button>
        ${
          authenticated
            ? `<button class="set-row" data-action="backup-key"><span class="ic">${Icons.key}</span>
                 <span><b>${t('profile.backupKey')}</b><span>${
                hasLocalKey ? t('profile.backupKeySub') : t('profile.keyManagedByExt')
              }</span></span></button>`
            : ''
        }
      </div>

      <div class="card">
        <div class="card-head"><h3>${t('profile.relays')}</h3>
          <span class="badge ${relays.length ? 'badge-success' : 'badge-neutral'}">${t(
            'profile.connectedCount',
            { n: relays.length }
          )}</span>
        </div>
        ${savedRelays
          .map((r) => {
            const conn = relays.includes(r);
            const isDefault = config.relays.default.includes(r);
            return `<div class="set-row" style="cursor:default">
              <span class="status-dot ${conn ? 'connected' : ''}"></span>
              <span style="flex:1"><b class="font-mono" style="font-size:12px">${this.escape(r)}</b>
                <span>${conn ? t('profile.connected') : t('profile.offlineState')}${
              isDefault ? ' · ' + t('profile.default') : ''
            }</span></span>
              ${
                !isDefault
                  ? `<button class="btn btn-ghost btn-sm" data-action="remove-relay" data-relay="${this.escape(
                      r
                    )}">${t('common.remove')}</button>`
                  : ''
              }
            </div>`;
          })
          .join('')}
        <div class="join" style="margin-top:12px">
          <input type="text" class="input relay-input" placeholder="${t(
            'profile.relayPlaceholder'
          )}" />
          <button class="btn btn-primary" data-action="add-relay" style="flex:0 0 auto">${t(
            'common.add'
          )}</button>
        </div>
      </div>

      <div class="card" style="padding:6px 16px">
        <a class="set-row" href="#about"><span class="ic">${Icons.info}</span>
          <span><b>${t('profile.aboutApp')}</b><span>${t('profile.aboutSub')}</span></span>
          <span class="ic" style="margin-left:auto">${Icons.chevR}</span></a>
      </div>

      <div class="card" style="padding:6px 16px">
        <button class="set-row danger" data-action="reset"><span class="ic">${Icons.trash}</span>
          <span><b>${t('profile.reset')}</b><span>${t('profile.resetSub')}</span></span></button>
      </div>

      <p class="muted-p" style="margin-bottom:24px">
        ZapJournal v${config.app.version} · ${t('profile.footer')}
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
    this.addEventListener(this.container, 'click', async (e) => {
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
      } else if (action === 'set-language') {
        setLanguage(el.dataset.lang);
      } else if (action === 'toggle-fiat') {
        priceService.setShowFiat(!priceService.showFiat);
      } else if (action === 'rate-source') {
        priceService.setRateSource(el.dataset.src);
      } else if (action === 'refresh-rate') {
        priceService.refresh();
      } else if (action === 'retry-sync') {
        const { syncService } = await import('../services/sync-service.js');
        toast(t('header.syncing'), 'info');
        await syncService.retryNow();
      } else if (action === 'logout') {
        authService.logout();
        toast(t('profile.disconnected'), 'info');
      } else if (action === 'copy-npub') {
        const { npub } = this._profile();
        if (npub) copyText(npub, t('profile.npubCopied'));
      } else if (action === 'copy-lud16') {
        const { lud16 } = this._profile();
        if (lud16) copyText(lud16, t('profile.lightningCopied'));
      } else if (action === 'backup-key') {
        this._openBackupKey();
      } else if (action === 'edit-profile') {
        this._openEditProfile();
      } else if (action === 'toggle-lock') {
        if (lock.isEnabled()) {
          const ok = await modal.confirm({
            title: t('profile.lockOffTitle'),
            message: t('profile.lockOffMessage'),
            confirmText: t('profile.lockOffConfirm'),
            danger: true,
          });
          if (!ok) return;
          lock.disable();
          toast(t('profile.appLockOff'), 'info');
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
          title: t('profile.resetTitle'),
          message: t('profile.resetMessage'),
          confirmText: t('profile.resetConfirm'),
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
    this.addEventListener(this.container, 'input', (e) => {
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
    this.addEventListener(this.container, 'change', (e) => {
      if (e.target.id === 'currencySelect') {
        priceService.setCurrency(e.target.value);
      } else if (e.target.id === 'manualRate') {
        priceService.setManualRate(e.target.value);
      }
    });
  }

  _openEditProfile() {
    const { name, bio, picture, nip05, lud16 } = this._profile();
    const content = document.createElement('div');
    content.innerHTML = `
      <label class="fld">${t('profile.displayName')}
        <input type="text" id="peName" maxlength="40" value="${this.escape(name)}" />
      </label>
      <label class="fld">${t('profile.bio')}
        <textarea id="peBio" rows="3" maxlength="160">${this.escape(bio)}</textarea>
      </label>
      <label class="fld">${t('profile.picture')}
        <input type="url" id="pePicture" inputmode="url"
          placeholder="https://…" value="${this.escape(picture)}" />
      </label>
      <label class="fld">${t('profile.nip05')}
        <input type="text" id="peNip05" placeholder="you@domain.com"
          value="${this.escape(nip05)}" />
      </label>
      <label class="fld">${t('profile.lightningAddress')}
        <input type="text" id="peLud16" placeholder="you@getalby.com"
          value="${this.escape(lud16)}" />
      </label>
      <p class="hint" style="max-width:none">${t('profile.editProfileHint')}</p>`;
    modal.open({
      title: t('profile.editProfile'),
      content,
      actions: [
        {
          label: t('common.save'),
          variant: 'btn-primary',
          handler: () => {
            const meta = {
              name: content.querySelector('#peName').value.trim() || name,
              about: content.querySelector('#peBio').value.trim(),
              picture: content.querySelector('#pePicture').value.trim(),
              nip05: content.querySelector('#peNip05').value.trim(),
              lud16: content.querySelector('#peLud16').value.trim(),
            };
            this._saveProfile(meta);
          },
        },
      ],
    });
  }

  /** Persist locally (always) and publish kind 0 to relays (when signed in). */
  _saveProfile(meta) {
    storageService.setLocal(NAME_KEY, meta.name);
    storageService.setLocal(BIO_KEY, meta.about);
    storageService.setLocal(PICTURE_KEY, meta.picture);
    storageService.setLocal(NIP05_KEY, meta.nip05);
    storageService.setLocal(LUD16_KEY, meta.lud16);

    store.set('profileMeta', { ...(store.get('profileMeta') || {}), ...meta });
    this.render();

    if (store.get('isAuthenticated')) {
      // Publish result drives the toast (published / saved locally).
      this._publishProfile(meta);
    } else {
      toast(t('profile.profileUpdated'));
    }
  }

  async _publishProfile(meta) {
    if (!store.get('isAuthenticated')) return;
    try {
      const content = {
        name: meta.name,
        display_name: meta.name,
        about: meta.about,
        picture: meta.picture,
        nip05: meta.nip05,
        lud16: meta.lud16,
      };
      Object.keys(content).forEach((k) => {
        if (!content[k]) delete content[k];
      });

      const event = {
        kind: config.kinds.METADATA,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(content),
      };
      const signed = await authService.signEvent(event);
      const result = await nostrService.publish(signed);
      if (result?.successes?.length) {
        toast(t('profile.profilePublished'));
      } else {
        toast(t('profile.profileSavedLocal'), 'info');
      }
    } catch (err) {
      console.warn('[Profile] Publish failed:', err);
      toast(t('profile.profileSavedLocal'), 'info');
    }
  }

  /**
   * Show the local signing key (nsec) so the user can back it up.
   * Extension logins have no local key — explain where it lives instead.
   */
  _openBackupKey() {
    const { npub } = this._profile();
    const privkey = storageService.getLocal('auth_privkey');

    if (!privkey) {
      modal.open({
        title: t('profile.backupKey'),
        content: `<p style="margin:0;line-height:1.6">${t('profile.keyManagedByExtBody')}</p>`,
        actions: [{ label: t('common.ok'), variant: 'btn-primary', handler: () => true }],
      });
      return;
    }

    let nsec = '';
    try {
      nsec = window.NostrTools?.nip19?.nsecEncode(privkey) || '';
    } catch (err) {
      console.warn('[Profile] Could not encode nsec:', err);
    }
    nsec = nsec || privkey;

    const content = document.createElement('div');
    content.innerHTML = `
      <div class="alert alert-warning" style="margin-bottom:14px">
        <b style="display:block;margin-bottom:4px">${t('profile.secretWarningTitle')}</b>
        <span style="font-size:12.5px;line-height:1.5">${t('profile.secretWarningBody')}</span>
      </div>
      <label class="fld">${t('profile.secretKey')}
        <div class="key-field">
          <input id="peNsec" type="password" readonly value="${this.escape(nsec)}"
            class="input font-mono" spellcheck="false" autocomplete="off" />
          <button type="button" class="btn btn-ghost" id="peReveal"
            aria-label="${t('profile.reveal')}" title="${t('profile.reveal')}">
            ${Icons.eye}
          </button>
        </div>
      </label>
      <label class="fld">${t('login.publicKey')}
        <input id="peNpub" type="text" readonly value="${this.escape(npub)}"
          class="input font-mono" spellcheck="false" />
      </label>`;

    const reveal = content.querySelector('#peReveal');
    reveal.addEventListener('click', () => {
      const input = content.querySelector('#peNsec');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      reveal.innerHTML = show ? Icons.eyeOff : Icons.eye;
    });

    modal.open({
      title: t('profile.backupKey'),
      content,
      actions: [
        {
          label: t('profile.copySecret'),
          variant: 'btn-primary',
          closeOnClick: false,
          handler: () => copyText(nsec, t('profile.secretCopied')),
        },
        {
          label: t('profile.downloadKey'),
          variant: 'btn-secondary',
          closeOnClick: false,
          handler: () => this._downloadKey(nsec, npub),
        },
      ],
    });
  }

  _downloadKey(nsec, npub) {
    const data = {
      app: 'ZapJournal',
      type: 'nostr-identity-backup',
      exported_at: new Date().toISOString(),
      npub,
      nsec,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zapjournal-key-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t('profile.keyDownloaded'), 'warning');
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
    toast(t('profile.backupDownloaded'));
  }

  _addRelay() {
    const input = this.$('.relay-input');
    const url = (input?.value || '').trim();
    if (!url.startsWith('wss://')) {
      toast(t('profile.relayMustWss'), 'warning');
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
      toast(t('profile.relayAdded'));
    }
  }

  afterRender() {
    hydrateIcons(this.container);
    // Fall back to the letter avatar if the profile picture fails to load.
    this.$$('.avatar img').forEach((img) => {
      img.addEventListener('error', () => img.remove(), { once: true });
    });
  }
}

export default ProfilePage;
