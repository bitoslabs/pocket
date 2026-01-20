/**
 * Modal Component
 * Accessible modal dialog
 * 
 * @module components/modal
 */

import { eventBus, Events } from '../core/event-bus.js';
import { store } from '../core/state.js';

class ModalManager {
    constructor() {
        this._overlay = null;
        this._modal = null;
        this._previousFocus = null;
        this._init();
    }

    /**
     * Initialize modal structure
     * @private
     */
    _init() {
        // Create overlay
        this._overlay = document.createElement('div');
        this._overlay.className = 'modal-overlay';
        this._overlay.setAttribute('aria-hidden', 'true');

        // Create modal
        this._modal = document.createElement('div');
        this._modal.className = 'modal';
        this._modal.setAttribute('role', 'dialog');
        this._modal.setAttribute('aria-modal', 'true');

        this._modal.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title"></h2>
        <button class="modal-close btn-icon btn-ghost" aria-label="Close modal">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>
    `;

        this._overlay.appendChild(this._modal);
        document.body.appendChild(this._overlay);

        // Event listeners
        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay) {
                this.close();
            }
        });

        this._modal.querySelector('.modal-close').addEventListener('click', () => {
            this.close();
        });

        // Keyboard handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });

        // Listen for modal events
        eventBus.on(Events.MODAL_OPEN, (options) => this.open(options));
        eventBus.on(Events.MODAL_CLOSE, () => this.close());
    }

    /**
     * Open modal
     * @param {Object} options - Modal options
     * @param {string} options.title - Modal title
     * @param {string|HTMLElement} options.content - Modal body content
     * @param {Array} [options.actions] - Footer action buttons
     * @param {Function} [options.onClose] - Close callback
     */
    open({ title, content, actions = [], onClose = null }) {
        // Save current focus
        this._previousFocus = document.activeElement;

        // Set title
        const titleEl = this._modal.querySelector('.modal-title');
        titleEl.textContent = title;
        this._modal.setAttribute('aria-labelledby', 'modal-title');
        titleEl.id = 'modal-title';

        // Set content
        const bodyEl = this._modal.querySelector('.modal-body');
        if (typeof content === 'string') {
            bodyEl.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            bodyEl.innerHTML = '';
            bodyEl.appendChild(content);
        }

        // Set footer actions
        const footerEl = this._modal.querySelector('.modal-footer');
        footerEl.innerHTML = '';

        if (actions.length > 0) {
            footerEl.style.display = '';
            actions.forEach(action => {
                const button = document.createElement('button');
                button.className = `btn ${action.variant || 'btn-secondary'}`;
                button.textContent = action.label;
                button.addEventListener('click', () => {
                    if (action.handler) {
                        const result = action.handler();
                        if (result !== false && action.closeOnClick !== false) {
                            this.close();
                        }
                    } else {
                        this.close();
                    }
                });
                footerEl.appendChild(button);
            });
        } else {
            footerEl.style.display = 'none';
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
    confirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
        return new Promise((resolve) => {
            this.open({
                title,
                content: `<p>${message}</p>`,
                actions: [
                    {
                        label: cancelText,
                        variant: 'btn-secondary',
                        handler: () => {
                            resolve(false);
                        }
                    },
                    {
                        label: confirmText,
                        variant: danger ? 'btn-primary' : 'btn-primary',
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
    alert({ title, message, buttonText = 'OK' }) {
        return new Promise((resolve) => {
            this.open({
                title,
                content: `<p>${message}</p>`,
                actions: [
                    {
                        label: buttonText,
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

// Convenience functions
export const openModal = (options) => modal.open(options);
export const closeModal = () => modal.close();
export const confirm = (options) => modal.confirm(options);
export const alert = (options) => modal.alert(options);

export default modal;
