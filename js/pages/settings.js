/**
 * Profile Page - identity, stats, settings, data management
 *
 * VanJS view: `template()` and the modal builders return DOM nodes built with
 * `van.tags`, so text/attributes are escaped automatically and no
 * `hydrateIcons` pass is needed. `_syncAppearance()` still patches the live
 * accent/theme controls in place for a flash-free toggle.
 *
 * @module pages/settings
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { Events } from '../core/event-bus.js';
import { config } from '../config.js';
import { t, getLanguage, setLanguage, LANGUAGES } from '../core/i18n.js';
import { authService } from '../services/auth-service.js';
import { nostrService } from '../services/nostr-service.js';
import { storageService } from '../services/storage-service.js';
import { categoryService } from '../services/category-service.js';
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
import { Icons } from '../utils/icons.js';
import {
  categoryMeta,
  copyText,
  fmtSats,
  isIncome,
  shortNpub,
  toast,
  toMs,
} from '../utils/ui.js';
import van from '../vendor/van.js';

const { a, b, button, code, div, h2, h3, img, input, label, option, p, select, span, textarea } =
  van.tags;

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
    [
      Events.CATEGORY_CREATED,
      Events.CATEGORY_UPDATED,
      Events.CATEGORY_DELETED,
    ].forEach((event) => this.watchEvent(event, () => this.render()));
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

    const tin = txs.filter(isIncome).reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
    const tout = txs
      .filter((tx) => !isIncome(tx))
      .reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);

    const spentAll = {};
    txs.filter((tx) => !isIncome(tx)).forEach((tx) => {
      const k = tx.category || 'uncategorized';
      spentAll[k] = (spentAll[k] || 0) + (Number(tx.amount) || 0);
    });
    const topCat = Object.entries(spentAll).sort((a2, b2) => b2[1] - a2[1])[0];

    const appLock = store.get('appLock');
    const sync = store.get('sync') || {};
    const themeMode = getTheme();
    const accent = getAccent();
    const streak = this._streak(entries);
    const relays = store.get('relays')?.connected || [];
    const price = store.get('price') || {
      currency: 'LAK',
      showFiat: true,
      rateSource: 'auto',
      rate: 0,
      ageLabel: '',
      loading: false,
      error: '',
    };
    const savedRelays =
      storageService.getLocal(config.storage.keys.RELAYS) || config.relays.default;

    const frag = document.createDocumentFragment();
    van.add(
      frag,
      div({ class: 'view-title' }, t('profile.title')),
      this._heroCard({ name, npub, picture, nip05, lud16, bio, entries, streak, tin, tout }),
      topCat ? this._topCatCard(topCat) : null,
      this._appearanceCard(themeMode, accent),
      this._languageCard(),
      this._categoriesCard(),
      this._moneyRateCard(price),
      this._syncCard(sync, relays, authenticated),
      this._actionsCard({ authenticated, npub, appLock, hasLocalKey }),
      this._relaysCard(savedRelays, relays),
      div(
        { class: 'card', style: 'padding:6px 16px' },
        a(
          { class: 'set-row', href: '#about' },
          this._ic('info'),
          span(b(t('profile.aboutApp')), span(t('profile.aboutSub'))),
          span({ class: 'ic', style: 'margin-left:auto', innerHTML: Icons.chevR })
        )
      ),
      div(
        { class: 'card', style: 'padding:6px 16px' },
        button(
          { class: 'set-row danger', 'data-action': 'reset' },
          this._ic('trash'),
          span(b(t('profile.reset')), span(t('profile.resetSub')))
        )
      ),
      p(
        { class: 'muted-p', style: 'margin-bottom:24px' },
        `${t('common.byBitOS')} · v${config.app.version} · ${t('profile.footer')}`
      )
    );
    return frag;
  }

  _ic(name) {
    return span({ class: 'ic', innerHTML: Icons[name] });
  }

  _heroCard({ name, npub, picture, nip05, lud16, bio, entries, streak, tin, tout }) {
    return div(
      { class: 'card', style: 'padding-bottom:14px' },
      div({ class: 'banner' }),
      div(
        { class: 'prof-row' },
        div(
          {
            class: 'avatar',
            style: 'background:linear-gradient(135deg,var(--accent),var(--accent-deep))',
          },
          span({ class: 'avatar-initial' }, (name[0] || '?').toUpperCase()),
          picture
            ? img({
                src: picture,
                alt: '',
                referrerpolicy: 'no-referrer',
                onerror: (e) => e.target.remove(),
              })
            : null
        ),
        button(
          {
            type: 'button',
            class: 'prof-edit',
            'data-action': 'edit-profile',
            title: t('profile.editProfile'),
            'aria-label': t('profile.editProfile'),
          },
          this._ic('edit'),
          t('profile.editProfile')
        )
      ),
      h2({ class: 'prof-name' }, name),
      npub
        ? button(
            { class: 'npub-full', 'data-action': 'copy-npub' },
            this._ic('copy'),
            shortNpub(npub)
          )
        : null,
      nip05 || lud16
        ? div(
            { class: 'prof-meta' },
            nip05
              ? span({ class: 'prof-chip nip05' }, span({ innerHTML: Icons.check }), nip05)
              : null,
            lud16
              ? button(
                  {
                    type: 'button',
                    class: 'prof-chip',
                    'data-action': 'copy-lud16',
                    title: t('profile.lightningAddress'),
                  },
                  span({ innerHTML: Icons.zap }),
                  shortLn(lud16)
                )
              : null
          )
        : null,
      p({ class: 'bio' }, bio),
      div(
        { class: 'prof-stats' },
        div({ class: 'pstat' }, b(`${entries.length}`), span(t('profile.entries'))),
        div(
          { class: 'pstat' },
          b({ class: 'streak' }, span({ innerHTML: Icons.flame }), `${streak}`),
          span(t('profile.dayStreak'))
        ),
        div({ class: 'pstat' }, b({ style: 'color:var(--in)' }, fmtSats(tin)), span(t('profile.allTimeIn'))),
        div({ class: 'pstat' }, b({ style: 'color:var(--out)' }, fmtSats(tout)), span(t('profile.allTimeOut')))
      )
    );
  }

  _topCatCard(topCat) {
    const meta = categoryMeta(topCat[0]);
    return div(
      { class: 'card' },
      p(
        { class: 'muted-p', style: 'padding:0' },
        t('profile.biggestCategory'),
        ' ',
        b({ style: `color:${meta.color}` }, meta.label),
        ` · ${fmtSats(topCat[1])} ${t('common.sats')}`
      )
    );
  }

  _appearanceCard(themeMode, accent) {
    return div(
      { class: 'card' },
      div({ class: 'card-head' }, h3(t('profile.appearance'))),
      div(
        { class: 'seg', style: 'margin-bottom:14px' },
        button(
          {
            type: 'button',
            'data-action': 'set-theme',
            'data-theme': 'dark',
            class: themeMode === 'dark' ? 'on' : '',
          },
          this._ic('Moon'),
          t('profile.dark')
        ),
        button(
          {
            type: 'button',
            'data-action': 'set-theme',
            'data-theme': 'light',
            class: themeMode === 'light' ? 'on' : '',
          },
          this._ic('Sun'),
          t('profile.light')
        )
      ),
      div(
        { class: 'bud-top', style: 'margin-bottom:6px' },
        span(t('profile.accentColor')),
        b({ style: `color:${accent}` }, accent)
      ),
      div(
        { class: 'swatches' },
        ACCENT_PRESETS.map((preset) =>
          button({
            type: 'button',
            class: `swatch ${accent === preset.hex ? 'on' : ''}`,
            style: `background:${preset.hex}`,
            'data-action': 'set-accent',
            'data-accent': preset.hex,
            title: preset.name,
            'aria-label': preset.name,
          })
        )
      ),
      div(
        { class: 'color-field' },
        input({
          type: 'color',
          id: 'accentPicker',
          value: accent.toLowerCase(),
          'aria-label': t('profile.customAccent'),
        }),
        code(t('profile.custom'))
      )
    );
  }

  _languageCard() {
    return div(
      { class: 'card' },
      div({ class: 'card-head' }, h3(t('profile.language'))),
      p({ class: 'muted-p', style: 'text-align:left;padding:0 0 10px' }, t('profile.languageSub')),
      div(
        { class: 'seg seg-3' },
        LANGUAGES.map((l) => {
          const active = getLanguage() === l.code;
          return button(
            {
              type: 'button',
              'data-action': 'set-language',
              'data-lang': l.code,
              'aria-pressed': String(active),
              class: active ? 'on' : '',
            },
            l.label
          );
        })
      )
    );
  }

  _moneyRateCard(price) {
    return div(
      { class: 'card' },
      div(
        { class: 'card-head' },
        h3(t('profile.moneyRate')),
        span(
          { class: `badge ${price.error ? 'badge-error' : 'badge-neutral'}` },
          price.loading
            ? t('profile.updating')
            : price.rateSource === 'manual'
            ? t('profile.manual')
            : price.ageLabel || t('profile.auto')
        )
      ),
      label(
        { class: 'fld', style: 'margin-bottom:12px' },
        t('profile.currency'),
        select(
          { id: 'currencySelect', class: 'input' },
          CURRENCIES.map((c) =>
            option({ value: c, selected: c === price.currency }, c)
          )
        )
      ),
      button(
        { class: 'set-row', 'data-action': 'toggle-fiat', 'aria-pressed': String(price.showFiat) },
        this._ic('wallet'),
        span(
          b(t('profile.showFiat')),
          span(
            price.showFiat
              ? t('profile.comparingSats', { currency: price.currency })
              : t('profile.satsOnly')
          )
        ),
        span({ class: `switch ${price.showFiat ? 'on' : ''}` })
      ),
      div({ class: 'bud-top', style: 'margin:12px 0 6px' }, span(t('profile.rateSource'))),
      div(
        { class: 'seg' },
        button(
          {
            type: 'button',
            'data-action': 'rate-source',
            'data-src': 'auto',
            class: price.rateSource === 'auto' ? 'on' : '',
          },
          this._ic('spark'),
          t('profile.auto')
        ),
        button(
          {
            type: 'button',
            'data-action': 'rate-source',
            'data-src': 'manual',
            class: price.rateSource === 'manual' ? 'on' : '',
          },
          this._ic('edit'),
          t('profile.manual')
        )
      ),
      price.rateSource === 'manual'
        ? label(
            { class: 'fld', style: 'margin-top:12px' },
            t('profile.manualRate', { currency: price.currency }),
            input({
              id: 'manualRate',
              type: 'number',
              inputmode: 'decimal',
              value: price.manualRate || '',
              placeholder: '0',
            })
          )
        : null,
      div(
        { class: 'set-row', style: 'cursor:default' },
        this._ic('trending'),
        span(
          { style: 'flex:1;min-width:0' },
          b(
            `${t('profile.btcEquals')} ${
              price.rate ? priceService.formatAmount(price.rate, price.currency) : '—'
            }`
          ),
          span(
            price.error
              ? price.error
              : price.loading
              ? t('profile.updating')
              : price.ageLabel
              ? t('profile.updated', { age: price.ageLabel })
              : t('profile.notFetched')
          )
        ),
        button({ class: 'btn btn-ghost btn-sm', 'data-action': 'refresh-rate' }, t('common.refresh'))
      )
    );
  }

  _syncCard(sync, relays, authenticated) {
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

    return div(
      { class: 'card' },
      div(
        { class: 'card-head' },
        h3(t('profile.sync')),
        span({ class: `badge ${badge}` }, label)
      ),
      div(
        { class: 'set-row', style: 'cursor:default' },
        this._ic('bolt'),
        span({ style: 'flex:1;min-width:0' }, b(label), span(sub)),
        authenticated
          ? button(
              { class: 'btn btn-ghost btn-sm', 'data-action': 'retry-sync', disabled: !sync.online },
              t('profile.syncNow')
            )
          : null
      )
    );
  }

  _actionsCard({ authenticated, npub, appLock, hasLocalKey }) {
    return div(
      { class: 'card', style: 'padding:6px 16px' },
      authenticated
        ? button(
            { class: 'set-row', 'data-action': 'logout' },
            this._ic('lock'),
            span(b(t('profile.disconnect')), span(shortNpub(npub)))
          )
        : button(
            { class: 'set-row', 'data-action': 'connect' },
            this._ic('plug'),
            span(b(t('profile.connect')), span(t('profile.connectSub')))
          ),
      button(
        { class: 'set-row', 'data-action': 'edit-profile' },
        this._ic('edit'),
        span(b(t('profile.editProfile')), span(t('profile.nameBio')))
      ),
      button(
        { class: 'set-row', 'data-action': 'toggle-lock', 'aria-pressed': String(appLock) },
        this._ic('lock'),
        span(b(t('profile.appLock')), span(appLock ? t('profile.pinRequired') : t('profile.offNoPin'))),
        span({ class: `switch ${appLock ? 'on' : ''}`, 'aria-hidden': 'true' })
      ),
      appLock
        ? button(
            { class: 'set-row', 'data-action': 'change-pin' },
            this._ic('lock'),
            span(b(t('profile.changePin')), span(t('profile.reLock')))
          )
        : null,
      button(
        { class: 'set-row', 'data-action': 'export' },
        this._ic('download'),
        span(b(t('profile.export')), span(t('profile.exportSub')))
      ),
      authenticated
        ? button(
            { class: 'set-row', 'data-action': 'backup-key' },
            this._ic('key'),
            span(
              b(t('profile.backupKey')),
              span(hasLocalKey ? t('profile.backupKeySub') : t('profile.keyManagedByExt'))
            )
          )
        : null
    );
  }

  _relaysCard(savedRelays, relays) {
    return div(
      { class: 'card' },
      div(
        { class: 'card-head' },
        h3(t('profile.relays')),
        span(
          { class: `badge ${relays.length ? 'badge-success' : 'badge-neutral'}` },
          t('profile.connectedCount', { n: relays.length })
        )
      ),
      savedRelays.map((r) => {
        const conn = relays.includes(r);
        const isDefault = config.relays.default.includes(r);
        return div(
          { class: 'set-row', style: 'cursor:default' },
          span({ class: `status-dot ${conn ? 'connected' : ''}` }),
          span(
            { style: 'flex:1' },
            b({ class: 'font-mono', style: 'font-size:12px' }, r),
            span(
              conn ? t('profile.connected') : t('profile.offlineState'),
              isDefault ? ` · ${t('profile.default')}` : ''
            )
          ),
          isDefault
            ? null
            : button(
                { class: 'btn btn-ghost btn-sm', 'data-action': 'remove-relay', 'data-relay': r },
                t('common.remove')
              )
        );
      }),
      div(
        { class: 'join', style: 'margin-top:12px' },
        input({ type: 'text', class: 'input relay-input', placeholder: t('profile.relayPlaceholder') }),
        button(
          { class: 'btn btn-primary', 'data-action': 'add-relay', style: 'flex:0 0 auto' },
          t('common.add')
        )
      )
    );
  }

  _categoriesCard() {
    const cats = categoryService.getCategories();
    return div(
      { class: 'card' },
      div(
        { class: 'card-head' },
        h3(t('profile.categories')),
        button(
          { class: 'btn btn-ghost btn-sm', 'data-action': 'add-category' },
          t('profile.addCategory')
        )
      ),
      cats.map((cat) => this._categoryRow(cat))
    );
  }

  _categoryRow(cat) {
    const typeLabel =
      cat.type === 'income'
        ? t('tx.income')
        : cat.type === 'both'
        ? t('profile.categoryBoth')
        : t('tx.expense');
    return div(
      { class: 'set-row', style: 'cursor:default' },
      span({ style: 'font-size:18px;line-height:1' }, cat.icon),
      span({ style: 'flex:1' }, b(cat.name), span(typeLabel)),
      cat.isCustom
        ? button(
            { class: 'btn btn-ghost btn-sm', 'data-action': 'delete-category', 'data-id': cat.id },
            t('common.delete')
          )
        : null
    );
  }

  _openAddCategory() {
    const nameEl = input({ type: 'text', id: 'catName', maxlength: '40' });
    const typeEl = select(
      { id: 'catType', class: 'input' },
      option({ value: 'expense' }, t('tx.expense')),
      option({ value: 'income' }, t('tx.income')),
      option({ value: 'both' }, t('profile.categoryBoth'))
    );
    const iconEl = input({ type: 'text', id: 'catIcon', maxlength: '2', placeholder: '📌' });
    const colorEl = input({ type: 'color', id: 'catColor', value: '#8C8C8C' });

    const content = div(
      label({ class: 'fld' }, t('profile.categoryName'), nameEl),
      label({ class: 'fld' }, t('profile.categoryType'), typeEl),
      label({ class: 'fld' }, t('profile.categoryIcon'), iconEl),
      label({ class: 'fld' }, t('profile.categoryColor'), colorEl)
    );

    modal.open({
      title: t('profile.newCategory'),
      content,
      actions: [
        { label: t('common.cancel'), variant: 'btn-ghost', handler: () => {} },
        {
          label: t('common.save'),
          variant: 'btn-primary',
          closeOnClick: false,
          handler: async () => {
            const name = nameEl.value.trim();
            if (!name) {
              toast(t('profile.categoryName'), 'error');
              return false;
            }
            try {
              await categoryService.createCategory({
                name,
                type: typeEl.value,
                icon: iconEl.value || '📌',
                color: colorEl.value,
              });
              modal.close();
              toast(t('profile.categoryCreated'));
              this.render();
            } catch (err) {
              toast(err.message || t('profile.categoryCreated'), 'error');
            }
            return false;
          },
        },
      ],
    });
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
        this._syncAppearance();
      } else if (action === 'set-accent') {
        setAccent(el.dataset.accent);
        this._syncAppearance();
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
      } else if (action === 'add-category') {
        this._openAddCategory();
      } else if (action === 'delete-category') {
        const cat = categoryService.getCategory(el.dataset.id);
        if (!cat) return;
        const ok = await modal.confirm({
          title: t('profile.deleteCategoryTitle'),
          message: t('profile.deleteCategoryMessage'),
          confirmText: t('common.delete'),
          danger: true,
        });
        if (!ok) return;
        try {
          await categoryService.deleteCategory(cat.id);
          toast(t('profile.categoryDeleted'));
          this.render();
        } catch (err) {
          toast(err.message || t('profile.categoryDeleted'), 'error');
        }
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
      this._syncAppearance();
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

  /** Reflect the current theme/accent in the appearance card without a
   *  full re-render (avoids the layout flash on every toggle). */
  _syncAppearance() {
    const theme = getTheme();
    const accent = getAccent();

    this.$$('[data-action="set-theme"]').forEach((b) =>
      b.classList.toggle('on', b.dataset.theme === theme)
    );
    this.$$('.swatch').forEach((s) =>
      s.classList.toggle('on', s.dataset.accent === accent)
    );

    const label = this.container.querySelector('.bud-top b');
    if (label) {
      label.textContent = accent;
      label.style.color = accent;
    }

    const picker = this.container.querySelector('#accentPicker');
    if (picker) picker.value = accent.toLowerCase();
  }

  _openEditProfile() {
    const { name, bio, picture, nip05, lud16 } = this._profile();

    const nameEl = input({ type: 'text', id: 'peName', maxlength: '40', value: name });
    const bioEl = textarea({ id: 'peBio', rows: '3', maxlength: '160' }, bio);
    const pictureEl = input({
      type: 'url',
      id: 'pePicture',
      inputmode: 'url',
      placeholder: 'https://…',
      value: picture,
    });
    const nip05El = input({
      type: 'text',
      id: 'peNip05',
      placeholder: 'you@domain.com',
      value: nip05,
    });
    const lud16El = input({
      type: 'text',
      id: 'peLud16',
      placeholder: 'you@getalby.com',
      value: lud16,
    });

    const content = div(
      label({ class: 'fld' }, t('profile.displayName'), nameEl),
      label({ class: 'fld' }, t('profile.bio'), bioEl),
      label({ class: 'fld' }, t('profile.picture'), pictureEl),
      label({ class: 'fld' }, t('profile.nip05'), nip05El),
      label({ class: 'fld' }, t('profile.lightningAddress'), lud16El),
      p({ class: 'hint', style: 'max-width:none' }, t('profile.editProfileHint'))
    );

    modal.open({
      title: t('profile.editProfile'),
      content,
      actions: [
        {
          label: t('common.save'),
          variant: 'btn-primary',
          handler: () => {
            const meta = {
              name: nameEl.value.trim() || name,
              about: bioEl.value.trim(),
              picture: pictureEl.value.trim(),
              nip05: nip05El.value.trim(),
              lud16: lud16El.value.trim(),
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
        content: p({ style: 'margin:0;line-height:1.6' }, t('profile.keyManagedByExtBody')),
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

    const nsecInput = input({
      id: 'peNsec',
      type: 'password',
      readonly: true,
      value: nsec,
      class: 'input font-mono',
      spellcheck: 'false',
      autocomplete: 'off',
    });

    const revealBtn = button({
      type: 'button',
      class: 'btn btn-ghost',
      id: 'peReveal',
      'aria-label': t('profile.reveal'),
      title: t('profile.reveal'),
      innerHTML: Icons.eye,
      onclick: (e) => {
        const show = nsecInput.type === 'password';
        nsecInput.type = show ? 'text' : 'password';
        e.currentTarget.innerHTML = show ? Icons.eyeOff : Icons.eye;
      },
    });

    const content = div(
      div(
        { class: 'alert alert-warning', style: 'margin-bottom:14px' },
        b({ style: 'display:block;margin-bottom:4px' }, t('profile.secretWarningTitle')),
        span({ style: 'font-size:12.5px;line-height:1.5' }, t('profile.secretWarningBody'))
      ),
      label({ class: 'fld' }, t('profile.secretKey'), div({ class: 'key-field' }, nsecInput, revealBtn)),
      label(
        { class: 'fld' },
        t('login.publicKey'),
        input({
          id: 'peNpub',
          type: 'text',
          readonly: true,
          value: npub,
          class: 'input font-mono',
          spellcheck: 'false',
        })
      )
    );

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
      app: 'PocketZap',
      type: 'nostr-identity-backup',
      exported_at: new Date().toISOString(),
      npub,
      nsec,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pocketzap-key-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t('profile.keyDownloaded'), 'warning');
  }

  _exportData() {
    const data = {
      app: 'PocketZap',
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
    a.download = `pocketzap-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t('profile.backupDownloaded'));
  }

  _addRelay() {
    const input2 = this.$('.relay-input');
    const url = (input2?.value || '').trim();
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
      input2.value = '';
      this.render();
      toast(t('profile.relayAdded'));
    }
  }
}

export default ProfilePage;
