/**
 * About Page - app info, contributor and donate
 *
 * Resolves the maintainer's Lightning address (lud16/lud06) from their Nostr
 * kind 0 metadata and offers a one-tap donate flow.
 *
 * VanJS view: `template()` returns DOM nodes built with `van.tags`, so profile
 * fields are escaped automatically and no `hydrateIcons` pass is needed.
 *
 * @module pages/about
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { config } from '../config.js';
import { t } from '../core/i18n.js';
import {
  fetchProfile,
  lightningAddressOf,
  lightningUri,
  shortNpub,
} from '../services/profile-service.js';
import { Icons } from '../utils/icons.js';
import { copyText, toast } from '../utils/ui.js';
import van from '../vendor/van.js';

const { a, b, button, div, em, h2, h3, img, p, span } = van.tags;

const NJUMP = 'https://njump.me/';

const FEATURES = [
  {
    icon: 'lock',
    titleKey: 'about.featurePrivateTitle',
    textKey: 'about.featurePrivateText',
  },
  {
    icon: 'bolt',
    titleKey: 'about.featureSatsTitle',
    textKey: 'about.featureSatsText',
  },
  {
    icon: 'download',
    titleKey: 'about.featureOfflineTitle',
    textKey: 'about.featureOfflineText',
  },
];

export class AboutPage extends Component {
  constructor(options) {
    super(options);
    this._profiles = { contributor: null, owner: null };
    this._loading = false;
    this._attempts = 0;
  }

  mounted() {
    this._load();
    // If we resolved nothing offline, try again once relays come online.
    this.watchStore('relays.connected', () => {
      const relays = store.get('relays.connected') || [];
      if (
        relays.length &&
        !this._loading &&
        !lightningAddressOf(this._profiles.owner) &&
        this._attempts < 3
      ) {
        this._load();
      }
    });
  }

  async _load(force = false) {
    if (this._loading) return;
    if (force) this._attempts = 0;
    if (!force && (this._attempts >= 3 || lightningAddressOf(this._profiles.owner))) {
      return;
    }
    this._attempts++;
    this._loading = true;
    if (this._isMounted) this.render();
    const [contributor, owner] = await Promise.all([
      fetchProfile(config.team.contributor),
      fetchProfile(config.team.owner),
    ]);
    this._profiles = { contributor, owner };
    this._loading = false;
    if (this._isMounted) this.render();
  }

  _safeUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
    } catch {
      return '';
    }
  }

  _icon(name) {
    return span({ class: 'ic', innerHTML: Icons[name] || Icons.info });
  }

  _person(npub, profile, copyAction) {
    const name =
      profile?.display_name || profile?.name || (npub ? shortNpub(npub) : t('profile.anon'));
    const nip05 = String(profile?.nip05 || '').trim();
    const pic = this._safeUrl(profile?.picture);
    const initial = (name[0] || '?').toUpperCase();

    return [
      div(
        { class: 'person' },
        pic
          ? span(
              { class: 'avatar avatar-sm' },
              img({ src: pic, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
            )
          : span(
              {
                class: 'avatar avatar-sm',
                style: 'background:linear-gradient(135deg,var(--accent),var(--accent-deep))',
              },
              initial
            ),
        div({ class: 'person-body' }, b(name), span(nip05 || shortNpub(npub))),
        nip05
          ? span(
              { class: 'badge badge-success', title: 'NIP-05 verified' },
              this._icon('check'),
              nip05.split('@')[1] || 'NIP-05'
            )
          : null
      ),
      div(
        { class: 'about-links' },
        button(
          { class: 'btn btn-outline btn-sm', 'data-action': copyAction, 'data-copy': npub },
          this._icon('copy'),
          t('common.copyNpub')
        ),
        a(
          {
            class: 'btn btn-ghost btn-sm',
            href: `${NJUMP}${npub}`,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          this._icon('external'),
          t('common.viewOnNostr')
        )
      ),
    ];
  }

  _donate() {
    const owner = config.team.owner;
    const address = lightningAddressOf(this._profiles.owner);
    const loading = this._loading;

    if (address) {
      return [
        p({ class: 'about-lead' }, t('about.supportMaintainer')),
        div(
          { class: 'ln-box' },
          span({ class: 'ln-label' }, t('about.lightningAddress')),
          b({ class: 'ln-addr' }, address)
        ),
        div(
          { class: 'about-links' },
          button(
            { class: 'btn btn-primary', 'data-action': 'copy-ln', 'data-copy': address },
            this._icon('copy'),
            t('about.copyAddress')
          ),
          a(
            { class: 'btn btn-outline', href: lightningUri(address) },
            this._icon('zap'),
            t('about.openWallet')
          )
        ),
      ];
    }

    return [
      p({ class: 'about-lead' }, loading ? t('about.lookingUp') : t('about.noLnAddress')),
      div(
        { class: `ln-box ${loading ? 'is-loading' : ''}` },
        span({ class: 'ln-label' }, t('about.owner')),
        b({ class: 'ln-addr' }, loading ? t('about.resolving') : shortNpub(owner))
      ),
      div(
        { class: 'about-links' },
        loading
          ? null
          : button(
              { class: 'btn btn-outline btn-sm', 'data-action': 'copy-owner', 'data-copy': owner },
              this._icon('copy'),
              t('common.copyNpub')
            ),
        a(
          {
            class: 'btn btn-ghost btn-sm',
            href: `${NJUMP}${owner}`,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          this._icon('zap'),
          t('about.zapOnNostr')
        ),
        button(
          { class: 'btn btn-ghost btn-sm', 'data-action': 'refresh-ln', disabled: loading },
          this._icon('spark'),
          t('common.retry')
        )
      ),
    ];
  }

  template() {
    const { homepage, repository, version } = {
      homepage: config.app.homepage,
      repository: config.app.repository,
      version: config.app.version,
    };

    const frag = document.createDocumentFragment();
    van.add(
      frag,
      div({ class: 'view-title' }, this._icon('info'), t('about.title')),
      div(
        { class: 'card about-hero' },
        span({ class: 'about-mark' }, img({ src: 'assets/icons/logo.svg', alt: '' })),
        h2({ class: 'about-name' }, 'Pocket', em('Zap')),
        p({ class: 'about-tagline' }, t('about.tagline')),
        span({ class: 'badge badge-neutral' }, `v${version}`),
        div(
          { class: 'about-links' },
          a(
            { class: 'btn btn-primary', href: homepage, target: '_blank', rel: 'noopener noreferrer' },
            this._icon('globe'),
            'bitos.space'
          ),
          a(
            { class: 'btn btn-outline', href: repository, target: '_blank', rel: 'noopener noreferrer' },
            this._icon('code'),
            t('about.source')
          )
        )
      ),
      div(
        { class: 'card' },
        div({ class: 'card-head' }, h3(t('about.whatsInside'))),
        FEATURES.map((f) =>
          div(
            { class: 'about-feature' },
            this._icon(f.icon),
            span(b(t(f.titleKey)), span(t(f.textKey)))
          )
        )
      ),
      div(
        { class: 'card' },
        div(
          { class: 'card-head' },
          h3(t('about.contributor')),
          span({ class: 'badge badge-primary' }, t('about.core'))
        ),
        this._person(config.team.contributor, this._profiles.contributor, 'copy-contributor')
      ),
      div(
        { class: 'card about-donate' },
        div(
          { class: 'card-head' },
          h3(t('about.donate')),
          span({ class: 'badge' }, this._icon('zap'), t('common.sats'))
        ),
        this._donate()
      ),
      div(
        { class: 'card', style: 'padding:6px 16px' },
        button(
          { class: 'set-row', 'data-action': 'force-update' },
          this._icon('undo'),
          span(b(t('about.forceUpdate')), span(t('about.forceUpdateSub')))
        )
      ),
      p(
        { class: 'muted-p', style: 'margin-bottom:24px' },
        `${t('common.byBitOS')} · v${version} · ${t('about.footer')}`
      )
    );
    return frag;
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.addEventListener(this.container, 'click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || !this.container.contains(el)) return;
      const action = el.dataset.action;
      const copy = el.dataset.copy || '';

      if (action === 'copy-contributor') {
        if (copy) copyText(copy, t('about.copyContributor'));
      } else if (action === 'copy-owner') {
        if (copy) copyText(copy, t('about.copyOwner'));
      } else if (action === 'copy-ln') {
        if (copy) copyText(copy, t('about.lnCopied'));
      } else if (action === 'refresh-ln') {
        this._load(true).then(() => {
          if (!lightningAddressOf(this._profiles.owner)) {
            toast(t('about.stillNoLn'), 'warning');
          }
        });
      } else if (action === 'force-update') {
        this._forceUpdate(el);
      }
    });
  }

  /** Clear only cached app files and reload the current release. */
  async _forceUpdate(button) {
    if (!navigator.onLine) {
      toast(t('about.updateOffline'), 'warning');
      return;
    }

    button.disabled = true;
    try {
      if (!('serviceWorker' in navigator)) {
        location.reload();
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
        const worker = registration.waiting || registration.installing;
        if (worker) {
          toast(t('about.updateInstalling'), 'info');
          worker.postMessage('skipWaiting');
          // index.html reloads when the new worker takes control.
          if (!navigator.serviceWorker.controller) setTimeout(() => location.reload(), 500);
          return;
        }
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames
            .filter((name) => name.startsWith('zap-journal-'))
            .map((name) => caches.delete(name))
        );
      }
      if (registration) await registration.unregister();

      toast(t('about.updateReloading'), 'info');
      setTimeout(() => location.reload(), 250);
    } catch (err) {
      console.warn('[App] Force update failed:', err);
      button.disabled = false;
      toast(t('about.updateFailed'), 'warning');
    }
  }
}

export default AboutPage;
