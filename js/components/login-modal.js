/**
 * Login Modal Component
 * UI for choosing authentication method (Extension, nsec, or Generate)
 * 
 * @module components/login-modal
 */

import { modal } from './modal.js';
import { t } from '../core/i18n.js';
import { authService } from '../services/auth-service.js';
import { eventBus, Events } from '../core/event-bus.js';

export class LoginModal {
    constructor() {
        this._bindEvents();
    }

    _bindEvents() {
        // Listen for requests to show login options
        eventBus.on(Events.AUTH_REQUEST_LOGIN, () => this.show());
    }

    show() {
        const content = document.createElement('div');
        content.className = 'login-options';
        content.innerHTML = `
            <div class="login-option-list flex flex-col gap-3">
                <!-- NIP-07 Extension -->
                <button class="btn btn-lg btn-outline flex items-center justify-between p-4" id="login-ext">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🔌</span>
                        <div class="text-left">
                            <div class="font-bold">${t('login.extension')}</div>
                            <div class="text-xs text-secondary">${t('login.extensionSub')}</div>
                        </div>
                    </div>
                    <span>→</span>
                </button>

                <div class="divider text-center text-secondary text-sm my-2">${t('login.or')}</div>

                <!-- nsec Login -->
                <div class="join w-full">
                    <input type="password" 
                           id="nsec-input" 
                           class="input input-bordered join-item w-full" 
                           placeholder="${t('login.nsecPlaceholder')}"
                    />
                    <button class="btn btn-primary join-item" id="login-nsec">
                        ${t('login.login')}
                    </button>
                </div>
                <p class="text-xs text-secondary text-center mb-2">
                    ${t('login.nsecHint')}
                </p>

                <div class="divider text-center text-secondary text-sm my-2">${t('login.or')}</div>

                <!-- Generate New -->
                <button class="btn btn-secondary flex items-center justify-center gap-2" id="login-gen">
                    <span>✨</span>
                    <span>${t('login.generate')}</span>
                </button>
            </div>
        `;

        // Bind clicks within the modal content
        // Extension Login
        content.querySelector('#login-ext').addEventListener('click', async () => {
            try {
                await authService.login();
                modal.close();
                eventBus.emit(Events.TOAST_SHOW, { type: 'success', message: t('login.connectedExt') });
            } catch (err) {
                // Error already handled/emitted by authService
            }
        });

        // nsec Login
        content.querySelector('#login-nsec').addEventListener('click', async () => {
            const input = content.querySelector('#nsec-input');
            const nsec = input.value.trim();
            if (!nsec) return;

            try {
                await authService.loginWithSecret(nsec);
                modal.close();
                eventBus.emit(Events.TOAST_SHOW, { type: 'success', message: t('login.loggedInKey') });
            } catch (err) {
                eventBus.emit(Events.TOAST_SHOW, { type: 'error', message: err.message });
            }
        });

        // Generate Account
        content.querySelector('#login-gen').addEventListener('click', async () => {
            try {
                const user = await authService.generateNewAccount();
                modal.close();

                // Show user their new key
                setTimeout(() => {
                    this._showNewAccountKeys(user);
                }, 500);

            } catch (err) {
                eventBus.emit(Events.TOAST_SHOW, { type: 'error', message: err.message });
            }
        });

        modal.open({
            title: t('login.title'),
            content: content
        });
    }

    _showNewAccountKeys(user) {
        const content = document.createElement('div');
        content.innerHTML = `
            <div class="alert alert-warning mb-4">
                <h3 class="font-bold">${t('login.saveSecretTitle')}</h3>
                <p class="text-sm">${t('login.saveSecretBody')}</p>
            </div>

            <div class="form-control mb-4">
                <label class="label"><span class="label-text">${t('login.secretKey')}</span></label>
                <div class="join w-full">
                    <input type="text" readonly value="${user.nsec}" class="input input-bordered join-item w-full font-mono text-sm" id="key-nsec" />
                    <button class="btn join-item" id="copy-nsec">${t('common.copy')}</button>
                </div>
            </div>

            <div class="form-control mb-6">
                <label class="label"><span class="label-text">${t('login.publicKey')}</span></label>
                <div class="join w-full">
                    <input type="text" readonly value="${user.npub}" class="input input-bordered join-item w-full font-mono text-sm" />
                </div>
            </div>
        `;

        content.querySelector('#copy-nsec').addEventListener('click', () => {
            const el = content.querySelector('#key-nsec');
            el.select();
            document.execCommand('copy');
            eventBus.emit(Events.TOAST_SHOW, { type: 'success', message: t('common.copied') });
        });

        modal.open({
            title: t('login.newAccountTitle'),
            content: content,
            actions: [
                {
                    label: t('login.savedKey'),
                    variant: 'btn-primary',
                    handler: () => true // Close modal
                }
            ]
        });
    }
}

export const loginModal = new LoginModal();
