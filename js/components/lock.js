/**
 * Lock Component - local PIN gate
 * Keeps the journal private on-device.
 *
 * VanJS view: the lock screen markup is built with `van.tags` (it previously
 * lived as static HTML in index.html) so no `hydrateIcons` pass is needed.
 *
 * @module components/lock
 */

import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { t } from '../core/i18n.js';
import { Icons } from '../utils/icons.js';
import van from '../vendor/van.js';

const { br, button, div, em, h1, img, span } = van.tags;

const PIN_KEY = 'zapjournal.pin.v1';

/** demo-grade PIN hash — swap for WebCrypto (PBKDF2/Argon2) in production */
const pinHash = (p) => {
  let h = 9;
  for (const c of p) h = Math.imul(h ^ c.charCodeAt(0), 387420489);
  return (h >>> 0).toString(36);
};

class Lock {
  constructor() {
    this._el = null;
    this._titleEl = null;
    this._subEl = null;
    this._dotsEl = null;
    this._forgotEl = null;
    this._cancelEl = null;
    this._footEl = null;
    this._backBtn = null;
    this.mode = null;
    this.draft = '';
    this.temp = null;
  }

  _build() {
    this._titleEl = div({ class: 'lock-title', id: 'lockTitle' });
    this._subEl = div({ class: 'lock-sub', id: 'lockSub' });
    this._dotsEl = div(
      { class: 'pin-dots', id: 'pinDots' },
      [0, 1, 2, 3].map(() => span({ class: 'pdot' }))
    );

    const digit = (k) =>
      button({ class: 'key', 'data-key': k, onclick: () => this.press(k) }, k);

    this._backBtn = button(
      { class: 'key', 'data-key': 'back', onclick: () => this.press('back') },
      span({ class: 'ic', innerHTML: Icons.back })
    );

    this._forgotEl = button({ id: 'forgotPin', hidden: true, onclick: () => this._forgot() });
    this._cancelEl = button({
      id: 'lockCancel',
      hidden: true,
      onclick: () => {
        this._cancelable = false;
        this.hide();
      },
    });
    this._footEl = span();

    this._el = div(
      { class: 'lockscr', id: 'lockscr', role: 'dialog', 'aria-modal': 'true', hidden: true },
      div(
        { class: 'lock-brand' },
        span({ class: 'lock-mark' }, img({ src: 'assets/icons/logo.svg', alt: '' })),
        h1('Pocket', em('Zap'))
      ),
      this._titleEl,
      this._subEl,
      this._dotsEl,
      div(
        { class: 'keypad', id: 'keypad' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit),
        button({ class: 'key ghost', 'aria-hidden': 'true' }),
        digit('0'),
        this._backBtn
      ),
      div({ class: 'lock-foot' }, this._footEl, br(), this._forgotEl, this._cancelEl)
    );
    return this._el;
  }

  _ensure() {
    if (this._el) return true;
    this._build();
    document.body.appendChild(this._el);
    return true;
  }

  hasPin() {
    try {
      return !!localStorage.getItem(PIN_KEY);
    } catch (e) {
      return false;
    }
  }

  /** App lock is enabled when a PIN has been set. */
  isEnabled() {
    return this.hasPin();
  }

  /** Turn the app lock off and forget the PIN. */
  disable() {
    try {
      localStorage.removeItem(PIN_KEY);
    } catch (e) {
      /* ignore */
    }
    store.set('appLock', false);
    this.hide();
  }

  show(mode, { cancelable = false } = {}) {
    if (!this._ensure()) return;
    this.mode = mode;
    this.draft = '';
    this.temp = null;
    this._cancelable = cancelable;
    this._render();
    this._el.hidden = false;
    document.body.classList.add('lock');
  }

  hide() {
    if (!this._el) return;
    this._el.hidden = true;
    document.body.classList.remove('lock');
  }

  _render() {
    const titles = {
      setup: t('lock.createTitle'),
      confirm: t('lock.confirmTitle'),
      unlock: t('lock.unlockTitle'),
    };
    const subs = {
      setup: t('lock.createSub'),
      confirm: t('lock.confirmSub'),
      unlock: t('lock.unlockSub'),
    };
    this._titleEl.textContent = titles[this.mode];
    this._subEl.textContent = subs[this.mode];
    this._footEl.textContent = t('lock.privateByDesign');
    this._backBtn.setAttribute('aria-label', t('lock.delete'));
    this._forgotEl.textContent = t('lock.forgot');
    this._cancelEl.textContent = t('lock.notNow');
    this._forgotEl.hidden = this.mode !== 'unlock';
    if (this._cancelEl) {
      this._cancelEl.hidden = !(this._cancelable && this.mode !== 'unlock');
    }
    this._dots();
  }

  _dots() {
    [...this._dotsEl.children].forEach((d, i) =>
      d.classList.toggle('on', i < this.draft.length)
    );
  }

  press(k) {
    if (k === 'back') {
      this.draft = this.draft.slice(0, -1);
      this._dots();
      return;
    }
    if (this.draft.length >= 4) return;
    this.draft += k;
    this._dots();
    if (this.draft.length === 4) setTimeout(() => this._submit(), 140);
  }

  _submit() {
    const p = this.draft;
    if (this.mode === 'setup') {
      this.temp = p;
      this.mode = 'confirm';
      this.draft = '';
      this._render();
    } else if (this.mode === 'confirm') {
      if (p === this.temp) {
        try {
          localStorage.setItem(PIN_KEY, pinHash(p));
        } catch (e) {
          /* ignore */
        }
        store.set('appLock', true);
        this.hide();
        this._emit(t('lock.appLockOn'));
      } else {
        this._err();
        this.mode = 'setup';
        this.temp = null;
        setTimeout(() => this._render(), 450);
      }
    } else if (this.mode === 'unlock') {
      let stored = null;
      try {
        stored = localStorage.getItem(PIN_KEY);
      } catch (e) {
        /* ignore */
      }
      if (pinHash(p) === stored) {
        this.hide();
        this._emit(t('lock.unlocked'));
      } else {
        this._err();
      }
    }
  }

  _err() {
    this._dotsEl.classList.add('shake');
    this.draft = '';
    setTimeout(() => {
      this._dotsEl.classList.remove('shake');
      this._dots();
    }, 450);
  }

  _forgot() {
    const b = this._forgotEl;
    if (b.dataset.armed === '1') {
      try {
        localStorage.removeItem(PIN_KEY);
      } catch (e) {
        /* ignore */
      }
      location.reload();
      return;
    }
    b.dataset.armed = '1';
    b.classList.add('armd');
    b.textContent = t('lock.tapAgainReset');
    setTimeout(() => {
      b.dataset.armed = '';
      b.classList.remove('armd');
      b.textContent = t('lock.forgot');
    }, 2600);
  }

  _emit(message) {
    eventBus.emit(Events.TOAST_SHOW, { message, type: 'success' });
  }
}

export const lock = new Lock();
export default lock;
