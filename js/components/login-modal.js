/**
 * Login Modal Component
 * UI for choosing authentication method (Extension, nsec, remote signer, or Generate)
 *
 * VanJS view: both dialogs are built with `van.tags` and use inline handlers.
 *
 * @module components/login-modal
 */

import { modal } from './modal.js';
import { t } from '../core/i18n.js';
import { authService } from '../services/auth-service.js';
import { eventBus, Events } from '../core/event-bus.js';
import { SolarIcons } from '../utils/icons.js';
import van from '../vendor/van.js';

const { a, button, div, h3, img, input, label, p, span } = van.tags;

const toast = (type, message) => eventBus.emit(Events.TOAST_SHOW, { type, message });
const solarIcon = (svg, className = '') =>
    span({ class: `ic ${className}`.trim(), innerHTML: svg });

export class LoginModal {
    constructor() {
        this._bindEvents();
    }

    _bindEvents() {
        // Listen for requests to show login options
        eventBus.on(Events.AUTH_REQUEST_LOGIN, () => this.show());
    }

    show() {
        const showRemote = van.state(false);
        const remoteStatus = van.state('idle');
        const remoteQr = van.state('');
        const remoteUri = van.state('');
        const remoteError = van.state('');
        const remoteAuthUrl = van.state('');
        let remoteController = null;

        const resetRemote = () => {
            if (remoteController) {
                remoteController.abort();
                remoteController = null;
            }
            remoteStatus.val = 'idle';
            remoteQr.val = '';
            remoteUri.val = '';
            remoteError.val = '';
            remoteAuthUrl.val = '';
        };

        const makeQr = (text) => {
            try {
                if (typeof window.qrcode !== 'function') return '';
                const qr = window.qrcode(0, 'M');
                qr.addData(text);
                qr.make();
                return qr.createDataURL(4, 4);
            } catch (error) {
                console.warn('[Login] QR generation failed:', error);
                return '';
            }
        };

        const onRemoteAuth = (url) => {
            remoteAuthUrl.val = url || '';
            toast('info', t('login.remoteApprovalNeeded'));
        };

        const copyRemoteUri = async () => {
            if (!remoteUri.val) return;
            try {
                await navigator.clipboard.writeText(remoteUri.val);
                toast('success', t('common.copied'));
            } catch {
                toast('error', t('common.copyFailed'));
            }
        };

        const startNostrConnect = async () => {
            resetRemote();
            const controller = new AbortController();
            remoteController = controller;
            remoteStatus.val = 'waiting';

            try {
                await authService.loginWithNostrConnect({
                    signal: controller.signal,
                    onAuth: onRemoteAuth,
                    onUri: (uri) => {
                        remoteUri.val = uri;
                        remoteQr.val = makeQr(uri);
                        if (!remoteQr.val) remoteError.val = t('login.qrFailed');
                    },
                });
                if (controller.signal.aborted) return;
                remoteController = null;
                modal.close();
                toast('success', t('login.remoteConnected'));
            } catch (err) {
                if (controller.signal.aborted) return;
                remoteController = null;
                remoteStatus.val = 'idle';
                remoteError.val = err.message || t('login.remoteFailed');
                toast('error', remoteError.val);
            }
        };

        const connectBunker = async () => {
            const value = bunkerInput.value.trim();
            if (!value) return;
            resetRemote();
            const controller = new AbortController();
            remoteController = controller;
            remoteStatus.val = 'connecting';
            remoteError.val = '';
            try {
                await authService.loginWithBunker(value, {
                    signal: controller.signal,
                    onAuth: onRemoteAuth,
                });
                if (controller.signal.aborted) return;
                remoteController = null;
                modal.close();
                toast('success', t('login.remoteConnected'));
            } catch (err) {
                if (controller.signal.aborted) return;
                remoteController = null;
                remoteStatus.val = 'idle';
                remoteError.val = err.message || t('login.remoteFailed');
                toast('error', remoteError.val);
            }
        };

        const bunkerInput = input({
            type: 'text',
            id: 'bunker-input',
            class: 'input input-bordered join-item w-full font-mono text-xs',
            placeholder: t('login.bunkerPlaceholder'),
            autocomplete: 'off',
            spellcheck: 'false',
        });

        const remoteButton = button(
            {
                class: 'btn btn-outline flex items-center justify-between p-4',
                id: 'login-remote',
                onclick: () => {
                    showRemote.val = true;
                },
            },
            div(
                { class: 'flex items-center gap-3' },
                solarIcon(SolarIcons.smartphone, 'login-ic'),
                div(
                    { class: 'text-left' },
                    div({ class: 'font-bold' }, t('login.remote')),
                    div({ class: 'text-xs text-secondary' }, t('login.remoteSub'))
                )
            ),
            span({ class: 'ic login-chevron', innerHTML: SolarIcons.arrowRight })
        );

        const remotePanel = () =>
            div(
                { class: 'flex flex-col gap-3' },
                p({ class: 'text-xs text-secondary' }, t('login.remoteHint')),
                () =>
                    remoteAuthUrl.val
                        ? p(
                              { class: 'text-xs text-warning login-uri' },
                              t('login.remoteApprovalNeeded'),
                              ' ',
                              remoteAuthUrl.val
                          )
                        : null,
                () => {
                    if (remoteStatus.val === 'waiting') {
                        return div(
                            { class: 'flex flex-col items-center gap-2' },
                            remoteQr.val
                                ? img({
                                      class: 'login-qr',
                                      src: remoteQr,
                                      width: 200,
                                      height: 200,
                                      alt: t('login.scanQr'),
                                  })
                                : div({ class: 'spinner spinner-lg' }),
                            p(
                                { class: 'text-xs text-secondary text-center' },
                                t('login.waitingApproval')
                            ),
                            remoteUri.val
                                ? div(
                                      { class: 'join w-full' },
                                      a(
                                          { class: 'btn btn-primary', href: remoteUri },
                                          solarIcon(SolarIcons.smartphone),
                                          t('login.openWithApp')
                                      ),
                                      button(
                                          {
                                              class: 'btn btn-secondary',
                                              onclick: copyRemoteUri,
                                          },
                                          solarIcon(SolarIcons.copy),
                                          t('common.copy')
                                      )
                                  )
                                : null,
                            button(
                                { class: 'btn btn-ghost btn-sm', onclick: resetRemote },
                                solarIcon(SolarIcons.closeCircle),
                                t('common.cancel')
                            )
                        );
                    }

                    return div(
                        { class: 'flex flex-col gap-2' },
                        button(
                            {
                                class: 'btn btn-secondary',
                                disabled: remoteStatus.val === 'connecting',
                                onclick: startNostrConnect,
                            },
                            solarIcon(SolarIcons.qrCode),
                            remoteStatus.val === 'connecting'
                                ? t('login.remoteConnecting')
                                : t('login.showQr')
                        ),
                        div({ class: 'divider text-center text-sm' }, t('login.or')),
                        div(
                            { class: 'join w-full' },
                            bunkerInput,
                            button(
                                {
                                    class: 'btn btn-primary',
                                    disabled: remoteStatus.val === 'connecting',
                                    onclick: connectBunker,
                                },
                                solarIcon(SolarIcons.linkCircle),
                                t('login.connectBunker')
                            )
                        )
                    );
                },
                () =>
                    remoteError.val
                        ? p({ class: 'text-xs text-error' }, remoteError.val)
                        : null,
                button(
                    {
                        class: 'btn btn-ghost btn-sm',
                        onclick: () => {
                            resetRemote();
                            showRemote.val = false;
                        },
                    },
                    solarIcon(SolarIcons.arrowLeft),
                    t('login.back')
                )
            );

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
                solarIcon(SolarIcons.plugCircle, 'login-ic'),
                div(
                    { class: 'text-left' },
                    div({ class: 'font-bold' }, t('login.extension')),
                    div({ class: 'text-xs text-secondary' }, t('login.extensionSub'))
                )
            ),
            span({ class: 'ic login-chevron', innerHTML: SolarIcons.arrowRight })
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
            solarIcon(SolarIcons.keyMinimalistic),
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
            solarIcon(SolarIcons.userPlus),
            span(t('login.generate'))
        );

        const mainOptions = div(
            { class: 'login-option-list flex flex-col gap-3' },
            extBtn,
            div({ class: 'divider text-center text-secondary text-sm my-2' }, t('login.or')),
            div({ class: 'join w-full' }, nsecInput, nsecBtn),
            p(
                { class: 'text-xs text-secondary text-center mb-2' },
                t('login.nsecHint')
            ),
            div({ class: 'divider text-center text-secondary text-sm my-2' }, t('login.or')),
            genBtn,
            div({ class: 'divider text-center text-secondary text-sm my-2' }, t('login.or')),
            remoteButton
        );

        const content = div(
            { class: 'login-options' },
            () => (showRemote.val ? remotePanel() : mainOptions)
        );

        modal.open({ title: t('login.title'), content, onClose: resetRemote });
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
                div(
                    { class: 'flex items-center gap-2' },
                    span({ class: 'ic', innerHTML: SolarIcons.shieldCheck }),
                    h3({ class: 'font-bold' }, t('login.saveSecretTitle'))
                ),
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
                        solarIcon(SolarIcons.copy),
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
