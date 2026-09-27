/**
 * Lock Component - local PIN gate
 * Keeps the journal private on-device (mirrors docs/ex.html lock screen).
 *
 * @module components/lock
 */

import { hydrateIcons } from '../utils/icons.js';
import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';

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
    this.mode = null;
    this.draft = '';
    this.temp = null;
    this._bound = false;
  }

  _ensure() {
    if (this._el) return true;
    this._el = document.getElementById('lockscr');
    if (!this._el) return false;
    this._titleEl = document.getElementById('lockTitle');
    this._subEl = document.getElementById('lockSub');
    this._dotsEl = document.getElementById('pinDots');
    this._forgotEl = document.getElementById('forgotPin');
    this._cancelEl = document.getElementById('lockCancel');

    if (!this._bound) {
      document.querySelectorAll('#keypad .key[data-key]').forEach((k) =>
        k.addEventListener('click', () => this.press(k.dataset.key))
      );
      if (this._forgotEl) {
        this._forgotEl.addEventListener('click', () => this._forgot());
      }
      if (this._cancelEl) {
        this._cancelEl.addEventListener('click', () => {
          this._cancelable = false;
          this.hide();
        });
      }
      this._bound = true;
    }
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
    hydrateIcons(this._el);
  }

  hide() {
    if (!this._el) return;
    this._el.hidden = true;
    document.body.classList.remove('lock');
  }

  _render() {
    const titles = {
      setup: 'Create your PIN',
      confirm: 'Confirm your PIN',
      unlock: 'Welcome back',
    };
    const subs = {
      setup: '4 digits · keeps your journal private on this device',
      confirm: 'Type it once more to make sure',
      unlock: 'Enter your PIN to unlock your journal',
    };
    this._titleEl.textContent = titles[this.mode];
    this._subEl.textContent = subs[this.mode];
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
        this._emit('App lock on 🔒');
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
        this._emit('Unlocked 🔓');
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
    b.textContent = 'Tap again to reset PIN';
    setTimeout(() => {
      b.dataset.armed = '';
      b.classList.remove('armd');
      b.textContent = 'Forgot PIN?';
    }, 2600);
  }

  _emit(message) {
    eventBus.emit(Events.TOAST_SHOW, { message, type: 'success' });
  }
}

export const lock = new Lock();
export default lock;
