/**
 * Modal Component
 * Accessible modal dialog
 *
 * VanJS view: the modal chrome is built with `van.tags`; content may be an
 * HTML string (legacy) or VanJS node(s). `confirm`/`alert` pass node content,
 * so their messages are escaped automatically.
 *
 * @module components/modal
 */

import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';
import { t } from '../core/i18n.js';
import van from '../vendor/van.js';

const { button, div, h2, p } = van.tags;

const CLOSE_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>`;

class ModalManager {
    constructor() {
        this._overlay = null;
        this._modal = null;
        this._titleEl = null;
        this._bodyEl = null;
        this._footerEl = null;
        this._previousFocus = null;
        this._init();
    }

    /**
     * Initialize modal structure
     * @private
     */
    _init() {
        this._titleEl = h2({ class: 'modal-title' });
        this._bodyEl = div({ class: 'modal-body' });
        this._footerEl = div({ class: 'modal-footer' });

        const closeBtn = button({
            class: 'modal-close btn-icon btn-ghost',
            'aria-label': t('common.close'),
            innerHTML: CLOSE_SVG,
            onclick: () => this.close(),
        });

        this._modal = div(
            { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
            div({ class: 'modal-header' }, this._titleEl, closeBtn),
            this._bodyEl,
            this._footerEl
        );

        this._overlay = div({ class: 'modal-overlay', 'aria-hidden': 'true' }, this._modal);
        document.body.appendChild(this._overlay);

        // Event listeners
        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay) {
                this.close();
            }
        });

        // Keyboard handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });

        // Swipe-down-to-close (mobile sheets)
        let touchStart = null;
        this._modal.addEventListener('touchstart', (e) => {
            touchStart = {
                y: e.touches[0].clientY,
                top: this._modal.getBoundingClientRect().top,
            };
        }, { passive: true });
        this._modal.addEventListener('touchend', (e) => {
            if (!touchStart) return;
            const dy = e.changedTouches[0].clientY - touchStart.y;
            if (dy > 90 && touchStart.y - touchStart.top < 60) {
                this.close();
            }
            touchStart = null;
        }, { passive: true });

        // Listen for modal events
        eventBus.on(Events.MODAL_OPEN, (options) => this.open(options));
        eventBus.on(Events.MODAL_CLOSE, () => this.close());
    }

    /**
     * Open modal
     * @param {Object} options - Modal options
     * @param {string} options.title - Modal title
     * @param {string|Node|Array<Node>} options.content - Modal body content
     * @param {Array} [options.actions] - Footer action buttons
     * @param {Function} [options.onClose] - Close callback
     */
    open({ title, content, actions = [], onClose = null }) {
        // Save current focus
        this._previousFocus = document.activeElement;

        // Set title
        this._titleEl.textContent = title;
        this._titleEl.id = 'modal-title';
        this._modal.setAttribute('aria-labelledby', 'modal-title');
        this._modal.querySelector('.modal-close')?.setAttribute('aria-label', t('common.close'));

        // Set content — accept an HTML string (legacy) or VanJS node(s).
        if (typeof content === 'string') {
            this._bodyEl.innerHTML = content;
        } else if (content instanceof Node) {
            this._bodyEl.replaceChildren(content);
        } else if (Array.isArray(content)) {
            this._bodyEl.replaceChildren(...content);
        }

        // Set footer actions
        this._footerEl.innerHTML = '';
        if (actions.length > 0) {
            this._footerEl.style.display = '';
            actions.forEach((action) => {
                const buttonEl = document.createElement('button');
                buttonEl.className = `btn ${action.variant || 'btn-secondary'}`;
                buttonEl.textContent = action.label;
                buttonEl.addEventListener('click', () => {
                    if (action.handler) {
                        const result = action.handler();
                        if (result !== false && action.closeOnClick !== false) {
                            this.close();
                        }
                    } else {
                        this.close();
                    }
                });
                this._footerEl.appendChild(buttonEl);
            });
        } else {
            this._footerEl.style.display = 'none';
        }

        // Store close callback
        this._onClose = onClose;

        // Show modal
        this._overlay.classList.add('open');
        this._overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Update state
        store.set('ui.modalOpen', true);
        store.set('ui.modalContent', { title, content: typeof content === 'string' ? content : 'element' });

        // Focus first focusable element
        requestAnimationFrame(() => {
            const focusable = this._modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable) focusable.focus();
        });
    }

    /**
     * Close modal
     */
    close() {
        this._overlay.classList.remove('open');
        this._overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        // Update state
        store.set('ui.modalOpen', false);
        store.set('ui.modalContent', null);

        // Call close callback
        if (this._onClose) {
            this._onClose();
            this._onClose = null;
        }

        // Restore focus
        if (this._previousFocus) {
            this._previousFocus.focus();
            this._previousFocus = null;
        }
    }

    /**
     * Check if modal is open
     * @returns {boolean}
     */
    isOpen() {
        return this._overlay.classList.contains('open');
    }

    /**
     * Show confirm dialog
     * @param {Object} options
     * @returns {Promise<boolean>}
     */
    confirm({ title, message, confirmText = null, cancelText = null, danger = false }) {
        return new Promise((resolve) => {
            this.open({
                title,
                content: p(message),
                actions: [
                    {
                        label: cancelText || t('common.cancel'),
                        variant: 'btn-secondary',
                        handler: () => {
                            resolve(false);
                        }
                    },
                    {
                        label: confirmText || t('common.confirm'),
                        variant: danger ? 'btn-danger' : 'btn-primary',
                        handler: () => {
                            resolve(true);
                        }
                    }
                ],
                onClose: () => resolve(false)
            });
        });
    }

    /**
     * Show alert dialog
     * @param {Object} options
     * @returns {Promise<void>}
     */
    alert({ title, message, buttonText = null }) {
        return new Promise((resolve) => {
            this.open({
                title,
                content: p(message),
                actions: [
                    {
                        label: buttonText || t('common.ok'),
                        variant: 'btn-primary',
                        handler: () => resolve()
                    }
                ],
                onClose: () => resolve()
            });
        });
    }
}

// Singleton instance
export const modal = new ModalManager();

export default modal;
