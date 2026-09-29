/**
 * Toast Component
 * Notification toast messages
 *
 * VanJS view: toasts are built with `van.tags`, so titles/messages are inserted
 * as text nodes and are escaped automatically — no manual escaping needed.
 *
 * @module components/toast
 */

import { eventBus, Events } from '../core/event-bus.js';
import { config } from '../config.js';
import { t } from '../core/i18n.js';
import van from '../vendor/van.js';

const { div, span, button } = van.tags;

const ICONS = {
    success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>`,
    error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>`,
    warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>`,
    info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>`,
};

const CLOSE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>`;

class ToastManager {
    constructor() {
        this._container = div({ class: 'toast-container', 'aria-live': 'polite' });
        document.body.appendChild(this._container);

        // Listen for toast events
        eventBus.on(Events.TOAST_SHOW, (data) => {
            this.show(data);
        });
    }

    /**
     * Show a toast notification
     * @param {Object} options - Toast options
     * @param {string} options.message - Toast message
     * @param {string} [options.title] - Toast title
     * @param {string} [options.type='info'] - Toast type (success, error, warning, info)
     * @param {number} [options.duration] - Display duration in ms
     */
    show({ message, title = '', type = 'info', duration = config.ui.toastDuration }) {
        const toast = div(
            { class: `toast ${type}`, role: 'alert' },
            span({ class: 'toast-icon', innerHTML: ICONS[type] || ICONS.info }),
            div(
                { class: 'toast-content' },
                title ? div({ class: 'toast-title' }, title) : null,
                div({ class: 'toast-message' }, message)
            ),
            button({
                class: 'toast-close btn-icon btn-ghost',
                'aria-label': t('common.close'),
                innerHTML: CLOSE_ICON,
                onclick: () => this._dismiss(toast),
            })
        );

        // Add to container
        this._container.appendChild(toast);

        // Auto dismiss
        if (duration > 0) {
            setTimeout(() => {
                this._dismiss(toast);
            }, duration);
        }

        return toast;
    }

    /**
     * Show success toast
     * @param {string} message
     * @param {string} [title]
     */
    success(message, title = '') {
        return this.show({ message, title, type: 'success' });
    }

    /**
     * Show error toast
     * @param {string} message
     * @param {string} [title]
     */
    error(message, title = '') {
        return this.show({ message, title, type: 'error', duration: 5000 });
    }

    /**
     * Show warning toast
     * @param {string} message
     * @param {string} [title]
     */
    warning(message, title = '') {
        return this.show({ message, title, type: 'warning' });
    }

    /**
     * Show info toast
     * @param {string} message
     * @param {string} [title]
     */
    info(message, title = '') {
        return this.show({ message, title, type: 'info' });
    }

    /**
     * Dismiss a toast
     * @private
     */
    _dismiss(toast) {
        if (!toast || !toast.parentNode) return;

        toast.classList.add('removing');

        // Remove after animation
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    /**
     * Dismiss all toasts
     */
    dismissAll() {
        const toasts = this._container.querySelectorAll('.toast');
        toasts.forEach(toast => this._dismiss(toast));
    }
}

// Singleton instance
export const toast = new ToastManager();

// Convenience functions
export const showToast = (options) => toast.show(options);
export const toastSuccess = (message, title) => toast.success(message, title);
export const toastError = (message, title) => toast.error(message, title);
export const toastWarning = (message, title) => toast.warning(message, title);
export const toastInfo = (message, title) => toast.info(message, title);

export default toast;
