/**
 * About Page - app info, contributor and donate
 *
 * Resolves the maintainer's Lightning address (lud16/lud06) from their Nostr
 * kind 0 metadata and offers a one-tap donate flow.
 *
 * @module pages/about
 */

import { Component } from '../core/component.js';
import { store } from '../core/state.js';
import { config } from '../config.js';
import {
  fetchProfile,
  lightningAddressOf,
  lightningUri,
  shortNpub,
} from '../services/profile-service.js';
import { Icons, hydrateIcons } from '../utils/icons.js';
import { copyText, toast } from '../utils/ui.js';

const NJUMP = 'https://njump.me/';

const FEATURES = [
  {
    icon: 'lock',
    title: 'Private journal',
    text: 'Entries encrypted with NIP-04 and stored as notes-to-self.',
  },
  {
    icon: 'bolt',
    title: 'Sats tracker',
    text: 'Zap receipts in and out, with budgets, reports and categories.',
  },
  {
    icon: 'download',
    title: 'Offline & yours',
    text: 'Installable PWA, local-first, export everything anytime.',
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

  _personHtml(npub, profile, copyAction) {
    const name =
      profile?.display_name || profile?.name || (npub ? shortNpub(npub) : 'Anonymous');
    const nip05 = String(profile?.nip05 || '').trim();
    const pic = this._safeUrl(profile?.picture);
    const initial = (name[0] || '?').toUpperCase();

    return `
      <div class="person">
        ${
          pic
            ? `<span class="avatar avatar-sm"><img src="${this.escape(
                pic
              )}" alt="" loading="lazy" referrerpolicy="no-referrer" /></span>`
            : `<span class="avatar avatar-sm" style="background:linear-gradient(135deg,var(--accent),var(--accent-deep))">${this.escape(
                initial
              )}</span>`
        }
        <div class="person-body">
          <b>${this.escape(name)}</b>
          <span>${this.escape(nip05 || shortNpub(npub))}</span>
        </div>
        ${
          nip05
            ? `<span class="badge badge-success" title="NIP-05 verified">${Icons.check}${this.escape(
                nip05.split('@')[1] || 'NIP-05'
              )}</span>`
            : ''
        }
      </div>
      <div class="about-links">
        <button class="btn btn-outline btn-sm" data-action="${copyAction}" data-copy="${this.escape(
      npub
    )}">
          <span class="ic">${Icons.copy}</span>Copy npub
        </button>
        <a class="btn btn-ghost btn-sm" href="${NJUMP}${this.escape(
      npub
    )}" target="_blank" rel="noopener noreferrer">
          <span class="ic">${Icons.external}</span>View on Nostr
        </a>
      </div>
    `;
  }

  _donateHtml() {
    const owner = config.team.owner;
    const address = lightningAddressOf(this._profiles.owner);

    if (address) {
      return `
        <p class="about-lead">Support the maintainer with a Lightning zap. No middlemen.</p>
        <div class="ln-box">
          <span class="ln-label">Lightning address</span>
          <b class="ln-addr">${this.escape(address)}</b>
        </div>
        <div class="about-links">
          <button class="btn btn-primary" data-action="copy-ln" data-copy="${this.escape(address)}">
            <span class="ic">${Icons.copy}</span>Copy address
          </button>
          <a class="btn btn-outline" href="${this.escape(lightningUri(address))}">
            <span class="ic">${Icons.zap}</span>Open wallet
          </a>
        </div>`;
    }

    const loading = this._loading;
    return `
      <p class="about-lead">${
        loading
          ? 'Looking up the maintainer’s Lightning address…'
          : 'No Lightning address is published in the maintainer’s Nostr profile yet.'
      }</p>
      <div class="ln-box ${loading ? 'is-loading' : ''}">
        <span class="ln-label">Owner</span>
        <b class="ln-addr">${loading ? 'Resolving…' : this.escape(shortNpub(owner))}</b>
      </div>
      <div class="about-links">
        ${
          loading
            ? ''
            : `<button class="btn btn-outline btn-sm" data-action="copy-owner" data-copy="${this.escape(
                owner
              )}">
                 <span class="ic">${Icons.copy}</span>Copy npub
               </button>`
        }
        <a class="btn btn-ghost btn-sm" href="${NJUMP}${this.escape(
      owner
    )}" target="_blank" rel="noopener noreferrer">
          <span class="ic">${Icons.zap}</span>Zap on Nostr
        </a>
        <button class="btn btn-ghost btn-sm" data-action="refresh-ln" ${
          loading ? 'disabled' : ''
        }>
          <span class="ic">${Icons.spark}</span>Retry
        </button>
      </div>`;
  }

  template() {
    const { homepage, repository, version } = {
      homepage: config.app.homepage,
      repository: config.app.repository,
      version: config.app.version,
    };

    return `
      <div class="view-title"><span class="ic">${Icons.info}</span>About</div>

      <div class="card about-hero">
        <span class="about-mark"><img src="assets/icons/logo-mark.svg" alt="" /></span>
        <h2 class="about-name">Zap<em>Journal</em></h2>
        <p class="about-tagline">
          A private journal and Lightning sats tracker on Nostr.
          Local-first, self-custodial, yours.
        </p>
        <span class="badge badge-neutral">v${this.escape(version)}</span>
        <div class="about-links">
          <a class="btn btn-primary" href="${this.escape(
            homepage
          )}" target="_blank" rel="noopener noreferrer">
            <span class="ic">${Icons.globe}</span>bitos.space
          </a>
          <a class="btn btn-outline" href="${this.escape(
            repository
          )}" target="_blank" rel="noopener noreferrer">
            <span class="ic">${Icons.code}</span>Source
          </a>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>What’s inside</h3></div>
        ${FEATURES.map(
          (f) => `<div class="about-feature">
            <span class="ic">${Icons[f.icon] || Icons.info}</span>
            <span><b>${this.escape(f.title)}</b><span>${this.escape(f.text)}</span></span>
          </div>`
        ).join('')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Contributor</h3><span class="badge badge-primary">Core</span></div>
        ${this._personHtml(config.team.contributor, this._profiles.contributor, 'copy-contributor')}
      </div>

      <div class="card about-donate">
        <div class="card-head"><h3>Donate</h3><span class="badge">${Icons.zap}sats</span></div>
        ${this._donateHtml()}
      </div>

      <p class="muted-p" style="margin-bottom:24px">
        ZapJournal v${this.escape(version)} · built by bitos.space · MIT-spirited, self-custody forever
      </p>
    `;
  }

  bindEvents() {
    if (this._delegated) return;
    this._delegated = true;
    this.container.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || !this.container.contains(el)) return;
      const action = el.dataset.action;
      const copy = el.dataset.copy || '';

      if (action === 'copy-contributor') {
        if (copy) copyText(copy, 'Contributor npub copied');
      } else if (action === 'copy-owner') {
        if (copy) copyText(copy, 'Owner npub copied');
      } else if (action === 'copy-ln') {
        if (copy) copyText(copy, 'Lightning address copied ⚡');
      } else if (action === 'refresh-ln') {
        this._load(true).then(() => {
          if (!lightningAddressOf(this._profiles.owner)) {
            toast('Still no Lightning address found', 'warning');
          }
        });
      }
    });
  }

  afterRender() {
    hydrateIcons(this.container);
  }
}

export default AboutPage;
