/**
 * Login Modal Component
 * UI for choosing authentication method (Extension, nsec, or Generate)
 *
 * VanJS view: both dialogs are built with `van.tags` and use inline handlers.
 *
 * @module components/login-modal
 */

import { modal } from './modal.js';
import { t } from '../core/i18n.js';
import { authService } from '../services/auth-service.js';
import { eventBus, Events } from '../core/event-bus.js';
import van from '../vendor/van.js';

const { button, div, h3, input, label, p, span } = van.tags;

const toast = (type, message) => eventBus.emit(Events.TOAST_SHOW, { type, message });

export class LoginModal {
    constructor() {
        this._bindEvents();
    }

    _bindEvents() {
        // Listen for requests to show login options
        eventBus.on(Events.AUTH_REQUEST_LOGIN, () => this.show());
    }

    show() {
        const content = div({ class: 'login-options' });

        const extBtn = button(
            {
                class: 'btn btn-lg btn-outline flex items-center justify-between p-4',
                id: 'login-ext',
                onclick: async () => {
                    try {
                        await authService.login();
                        modal.close();
                        toast('success', t('login.connectedExt'));
                    } catch (err) {
                        // Error already handled/emitted by authService
                    }
                },
            },
            div(
                { class: 'flex items-center gap-3' },
                span({ class: 'text-2xl' }, '🔌'),
                div(
                    { class: 'text-left' },
                    div({ class: 'font-bold' }, t('login.extension')),
                    div({ class: 'text-xs text-secondary' }, t('login.extensionSub'))
                )
            ),
            span('→')
        );

        const nsecInput = input({
            type: 'password',
            id: 'nsec-input',
            class: 'input input-bordered join-item w-full',
            placeholder: t('login.nsecPlaceholder'),
        });

        const nsecBtn = button(
            {
                class: 'btn btn-primary join-item',
                id: 'login-nsec',
                onclick: async () => {
                    const nsec = nsecInput.value.trim();
                    if (!nsec) return;
                    try {
                        await authService.loginWithSecret(nsec);
                        modal.close();
                        toast('success', t('login.loggedInKey'));
                    } catch (err) {
                        toast('error', err.message);
                    }
                },
            },
            t('login.login')
        );

        const genBtn = button(
            {
                class: 'btn btn-secondary flex items-center justify-center gap-2',
                id: 'login-gen',
                onclick: async () => {
                    try {
                        const user = await authService.generateNewAccount();
                        modal.close();
                        setTimeout(() => this._showNewAccountKeys(user), 500);
                    } catch (err) {
                        toast('error', err.message);
                    }
                },
            },
            span('✨'),
            span(t('login.generate'))
        );

        van.add(
            content,
            div(
                { class: 'login-option-list flex flex-col gap-3' },
                extBtn,
                div({ class: 'divider text-center text-secondary text-sm my-2' }, t('login.or')),
                div({ class: 'join w-full' }, nsecInput, nsecBtn),
                p(
                    { class: 'text-xs text-secondary text-center mb-2' },
                    t('login.nsecHint')
                ),
                div({ class: 'divider text-center text-secondary text-sm my-2' }, t('login.or')),
                genBtn
            )
        );

        modal.open({ title: t('login.title'), content });
    }

    _showNewAccountKeys(user) {
        const nsecField = input({
            type: 'text',
            readonly: true,
            value: user.nsec,
            class: 'input input-bordered join-item w-full font-mono text-sm',
            id: 'key-nsec',
        });

        const content = div(
            div(
                { class: 'alert alert-warning mb-4' },
                h3({ class: 'font-bold' }, t('login.saveSecretTitle')),
                p({ class: 'text-sm' }, t('login.saveSecretBody'))
            ),
            div(
                { class: 'form-control mb-4' },
                label({ class: 'label' }, span({ class: 'label-text' }, t('login.secretKey'))),
                div(
                    { class: 'join w-full' },
                    nsecField,
                    button(
                        {
                            class: 'btn join-item',
                            id: 'copy-nsec',
                            onclick: () => {
                                nsecField.select();
                                document.execCommand('copy');
                                toast('success', t('common.copied'));
                            },
                        },
                        t('common.copy')
                    )
                )
            ),
            div(
                { class: 'form-control mb-6' },
                label({ class: 'label' }, span({ class: 'label-text' }, t('login.publicKey'))),
                div(
                    { class: 'join w-full' },
                    input({
                        type: 'text',
                        readonly: true,
                        value: user.npub,
                        class: 'input input-bordered join-item w-full font-mono text-sm',
                    })
                )
            )
        );

        modal.open({
            title: t('login.newAccountTitle'),
            content,
            actions: [
                {
                    label: t('login.savedKey'),
                    variant: 'btn-primary',
                    handler: () => true, // Close modal
                },
            ],
        });
    }
}

export const loginModal = new LoginModal();
